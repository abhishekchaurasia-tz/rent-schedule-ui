/**
 * The Notes & Files panel's shapes — Billing spec `20-invoice-notes-files.md` (v8), served by merlin's
 * existing `PropertyOwner/Notes/...` and `PropertyOwner/AttachmentFiles/...` routes (D6).
 *
 * **Two layers, as `owner-bank.models.ts` keeps them.** The `…Wire` types are merlin's, PascalCase and
 * named exactly as its view models are (`NoteViewModel`, `AttachmentFileViewModel`, `FileModel`,
 * `SelectedListItem`), so the mapping to its answer stays obvious. The camelCase types are what the
 * panel reads. `InvoiceNotesService` is the only place the two meet.
 */

/** merlin's note type for an invoice note (`NotesTypeEnum.InvoiceNotes`). */
export const INVOICE_NOTE_TYPE_ID = 257;

/** merlin's attachment type for an invoice file (`AttachmentType.InvoiceAttachment`). */
export const INVOICE_ATTACHMENT_TYPE_ID = 342;

/** The primary lists' page size; merlin pins it server-side, this only says so (spec Flow 1 step 6). */
export const NOTES_PAGE_SIZE = 5;

/** The owner app's upload limit, byte for byte (`MAX_FILE_SIZE = 20971520`). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** The owner app's accepted extensions (`ValidExtension`), compared lower-case. */
export const ALLOWED_UPLOAD_EXTENSIONS: readonly string[] = [
  'jpg',
  'jpeg',
  'png',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'txt'
];

// ---- merlin, on the wire --------------------------------------------------------------------------

/**
 * merlin's standard envelope (`ResponseModel`): the answer is under `Data`. `Data` is optional because
 * an error-shaped answer may omit it, and a missing answer has to read as "unavailable" rather than
 * throwing while mapping.
 */
export interface MerlinEnvelope<T> {
  Data?: T | null;
  Message?: { Message?: string | null } | null;
}

/** One file attached to a note (`AssociatedFileViewModel`). */
export interface AssociatedFileWire {
  AttachmentId: number;
  FileName: string;
  FileType: string;
  FileSize: string;
  DownloadUrl: string;
}

/**
 * One note (`NoteViewModel`). `BillingInvoiceId` is spec 20's additive field: present on a Billing
 * invoice's row and **absent** from every other row's JSON (S6, BR-14).
 */
export interface NoteWire {
  NoteId: number;
  NoteText: string;
  NoteHeading: string;
  NoteHeaderId: number;
  NotesTypeId: number;
  PropertyDetails: string | null;
  LastModifiedAt: string;
  LastModifiedBy: string;
  AssociatedFiles?: AssociatedFileWire[] | null;
  BillingInvoiceId?: string | null;
}

/**
 * One page of notes (`NotesViewModel`). `PagingModel.TotalRecords` is every note the read matched, past
 * this page too — the "Notes (n)" count (`InvoiceNotesService.count`).
 */
export interface NotesPageWire {
  Collection?: NoteWire[] | null;
  RemainingNotesCount?: number | null;
  PagingModel?: { CurrentPage?: number | null; TotalRecords?: number | null } | null;
}

/** One file (`AttachmentFileViewModel`), with spec 20's additive `BillingInvoiceId`. */
export interface AttachmentWire {
  AttachmentId: number;
  FileName: string;
  FileType: string;
  FileSize: string;
  DownloadUrl: string;
  AttachmentHeading: string;
  AttachmentHeaderId: number;
  AttachmentsTypeId: number;
  PropertyDetails: string | null;
  LastModifiedAt: string;
  LastModifiedBy: string;
  BillingInvoiceId?: string | null;
}

/** One page of files (`AttachmentFilesViewModel`). */
export interface AttachmentsPageWire {
  Collection?: AttachmentWire[] | null;
  RemainingAttachmentsCount?: number | null;
  PagingModel?: { CurrentPage?: number | null } | null;
}

/** One dropdown option (`SelectedListItem`): a user or a category. */
export interface SelectedListItemWire {
  Text: string;
  Value: string;
  Selected?: boolean;
}

/**
 * A file staged by `public/File/Upload/TempSaveFile` (`FileModel`), as the owner app's `AttachmentDto`
 * reads it. **Passed back to `SaveAttachments` untouched** — merlin moves it out of the temp location
 * by these fields, and nothing here reads them beyond the caption.
 */
export interface TempFileWire {
  Id: number;
  Caption: string;
  FileName: string;
  FolderPath: string;
  FileSize: number;
  Url: string;
  [field: string]: unknown;
}

// ---- what the panel reads -------------------------------------------------------------------------

/** One file attached to a note. */
export interface NoteAttachment {
  attachmentId: number;
  fileName: string;
  fileType: string;
  fileSize: string;
  downloadUrl: string;
}

/** One note, in the panel's words. */
export interface InvoiceNote {
  noteId: number;
  text: string;
  /** `INV-…` on a Billing invoice's note (BR-14); a lease, property or legacy invoice header otherwise. */
  heading: string;
  notesTypeId: number;
  /** Set only on a Billing invoice's row — the one kind of heading this app can open (spec, header click). */
  billingInvoiceId: string | null;
  propertyDetails: string;
  lastModifiedAt: string;
  lastModifiedBy: string;
  files: NoteAttachment[];
}

/** One file, in the panel's words. */
export interface InvoiceFile {
  attachmentId: number;
  fileName: string;
  fileType: string;
  fileSize: string;
  downloadUrl: string;
  heading: string;
  attachmentsTypeId: number;
  billingInvoiceId: string | null;
  propertyDetails: string;
  lastModifiedAt: string;
  lastModifiedBy: string;
}

/**
 * One page of a list.
 *
 * **"Nothing here" and "could not read it" are not the same thing**, as `OwnerBankListResult` already
 * says for the bank list: both leave `items` empty, but only one of them is a fact about this invoice.
 * The panel says "unavailable" for the second rather than "no notes yet".
 */
export interface NotesListPage<T> {
  items: T[];
  /** How many more merlin holds past this page — what "View More" is offered on. */
  remaining: number;
  pageNumber: number;
  /** True when the read failed outright, rather than answering an empty page. */
  unavailable: boolean;
}

/** The "Notes (n)" count, or `unavailable` when merlin did not answer one. */
export interface NotesCountResult {
  count: number;
  unavailable: boolean;
}

/** A dropdown option, in the panel's words. */
export interface FilterOption {
  value: string;
  text: string;
}

/** The dropdown options, or `unavailable` when merlin did not answer them. */
export interface FilterOptionsResult {
  options: FilterOption[];
  unavailable: boolean;
}

/**
 * The three filters (spec Flow 1 step 5). Blank means "any": `''` for a dropdown, `null` for a date.
 * Dates are `YYYY-MM-DD`.
 */
export interface NotesFilter {
  startDate: string | null;
  endDate: string | null;
  categoryId: string;
  userId: string;
}

/** No filter at all. */
export const NO_NOTES_FILTER: NotesFilter = { startDate: null, endDate: null, categoryId: '', userId: '' };

/**
 * The outcome of one write. A refusal **answers rather than throwing** and carries merlin's own sentence
 * where it sent one (`Invoice has been deleted`, `Invoice not found`, the "try again" of an unreachable
 * Billing), so the panel can say why.
 */
export type NotesWriteResult = { ok: true } | NotesWriteRefused;

/** `SaveNote`'s outcome: the new note's id, which `SaveAttachments` then carries (spec Flow 2). */
export type NoteSavedResult = { ok: true; noteId: number } | NotesWriteRefused;

/** `TempSaveFile`'s outcome: the staged file, to hand back to `SaveAttachments` untouched. */
export type TempUploadResult = { ok: true; file: TempFileWire } | NotesWriteRefused;

/** A refused write, in words fit to show. */
export interface NotesWriteRefused {
  ok: false;
  message: string;
}

/** Which invoice a request is about: Billing's id, and the agreement its Related list follows. */
export interface InvoiceNotesSubject {
  invoiceId: string;
  /** The invoice's `rentAgreementId`, sent as Related's `LeaseId`; `null` lets merlin fall back (BR-13). */
  rentAgreementId: string | null;
}
