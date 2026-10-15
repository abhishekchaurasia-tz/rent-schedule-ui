import { HttpClientTestingModule, HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { InvoiceNotesPanelComponent, InvoiceNotesPanelMessages } from './invoice-notes-panel.component';
import { AttachmentWire, MAX_UPLOAD_BYTES, NoteWire, TempFileWire } from './invoice-notes.models';

/**
 * Covers M14 of plan `20-invoice-notes-files` — the Notes & Files side panel of spec 20 v8, Flows 1 – 4:
 * tabs, paging, Related, posting, edit / rename / delete, filters, upload limits, the Related header
 * click, and merlin being unavailable.
 */
describe('InvoiceNotesPanelComponent', () => {
  let fixture: ComponentFixture<InvoiceNotesPanelComponent>;
  let component: InvoiceNotesPanelComponent;
  let httpMock: HttpTestingController;
  let closed: number;

  const merlin = `${environment.monolithBaseUrl}/PropertyOwner`;
  const uploadUrl = `${environment.monolithBaseUrl}/public/File/Upload/TempSaveFile`;
  const invoiceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const siblingInvoiceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const agreementId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const envelope = <T>(data: T) => ({ Message: { Message: 'Request succeeded successfully.' }, Data: data });
  const refusal = (message: string) => ({ Message: { Message: message }, Data: null });

  function note(noteId: number, overrides: Partial<NoteWire> = {}): NoteWire {
    return {
      NoteId: noteId,
      NoteText: `Note ${noteId}`,
      NoteHeading: 'INV-102026-000123',
      NoteHeaderId: 0,
      NotesTypeId: 257,
      PropertyDetails: 'Elm Street | Unit 2',
      LastModifiedAt: '2026-10-15T10:00:00',
      LastModifiedBy: 'Pat Owner',
      AssociatedFiles: [],
      BillingInvoiceId: invoiceId,
      ...overrides
    };
  }

  function file(attachmentId: number, overrides: Partial<AttachmentWire> = {}): AttachmentWire {
    return {
      AttachmentId: attachmentId,
      FileName: `file-${attachmentId}.pdf`,
      FileType: 'pdf',
      FileSize: '12 KB',
      DownloadUrl: `https://cdn.test/file-${attachmentId}.pdf`,
      AttachmentHeading: 'INV-102026-000123',
      AttachmentHeaderId: 0,
      AttachmentsTypeId: 342,
      PropertyDetails: 'Elm Street | Unit 2',
      LastModifiedAt: '2026-10-15T10:00:00',
      LastModifiedBy: 'Pat Owner',
      BillingInvoiceId: invoiceId,
      ...overrides
    };
  }

  const notesPage = (items: NoteWire[], remaining = 0, currentPage = 1) =>
    envelope({ Collection: items, RemainingNotesCount: remaining, PagingModel: { CurrentPage: currentPage } });

  const filesPage = (items: AttachmentWire[], remaining = 0, currentPage = 1) =>
    envelope({ Collection: items, RemainingAttachmentsCount: remaining, PagingModel: { CurrentPage: currentPage } });

  const staged = (name: string): TempFileWire => ({
    Id: 0,
    Caption: name,
    FileName: `0f1e_${name}`,
    FolderPath: '/temp',
    FileSize: 1024,
    Url: `https://cdn.test/temp/0f1e_${name}`
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceNotesPanelComponent, HttpClientTestingModule],
      providers: [provideRouter([])]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(InvoiceNotesPanelComponent);
    component = fixture.componentInstance;
    component.invoiceId = invoiceId;
    component.invoiceNumber = 'INV-102026-000123';
    component.rentAgreementId = agreementId;
    closed = 0;
    component.closed.subscribe(() => closed++);
  });

  afterEach(() => httpMock.verify());

  function page(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function texts(selector: string): string[] {
    return Array.from(page().querySelectorAll(selector)).map((element) => element.textContent!.replace(/\s+/g, ' ').trim());
  }

  function click(selector: string): void {
    (page().querySelector(selector) as HTMLElement).click();
    fixture.detectChanges();
  }

  function expectCall(route: string): TestRequest {
    return httpMock.expectOne((request) => request.url === `${merlin}/${route}`);
  }

  /** Opens the panel and answers its five opening reads. */
  function open(notes = notesPage([note(41)]), files = filesPage([file(8)])): void {
    fixture.detectChanges();
    expectCall('Notes/GetPrimaryNotes').flush(notes);
    expectCall('AttachmentFiles/GetPrimaryAttachments').flush(files);
    expectCall('Notes/GetFilterUserList').flush(envelope([{ Text: 'Pat Owner', Value: '9876' }]));
    expectCall('Notes/GetNotesCategoryList').flush(envelope([{ Text: 'Invoice Notes', Value: '257' }]));
    expectCall('AttachmentFiles/GetAttachmentsCategoryList').flush(envelope([{ Text: 'Invoice Files', Value: '342' }]));
    fixture.detectChanges();
  }

  /** Answers the reload every successful write ends with: both primary lists, page 1. */
  function answerReload(notes = notesPage([note(41)]), files = filesPage([file(8)])): void {
    const reloadNotes = expectCall('Notes/GetPrimaryNotes');
    expect(reloadNotes.request.body.PageNumber).toBe(1);
    reloadNotes.flush(notes);
    expectCall('AttachmentFiles/GetPrimaryAttachments').flush(files);
    fixture.detectChanges();
  }

  function pdf(name = 'receipt.pdf', size = 1024): File {
    const chosen = new File(['%PDF'], name, { type: 'application/pdf' });
    Object.defineProperty(chosen, 'size', { value: size });
    return chosen;
  }

  function typeNote(text: string): void {
    const box = page().querySelector('.composer textarea') as HTMLTextAreaElement;
    box.value = text;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  // ---- Flow 1: opening, tabs, paging -------------------------------------------------------------

  it('Flow1_Open_ReadsBothPrimaryListsAndTheFilters_AndShowsEachNotesHeading', () => {
    open();

    expect(texts('.panel-head h2')).toEqual(['NOTES & FILES']);
    expect(texts('.panel-head .invoice-number')).toEqual(['INV-102026-000123']);
    expect(texts('.primary-list .item-heading')).toEqual(['INV-102026-000123']);
    expect(texts('.primary-list .item-text')).toEqual(['Note 41']);
    // Related is read only when it is opened.
    httpMock.expectNone(`${merlin}/Notes/GetRelatedNotes`);
  });

  it('Flow1_Tabs_SwitchBetweenNotesAndFiles', () => {
    open();

    expect(texts('.tab-btn.active')).toEqual(['NOTES']);

    click('.tab-btn.files-tab');

    expect(texts('.tab-btn.active')).toEqual(['FILES']);
    expect(texts('.primary-list .file-name')).toEqual(['file-8.pdf']);
    expect(page().querySelector('.primary-list .item-text')).toBeNull();
  });

  it('Flow1_PrimaryList_ShowsFiveAndViewMoreAppendsTheNextPage', () => {
    open(notesPage([note(1), note(2), note(3), note(4), note(5)], 3));

    expect(page().querySelectorAll('.primary-list .item').length).toBe(5);

    click('.primary-list .view-more');

    const more = expectCall('Notes/GetPrimaryNotes');
    expect(more.request.body.PageNumber).toBe(2);
    more.flush(notesPage([note(6), note(7), note(8)], 0, 2));
    fixture.detectChanges();

    expect(page().querySelectorAll('.primary-list .item').length).toBe(8);
    expect(page().querySelector('.primary-list .view-more')).toBeNull();
  });

  it('Flow1_Related_OpensOnDemandShowsTwoThenFive', () => {
    open();

    click('.related-toggle');

    const first = expectCall('Notes/GetRelatedNotes');
    expect(first.request.body.PageNumber).toBe(1);
    expect(first.request.body.LeaseId).toBe(agreementId);
    first.flush(notesPage([note(51, { BillingInvoiceId: siblingInvoiceId }), note(52, { BillingInvoiceId: siblingInvoiceId })], 6));
    fixture.detectChanges();

    expect(page().querySelectorAll('.related-list .item').length).toBe(2);

    click('.related-list .view-more');

    const second = expectCall('Notes/GetRelatedNotes');
    expect(second.request.body.PageNumber).toBe(2);
    second.flush(notesPage([53, 54, 55, 56, 57].map((id) => note(id, { BillingInvoiceId: siblingInvoiceId })), 1, 2));
    fixture.detectChanges();

    expect(page().querySelectorAll('.related-list .item').length).toBe(7);
    expect(page().querySelector('.related-list .view-more')).not.toBeNull();
  });

  it('Flow1_RelatedFiles_ReadTheFilesRouteOnTheFilesTab', () => {
    open();
    click('.tab-btn.files-tab');
    click('.related-toggle');

    const related = expectCall('AttachmentFiles/GetRelatedAttachments');
    expect(related.request.body.LeaseId).toBe(agreementId);
    related.flush(filesPage([file(81, { BillingInvoiceId: siblingInvoiceId })]));
    fixture.detectChanges();

    expect(texts('.related-list .file-name')).toEqual(['file-81.pdf']);
  });

  it('HeaderClick_ABillingInvoiceInRelated_OpensThatInvoiceInThisApp_ALegacyOneIsNotALink', () => {
    open();
    click('.related-toggle');
    expectCall('Notes/GetRelatedNotes').flush(
      notesPage([
        note(51, { NoteHeading: 'INV-102026-000124', BillingInvoiceId: siblingInvoiceId }),
        note(52, { NoteHeading: '9456308', NoteHeaderId: 9456308, BillingInvoiceId: undefined })
      ])
    );
    fixture.detectChanges();

    const headings = Array.from(page().querySelectorAll('.related-list .item-heading')) as HTMLElement[];
    expect(headings[0].tagName).toBe('A');
    expect(headings[0].getAttribute('href')).toBe(`/invoices/update?invoiceId=${siblingInvoiceId}`);
    expect(headings[1].tagName).not.toBe('A');
    expect(headings[1].textContent!.trim()).toBe('9456308');
  });

  // ---- merlin unavailable --------------------------------------------------------------------------

  it('Unavailable_ANotesReadThatFails_SaysSoRatherThanShowingAnEmptyList', () => {
    open(refusal('boom') as never);
    // `open` flushed with a 200 that carried no page; a 500 reads the same way.

    expect(texts('.primary-list .unavailable')).toEqual([InvoiceNotesPanelMessages.notesUnavailable]);
    expect(page().querySelector('.primary-list .empty')).toBeNull();
  });

  it('Unavailable_A401_ShowsTheMessage', () => {
    fixture.detectChanges();
    expectCall('Notes/GetPrimaryNotes').flush('', { status: 401, statusText: 'Unauthorized' });
    expectCall('AttachmentFiles/GetPrimaryAttachments').flush('', { status: 401, statusText: 'Unauthorized' });
    expectCall('Notes/GetFilterUserList').flush('', { status: 401, statusText: 'Unauthorized' });
    expectCall('Notes/GetNotesCategoryList').flush('', { status: 401, statusText: 'Unauthorized' });
    expectCall('AttachmentFiles/GetAttachmentsCategoryList').flush('', { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(texts('.primary-list .unavailable')).toEqual([InvoiceNotesPanelMessages.notesUnavailable]);

    click('.tab-btn.files-tab');
    expect(texts('.primary-list .unavailable')).toEqual([InvoiceNotesPanelMessages.filesUnavailable]);
  });

  it('Empty_AnInvoiceWithNoNotes_SaysThereAreNone', () => {
    open(notesPage([]));

    expect(texts('.primary-list .empty')).toEqual([InvoiceNotesPanelMessages.noNotes]);
    expect(page().querySelector('.primary-list .unavailable')).toBeNull();
  });

  // ---- Flow 2 and 3: posting -----------------------------------------------------------------------

  it('Flow2_TextOnly_SavesTheNoteAndNoFiles_ThenReloads', () => {
    open();
    typeNote('Tenant asked for a copy');

    click('.post-btn');

    const save = expectCall('Notes/SaveNote');
    expect(save.request.body).toEqual({
      NoteText: 'Tenant asked for a copy',
      NotesTypeId: 257,
      BillingInvoiceId: invoiceId,
      PostedById: 0
    });
    save.flush(envelope(42));
    answerReload(notesPage([note(42), note(41)]));

    httpMock.expectNone(`${merlin}/AttachmentFiles/SaveAttachments`);
    expect((page().querySelector('.composer textarea') as HTMLTextAreaElement).value).toBe('');
    expect(texts('.primary-list .item-text')).toEqual(['Note 42', 'Note 41']);
  });

  it('Flow3_FilesOnly_StagesThemThenSavesAttachmentsWithANullNoteId', () => {
    open();

    component.chooseFiles([pdf('receipt.pdf')]);
    fixture.detectChanges();
    expect((page().querySelector('.post-btn') as HTMLButtonElement).disabled)
      .withContext('Post waits for the upload')
      .toBeTrue();

    const upload = httpMock.expectOne(uploadUrl);
    expect((upload.request.body as FormData).get('file')).toEqual(jasmine.any(File));
    upload.flush(envelope(staged('receipt.pdf')));
    fixture.detectChanges();

    expect(texts('.staged-file .staged-name')).toEqual(['receipt.pdf']);

    click('.post-btn');

    const save = expectCall('AttachmentFiles/SaveAttachments');
    expect(save.request.body.NoteId).toBeNull();
    expect(save.request.body.AttachmentTypeId).toBe(342);
    expect(save.request.body.BillingInvoiceId).toBe(invoiceId);
    expect(save.request.body.Files).toEqual([staged('receipt.pdf')]);
    save.flush(envelope(true));
    answerReload();

    httpMock.expectNone(`${merlin}/Notes/SaveNote`);
    expect(page().querySelectorAll('.staged-file').length).toBe(0);
  });

  it('Flow2_TextAndFiles_SavesTheNoteFirstThenTheFilesWithTheReturnedNoteId', () => {
    open();
    typeNote('See attached');
    component.chooseFiles([pdf('receipt.pdf')]);
    httpMock.expectOne(uploadUrl).flush(envelope(staged('receipt.pdf')));
    fixture.detectChanges();

    click('.post-btn');

    const saveNote = expectCall('Notes/SaveNote');
    httpMock.expectNone(`${merlin}/AttachmentFiles/SaveAttachments`);
    saveNote.flush(envelope(43));

    const saveFiles = expectCall('AttachmentFiles/SaveAttachments');
    expect(saveFiles.request.body.NoteId).toBe(43);
    expect(saveFiles.request.body.Files).toEqual([staged('receipt.pdf')]);
    expect(Object.keys(saveFiles.request.body).map((key) => key.toLowerCase())).not.toContain('invoiceid');
    saveFiles.flush(envelope(true));
    answerReload();

    expect((page().querySelector('.composer textarea') as HTMLTextAreaElement).value).toBe('');
    expect(page().querySelectorAll('.staged-file').length).toBe(0);
  });

  it('Flow2_NoteRefused_KeepsWhatWasTypedAndSaysWhy', () => {
    open();
    typeNote('Too late');

    click('.post-btn');
    expectCall('Notes/SaveNote').flush(refusal('Invoice has been deleted'), { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    expect(texts('.post-error')).toEqual(['Invoice has been deleted']);
    expect((page().querySelector('.composer textarea') as HTMLTextAreaElement).value).toBe('Too late');
  });

  it('Flow2_NoteSavedButFilesRefused_SaysTheFilesWereNotAttachedAndKeepsThem', () => {
    open();
    typeNote('See attached');
    component.chooseFiles([pdf('receipt.pdf')]);
    httpMock.expectOne(uploadUrl).flush(envelope(staged('receipt.pdf')));
    fixture.detectChanges();

    click('.post-btn');
    expectCall('Notes/SaveNote').flush(envelope(44));
    expectCall('AttachmentFiles/SaveAttachments').flush(refusal('Try again'), { status: 422, statusText: 'Unprocessable' });
    answerReload();

    expect(texts('.post-error')[0]).toContain('The note was posted, but its files were not attached');
    expect(texts('.post-error')[0]).toContain('Try again');
    expect(texts('.staged-file .staged-name')).toEqual(['receipt.pdf']);
    expect((page().querySelector('.composer textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('Flow2_NothingTyped_PostIsDisabled', () => {
    open();

    expect((page().querySelector('.post-btn') as HTMLButtonElement).disabled).toBeTrue();
    typeNote('   ');
    expect((page().querySelector('.post-btn') as HTMLButtonElement).disabled).toBeTrue();
  });

  // ---- upload limits -------------------------------------------------------------------------------

  it('UploadLimits_ATooLargeOrWrongTypeFileIsReportedAndOnlyTheValidOneUploads', () => {
    open();

    component.chooseFiles([
      pdf('huge.pdf', MAX_UPLOAD_BYTES + 1),
      new File(['MZ'], 'setup.exe'),
      new File(['x'], 'noextension'),
      pdf('exactly-twenty.pdf', MAX_UPLOAD_BYTES),
      new File(['png'], 'SCAN.PNG')
    ]);
    fixture.detectChanges();

    const uploads = httpMock.match(uploadUrl);
    expect(uploads.map((upload) => ((upload.request.body as FormData).get('file') as File).name)).toEqual([
      'exactly-twenty.pdf',
      'SCAN.PNG'
    ]);
    uploads.forEach((upload, index) => upload.flush(envelope(staged(`f${index}.pdf`))));
    fixture.detectChanges();

    const reported = texts('.rejections li');
    expect(reported.length).toBe(3);
    expect(reported[0]).toContain('huge.pdf');
    expect(reported[0]).toContain('20 MB');
    expect(reported[1]).toContain('setup.exe');
    expect(reported[1]).toContain('jpg, jpeg, png, pdf, doc, docx, xls, xlsx, txt');
    expect(reported[2]).toContain('noextension');
  });

  it('UploadLimits_EveryAllowedExtensionIsAccepted', () => {
    open();

    const names = ['a.jpg', 'a.jpeg', 'a.png', 'a.pdf', 'a.doc', 'a.docx', 'a.xls', 'a.xlsx', 'a.txt'];
    component.chooseFiles(names.map((name) => new File(['x'], name)));

    const uploads = httpMock.match(uploadUrl);
    expect(uploads.length).toBe(9);
    uploads.forEach((upload) => upload.flush(envelope(staged('x.pdf'))));
    fixture.detectChanges();
    expect(page().querySelectorAll('.rejections li').length).toBe(0);
  });

  it('UploadLimits_AnUploadMerlinRefuses_IsReportedNotDropped', () => {
    open();

    component.chooseFiles([pdf('receipt.pdf')]);
    httpMock.expectOne(uploadUrl).flush(refusal('Invalid file format'), { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    expect(texts('.rejections li')).toEqual(['receipt.pdf was not uploaded: Invalid file format']);
    expect(page().querySelectorAll('.staged-file').length).toBe(0);
  });

  it('UploadLimits_AStagedFileCanBeRemovedBeforePosting', () => {
    open();
    component.chooseFiles([pdf('receipt.pdf')]);
    httpMock.expectOne(uploadUrl).flush(envelope(staged('receipt.pdf')));
    fixture.detectChanges();

    click('.staged-file .remove-staged');

    expect(page().querySelectorAll('.staged-file').length).toBe(0);
    expect((page().querySelector('.post-btn') as HTMLButtonElement).disabled).toBeTrue();
  });

  // ---- Flow 4: edit, rename, delete ----------------------------------------------------------------

  it('Flow4_EditNote_SendsTheNewTextThenReloads', () => {
    open();

    click('.primary-list .edit-btn');
    const box = page().querySelector('.primary-list .edit-input') as HTMLTextAreaElement;
    expect(box.value).toBe('Note 41');
    box.value = 'Note 41, corrected';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click('.primary-list .save-edit');

    const update = expectCall('Notes/UpdateNote');
    expect(update.request.body).toEqual({ NoteId: 41, UpdatedNotes: 'Note 41, corrected', BillingInvoiceId: invoiceId });
    update.flush(envelope(true));
    answerReload(notesPage([note(41, { NoteText: 'Note 41, corrected' })]));

    expect(texts('.primary-list .item-text')).toEqual(['Note 41, corrected']);
    expect(page().querySelector('.primary-list .edit-input')).toBeNull();
  });

  it('Flow4_RenameFile_SendsTheNewNameThenReloads', () => {
    open();
    click('.tab-btn.files-tab');

    click('.primary-list .edit-btn');
    const box = page().querySelector('.primary-list .edit-input') as HTMLInputElement;
    expect(box.value).toBe('file-8.pdf');
    box.value = 'lease-signed.pdf';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click('.primary-list .save-edit');

    const update = expectCall('AttachmentFiles/UpdateAttachment');
    expect(update.request.body).toEqual({ AttachmentId: 8, UpdatedFileName: 'lease-signed.pdf', BillingInvoiceId: invoiceId });
    update.flush(envelope(true));
    answerReload(undefined, filesPage([file(8, { FileName: 'lease-signed.pdf' })]));

    expect(texts('.primary-list .file-name')).toEqual(['lease-signed.pdf']);
  });

  it('Flow4_DeleteNote_AsksFirstThenDeletesAndReloads', () => {
    open();

    click('.primary-list .delete-btn');
    httpMock.expectNone(`${merlin}/Notes/DeleteNote`);
    expect(texts('.primary-list .confirm-delete span')[0]).toContain('Delete this note?');

    click('.primary-list .confirm-delete .danger-btn');

    const remove = httpMock.expectOne((request) => request.url === `${merlin}/Notes/DeleteNote`);
    expect(remove.request.params.get('noteId')).toBe('41');
    remove.flush(envelope(true));
    answerReload(notesPage([]));

    expect(texts('.primary-list .empty')).toEqual([InvoiceNotesPanelMessages.noNotes]);
  });

  it('Flow4_DeleteFile_DeletesByAttachmentId', () => {
    open();
    click('.tab-btn.files-tab');

    click('.primary-list .delete-btn');
    click('.primary-list .confirm-delete .danger-btn');

    const remove = httpMock.expectOne((request) => request.url === `${merlin}/AttachmentFiles/DeleteAttachment`);
    expect(remove.request.params.get('attachmentId')).toBe('8');
    remove.flush(envelope(true));
    answerReload(undefined, filesPage([]));

    expect(texts('.primary-list .empty')).toEqual([InvoiceNotesPanelMessages.noFiles]);
  });

  it('Flow4_CancelDelete_SendsNothing', () => {
    open();

    click('.primary-list .delete-btn');
    click('.primary-list .confirm-delete .cancel-btn');

    httpMock.expectNone(`${merlin}/Notes/DeleteNote`);
    expect(page().querySelector('.primary-list .confirm-delete')).toBeNull();
  });

  it('Flow4_ARefusedEditSaysWhyOnThatRow', () => {
    open();

    click('.primary-list .edit-btn');
    click('.primary-list .save-edit');
    expectCall('Notes/UpdateNote').flush('You do not have access to this note.', { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    expect(texts('.primary-list .row-error')).toEqual(['You do not have access to this note.']);
    expect(page().querySelector('.primary-list .edit-input')).not.toBeNull();
  });

  // ---- filters ---------------------------------------------------------------------------------------

  it('Filters_OfferMerlinsUsersAndCategories', () => {
    open();

    expect(texts('.filters select[name="user"] option')).toEqual(['All users', 'Pat Owner']);
    expect(texts('.filters select[name="category"] option')).toEqual(['All categories', 'Invoice Notes']);

    click('.tab-btn.files-tab');
    expect(texts('.filters select[name="category"] option')).toEqual(['All categories', 'Invoice Files']);
  });

  it('Filters_EachOneReloadsThePrimaryListFromPageOne', () => {
    open();

    const change = (selector: string, value: string): void => {
      const field = page().querySelector(selector) as HTMLInputElement | HTMLSelectElement;
      field.value = value;
      field.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };

    change('.filters input[name="startDate"]', '2026-10-01');
    let reload = expectCall('Notes/GetPrimaryNotes');
    expect(reload.request.body.StartDate).toBe('2026-10-01');
    expect(reload.request.body.PageNumber).toBe(1);
    reload.flush(notesPage([note(41)]));

    change('.filters input[name="endDate"]', '2026-10-31');
    reload = expectCall('Notes/GetPrimaryNotes');
    expect(reload.request.body.StartDate).toBe('2026-10-01');
    expect(reload.request.body.EndDate).toBe('2026-10-31');
    reload.flush(notesPage([note(41)]));

    change('.filters select[name="category"]', '257');
    reload = expectCall('Notes/GetPrimaryNotes');
    expect(reload.request.body.FilterNoteTypeId).toBe(257);
    reload.flush(notesPage([note(41)]));

    change('.filters select[name="user"]', '9876');
    reload = expectCall('Notes/GetPrimaryNotes');
    expect(reload.request.body.UserId).toBe(9876);
    reload.flush(notesPage([]));
    fixture.detectChanges();

    click('.filters .clear-filters');
    reload = expectCall('Notes/GetPrimaryNotes');
    expect(reload.request.body).toEqual(
      jasmine.objectContaining({ StartDate: null, EndDate: null, FilterNoteTypeId: 0, UserId: 0 })
    );
    reload.flush(notesPage([note(41)]));
  });

  it('Filters_AlsoReloadAnOpenRelatedList', () => {
    open();
    click('.related-toggle');
    expectCall('Notes/GetRelatedNotes').flush(notesPage([]));
    fixture.detectChanges();

    const user = page().querySelector('.filters select[name="user"]') as HTMLSelectElement;
    user.value = '9876';
    user.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expectCall('Notes/GetPrimaryNotes').flush(notesPage([]));
    const related = expectCall('Notes/GetRelatedNotes');
    expect(related.request.body.UserId).toBe(9876);
    expect(related.request.body.PageNumber).toBe(1);
    related.flush(notesPage([]));
  });

  // ---- closing ---------------------------------------------------------------------------------------

  it('Close_EmitsClosed', () => {
    open();

    click('.close-btn');

    expect(closed).toBe(1);
  });
});
