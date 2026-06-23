import { detectFormat } from '../../../src/ingest/detect';
import { SourceFormat } from '../../../src/ingest/types';

describe('detectFormat', () => {
  it('detects PDF by extension', () => {
    expect(detectFormat('/docs/paper.PDF')).toBe(SourceFormat.PDF);
  });

  it('detects HTML by extension', () => {
    expect(detectFormat('/docs/page.html')).toBe(SourceFormat.HTML);
    expect(detectFormat('/docs/page.htm')).toBe(SourceFormat.HTML);
  });

  it('detects JSON by extension', () => {
    expect(detectFormat('/data/compounds.json')).toBe(SourceFormat.JSON);
  });

  it('detects TXT by extension', () => {
    expect(detectFormat('/notes/readme.txt')).toBe(SourceFormat.TXT);
    expect(detectFormat('/notes/readme.md')).toBe(SourceFormat.TXT);
  });

  it('returns UNKNOWN for unsupported extensions', () => {
    expect(detectFormat('/archive/binary.bin')).toBe(SourceFormat.UNKNOWN);
  });
});
