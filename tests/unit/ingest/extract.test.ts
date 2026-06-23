import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { extractText } from '../../../src/ingest/extract';
import { Source, SourceFormat, IngestError } from '../../../src/ingest/types';

async function withTempFile(
  ext: string,
  content: string | Buffer,
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-test-'));
  const filePath = path.join(dir, `source${ext}`);
  await fs.writeFile(filePath, content);
  return filePath;
}

function makeSource(filePath: string, format: SourceFormat): Source {
  return {
    path: filePath,
    format,
    fiber: 'data',
    domains: ['governance'],
    originator: 'test',
  };
}

describe('extractText', () => {
  it('extracts plain text', async () => {
    const filePath = await withTempFile('.txt', '  Hello   world  \n\n  ');
    const text = await extractText(makeSource(filePath, SourceFormat.TXT));
    expect(text).toBe('Hello world');
  });

  it('extracts and flattens JSON', async () => {
    const filePath = await withTempFile(
      '.json',
      JSON.stringify({
        title: 'DAMA-DMBOK',
        chapters: [
          { name: 'Data Governance', pages: 42 },
          { name: 'Data Quality', active: true },
        ],
      }),
    );
    const text = await extractText(makeSource(filePath, SourceFormat.JSON));
    expect(text).toContain('DAMA-DMBOK');
    expect(text).toContain('Data Governance');
    expect(text).toContain('42');
    expect(text).toContain('true');
  });

  it('extracts text from HTML', async () => {
    const html = `
      <html>
        <head><style>body{color:red}</style></head>
        <body>
          <h1>Title</h1>
          <script>alert('x')</script>
          <p>Paragraph with &amp; entities.</p>
        </body>
      </html>
    `;
    const filePath = await withTempFile('.html', html);
    const text = await extractText(makeSource(filePath, SourceFormat.HTML));
    expect(text).toContain('Title');
    expect(text).toContain('Paragraph with & entities.');
    expect(text).not.toContain('<script>');
    expect(text).not.toContain('color:red');
  });

  it('rejects unsupported formats', async () => {
    const filePath = await withTempFile('.bin', '\x00\x01');
    await expect(
      extractText(makeSource(filePath, SourceFormat.UNKNOWN)),
    ).rejects.toBeInstanceOf(IngestError);
  });
});
