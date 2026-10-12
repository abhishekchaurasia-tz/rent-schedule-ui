import { TestBed } from '@angular/core/testing';
import { fakeAsync, tick } from '@angular/core/testing';

import { FileDownloadService } from './file-download.service';

describe('FileDownloadService', () => {
  let service: FileDownloadService;
  let anchor: HTMLAnchorElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FileDownloadService);

    // A real anchor, handed back from a scoped `createElement` fake so the save path is exercised
    // without the browser being asked to download anything during the run.
    anchor = document.createElement('a');
    spyOn(anchor, 'click');

    const createElement = document.createElement.bind(document);
    spyOn(document, 'createElement').and.callFake((tag: string) =>
      tag === 'a' ? anchor : createElement(tag as 'div')
    );

    spyOn(URL, 'createObjectURL').and.returnValue('blob:test-url');
    spyOn(URL, 'revokeObjectURL');
  });

  it('clicks a download anchor named after the file', () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

    service.save(blob, 'invoice-INV-092026-000042.pdf');

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toContain('blob:test-url');
    expect(anchor.download).toBe('invoice-INV-092026-000042.pdf');
    expect(anchor.click).toHaveBeenCalled();
  });

  it('leaves no anchor in the document', () => {
    service.save(new Blob(['x']), 'x.pdf');

    expect(document.body.contains(anchor)).toBeFalse();
  });

  // Requirement 6. Each un-revoked URL pins its blob for the life of the document, and this is an SPA
  // a manager keeps open all day.
  it('revokes the object URL after the click', fakeAsync(() => {
    service.save(new Blob(['x']), 'x.pdf');
    tick();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  }));
});
