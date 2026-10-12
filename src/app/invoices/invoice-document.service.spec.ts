import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { InvoiceDocumentFile, InvoiceDocumentService } from './invoice-document.service';

describe('InvoiceDocumentService', () => {
  let service: InvoiceDocumentService;
  let httpMock: HttpTestingController;

  const invoiceId = '8f14e45f-ceea-467e-bd9f-000000000001';
  const documentUrl = `${environment.apiBaseUrl}/api/v1/invoices/${invoiceId}/document`;

  const pdf = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });

    service = TestBed.inject(InvoiceDocumentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Runs one download and hands back what the service answered, flushing `headers` with the bytes. */
  function download(headers: Record<string, string>): InvoiceDocumentFile {
    let actual: InvoiceDocumentFile | undefined;
    service.download(invoiceId).subscribe((file) => (actual = file));

    httpMock
      .expectOne(documentUrl)
      .flush(pdf(), { headers: new HttpHeaders(headers) });

    return actual!;
  }

  // Requirement 2 and 3.
  it('asks for the document as a blob and sends no audience', () => {
    service.download(invoiceId).subscribe();

    const request = httpMock.expectOne(documentUrl);

    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.params.has('audience')).toBeFalse();

    request.flush(pdf());
  });

  it('returns the bytes that arrived', () => {
    const file = download({});

    expect(file.blob.size).toBeGreaterThan(0);
  });

  // Requirement 4. BR-25: the server names the file after the invoice number, and the name is in a
  // header — which is the whole reason this service observes the response rather than the body.
  it('reads the file name out of Content-Disposition', () => {
    const file = download({
      'Content-Disposition': 'attachment; filename="invoice-INV-092026-000042.pdf"'
    });

    expect(file.fileName).toBe('invoice-INV-092026-000042.pdf');
  });

  // RFC 6266: when both forms are present the plain one is the ASCII approximation and the extended
  // one is the real name. ASP.NET Core's `File(...)` sends both.
  it('prefers filename* and percent-decodes it', () => {
    const file = download({
      'Content-Disposition':
        "attachment; filename=invoice-ascii.pdf; filename*=UTF-8''invoice-%C2%A3-000042.pdf"
    });

    expect(file.fileName).toBe('invoice-£-000042.pdf');
  });

  it('falls back to the plain filename when the extended one is malformed', () => {
    const file = download({
      'Content-Disposition': "attachment; filename=invoice-plain.pdf; filename*=UTF-8''%E0%A4%A"
    });

    // The malformed value decodes to itself rather than throwing, and is kept — a header the server
    // got wrong is not a reason to fail a download whose bytes arrived intact.
    expect(file.fileName).toBe('%E0%A4%A');
  });

  it('keeps only the name when the header carries a path', () => {
    const file = download({
      'Content-Disposition': 'attachment; filename="/var/tmp/invoice-000042.pdf"'
    });

    expect(file.fileName).toBe('invoice-000042.pdf');
  });

  // Requirement 5's trigger: no header, so the caller applies its own fallback. Reported as `null`
  // rather than invented here, because the invoice number lives on the page and not in this service.
  it('reports a null file name when the header is absent', () => {
    expect(download({}).fileName).toBeNull();
  });

  it('reports a null file name when the header names nothing usable', () => {
    expect(download({ 'Content-Disposition': 'attachment; filename=".."' }).fileName).toBeNull();
    expect(download({ 'Content-Disposition': 'attachment' }).fileName).toBeNull();
  });

  // Requirement 10's trigger: because the request asked for a blob, the error body is a blob too. The
  // service passes the failure on untouched — unwrapping it is the page's job.
  it('propagates a failure with its body still a blob', async () => {
    let error: HttpErrorResponse | undefined;
    service.download(invoiceId).subscribe({ error: (err: HttpErrorResponse) => (error = err) });

    httpMock.expectOne(documentUrl).flush(
      new Blob([JSON.stringify({ detail: 'The invoice document could not be rendered.' })], {
        type: 'application/problem+json'
      }),
      { status: 502, statusText: 'Bad Gateway' }
    );

    expect(error?.status).toBe(502);
    expect(error?.error instanceof Blob).toBeTrue();
    expect(JSON.parse(await (error!.error as Blob).text()).detail).toBe(
      'The invoice document could not be rendered.'
    );
  });
});
