import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  AssociatedFileWire,
  AttachmentWire,
  AttachmentsPageWire,
  FilterOptionsResult,
  INVOICE_ATTACHMENT_TYPE_ID,
  INVOICE_NOTE_TYPE_ID,
  InvoiceFile,
  InvoiceNote,
  InvoiceNotesSubject,
  MerlinEnvelope,
  NOTES_PAGE_SIZE,
  NO_NOTES_FILTER,
  NoteAttachment,
  NoteSavedResult,
  NoteWire,
  NotesCountResult,
  NotesFilter,
  NotesListPage,
  NotesPageWire,
  NotesWriteRefused,
  NotesWriteResult,
  SelectedListItemWire,
  TempFileWire,
  TempUploadResult
} from './invoice-notes.models';

/** What the panel says when merlin gave no sentence of its own. */
export const InvoiceNotesMessages = {
  unreachable: 'The notes service could not be reached. Try again in a moment.',
  refused: 'The notes service did not accept the change. Try again in a moment.'
} as const;

/**
 * A Billing invoice's notes and files, read from and written to merlin — Billing spec
 * `20-invoice-notes-files.md` v8 (D6, D10, BR-22).
 *
 * **merlin owns these and Billing does not**, as with the owner's bank list (`OwnerBankService`): the
 * calls go straight to merlin's existing `PropertyOwner/Notes/...` and `PropertyOwner/AttachmentFiles/...`
 * routes through the same gateway and on the same bearer as every Billing call
 * (`scopeHeadersInterceptor`, BR-23). No route is added; spec 20 only adds the optional `BillingInvoiceId`
 * those routes branch on.
 *
 * **Every notes and files request names the invoice by `BillingInvoiceId` and never by `InvoiceId`
 * (BR-22).** `InvoiceId` is merlin's numeric legacy key, and Newtonsoft binds request fields
 * case-insensitively — so a Billing `Guid` sent under that name would at best fail to bind and at worst
 * drop the request onto the legacy path, where a null id is the cross-organization query S1 exists to
 * stop. The update, delete and lookup routes ignore the field; it is sent there too so that the rule has
 * no exceptions to remember.
 *
 * **Reads answer `unavailable` and writes answer `{ ok: false }` rather than throwing.** A 401 from a
 * missing bearer, a proxy pointed at the wrong service and merlin's own 422 all land in the panel as a
 * sentence, not as an empty list that reads as "no notes yet".
 */
@Injectable({ providedIn: 'root' })
export class InvoiceNotesService {
  private readonly notesUrl = `${environment.monolithBaseUrl}/PropertyOwner/Notes`;
  private readonly filesUrl = `${environment.monolithBaseUrl}/PropertyOwner/AttachmentFiles`;
  private readonly uploadUrl = `${environment.monolithBaseUrl}/public/File/Upload/TempSaveFile`;

  constructor(private readonly http: HttpClient) {}

  // ---- reads -------------------------------------------------------------------------------------

  /**
   * The "Notes (n)" count: this invoice's own notes (P6), not the lease-wide legacy count.
   *
   * **Read from the primary list, not from `Notes/GetNotesCount`.** That route takes its filter as a
   * complex parameter under `[ApiController]`, which binds from the body, so a GET carrying the filter on
   * its query never reaches it — and merlin's legacy binding is not changed for this (D6). The primary
   * read is the same request the panel's first page sends, and merlin answers its total in
   * `PagingModel.TotalRecords` (`new PagingModel(pageSize, total, pageNumber)` in `GetNotesService`).
   * A missing total reads as `unavailable`, never as zero.
   */
  count(invoiceId: string): Observable<NotesCountResult> {
    const body = this.notesFilter({ invoiceId, rentAgreementId: null }, 1, NO_NOTES_FILTER, false);

    return this.http.post<MerlinEnvelope<NotesPageWire>>(`${this.notesUrl}/GetPrimaryNotes`, body).pipe(
      map((response) => {
        const total = response?.Data?.PagingModel?.TotalRecords;
        return typeof total === 'number' ? { count: total, unavailable: false } : { count: 0, unavailable: true };
      }),
      catchError(() => of({ count: 0, unavailable: true }))
    );
  }

  /** The invoice's own notes, newest first, five a page (Flow 1 step 3, BR-12). */
  primaryNotes(subject: InvoiceNotesSubject, page: number, filter: NotesFilter): Observable<NotesListPage<InvoiceNote>> {
    return this.readNotes('GetPrimaryNotes', this.notesFilter(subject, page, filter, false));
  }

  /**
   * The notes of the invoice's lease and agreement (Flow 1 step 4, BR-13). merlin pages Related as two
   * on the first page and five after; the panel only sends the page number.
   */
  relatedNotes(subject: InvoiceNotesSubject, page: number, filter: NotesFilter): Observable<NotesListPage<InvoiceNote>> {
    return this.readNotes('GetRelatedNotes', this.notesFilter(subject, page, filter, true));
  }

  /** The invoice's own files (Flow 1 step 3). */
  primaryFiles(subject: InvoiceNotesSubject, page: number, filter: NotesFilter): Observable<NotesListPage<InvoiceFile>> {
    return this.readFiles('GetPrimaryAttachments', this.filesFilter(subject, page, filter, false));
  }

  /** The files of the invoice's lease and agreement (Flow 1 step 4). */
  relatedFiles(subject: InvoiceNotesSubject, page: number, filter: NotesFilter): Observable<NotesListPage<InvoiceFile>> {
    return this.readFiles('GetRelatedAttachments', this.filesFilter(subject, page, filter, true));
  }

  /** The users a list can be filtered by — the organization's, from merlin's session. */
  users(invoiceId: string): Observable<FilterOptionsResult> {
    return this.readOptions(`${this.notesUrl}/GetFilterUserList`, invoiceId);
  }

  /** The note categories a list can be filtered by. */
  noteCategories(invoiceId: string): Observable<FilterOptionsResult> {
    return this.readOptions(`${this.notesUrl}/GetNotesCategoryList`, invoiceId);
  }

  /** The file categories a list can be filtered by. */
  fileCategories(invoiceId: string): Observable<FilterOptionsResult> {
    return this.readOptions(`${this.filesUrl}/GetAttachmentsCategoryList`, invoiceId);
  }

  // ---- writes ------------------------------------------------------------------------------------

  /**
   * Posts a note (Flow 2) and answers its id, which `saveFiles` carries when files go with it.
   *
   * **`PostedById` is sent as `0` on purpose.** merlin takes the poster from the session on the Billing
   * path and ignores the client's (BR-08, P11) — and this application holds a `PropertyOwnerUid`, not the
   * merlin ORU id the field asks for, so it has nothing truthful to put there.
   */
  saveNote(invoiceId: string, text: string): Observable<NoteSavedResult> {
    const body = { NoteText: text, NotesTypeId: INVOICE_NOTE_TYPE_ID, BillingInvoiceId: invoiceId, PostedById: 0 };

    return this.http.post<MerlinEnvelope<number>>(`${this.notesUrl}/SaveNote`, body).pipe(
      map((response): NoteSavedResult =>
        typeof response?.Data === 'number' && response.Data > 0
          ? { ok: true, noteId: response.Data }
          : InvoiceNotesService.refused(InvoiceNotesMessages.refused)
      ),
      catchError((err: unknown) => of(InvoiceNotesService.refusedBy(err)))
    );
  }

  /**
   * Attaches files already staged by `uploadTemp` (Flow 2, Flow 3). `noteId` ties them to the note just
   * posted; `null` posts files on their own.
   */
  saveFiles(invoiceId: string, files: TempFileWire[], noteId: number | null): Observable<NotesWriteResult> {
    const body = {
      AttachmentTypeId: INVOICE_ATTACHMENT_TYPE_ID,
      BillingInvoiceId: invoiceId,
      NoteId: noteId,
      Files: files,
      PostedById: 0
    };

    return this.write(`${this.filesUrl}/SaveAttachments`, body);
  }

  /** Edits a note's text (Flow 4). */
  updateNote(invoiceId: string, noteId: number, text: string): Observable<NotesWriteResult> {
    return this.write(`${this.notesUrl}/UpdateNote`, { NoteId: noteId, UpdatedNotes: text, BillingInvoiceId: invoiceId });
  }

  /** Deletes a note (Flow 4). merlin reads the id from the query. */
  deleteNote(invoiceId: string, noteId: number): Observable<NotesWriteResult> {
    const params = new HttpParams().set('noteId', noteId).set('BillingInvoiceId', invoiceId);
    return this.write(`${this.notesUrl}/DeleteNote`, null, params);
  }

  /** Renames a file (Flow 4). */
  renameFile(invoiceId: string, attachmentId: number, fileName: string): Observable<NotesWriteResult> {
    return this.write(`${this.filesUrl}/UpdateAttachment`, {
      AttachmentId: attachmentId,
      UpdatedFileName: fileName,
      BillingInvoiceId: invoiceId
    });
  }

  /** Deletes a file (Flow 4). merlin reads the id from the query. */
  deleteFile(invoiceId: string, attachmentId: number): Observable<NotesWriteResult> {
    const params = new HttpParams().set('attachmentId', attachmentId).set('BillingInvoiceId', invoiceId);
    return this.write(`${this.filesUrl}/DeleteAttachment`, null, params);
  }

  /**
   * Stages one file at merlin's `public/File/Upload/TempSaveFile`, multipart field `file`, as the owner
   * app does. The answer is handed back to `saveFiles` untouched. Not a notes route, so it names no
   * invoice: the staged file belongs to nothing until `SaveAttachments` says which invoice it is for.
   */
  uploadTemp(file: File): Observable<TempUploadResult> {
    const form = new FormData();
    form.append('file', file);

    return this.http.post<MerlinEnvelope<TempFileWire>>(this.uploadUrl, form).pipe(
      map((response): TempUploadResult =>
        response?.Data ? { ok: true, file: response.Data } : InvoiceNotesService.refused(InvoiceNotesMessages.refused)
      ),
      catchError((err: unknown) => of(InvoiceNotesService.refusedBy(err)))
    );
  }

  // ---- internals ---------------------------------------------------------------------------------

  /**
   * The body every notes read shares. The filters go out under merlin's names, `0` meaning "any" as the
   * owner app sends it. Related adds `LeaseId` = the invoice's `rentAgreementId`, and omits it when the
   * invoice has none, so merlin falls back to the agreement on the invoice's newest note (BR-13).
   */
  private notesFilter(subject: InvoiceNotesSubject, page: number, filter: NotesFilter, related: boolean): object {
    return {
      PrimaryNoteTypeId: INVOICE_NOTE_TYPE_ID,
      BillingInvoiceId: subject.invoiceId,
      ...(related && subject.rentAgreementId ? { LeaseId: subject.rentAgreementId } : {}),
      PageNumber: page,
      PageSize: NOTES_PAGE_SIZE,
      FilterNoteTypeId: Number(filter.categoryId) || 0,
      UserId: Number(filter.userId) || 0,
      StartDate: filter.startDate,
      EndDate: filter.endDate
    };
  }

  /** The same for files, under `AttachmentFileFilterModel`'s names. */
  private filesFilter(subject: InvoiceNotesSubject, page: number, filter: NotesFilter, related: boolean): object {
    return {
      PrimaryAttachmentTypeId: INVOICE_ATTACHMENT_TYPE_ID,
      BillingInvoiceId: subject.invoiceId,
      ...(related && subject.rentAgreementId ? { LeaseId: subject.rentAgreementId } : {}),
      PageNumber: page,
      PageSize: NOTES_PAGE_SIZE,
      FilterAttachmentTypeId: Number(filter.categoryId) || 0,
      UserId: Number(filter.userId) || 0,
      StartDate: filter.startDate,
      EndDate: filter.endDate
    };
  }

  private readNotes(route: string, body: object): Observable<NotesListPage<InvoiceNote>> {
    return this.http.post<MerlinEnvelope<NotesPageWire>>(`${this.notesUrl}/${route}`, body).pipe(
      map((response) => {
        const page = response?.Data;
        return Array.isArray(page?.Collection)
          ? {
              items: page.Collection.map(InvoiceNotesService.noteFromWire),
              remaining: page.RemainingNotesCount ?? 0,
              pageNumber: page.PagingModel?.CurrentPage ?? 1,
              unavailable: false
            }
          : InvoiceNotesService.unavailablePage<InvoiceNote>();
      }),
      catchError(() => of(InvoiceNotesService.unavailablePage<InvoiceNote>()))
    );
  }

  private readFiles(route: string, body: object): Observable<NotesListPage<InvoiceFile>> {
    return this.http.post<MerlinEnvelope<AttachmentsPageWire>>(`${this.filesUrl}/${route}`, body).pipe(
      map((response) => {
        const page = response?.Data;
        return Array.isArray(page?.Collection)
          ? {
              items: page.Collection.map(InvoiceNotesService.fileFromWire),
              remaining: page.RemainingAttachmentsCount ?? 0,
              pageNumber: page.PagingModel?.CurrentPage ?? 1,
              unavailable: false
            }
          : InvoiceNotesService.unavailablePage<InvoiceFile>();
      }),
      catchError(() => of(InvoiceNotesService.unavailablePage<InvoiceFile>()))
    );
  }

  private readOptions(url: string, invoiceId: string): Observable<FilterOptionsResult> {
    const params = new HttpParams().set('BillingInvoiceId', invoiceId);

    return this.http.get<MerlinEnvelope<SelectedListItemWire[]>>(url, { params }).pipe(
      map((response) =>
        Array.isArray(response?.Data)
          ? { options: response.Data.map((item) => ({ value: item.Value, text: item.Text })), unavailable: false }
          : { options: [], unavailable: true }
      ),
      catchError(() => of({ options: [], unavailable: true }))
    );
  }

  /** A write merlin answers with a `bool` under `Data`: anything but `true` did not happen. */
  private write(url: string, body: object | null, params?: HttpParams): Observable<NotesWriteResult> {
    return this.http.post<MerlinEnvelope<boolean>>(url, body, { params }).pipe(
      map((response): NotesWriteResult =>
        response?.Data === true ? { ok: true } : InvoiceNotesService.refused(InvoiceNotesMessages.refused)
      ),
      catchError((err: unknown) => of(InvoiceNotesService.refusedBy(err)))
    );
  }

  private static unavailablePage<T>(): NotesListPage<T> {
    return { items: [], remaining: 0, pageNumber: 1, unavailable: true };
  }

  private static refused(message: string): NotesWriteRefused {
    return { ok: false, message };
  }

  /**
   * merlin's own sentence for a refused write, where it sent one.
   *
   * A handled exception comes back as merlin's envelope with the sentence under `Message.Message`
   * (`BasicExceptionFilterAttribute`, 422); an `AccessForbiddenException` as a bare string (403). Any
   * other string body — a proxy's HTML page, a gateway's 401 — is not a sentence for the owner, so it
   * falls back to the general one.
   */
  private static refusedBy(err: unknown): NotesWriteRefused {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as unknown;
      const enveloped = (body as MerlinEnvelope<unknown> | null)?.Message?.Message;

      if (typeof enveloped === 'string' && enveloped.trim()) {
        return InvoiceNotesService.refused(enveloped);
      }

      if (err.status === 403 && typeof body === 'string' && body.trim()) {
        return InvoiceNotesService.refused(body);
      }

      if (err.status === 0) {
        return InvoiceNotesService.refused(InvoiceNotesMessages.unreachable);
      }
    }

    return InvoiceNotesService.refused(InvoiceNotesMessages.refused);
  }

  private static noteFromWire(wire: NoteWire): InvoiceNote {
    return {
      noteId: wire.NoteId,
      text: wire.NoteText ?? '',
      heading: wire.NoteHeading ?? '',
      notesTypeId: wire.NotesTypeId,
      billingInvoiceId: wire.BillingInvoiceId ?? null,
      propertyDetails: wire.PropertyDetails ?? '',
      lastModifiedAt: wire.LastModifiedAt,
      lastModifiedBy: wire.LastModifiedBy ?? '',
      files: (wire.AssociatedFiles ?? []).map(InvoiceNotesService.attachmentFromWire)
    };
  }

  private static attachmentFromWire(wire: AssociatedFileWire): NoteAttachment {
    return {
      attachmentId: wire.AttachmentId,
      fileName: wire.FileName,
      fileType: wire.FileType,
      fileSize: wire.FileSize,
      downloadUrl: wire.DownloadUrl
    };
  }

  private static fileFromWire(wire: AttachmentWire): InvoiceFile {
    return {
      attachmentId: wire.AttachmentId,
      fileName: wire.FileName,
      fileType: wire.FileType,
      fileSize: wire.FileSize,
      downloadUrl: wire.DownloadUrl,
      heading: wire.AttachmentHeading ?? '',
      attachmentsTypeId: wire.AttachmentsTypeId,
      billingInvoiceId: wire.BillingInvoiceId ?? null,
      propertyDetails: wire.PropertyDetails ?? '',
      lastModifiedAt: wire.LastModifiedAt,
      lastModifiedBy: wire.LastModifiedBy ?? ''
    };
  }
}
