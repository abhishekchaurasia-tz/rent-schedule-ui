import { Injectable } from '@angular/core';

/**
 * Hands a `Blob` to the browser as a saved file.
 *
 * **The only code in this application that touches `URL.createObjectURL` and clicks an anchor**, and
 * the reason it is a service rather than an exported function: a component test that could not replace
 * it would make the browser download a file on every run.
 *
 * Specified in `docs/specs/rent-agreements/07-invoice-download-ui.md`, requirement 6.
 */
@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  /**
   * Saves `blob` under `fileName`.
   *
   * **The object URL is revoked afterwards.** Each URL pins its blob in memory until it is revoked or
   * the document is unloaded, and this page is a long-lived SPA — a session of repeated downloads
   * would otherwise retain every PDF it had ever fetched.
   *
   * Revoked on the next macrotask rather than on the next statement. The download is *started* by the
   * click, so revoking immediately is defensible by specification, but browsers have historically
   * disagreed; a `setTimeout` costs nothing and removes the argument.
   */
  save(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    // Not navigation, but the anchor is a real one and inherits the rules: `rel` keeps the opener out
    // of any window a browser decides to use, and `hidden` keeps the element out of layout for the
    // moment it is in the document.
    anchor.rel = 'noopener';
    anchor.hidden = true;

    // Appended before clicking: a detached anchor's click is ignored by Firefox.
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url));
  }
}
