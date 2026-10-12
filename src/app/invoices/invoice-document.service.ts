import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';

/**
 * What `GET /api/v1/invoices/{id}/document` answered — a faithful report of the response, not a
 * decision about it.
 */
export interface InvoiceDocumentFile {
  /**
   * The PDF bytes as delivered.
   *
   * A `size` of `0` is a **failure**, not an empty document: backend `13-invoice-download.md`
   * **BR-21** states the endpoint never answers `200` with an empty body, and the monolith's
   * `PrintInvoiceView` — which does exactly that, through `catch { return ""; }` — is what the rule
   * exists to refuse. The caller applies that check; this service reports what arrived.
   */
  blob: Blob;

  /**
   * The name parsed out of `Content-Disposition`, or `null` when the header is absent or unparseable.
   *
   * `null` is the caller's cue to apply its own fallback (spec requirement 5), which is built from the
   * invoice number — something this service does not have and should not fetch to get.
   */
  fileName: string | null;
}

/**
 * Downloads one invoice as a PDF (backend spec `13-invoice-download.md` v3).
 *
 * **Separate from `InvoicesService` because the response is a file, not JSON.** That service is a set
 * of typed reads over the invoice projection; this one asks for bytes, reads a response *header* for
 * meaning, and returns something no component renders. Folding it in would break the shape of every
 * method around it.
 *
 * Specified in `docs/specs/rent-agreements/07-invoice-download-ui.md`.
 */
@Injectable({ providedIn: 'root' })
export class InvoiceDocumentService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/v1/invoices`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Renders and fetches one invoice's document.
   *
   * **No `audience` is sent** (requirement 3). The endpoint defaults to the `owner` view, which is the
   * one this screen wants; `tenant` and `refund` exist (**BR-26**) and are out of scope, and sending
   * `audience=owner` explicitly would differ from omitting it only by being one more thing that can be
   * mistyped into a `400`.
   *
   * **`observe: 'response'`, not the body.** The server names the file (**BR-25**) and that name lives
   * in a header, so reading only the body would throw the name away and leave every download called
   * after its id.
   *
   * A failure propagates as an ordinary `HttpErrorResponse` — with its body as a `Blob`, because that
   * is what the request asked for. Unwrapping the RFC 9457 `detail` out of it is the caller's job
   * (requirement 10); doing it here would mean a service that reports a string where its neighbours
   * report a response.
   */
  download(invoiceId: string): Observable<InvoiceDocumentFile> {
    return this.http
      .get(`${this.baseUrl}/${invoiceId}/document`, {
        observe: 'response',
        responseType: 'blob'
      })
      .pipe(
        map((response) => ({
          blob: response.body ?? new Blob([], { type: 'application/pdf' }),
          fileName: InvoiceDocumentService.parseFileName(response.headers.get('Content-Disposition'))
        }))
      );
  }

  /**
   * Reads the filename out of a `Content-Disposition` header.
   *
   * **`filename*` is preferred over `filename`** per RFC 6266: when a server sends both, the plain one
   * is the ASCII-safe approximation and the extended one is the real name. ASP.NET Core's
   * `ControllerBase.File` sends both.
   *
   * Returns `null` rather than a guess whenever the header is absent, unparseable, or names something
   * that is not a file name — the caller has a better fallback than anything that could be invented
   * here.
   *
   * @param contentDisposition The raw header value, which may be absent.
   * @returns The file name, or `null`.
   */
  private static parseFileName(contentDisposition: string | null): string | null {
    if (!contentDisposition) {
      return null;
    }

    const extended = /filename\*\s*=\s*([^;]+)/i.exec(contentDisposition);
    if (extended) {
      // RFC 5987: `charset'language'percent-encoded-name`. Everything before the second quote is
      // metadata about the encoding, not part of the name.
      const raw = extended[1].trim();
      const separator = raw.indexOf("''");
      const encoded = separator >= 0 ? raw.slice(separator + 2) : raw;

      const name = InvoiceDocumentService.sanitize(InvoiceDocumentService.tryDecode(encoded));
      if (name) {
        return name;
      }
    }

    const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(contentDisposition);

    return plain ? InvoiceDocumentService.sanitize(plain[1] ?? plain[2]) : null;
  }

  /**
   * Percent-decodes a value, keeping it verbatim when it is not valid percent-encoding.
   *
   * A malformed `filename*` is a header the server got wrong; it is not a reason to fail a download
   * whose bytes arrived intact.
   */
  private static tryDecode(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  /**
   * Reduces a parsed value to a bare file name, or `null` if nothing is left.
   *
   * **Path separators are discarded, not escaped.** `anchor.download` already refuses a path, but a
   * name is what this returns and a name has no directories in it. `.` and `..` go the same way: they
   * are directory references, not names.
   */
  private static sanitize(value: string | undefined): string | null {
    if (!value) {
      return null;
    }

    const name = value
      .trim()
      .replace(/^"|"$/g, '')
      .split(/[\\/]/)
      .pop()
      ?.trim();

    return !name || name === '.' || name === '..' ? null : name;
  }
}
