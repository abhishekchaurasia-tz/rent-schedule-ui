import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import {
  AttachmentWire,
  InvoiceFile,
  InvoiceNote,
  InvoiceNotesSubject,
  NO_NOTES_FILTER,
  NoteWire,
  NotesListPage,
  NotesWriteResult,
  TempFileWire,
  TempUploadResult
} from './invoice-notes.models';
import { InvoiceNotesMessages, InvoiceNotesService } from './invoice-notes.service';

/**
 * Covers M13 of plan `20-invoice-notes-files` — the merlin notes and files calls of spec 20 v8: Flow 1 – 4,
 * BR-19, BR-22 (every request carries `BillingInvoiceId` and never `InvoiceId`) and the "unavailable"
 * answer `OwnerBankService` already gives.
 */
describe('InvoiceNotesService', () => {
  const merlin = `${environment.monolithBaseUrl}/PropertyOwner`;
  const invoiceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const otherInvoiceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const agreementId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const subject: InvoiceNotesSubject = { invoiceId, rentAgreementId: agreementId };

  let service: InvoiceNotesService;
  let http: HttpTestingController;
  let sent: TestRequest[];

  /** merlin's envelope, as the gateway returns it. */
  const envelope = <T>(data: T) => ({
    Message: { Message: 'Request succeeded successfully.', MessageType: 1 },
    Data: data,
    IsFeedbackSet: true
  });

  /** merlin's 422: a handled exception's message, in the same envelope (`BasicExceptionFilterAttribute`). */
  const refusal = (message: string) => ({ Message: { Message: message, MessageType: 3 }, Data: null, IsFeedbackSet: true });

  const billingNote: NoteWire = {
    NoteId: 41,
    NoteText: 'Tenant asked for a copy',
    NoteHeading: 'INV-102026-000123',
    NoteHeaderId: 0,
    NotesTypeId: 257,
    PropertyDetails: 'Elm Street | Unit 2',
    LastModifiedAt: '2026-10-15T10:00:00',
    LastModifiedBy: 'Pat Owner',
    AssociatedFiles: [
      { AttachmentId: 7, FileName: 'receipt.pdf', FileType: 'pdf', FileSize: '12 KB', DownloadUrl: 'https://cdn.test/receipt.pdf' }
    ],
    BillingInvoiceId: invoiceId
  };

  /** A lease note in Related: no `BillingInvoiceId` on the wire at all (S6). */
  const leaseNote: NoteWire = {
    NoteId: 42,
    NoteText: 'Lease renewed',
    NoteHeading: 'Lease 2026',
    NoteHeaderId: 9001,
    NotesTypeId: 366,
    PropertyDetails: 'Elm Street | Unit 2',
    LastModifiedAt: '2026-10-01T09:00:00',
    LastModifiedBy: 'Pat Owner',
    AssociatedFiles: []
  };

  const billingFile: AttachmentWire = {
    AttachmentId: 8,
    FileName: 'lease.pdf',
    FileType: 'pdf',
    FileSize: '40 KB',
    DownloadUrl: 'https://cdn.test/lease.pdf',
    AttachmentHeading: 'INV-102026-000124',
    AttachmentHeaderId: 0,
    AttachmentsTypeId: 342,
    PropertyDetails: 'Elm Street | Unit 2',
    LastModifiedAt: '2026-10-15T11:00:00',
    LastModifiedBy: 'Pat Owner',
    BillingInvoiceId: otherInvoiceId
  };

  const staged: TempFileWire = {
    Id: 0,
    Caption: 'receipt.pdf',
    FileName: '0f1e_receipt.pdf',
    FolderPath: '/temp',
    FileSize: 12288,
    Url: 'https://cdn.test/temp/0f1e_receipt.pdf',
    IsTemporaryLocated: true
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(InvoiceNotesService);
    http = TestBed.inject(HttpTestingController);
    sent = [];
  });

  afterEach(() => http.verify());

  /** Takes the one request to `path` and remembers it, for the BR-22 sweep. */
  function expectOne(path: string): TestRequest {
    const request = http.expectOne((candidate) => candidate.url === `${merlin}/${path}`);
    sent.push(request);
    return request;
  }

  /** Every way a request can carry an identifier: its body's keys and its query's. */
  function identifierKeys(request: TestRequest): string[] {
    const body = request.request.body;
    const bodyKeys = body && !(body instanceof FormData) && typeof body === 'object' ? Object.keys(body) : [];
    return [...bodyKeys, ...request.request.params.keys()];
  }

  // ---- count (Flow 1 step 1, P6, BR-19) ------------------------------------------------------------

  // merlin's `GET Notes/GetNotesCount` takes its filter as a complex parameter under `[ApiController]`,
  // which binds from the body -- a query-string call cannot reach it, and merlin's legacy binding is not
  // changed (D6). The count is the primary read's own `PagingModel.TotalRecords` instead.
  it('Flow1_Count_IsThePrimaryReadsTotalRecords_PostedLikeThePanelsFirstPage', () => {
    let answered: unknown;
    service.count(invoiceId).subscribe((result) => (answered = result));

    const request = expectOne('Notes/GetPrimaryNotes');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      PrimaryNoteTypeId: 257,
      BillingInvoiceId: invoiceId,
      PageNumber: 1,
      PageSize: 5,
      FilterNoteTypeId: 0,
      UserId: 0,
      StartDate: null,
      EndDate: null
    });
    request.flush(
      envelope({ Collection: [billingNote], RemainingNotesCount: 2, PagingModel: { CurrentPage: 1, TotalRecords: 7 } })
    );

    // TotalRecords, not the page's length and not the remainder: seven notes, of which one page shows five.
    expect(answered).toEqual({ count: 7, unavailable: false });
  });

  it('Flow1_Count_NeverCallsGetNotesCount', () => {
    service.count(invoiceId).subscribe();

    expectOne('Notes/GetPrimaryNotes').flush(envelope({ Collection: [], PagingModel: { CurrentPage: 1, TotalRecords: 0 } }));

    http.expectNone((request) => request.url.includes('GetNotesCount'));
  });

  it('Flow1_CountFails_AnswersUnavailableRatherThanZero', () => {
    let answered: unknown;
    service.count(invoiceId).subscribe((result) => (answered = result));

    expectOne('Notes/GetPrimaryNotes').flush('', { status: 401, statusText: 'Unauthorized' });

    expect(answered).toEqual({ count: 0, unavailable: true });
  });

  it('Flow1_CountWithNoTotalInTheEnvelope_IsUnavailable', () => {
    const answered: unknown[] = [];
    service.count(invoiceId).subscribe((result) => answered.push(result));
    service.count(invoiceId).subscribe((result) => answered.push(result));

    const [noData, noTotal] = http.match((request) => request.url === `${merlin}/Notes/GetPrimaryNotes`);
    noData.flush({ Data: null });
    noTotal.flush(envelope({ Collection: [], PagingModel: { CurrentPage: 1 } }));

    expect(answered).toEqual([
      { count: 0, unavailable: true },
      { count: 0, unavailable: true }
    ]);
  });

  // ---- primary and related notes (Flow 1 steps 3 and 4) --------------------------------------------

  it('Flow1_PrimaryNotes_PostsTheInvoiceTypeTheBillingIdAndThePage', () => {
    let answered: NotesListPage<InvoiceNote> | undefined;
    service.primaryNotes(subject, 2, NO_NOTES_FILTER).subscribe((page) => (answered = page));

    const request = expectOne('Notes/GetPrimaryNotes');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      PrimaryNoteTypeId: 257,
      BillingInvoiceId: invoiceId,
      PageNumber: 2,
      PageSize: 5,
      FilterNoteTypeId: 0,
      UserId: 0,
      StartDate: null,
      EndDate: null
    });
    request.flush(envelope({ Collection: [billingNote], RemainingNotesCount: 4, PagingModel: { CurrentPage: 2 } }));

    expect(answered).toEqual({
      items: [
        {
          noteId: 41,
          text: 'Tenant asked for a copy',
          heading: 'INV-102026-000123',
          notesTypeId: 257,
          billingInvoiceId: invoiceId,
          propertyDetails: 'Elm Street | Unit 2',
          lastModifiedAt: '2026-10-15T10:00:00',
          lastModifiedBy: 'Pat Owner',
          files: [
            { attachmentId: 7, fileName: 'receipt.pdf', fileType: 'pdf', fileSize: '12 KB', downloadUrl: 'https://cdn.test/receipt.pdf' }
          ]
        }
      ],
      remaining: 4,
      pageNumber: 2,
      unavailable: false
    });
  });

  it('Flow1_PrimaryNotes_SendsTheThreeFiltersAsMerlinNamesThem', () => {
    service
      .primaryNotes(subject, 1, { startDate: '2026-10-01', endDate: '2026-10-31', categoryId: '257', userId: '9876' })
      .subscribe();

    const body = expectOne('Notes/GetPrimaryNotes').request.body;
    expect(body.StartDate).toBe('2026-10-01');
    expect(body.EndDate).toBe('2026-10-31');
    expect(body.FilterNoteTypeId).toBe(257);
    expect(body.UserId).toBe(9876);
    sent[0].flush(envelope({ Collection: [], RemainingNotesCount: 0 }));
  });

  it('Flow1_RelatedNotes_SendsLeaseIdAsTheInvoicesRentAgreementId', () => {
    let answered: NotesListPage<InvoiceNote> | undefined;
    service.relatedNotes(subject, 1, NO_NOTES_FILTER).subscribe((page) => (answered = page));

    const request = expectOne('Notes/GetRelatedNotes');
    expect(request.request.body.PrimaryNoteTypeId).toBe(257);
    expect(request.request.body.BillingInvoiceId).toBe(invoiceId);
    expect(request.request.body.LeaseId).toBe(agreementId);
    request.flush(envelope({ Collection: [leaseNote], RemainingNotesCount: 0, PagingModel: { CurrentPage: 1 } }));

    // A legacy row carries no BillingInvoiceId on the wire; it reads as null, never as undefined.
    expect(answered?.items[0].billingInvoiceId).toBeNull();
    expect(answered?.items[0].heading).toBe('Lease 2026');
  });

  it('BR13_RelatedNotesWithNoAgreement_OmitsLeaseIdSoMerlinFallsBack', () => {
    service.relatedNotes({ invoiceId, rentAgreementId: null }, 1, NO_NOTES_FILTER).subscribe();

    const request = expectOne('Notes/GetRelatedNotes');
    expect('LeaseId' in request.request.body).toBeFalse();
    request.flush(envelope({ Collection: [] }));
  });

  it('Flow1_NotesReadFails_AnswersUnavailableRatherThanAnEmptyList', () => {
    let answered: NotesListPage<InvoiceNote> | undefined;
    service.primaryNotes(subject, 1, NO_NOTES_FILTER).subscribe((page) => (answered = page));

    expectOne('Notes/GetPrimaryNotes').flush(refusal('boom'), { status: 500, statusText: 'Server Error' });

    expect(answered).toEqual({ items: [], remaining: 0, pageNumber: 1, unavailable: true });
  });

  it('Flow1_NotesEnvelopeWithNoCollection_IsUnavailable', () => {
    let answered: NotesListPage<InvoiceNote> | undefined;
    service.relatedNotes(subject, 1, NO_NOTES_FILTER).subscribe((page) => (answered = page));

    expectOne('Notes/GetRelatedNotes').flush({ Data: null });

    expect(answered?.unavailable).toBeTrue();
  });

  // ---- primary and related files --------------------------------------------------------------------

  it('Flow1_PrimaryFiles_PostsTheAttachmentTypeAndTheBillingId', () => {
    let answered: NotesListPage<InvoiceFile> | undefined;
    service.primaryFiles(subject, 1, { ...NO_NOTES_FILTER, categoryId: '342' }).subscribe((page) => (answered = page));

    const request = expectOne('AttachmentFiles/GetPrimaryAttachments');
    expect(request.request.body).toEqual({
      PrimaryAttachmentTypeId: 342,
      BillingInvoiceId: invoiceId,
      PageNumber: 1,
      PageSize: 5,
      FilterAttachmentTypeId: 342,
      UserId: 0,
      StartDate: null,
      EndDate: null
    });
    request.flush(envelope({ Collection: [billingFile], RemainingAttachmentsCount: 0, PagingModel: { CurrentPage: 1 } }));

    expect(answered?.items).toEqual([
      {
        attachmentId: 8,
        fileName: 'lease.pdf',
        fileType: 'pdf',
        fileSize: '40 KB',
        downloadUrl: 'https://cdn.test/lease.pdf',
        heading: 'INV-102026-000124',
        attachmentsTypeId: 342,
        billingInvoiceId: otherInvoiceId,
        propertyDetails: 'Elm Street | Unit 2',
        lastModifiedAt: '2026-10-15T11:00:00',
        lastModifiedBy: 'Pat Owner'
      }
    ]);
  });

  it('Flow1_RelatedFiles_SendsLeaseIdAsTheInvoicesRentAgreementId', () => {
    service.relatedFiles(subject, 3, NO_NOTES_FILTER).subscribe();

    const request = expectOne('AttachmentFiles/GetRelatedAttachments');
    expect(request.request.body.PrimaryAttachmentTypeId).toBe(342);
    expect(request.request.body.BillingInvoiceId).toBe(invoiceId);
    expect(request.request.body.LeaseId).toBe(agreementId);
    expect(request.request.body.PageNumber).toBe(3);
    request.flush(envelope({ Collection: [], RemainingAttachmentsCount: 0 }));
  });

  it('Flow1_FilesReadFails_AnswersUnavailable', () => {
    let answered: NotesListPage<InvoiceFile> | undefined;
    service.primaryFiles(subject, 1, NO_NOTES_FILTER).subscribe((page) => (answered = page));

    expectOne('AttachmentFiles/GetPrimaryAttachments').error(new ProgressEvent('network'));

    expect(answered).toEqual({ items: [], remaining: 0, pageNumber: 1, unavailable: true });
  });

  // ---- writes (Flow 2 – 4) ---------------------------------------------------------------------------

  it('Flow2_SaveNote_PostsTheTextTheInvoiceTypeAndTheBillingId_AndAnswersTheNoteId', () => {
    let answered: unknown;
    service.saveNote(invoiceId, 'Tenant asked for a copy').subscribe((result) => (answered = result));

    const request = expectOne('Notes/SaveNote');
    // PostedById is ignored on the Billing path (BR-08): merlin takes the poster from the session.
    expect(request.request.body).toEqual({
      NoteText: 'Tenant asked for a copy',
      NotesTypeId: 257,
      BillingInvoiceId: invoiceId,
      PostedById: 0
    });
    request.flush(envelope(41));

    expect(answered).toEqual({ ok: true, noteId: 41 });
  });

  it('Flow2_SaveNoteRefused_CarriesMerlinsOwnSentence', () => {
    let answered: unknown;
    service.saveNote(invoiceId, 'late').subscribe((result) => (answered = result));

    expectOne('Notes/SaveNote').flush(refusal('Invoice has been deleted'), { status: 422, statusText: 'Unprocessable' });

    expect(answered).toEqual({ ok: false, message: 'Invoice has been deleted' });
  });

  it('Flow2_SaveNoteWithNoIdInTheAnswer_IsRefusedRatherThanPostingFilesToNothing', () => {
    let answered: unknown;
    service.saveNote(invoiceId, 'text').subscribe((result) => (answered = result));

    expectOne('Notes/SaveNote').flush({ Data: null });

    expect((answered as { ok: boolean }).ok).toBeFalse();
  });

  it('Flow2_SaveFiles_PostsTheStagedFilesWithTheNoteId', () => {
    let answered: NotesWriteResult | undefined;
    service.saveFiles(invoiceId, [staged], 41).subscribe((result) => (answered = result));

    const request = expectOne('AttachmentFiles/SaveAttachments');
    expect(request.request.body).toEqual({
      AttachmentTypeId: 342,
      BillingInvoiceId: invoiceId,
      NoteId: 41,
      Files: [staged],
      PostedById: 0
    });
    request.flush(envelope(true));

    expect(answered).toEqual({ ok: true });
  });

  it('Flow3_SaveFilesOnly_SendsANullNoteId', () => {
    service.saveFiles(invoiceId, [staged], null).subscribe();

    const request = expectOne('AttachmentFiles/SaveAttachments');
    expect(request.request.body.NoteId).toBeNull();
    request.flush(envelope(true));
  });

  it('Flow3_SaveFilesAnsweredFalse_IsRefused', () => {
    let answered: NotesWriteResult | undefined;
    service.saveFiles(invoiceId, [staged], null).subscribe((result) => (answered = result));

    expectOne('AttachmentFiles/SaveAttachments').flush(envelope(false));

    expect(answered?.ok).toBeFalse();
  });

  it('Flow4_UpdateNote_PostsMerlinsUpdateShape', () => {
    let answered: NotesWriteResult | undefined;
    service.updateNote(invoiceId, 41, 'Edited').subscribe((result) => (answered = result));

    const request = expectOne('Notes/UpdateNote');
    expect(request.request.body).toEqual({ NoteId: 41, UpdatedNotes: 'Edited', BillingInvoiceId: invoiceId });
    request.flush(envelope(true));

    expect(answered).toEqual({ ok: true });
  });

  it('Flow4_DeleteNote_PostsTheNoteIdOnTheQuery', () => {
    service.deleteNote(invoiceId, 41).subscribe();

    const request = expectOne('Notes/DeleteNote');
    expect(request.request.method).toBe('POST');
    expect(request.request.params.get('noteId')).toBe('41');
    expect(request.request.params.get('BillingInvoiceId')).toBe(invoiceId);
    request.flush(envelope(true));
  });

  it('Flow4_RenameFile_PostsMerlinsUpdateShape', () => {
    service.renameFile(invoiceId, 8, 'lease-signed.pdf').subscribe();

    const request = expectOne('AttachmentFiles/UpdateAttachment');
    expect(request.request.body).toEqual({ AttachmentId: 8, UpdatedFileName: 'lease-signed.pdf', BillingInvoiceId: invoiceId });
    request.flush(envelope(true));
  });

  it('Flow4_DeleteFile_PostsTheAttachmentIdOnTheQuery', () => {
    service.deleteFile(invoiceId, 8).subscribe();

    const request = expectOne('AttachmentFiles/DeleteAttachment');
    expect(request.request.params.get('attachmentId')).toBe('8');
    request.flush(envelope(true));
  });

  it('Flow4_ForeignRowRefusedWith403_CarriesMerlinsPlainTextMessage', () => {
    let answered: NotesWriteResult | undefined;
    service.deleteNote(invoiceId, 41).subscribe((result) => (answered = result));

    // AccessForbiddenException is answered as a bare string, not the envelope (BR-16).
    expectOne('Notes/DeleteNote').flush('You do not have access to this note.', { status: 403, statusText: 'Forbidden' });

    expect(answered).toEqual({ ok: false, message: 'You do not have access to this note.' });
  });

  it('Flow4_WriteFailsWithNoSentence_SaysSoInGeneralTerms', () => {
    let answered: NotesWriteResult | undefined;
    service.renameFile(invoiceId, 8, 'x.pdf').subscribe((result) => (answered = result));

    expectOne('AttachmentFiles/UpdateAttachment').error(new ProgressEvent('network'));

    expect(answered?.ok).toBeFalse();
    expect((answered as { message: string }).message).toBe(InvoiceNotesMessages.unreachable);
  });

  // ---- filters and the temp upload ------------------------------------------------------------------

  it('Flow1_FilterLists_MapMerlinsSelectItems', () => {
    let users: unknown;
    let noteCategories: unknown;
    let fileCategories: unknown;
    service.users(invoiceId).subscribe((result) => (users = result));
    service.noteCategories(invoiceId).subscribe((result) => (noteCategories = result));
    service.fileCategories(invoiceId).subscribe((result) => (fileCategories = result));

    expectOne('Notes/GetFilterUserList').flush(envelope([{ Text: 'Pat Owner', Value: '9876', Selected: false }]));
    expectOne('Notes/GetNotesCategoryList').flush(envelope([{ Text: 'Invoice Notes', Value: '257', Selected: false }]));
    expectOne('AttachmentFiles/GetAttachmentsCategoryList').flush('', { status: 500, statusText: 'Server Error' });

    expect(users).toEqual({ options: [{ value: '9876', text: 'Pat Owner' }], unavailable: false });
    expect(noteCategories).toEqual({ options: [{ value: '257', text: 'Invoice Notes' }], unavailable: false });
    expect(fileCategories).toEqual({ options: [], unavailable: true });
    expect(sent.every((request) => request.request.method === 'GET')).toBeTrue();
  });

  it('Flow2_TempUpload_PostsTheFileAsMultipartFieldFile_AndAnswersTheStagedFile', () => {
    let answered: TempUploadResult | undefined;
    const file = new File(['hello'], 'receipt.pdf', { type: 'application/pdf' });

    service.uploadTemp(file).subscribe((result) => (answered = result));

    const request = http.expectOne(`${environment.monolithBaseUrl}/public/File/Upload/TempSaveFile`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body instanceof FormData).toBeTrue();
    expect((request.request.body as FormData).get('file')).toBe(file);
    request.flush(envelope(staged));

    expect(answered).toEqual({ ok: true, file: staged });
  });

  it('Flow2_TempUploadFails_IsRefusedNotThrown', () => {
    let answered: TempUploadResult | undefined;

    service.uploadTemp(new File(['x'], 'a.pdf')).subscribe((result) => (answered = result));

    http
      .expectOne(`${environment.monolithBaseUrl}/public/File/Upload/TempSaveFile`)
      .flush(refusal('Invalid file format'), { status: 422, statusText: 'Unprocessable' });

    expect(answered).toEqual({ ok: false, message: 'Invalid file format' });
  });

  // ---- BR-22, across every notes and files call -------------------------------------------------------

  it('BR22_EveryNotesAndFilesRequest_CarriesBillingInvoiceIdAndNeverInvoiceId', () => {
    service.count(invoiceId).subscribe();
    service.primaryNotes(subject, 1, NO_NOTES_FILTER).subscribe();
    service.relatedNotes(subject, 1, NO_NOTES_FILTER).subscribe();
    service.saveNote(invoiceId, 'text').subscribe();
    service.updateNote(invoiceId, 41, 'text').subscribe();
    service.deleteNote(invoiceId, 41).subscribe();
    service.primaryFiles(subject, 1, NO_NOTES_FILTER).subscribe();
    service.relatedFiles(subject, 1, NO_NOTES_FILTER).subscribe();
    service.saveFiles(invoiceId, [staged], null).subscribe();
    service.renameFile(invoiceId, 8, 'x.pdf').subscribe();
    service.deleteFile(invoiceId, 8).subscribe();
    service.users(invoiceId).subscribe();
    service.noteCategories(invoiceId).subscribe();
    service.fileCategories(invoiceId).subscribe();

    const requests = http.match((request) => request.url.startsWith(merlin));
    expect(requests.length).toBe(14);
    // The count rides the primary read (merlin's GetNotesCount cannot bind a query); nothing calls it.
    expect(requests.filter((request) => request.request.url.includes('GetNotesCount'))).toEqual([]);
    expect(requests.filter((request) => request.request.url === `${merlin}/Notes/GetPrimaryNotes`).length).toBe(2);

    for (const request of requests) {
      const keys = identifierKeys(request);
      const body = request.request.body as Record<string, unknown> | null;
      const carried = body?.['BillingInvoiceId'] ?? request.request.params.get('BillingInvoiceId');

      expect(carried).withContext(request.request.url).toBe(invoiceId);
      expect(keys.map((key) => key.toLowerCase()))
        .withContext(`${request.request.url} must never name merlin's numeric invoice id`)
        .not.toContain('invoiceid');
      request.flush(envelope(null));
    }
  });
});
