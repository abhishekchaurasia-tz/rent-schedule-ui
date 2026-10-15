import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, WritableSignal, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, map, of, switchMap } from 'rxjs';

import {
  ALLOWED_UPLOAD_EXTENSIONS,
  FilterOptionsResult,
  InvoiceFile,
  InvoiceNote,
  InvoiceNotesSubject,
  MAX_UPLOAD_BYTES,
  NO_NOTES_FILTER,
  NotesFilter,
  NotesListPage,
  NotesWriteResult,
  TempFileWire
} from './invoice-notes.models';
import { InvoiceNotesService } from './invoice-notes.service';

/** The panel's two tabs (spec Flow 1 step 6). */
export type NotesTab = 'notes' | 'files';

/** The panel's own sentences. */
export const InvoiceNotesPanelMessages = {
  notesUnavailable: 'The notes could not be loaded. The notes service did not answer; try again in a moment.',
  filesUnavailable: 'The files could not be loaded. The notes service did not answer; try again in a moment.',
  relatedUnavailable: 'The related notes and files could not be loaded. Try again in a moment.',
  moreUnavailable: 'The next page could not be loaded. Try again in a moment.',
  noNotes: 'No notes on this invoice yet.',
  noFiles: 'No files on this invoice yet.',
  noRelated: 'Nothing related to this invoice.',
  tooLarge: (name: string) => `${name} was not added: it is larger than the 20 MB limit.`,
  wrongType: (name: string) =>
    `${name} was not added: only ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')} files can be uploaded.`,
  uploadFailed: (name: string, why: string) => `${name} was not uploaded: ${why}`,
  filesNotAttached: (why: string) => `The note was posted, but its files were not attached: ${why}`
} as const;

/** One list on screen: what has been read so far, and how the last read went. */
interface ListState<T> {
  items: T[];
  remaining: number;
  page: number;
  loading: boolean;
  /** The first page could not be read: the list says so instead of "nothing yet". */
  unavailable: boolean;
  /** A "View More" could not be read: the items already shown stay. */
  moreFailed: boolean;
}

/** A file chosen for the next post: uploading to merlin's temp store, or staged and ready. */
interface StagedFile {
  key: number;
  name: string;
  /** `null` while the temp upload is in flight. */
  staged: TempFileWire | null;
}

/** What is being edited inline: a note's text or a file's name. */
interface EditTarget {
  kind: NotesTab;
  id: number;
}

const emptyList = <T>(): ListState<T> => ({
  items: [],
  remaining: 0,
  page: 0,
  loading: false,
  unavailable: false,
  moreFailed: false
});

/**
 * The **Notes & Files** side panel on a Billing invoice — Billing spec `20-invoice-notes-files.md` v8,
 * Flows 1 – 4, laid out as the owner app's *Notes & Files* panel and hosted here rather than there (D10).
 *
 * **It talks to merlin itself**, as the record-payment panel talks to Billing: the host only opens it and
 * hears when it is closed. Every call goes through `InvoiceNotesService`, which names the invoice by
 * `BillingInvoiceId` and never by `InvoiceId` (BR-22).
 *
 * **Paging is merlin's.** The primary lists are five a page and Related two on its first page and five
 * after; merlin pins both sizes, so the panel asks for the next page and shows "View More" while merlin
 * says more remain.
 *
 * **Edit, rename and delete are offered on this invoice's own items only.** Related shows the lease's
 * and the agreement's other notes and files, which belong to other screens; they are read here, not
 * managed.
 *
 * **A failed read is said, not shown as an empty list.** A 401 from a missing bearer and merlin being
 * down both answer `unavailable`, and the list says the notes could not be loaded rather than that there
 * are none.
 */
@Component({
  selector: 'app-invoice-notes-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './invoice-notes-panel.component.html',
  styleUrl: './invoice-notes-panel.component.scss'
})
export class InvoiceNotesPanelComponent implements OnInit {
  /** The Billing invoice the notes are about. */
  @Input({ required: true }) invoiceId!: string;

  /** Its number, for the header (`INV-…`). */
  @Input({ required: true }) invoiceNumber!: string;

  /** Its agreement, which Related follows (spec Flow 1 step 4); `null` lets merlin fall back (BR-13). */
  @Input() rentAgreementId: string | null = null;

  /** The user closed the panel. */
  @Output() readonly closed = new EventEmitter<void>();

  readonly messages = InvoiceNotesPanelMessages;
  readonly accept = ALLOWED_UPLOAD_EXTENSIONS.map((extension) => `.${extension}`).join(',');

  readonly tab = signal<NotesTab>('notes');

  readonly primaryNotes = signal<ListState<InvoiceNote>>(emptyList());
  readonly relatedNotes = signal<ListState<InvoiceNote>>(emptyList());
  readonly primaryFiles = signal<ListState<InvoiceFile>>(emptyList());
  readonly relatedFiles = signal<ListState<InvoiceFile>>(emptyList());

  /** Whether each tab's Related section is expanded. Read only once it is (spec Flow 1 step 4). */
  readonly relatedOpen = signal<Record<NotesTab, boolean>>({ notes: false, files: false });

  /** Each tab's own filters, as the owner app keeps them. */
  readonly filters = signal<Record<NotesTab, NotesFilter>>({ notes: NO_NOTES_FILTER, files: NO_NOTES_FILTER });

  readonly users = signal<FilterOptionsResult>({ options: [], unavailable: false });
  readonly noteCategories = signal<FilterOptionsResult>({ options: [], unavailable: false });
  readonly fileCategories = signal<FilterOptionsResult>({ options: [], unavailable: false });

  readonly noteText = new FormControl('', { nonNullable: true });

  /** The files chosen for the next post. */
  readonly staged = signal<StagedFile[]>([]);

  /** Every file that was not added, and why — never dropped without a word (spec Flow 1 step 6). */
  readonly rejections = signal<string[]>([]);

  readonly posting = signal(false);
  readonly postError = signal<string | null>(null);

  readonly editing = signal<EditTarget | null>(null);
  readonly editText = new FormControl('', { nonNullable: true });
  readonly confirmingDelete = signal<EditTarget | null>(null);
  readonly rowWorking = signal(false);
  readonly rowError = signal<(EditTarget & { message: string }) | null>(null);

  /** Mirrors `noteText` for `canPost`, which change detection reads as a signal. */
  private readonly typed = signal('');

  private nextKey = 0;

  constructor(private readonly notes: InvoiceNotesService) {
    this.noteText.valueChanges.subscribe((value) => this.typed.set(value));
  }

  /** Reads both primary lists and the three filter lists (spec Flow 1 steps 3 and 5). */
  ngOnInit(): void {
    this.loadPrimary('notes', 1);
    this.loadPrimary('files', 1);
    this.notes.users(this.invoiceId).subscribe((result) => this.users.set(result));
    this.notes.noteCategories(this.invoiceId).subscribe((result) => this.noteCategories.set(result));
    this.notes.fileCategories(this.invoiceId).subscribe((result) => this.fileCategories.set(result));
  }

  // ---- what the template reads -----------------------------------------------------------------

  get primary(): ListState<InvoiceNote | InvoiceFile> {
    return this.tab() === 'notes' ? this.primaryNotes() : this.primaryFiles();
  }

  get related(): ListState<InvoiceNote | InvoiceFile> {
    return this.tab() === 'notes' ? this.relatedNotes() : this.relatedFiles();
  }

  get categories(): FilterOptionsResult {
    return this.tab() === 'notes' ? this.noteCategories() : this.fileCategories();
  }

  get filter(): NotesFilter {
    return this.filters()[this.tab()];
  }

  get isRelatedOpen(): boolean {
    return this.relatedOpen()[this.tab()];
  }

  /** *Post* takes text, files, or both — once every chosen file has finished uploading (spec Flow 2). */
  get canPost(): boolean {
    const files = this.staged();
    const uploading = files.some((chosen) => chosen.staged === null);
    return !this.posting() && !uploading && (this.typed().trim().length > 0 || files.length > 0);
  }

  isEditing(kind: NotesTab, id: number): boolean {
    const target = this.editing();
    return target?.kind === kind && target.id === id;
  }

  isConfirmingDelete(kind: NotesTab, id: number): boolean {
    const target = this.confirmingDelete();
    return target?.kind === kind && target.id === id;
  }

  errorFor(kind: NotesTab, id: number): string | null {
    const failure = this.rowError();
    return failure?.kind === kind && failure.id === id ? failure.message : null;
  }

  asNote(item: InvoiceNote | InvoiceFile): InvoiceNote {
    return item as InvoiceNote;
  }

  asFile(item: InvoiceNote | InvoiceFile): InvoiceFile {
    return item as InvoiceFile;
  }

  idOf(item: InvoiceNote | InvoiceFile): number {
    return 'noteId' in item ? item.noteId : item.attachmentId;
  }

  // ---- tabs, paging, Related, filters -----------------------------------------------------------

  selectTab(tab: NotesTab): void {
    this.tab.set(tab);
    this.cancelEdit();
    this.cancelDelete();
  }

  /** The next page of the primary list on screen (spec Flow 1 step 6). */
  viewMorePrimary(): void {
    const tab = this.tab();
    this.loadPrimary(tab, this.pageOf(tab, 'primary') + 1);
  }

  /** The next page of Related: two came first, five come each time after (merlin's paging). */
  viewMoreRelated(): void {
    const tab = this.tab();
    this.loadRelated(tab, this.pageOf(tab, 'related') + 1);
  }

  /** Expands or collapses Related, reading its first page on the first expansion. */
  toggleRelated(): void {
    const tab = this.tab();
    const open = !this.relatedOpen()[tab];
    this.relatedOpen.update((state) => ({ ...state, [tab]: open }));

    if (open && this.pageOf(tab, 'related') === 0) {
      this.loadRelated(tab, 1);
    }
  }

  /** Narrows the tab's lists and reads them again from page 1 (spec Flow 1 step 5). */
  applyFilter(patch: Partial<NotesFilter>): void {
    const tab = this.tab();
    this.filters.update((state) => ({ ...state, [tab]: { ...state[tab], ...patch } }));
    this.reloadTab(tab);
  }

  clearFilters(): void {
    const tab = this.tab();
    this.filters.update((state) => ({ ...state, [tab]: NO_NOTES_FILTER }));
    this.reloadTab(tab);
  }

  // ---- posting (Flow 2, Flow 3) -----------------------------------------------------------------

  /** The file input's change: hands its files on and clears it, so the same file can be chosen again. */
  onFilesChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.chooseFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  /**
   * Checks each chosen file against the owner app's limits, reports the ones that fail, and stages the
   * rest at merlin's temp store (spec Flow 1 step 6, Flow 2 step 1). A file merlin refuses to stage is
   * reported too: nothing chosen disappears without a word.
   */
  chooseFiles(files: File[]): void {
    for (const chosen of files) {
      const problem = InvoiceNotesPanelComponent.problemWith(chosen);
      if (problem) {
        this.rejections.update((list) => [...list, problem]);
        continue;
      }

      const key = this.nextKey++;
      this.staged.update((list) => [...list, { key, name: chosen.name, staged: null }]);

      this.notes.uploadTemp(chosen).subscribe((result) => {
        if (result.ok) {
          this.staged.update((list) => list.map((entry) => (entry.key === key ? { ...entry, staged: result.file } : entry)));
        } else {
          this.staged.update((list) => list.filter((entry) => entry.key !== key));
          this.rejections.update((list) => [...list, InvoiceNotesPanelMessages.uploadFailed(chosen.name, result.message)]);
        }
      });
    }
  }

  removeStaged(key: number): void {
    this.staged.update((list) => list.filter((entry) => entry.key !== key));
  }

  /**
   * Posts what was typed and what was staged (spec Flow 2, Flow 3).
   *
   * **Text and files go as two calls, note first**: merlin's `SaveNote` answers the new note's id, and
   * `SaveAttachments` carries it so the files hang off that note. Files alone go with a null `NoteId`.
   * When the note is saved and its files are refused, the note stays posted and the files stay staged,
   * so posting again attaches them on their own.
   */
  post(): void {
    if (!this.canPost) {
      return;
    }

    const text = this.noteText.value.trim();
    const files = this.staged()
      .map((entry) => entry.staged)
      .filter((staged): staged is TempFileWire => staged !== null);

    this.posting.set(true);
    this.postError.set(null);

    if (!text) {
      this.notes.saveFiles(this.invoiceId, files, null).subscribe((result) => this.afterPost(result, false));
      return;
    }

    this.notes
      .saveNote(this.invoiceId, text)
      .pipe(
        switchMap((saved): Observable<{ noteSaved: boolean; result: NotesWriteResult }> => {
          if (!saved.ok) {
            return of({ noteSaved: false, result: saved });
          }

          return files.length === 0
            ? of({ noteSaved: true, result: { ok: true } as NotesWriteResult })
            : this.notes
                .saveFiles(this.invoiceId, files, saved.noteId)
                .pipe(map((attached) => ({ noteSaved: true, result: attached })));
        })
      )
      .subscribe(({ noteSaved, result }) => {
        if (noteSaved) {
          this.noteText.setValue('');
        }
        this.afterPost(result, noteSaved);
      });
  }

  // ---- edit, rename, delete (Flow 4) ------------------------------------------------------------

  startEdit(kind: NotesTab, item: InvoiceNote | InvoiceFile): void {
    this.cancelDelete();
    this.rowError.set(null);
    this.editing.set({ kind, id: this.idOf(item) });
    this.editText.setValue(kind === 'notes' ? this.asNote(item).text : this.asFile(item).fileName);
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.rowError.set(null);
  }

  /** Sends the edited note text or file name; a refusal stays on the row with merlin's reason. */
  saveEdit(): void {
    const target = this.editing();
    const value = this.editText.value.trim();
    if (!target || !value || this.rowWorking()) {
      return;
    }

    const request =
      target.kind === 'notes'
        ? this.notes.updateNote(this.invoiceId, target.id, value)
        : this.notes.renameFile(this.invoiceId, target.id, value);

    this.runRowWrite(target, request, () => this.editing.set(null));
  }

  askDelete(kind: NotesTab, item: InvoiceNote | InvoiceFile): void {
    this.cancelEdit();
    this.confirmingDelete.set({ kind, id: this.idOf(item) });
  }

  cancelDelete(): void {
    this.confirmingDelete.set(null);
  }

  confirmDelete(): void {
    const target = this.confirmingDelete();
    if (!target || this.rowWorking()) {
      return;
    }

    const request =
      target.kind === 'notes'
        ? this.notes.deleteNote(this.invoiceId, target.id)
        : this.notes.deleteFile(this.invoiceId, target.id);

    this.runRowWrite(target, request, () => this.confirmingDelete.set(null));
  }

  close(): void {
    this.closed.emit();
  }

  // ---- internals -------------------------------------------------------------------------------

  private get subject(): InvoiceNotesSubject {
    return { invoiceId: this.invoiceId, rentAgreementId: this.rentAgreementId };
  }

  /** The last page read into one of the four lists; `0` before its first read. */
  private pageOf(tab: NotesTab, which: 'primary' | 'related'): number {
    if (tab === 'notes') {
      return (which === 'primary' ? this.primaryNotes() : this.relatedNotes()).page;
    }

    return (which === 'primary' ? this.primaryFiles() : this.relatedFiles()).page;
  }

  private loadPrimary(tab: NotesTab, page: number): void {
    const filter = this.filters()[tab];

    if (tab === 'notes') {
      this.load(this.primaryNotes, this.notes.primaryNotes(this.subject, page, filter), page);
    } else {
      this.load(this.primaryFiles, this.notes.primaryFiles(this.subject, page, filter), page);
    }
  }

  private loadRelated(tab: NotesTab, page: number): void {
    const filter = this.filters()[tab];

    if (tab === 'notes') {
      this.load(this.relatedNotes, this.notes.relatedNotes(this.subject, page, filter), page);
    } else {
      this.load(this.relatedFiles, this.notes.relatedFiles(this.subject, page, filter), page);
    }
  }

  /**
   * Reads one page into one list. Page 1 replaces what is shown; a later page is appended. A failed
   * page 1 marks the list unavailable; a failed later page keeps what is shown and says so.
   */
  private load<T>(list: WritableSignal<ListState<T>>, read: Observable<NotesListPage<T>>, page: number): void {
    list.update((state) => ({ ...state, loading: true, moreFailed: false }));

    read.subscribe((result) => {
      list.update((state) => {
        if (result.unavailable) {
          return page === 1
            ? { ...emptyList<T>(), unavailable: true }
            : { ...state, loading: false, moreFailed: true };
        }

        return {
          items: page === 1 ? result.items : [...state.items, ...result.items],
          remaining: result.remaining,
          page,
          loading: false,
          unavailable: false,
          moreFailed: false
        };
      });
    });
  }

  private reloadTab(tab: NotesTab): void {
    this.loadPrimary(tab, 1);
    if (this.relatedOpen()[tab]) {
      this.loadRelated(tab, 1);
    }
  }

  /** Both primary lists again, from page 1: a note's files show on the Notes tab and on the Files tab. */
  private reloadPrimaries(): void {
    this.loadPrimary('notes', 1);
    this.loadPrimary('files', 1);
  }

  private afterPost(result: NotesWriteResult, noteSaved: boolean): void {
    this.posting.set(false);

    if (result.ok) {
      this.staged.set([]);
      this.rejections.set([]);
      this.reloadPrimaries();
      return;
    }

    this.postError.set(noteSaved ? InvoiceNotesPanelMessages.filesNotAttached(result.message) : result.message);
    if (noteSaved) {
      this.reloadPrimaries();
    }
  }

  private runRowWrite(target: EditTarget, request: Observable<NotesWriteResult>, done: () => void): void {
    this.rowWorking.set(true);
    this.rowError.set(null);

    request.subscribe((result) => {
      this.rowWorking.set(false);
      if (result.ok) {
        done();
        this.reloadPrimaries();
      } else {
        this.rowError.set({ ...target, message: result.message });
      }
    });
  }

  /** The owner app's two checks (`validateFile`): the extension, case-insensitively, then the size. */
  private static problemWith(chosen: File): string | null {
    const dot = chosen.name.lastIndexOf('.');
    const extension = dot > 0 ? chosen.name.slice(dot + 1).toLowerCase() : '';

    if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extension)) {
      return InvoiceNotesPanelMessages.wrongType(chosen.name);
    }

    return chosen.size > MAX_UPLOAD_BYTES ? InvoiceNotesPanelMessages.tooLarge(chosen.name) : null;
  }
}
