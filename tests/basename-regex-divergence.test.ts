import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractRhs } from './helpers/inlineExtract';
import { readSourceLines } from './helpers/sourceExtract';
import { FILENAMES } from './fixtures/curriculum';

/**
 * GROUP D — `baseName` derivation: the download-filename stem.
 *
 * Three different regexes are in use for what is meant to be one operation, plus a fourth
 * variant that also rewrites underscores:
 *
 *   R1  /\.pdf$/i                       — strips ONLY a trailing .pdf
 *       src/components/OutputViewer.tsx (x3), HistoryList.tsx, HistoryDrawer.tsx
 *   R2  /\.(docx|pdf|txt|md)$/i        — stripped one of four extensions. Existed only in
 *       src/components/LayoutIntegrityEngine.tsx, inside a download handler that was never
 *       wired to a button, so the whole site is gone. See the absence assertion below.
 *   R3  /\.[^/.]+$/                    — strips the last extension of ANY kind
 *       src/App.tsx (x5, one of which strips .docx only), documentConverter.ts (x2),
 *       historyStorage.ts, batchZipExporter.ts, documentMerger.ts
 *   R4  /\.(pdf|docx|md|txt)$/i + .replace(/_/g, ' ')
 *       src/utils/documentStructuralAuditor.ts
 *
 * Line numbers are deliberately absent from both the snapshots and this comment: the
 * harness locates by content anchor, and an unrelated edit above a site must not be able
 * to fail these tests. Exact file:line for every site is printed by `SITES` at runtime.
 *
 * These are one-line initializers, not `.replace()` chains, so they are compiled with
 * `extractRhs` / `extractRawExpression` from the real source text.
 *
 * The three OutputViewer copies are located by walking forward from the previous hit, so
 * they stay distinct without hard-coding line numbers.
 */
type Site = {
  id: string;
  file: string;
  startLine: number;
  expr: string;
  variant: 'R1' | 'R2' | 'R3' | 'R4';
  call: (name: string) => string;
};

function site(
  id: string,
  file: string,
  anchorNeedle: string,
  variant: Site['variant'],
  bind: Record<string, unknown>,
  from?: number,
): Site {
  const e = extractRhs(file, anchorNeedle, from === undefined ? {} : { from });
  return {
    id,
    file,
    startLine: e.startLine,
    expr: e.expr,
    variant,
    call: (name: string) => {
      const bindings: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(bind)) {
        bindings[k] = typeof v === 'function' ? (v as (n: string) => unknown)(name) : v;
      }
      return e.fn(bindings) as string;
    },
  };
}

const OV = 'src/components/OutputViewer.tsx';
const ov1 = site('D1', OV, 'const baseName = (result.fileName', 'R1', { result: (n: string) => ({ fileName: n }) });
const ov2 = site('D2', OV, 'const baseName = (result.fileName', 'R1', { result: (n: string) => ({ fileName: n }) }, ov1.startLine + 1);
const ov3 = site('D3', OV, 'const baseName = (result.fileName', 'R1', { result: (n: string) => ({ fileName: n }) }, ov2.startLine + 1);
const D4 = site('D4', 'src/components/HistoryList.tsx', 'const baseName = (item.fileName', 'R1', { item: (n: string) => ({ fileName: n }) });
const D5 = site('D5', 'src/components/HistoryDrawer.tsx', 'const baseName = (item.fileName', 'R1', { item: (n: string) => ({ fileName: n }) });
const D7 = site('D7', 'src/App.tsx', 'const baseName = fileName.replace', 'R3', { fileName: (n: string) => n });
const D8 = site('D8', 'src/App.tsx', 'title: err.resumeState?.docTitle || file.name.replace', 'R3', {
  err: () => ({ resumeState: undefined }),
  file: (n: string) => ({ name: n }),
});
const D9 = site('D9', 'src/App.tsx', 'title: parsed.title || currentFile.name.replace', 'R3', {
  parsed: () => ({ title: '' }),
  currentFile: (n: string) => ({ name: n }),
});
const D10 = site('D10', 'src/App.tsx', 'title: extracted.title || file.name.replace', 'R3', {
  extracted: () => ({ title: '' }),
  file: (n: string) => ({ name: n }),
});
const D11 = site('D11', 'src/App.tsx', 'title: file.name.replace', 'R3', { file: (n: string) => ({ name: n }) });
const D12 = site('D12', 'src/utils/documentConverter.ts', 'title: file.name.replace', 'R3', { file: (n: string) => ({ name: n }) });
const D13 = site('D13', 'src/utils/documentConverter.ts', 'let docTitle = resumeState?.docTitle || file.name.replace', 'R3', {
  resumeState: () => undefined,
  file: (n: string) => ({ name: n }),
});
const D14 = site('D14', 'src/utils/historyStorage.ts', 'title: result.title || fileName.replace', 'R3', {
  result: () => ({ title: '' }),
  fileName: (n: string) => n,
});
const D15 = site('D15', 'src/utils/batchZipExporter.ts', 'const baseName = doc.name.replace', 'R3', { doc: (n: string) => ({ name: n }) });

// The title fallback sits on a ternary branch (`? filename.replace(...)`), so it is read
// with extractRhs, which strips the leading `? ` and keeps the expression self-contained.
const structural = extractRhs('src/utils/documentStructuralAuditor.ts', '? filename.replace');
const D16: Site = {
  id: 'D16',
  file: 'src/utils/documentStructuralAuditor.ts',
  startLine: structural.startLine,
  expr: structural.expr,
  variant: 'R4',
  call: (name: string) => structural.fn({ filename: name }) as string,
};

/**
 * src/utils/documentMerger.ts:157 embeds the same R3 regex in a template literal
 * (`${file.name.replace(...)}.pdf`), so it is pinned as source text rather than compiled.
 */
const MERGER_LINE = readSourceLines('src/utils/documentMerger.ts').find((l) => l.includes('${file.name.replace')) ?? '';

const SITES: Site[] = [ov1, ov2, ov3, D4, D5, D7, D8, D9, D10, D11, D12, D13, D14, D15, D16];

const EXTRA_NAMES = [
  'a.tar.gz.pdf',
  'file.PDF',
  'File.PdF',
  'notes.DOCX',
  'notes.TXT',
  'notes.MD',
  'x.doc',
  'x.docm',
  'a.b',
  '.docx',
  'no-extension',
  'ملف الحصة',
] as const;

const NAMES: string[] = [...FILENAMES, ...EXTRA_NAMES];

describe('D. provenance: which regex each site uses', () => {
  it('all sites: the exact expression each site evaluates (no line numbers — they drift)', () => {
    expect(SITES.map((s) => ({ id: s.id, file: s.file, variant: s.variant, expr: s.expr }))).toMatchInlineSnapshot(`
      [
        {
          "expr": "(result.fileName || 'document').replace(/\\.pdf$/i, '')",
          "file": "src/components/OutputViewer.tsx",
          "id": "D1",
          "variant": "R1",
        },
        {
          "expr": "(result.fileName || 'document').replace(/\\.pdf$/i, '')",
          "file": "src/components/OutputViewer.tsx",
          "id": "D2",
          "variant": "R1",
        },
        {
          "expr": "(result.fileName || 'document').replace(/\\.pdf$/i, '')",
          "file": "src/components/OutputViewer.tsx",
          "id": "D3",
          "variant": "R1",
        },
        {
          "expr": "(item.fileName || 'document').replace(/\\.pdf$/i, '')",
          "file": "src/components/HistoryList.tsx",
          "id": "D4",
          "variant": "R1",
        },
        {
          "expr": "(item.fileName || 'document').replace(/\\.pdf$/i, '')",
          "file": "src/components/HistoryDrawer.tsx",
          "id": "D5",
          "variant": "R1",
        },
        {
          "expr": "fileName.replace(/\\.[^/.]+$/, '')",
          "file": "src/App.tsx",
          "id": "D7",
          "variant": "R3",
        },
        {
          "expr": "err.resumeState?.docTitle || file.name.replace(/\\.[^/.]+$/, '')",
          "file": "src/App.tsx",
          "id": "D8",
          "variant": "R3",
        },
        {
          "expr": "parsed.title || currentFile.name.replace(/\\.[^/.]+$/, '')",
          "file": "src/App.tsx",
          "id": "D9",
          "variant": "R3",
        },
        {
          "expr": "extracted.title || file.name.replace(/\\.docx$/i, '')",
          "file": "src/App.tsx",
          "id": "D10",
          "variant": "R3",
        },
        {
          "expr": "file.name.replace(/\\.[^/.]+$/, '')",
          "file": "src/App.tsx",
          "id": "D11",
          "variant": "R3",
        },
        {
          "expr": "file.name.replace(/\\.[^/.]+$/, '')",
          "file": "src/utils/documentConverter.ts",
          "id": "D12",
          "variant": "R3",
        },
        {
          "expr": "resumeState?.docTitle || file.name.replace(/\\.[^/.]+$/, '')",
          "file": "src/utils/documentConverter.ts",
          "id": "D13",
          "variant": "R3",
        },
        {
          "expr": "result.title || fileName.replace(/\\.[^/.]+$/, '')",
          "file": "src/utils/historyStorage.ts",
          "id": "D14",
          "variant": "R3",
        },
        {
          "expr": "doc.name.replace(/\\.[^/.]+$/, '')",
          "file": "src/utils/batchZipExporter.ts",
          "id": "D15",
          "variant": "R3",
        },
        {
          "expr": "filename.replace(/\\.(pdf|docx|md|txt)$/i, '').replace(/_/g, ' ')",
          "file": "src/utils/documentStructuralAuditor.ts",
          "id": "D16",
          "variant": "R4",
        },
      ]
    `);
  });

  it('the regex inventory, deduplicated', () => {
    // Scan the FIRST `.replace(` argument as a regex literal, respecting `[...]`, so a
    // `/` inside a character class (as in `/\.[^/.]+$/`) does not end the literal early.
    const firstReplaceRegex = (expr: string): string | null => {
      const open = expr.indexOf('.replace(');
      if (open === -1) return null;
      let i = open + '.replace('.length;
      if (expr[i] !== '/') return null;
      let out = '/';
      i++;
      let inClass = false;
      while (i < expr.length) {
        const ch = expr[i];
        if (ch === '\\') {
          out += ch + (expr[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) {
          out += '/';
          i++;
          while (/[a-z]/i.test(expr[i] ?? '')) out += expr[i++];
          return out;
        }
        out += ch;
        i++;
      }
      return null;
    };
    const regexes = SITES.map((x) => firstReplaceRegex(x.expr));
    expect({
      unique: [...new Set(regexes)],
      counts: regexes.reduce<Record<string, number>>((acc, r) => ({ ...acc, [String(r)]: (acc[String(r)] ?? 0) + 1 }), {}),
      documentMerger_text_only: MERGER_LINE.trim(),
    }).toMatchInlineSnapshot(`
      {
        "counts": {
          "/\\.(pdf|docx|md|txt)$/i": 1,
          "/\\.[^/.]+$/": 8,
          "/\\.docx$/i": 1,
          "/\\.pdf$/i": 5,
        },
        "documentMerger_text_only": "\`\${file.name.replace(/\\.[^/.]+$/, '')}.pdf\`",
        "unique": [
          "/\\.pdf$/i",
          "/\\.[^/.]+$/",
          "/\\.docx$/i",
          "/\\.(pdf|docx|md|txt)$/i",
        ],
      }
    `);
  });
});

describe('D. per-site output for the fixture filenames', () => {
  it('OutputViewer x3 (R1) agree with each other and with HistoryList / HistoryDrawer', () => {
    expect(NAMES.map((n) => ({
      name: n,
      ov1: ov1.call(n),
      ov2: ov2.call(n),
      ov3: ov3.call(n),
      historyList: D4.call(n),
      historyDrawer: D5.call(n),
      allEqual: new Set([ov1.call(n), ov2.call(n), ov3.call(n), D4.call(n), D5.call(n)]).size === 1,
    }))).toMatchInlineSnapshot(`
      [
        {
          "allEqual": true,
          "historyDrawer": "ملف الحصة",
          "historyList": "ملف الحصة",
          "name": "ملف الحصة.pdf",
          "ov1": "ملف الحصة",
          "ov2": "ملف الحصة",
          "ov3": "ملف الحصة",
        },
        {
          "allEqual": true,
          "historyDrawer": "ملف الحصة",
          "historyList": "ملف الحصة",
          "name": "ملف الحصة.PDF",
          "ov1": "ملف الحصة",
          "ov2": "ملف الحصة",
          "ov3": "ملف الحصة",
        },
        {
          "allEqual": true,
          "historyDrawer": "ملف الحصة.docx",
          "historyList": "ملف الحصة.docx",
          "name": "ملف الحصة.docx",
          "ov1": "ملف الحصة.docx",
          "ov2": "ملف الحصة.docx",
          "ov3": "ملف الحصة.docx",
        },
        {
          "allEqual": true,
          "historyDrawer": "ملف الحصة.md",
          "historyList": "ملف الحصة.md",
          "name": "ملف الحصة.md",
          "ov1": "ملف الحصة.md",
          "ov2": "ملف الحصة.md",
          "ov3": "ملف الحصة.md",
        },
        {
          "allEqual": true,
          "historyDrawer": "ملف الحصة.txt",
          "historyList": "ملف الحصة.txt",
          "name": "ملف الحصة.txt",
          "ov1": "ملف الحصة.txt",
          "ov2": "ملف الحصة.txt",
          "ov3": "ملف الحصة.txt",
        },
        {
          "allEqual": true,
          "historyDrawer": "ملف الحصة.doc",
          "historyList": "ملف الحصة.doc",
          "name": "ملف الحصة.doc",
          "ov1": "ملف الحصة.doc",
          "ov2": "ملف الحصة.doc",
          "ov3": "ملف الحصة.doc",
        },
        {
          "allEqual": true,
          "historyDrawer": "ملف.الحصة.المرحلة.الثانية",
          "historyList": "ملف.الحصة.المرحلة.الثانية",
          "name": "ملف.الحصة.المرحلة.الثانية.pdf",
          "ov1": "ملف.الحصة.المرحلة.الثانية",
          "ov2": "ملف.الحصة.المرحلة.الثانية",
          "ov3": "ملف.الحصة.المرحلة.الثانية",
        },
        {
          "allEqual": true,
          "historyDrawer": "ملف الحصة.final.v2",
          "historyList": "ملف الحصة.final.v2",
          "name": "ملف الحصة.final.v2.pdf",
          "ov1": "ملف الحصة.final.v2",
          "ov2": "ملف الحصة.final.v2",
          "ov3": "ملف الحصة.final.v2",
        },
        {
          "allEqual": true,
          "historyDrawer": "archive.tar.gz",
          "historyList": "archive.tar.gz",
          "name": "archive.tar.gz",
          "ov1": "archive.tar.gz",
          "ov2": "archive.tar.gz",
          "ov3": "archive.tar.gz",
        },
        {
          "allEqual": true,
          "historyDrawer": "no-extension",
          "historyList": "no-extension",
          "name": "no-extension",
          "ov1": "no-extension",
          "ov2": "no-extension",
          "ov3": "no-extension",
        },
        {
          "allEqual": true,
          "historyDrawer": "archive.pdf",
          "historyList": "archive.pdf",
          "name": "archive.pdf.pdf",
          "ov1": "archive.pdf",
          "ov2": "archive.pdf",
          "ov3": "archive.pdf",
        },
        {
          "allEqual": true,
          "historyDrawer": "",
          "historyList": "",
          "name": ".pdf",
          "ov1": "",
          "ov2": "",
          "ov3": "",
        },
        {
          "allEqual": true,
          "historyDrawer": "v1.2",
          "historyList": "v1.2",
          "name": "v1.2",
          "ov1": "v1.2",
          "ov2": "v1.2",
          "ov3": "v1.2",
        },
        {
          "allEqual": true,
          "historyDrawer": "ملف الحصة",
          "historyList": "ملف الحصة",
          "name": "ملف الحصة",
          "ov1": "ملف الحصة",
          "ov2": "ملف الحصة",
          "ov3": "ملف الحصة",
        },
        {
          "allEqual": true,
          "historyDrawer": "a.tar.gz",
          "historyList": "a.tar.gz",
          "name": "a.tar.gz.pdf",
          "ov1": "a.tar.gz",
          "ov2": "a.tar.gz",
          "ov3": "a.tar.gz",
        },
        {
          "allEqual": true,
          "historyDrawer": "file",
          "historyList": "file",
          "name": "file.PDF",
          "ov1": "file",
          "ov2": "file",
          "ov3": "file",
        },
        {
          "allEqual": true,
          "historyDrawer": "File",
          "historyList": "File",
          "name": "File.PdF",
          "ov1": "File",
          "ov2": "File",
          "ov3": "File",
        },
        {
          "allEqual": true,
          "historyDrawer": "notes.DOCX",
          "historyList": "notes.DOCX",
          "name": "notes.DOCX",
          "ov1": "notes.DOCX",
          "ov2": "notes.DOCX",
          "ov3": "notes.DOCX",
        },
        {
          "allEqual": true,
          "historyDrawer": "notes.TXT",
          "historyList": "notes.TXT",
          "name": "notes.TXT",
          "ov1": "notes.TXT",
          "ov2": "notes.TXT",
          "ov3": "notes.TXT",
        },
        {
          "allEqual": true,
          "historyDrawer": "notes.MD",
          "historyList": "notes.MD",
          "name": "notes.MD",
          "ov1": "notes.MD",
          "ov2": "notes.MD",
          "ov3": "notes.MD",
        },
        {
          "allEqual": true,
          "historyDrawer": "x.doc",
          "historyList": "x.doc",
          "name": "x.doc",
          "ov1": "x.doc",
          "ov2": "x.doc",
          "ov3": "x.doc",
        },
        {
          "allEqual": true,
          "historyDrawer": "x.docm",
          "historyList": "x.docm",
          "name": "x.docm",
          "ov1": "x.docm",
          "ov2": "x.docm",
          "ov3": "x.docm",
        },
        {
          "allEqual": true,
          "historyDrawer": "a.b",
          "historyList": "a.b",
          "name": "a.b",
          "ov1": "a.b",
          "ov2": "a.b",
          "ov3": "a.b",
        },
        {
          "allEqual": true,
          "historyDrawer": ".docx",
          "historyList": ".docx",
          "name": ".docx",
          "ov1": ".docx",
          "ov2": ".docx",
          "ov3": ".docx",
        },
        {
          "allEqual": true,
          "historyDrawer": "no-extension",
          "historyList": "no-extension",
          "name": "no-extension",
          "ov1": "no-extension",
          "ov2": "no-extension",
          "ov3": "no-extension",
        },
        {
          "allEqual": true,
          "historyDrawer": "ملف الحصة",
          "historyList": "ملف الحصة",
          "name": "ملف الحصة",
          "ov1": "ملف الحصة",
          "ov2": "ملف الحصة",
          "ov3": "ملف الحصة",
        },
      ]
    `);
  });

  // R2 lived only inside a download handler in LayoutIntegrityEngine that was never
  // wired to any control, so the site is gone rather than merely unused. Asserted as an
  // absence so reintroducing a private copy is caught.
  it('LayoutIntegrityEngine no longer derives a filename of its own', () => {
    const source = readFileSync('src/components/LayoutIntegrityEngine.tsx', 'utf8');
    expect(source).not.toContain('baseName');
    expect(source).not.toContain('docx|pdf|txt|md');
    expect(source).not.toContain('downloadDocx');
  });

  it('R3 App.tsx:490 baseName (no `|| "document"` fallback)', () => {
    expect(NAMES.map((n) => ({ name: n, out: D7.call(n) }))).toMatchInlineSnapshot(`
      [
        {
          "name": "ملف الحصة.pdf",
          "out": "ملف الحصة",
        },
        {
          "name": "ملف الحصة.PDF",
          "out": "ملف الحصة",
        },
        {
          "name": "ملف الحصة.docx",
          "out": "ملف الحصة",
        },
        {
          "name": "ملف الحصة.md",
          "out": "ملف الحصة",
        },
        {
          "name": "ملف الحصة.txt",
          "out": "ملف الحصة",
        },
        {
          "name": "ملف الحصة.doc",
          "out": "ملف الحصة",
        },
        {
          "name": "ملف.الحصة.المرحلة.الثانية.pdf",
          "out": "ملف.الحصة.المرحلة.الثانية",
        },
        {
          "name": "ملف الحصة.final.v2.pdf",
          "out": "ملف الحصة.final.v2",
        },
        {
          "name": "archive.tar.gz",
          "out": "archive.tar",
        },
        {
          "name": "no-extension",
          "out": "no-extension",
        },
        {
          "name": "archive.pdf.pdf",
          "out": "archive.pdf",
        },
        {
          "name": ".pdf",
          "out": "",
        },
        {
          "name": "v1.2",
          "out": "v1",
        },
        {
          "name": "ملف الحصة",
          "out": "ملف الحصة",
        },
        {
          "name": "a.tar.gz.pdf",
          "out": "a.tar.gz",
        },
        {
          "name": "file.PDF",
          "out": "file",
        },
        {
          "name": "File.PdF",
          "out": "File",
        },
        {
          "name": "notes.DOCX",
          "out": "notes",
        },
        {
          "name": "notes.TXT",
          "out": "notes",
        },
        {
          "name": "notes.MD",
          "out": "notes",
        },
        {
          "name": "x.doc",
          "out": "x",
        },
        {
          "name": "x.docm",
          "out": "x",
        },
        {
          "name": "a.b",
          "out": "a",
        },
        {
          "name": ".docx",
          "out": "",
        },
        {
          "name": "no-extension",
          "out": "no-extension",
        },
        {
          "name": "ملف الحصة",
          "out": "ملف الحصة",
        },
      ]
    `);
  });

  it('R3 title fallbacks: App.tsx:261 / 382 / 789, documentConverter:165 / 204, historyStorage:41, batchZipExporter:47, documentMerger:157', () => {
    expect(
      NAMES.map((n) => ({
        name: n,
        app261: D8.call(n),
        app382: D9.call(n),
        app789: D11.call(n),
        app490: D7.call(n),
        docConv165: D12.call(n),
        docConv204: D13.call(n),
        historyStorage41: D14.call(n),
        batchZip47: D15.call(n),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "app261": "ملف الحصة",
          "app382": "ملف الحصة",
          "app490": "ملف الحصة",
          "app789": "ملف الحصة",
          "batchZip47": "ملف الحصة",
          "docConv165": "ملف الحصة",
          "docConv204": "ملف الحصة",
          "historyStorage41": "ملف الحصة",
          "name": "ملف الحصة.pdf",
        },
        {
          "app261": "ملف الحصة",
          "app382": "ملف الحصة",
          "app490": "ملف الحصة",
          "app789": "ملف الحصة",
          "batchZip47": "ملف الحصة",
          "docConv165": "ملف الحصة",
          "docConv204": "ملف الحصة",
          "historyStorage41": "ملف الحصة",
          "name": "ملف الحصة.PDF",
        },
        {
          "app261": "ملف الحصة",
          "app382": "ملف الحصة",
          "app490": "ملف الحصة",
          "app789": "ملف الحصة",
          "batchZip47": "ملف الحصة",
          "docConv165": "ملف الحصة",
          "docConv204": "ملف الحصة",
          "historyStorage41": "ملف الحصة",
          "name": "ملف الحصة.docx",
        },
        {
          "app261": "ملف الحصة",
          "app382": "ملف الحصة",
          "app490": "ملف الحصة",
          "app789": "ملف الحصة",
          "batchZip47": "ملف الحصة",
          "docConv165": "ملف الحصة",
          "docConv204": "ملف الحصة",
          "historyStorage41": "ملف الحصة",
          "name": "ملف الحصة.md",
        },
        {
          "app261": "ملف الحصة",
          "app382": "ملف الحصة",
          "app490": "ملف الحصة",
          "app789": "ملف الحصة",
          "batchZip47": "ملف الحصة",
          "docConv165": "ملف الحصة",
          "docConv204": "ملف الحصة",
          "historyStorage41": "ملف الحصة",
          "name": "ملف الحصة.txt",
        },
        {
          "app261": "ملف الحصة",
          "app382": "ملف الحصة",
          "app490": "ملف الحصة",
          "app789": "ملف الحصة",
          "batchZip47": "ملف الحصة",
          "docConv165": "ملف الحصة",
          "docConv204": "ملف الحصة",
          "historyStorage41": "ملف الحصة",
          "name": "ملف الحصة.doc",
        },
        {
          "app261": "ملف.الحصة.المرحلة.الثانية",
          "app382": "ملف.الحصة.المرحلة.الثانية",
          "app490": "ملف.الحصة.المرحلة.الثانية",
          "app789": "ملف.الحصة.المرحلة.الثانية",
          "batchZip47": "ملف.الحصة.المرحلة.الثانية",
          "docConv165": "ملف.الحصة.المرحلة.الثانية",
          "docConv204": "ملف.الحصة.المرحلة.الثانية",
          "historyStorage41": "ملف.الحصة.المرحلة.الثانية",
          "name": "ملف.الحصة.المرحلة.الثانية.pdf",
        },
        {
          "app261": "ملف الحصة.final.v2",
          "app382": "ملف الحصة.final.v2",
          "app490": "ملف الحصة.final.v2",
          "app789": "ملف الحصة.final.v2",
          "batchZip47": "ملف الحصة.final.v2",
          "docConv165": "ملف الحصة.final.v2",
          "docConv204": "ملف الحصة.final.v2",
          "historyStorage41": "ملف الحصة.final.v2",
          "name": "ملف الحصة.final.v2.pdf",
        },
        {
          "app261": "archive.tar",
          "app382": "archive.tar",
          "app490": "archive.tar",
          "app789": "archive.tar",
          "batchZip47": "archive.tar",
          "docConv165": "archive.tar",
          "docConv204": "archive.tar",
          "historyStorage41": "archive.tar",
          "name": "archive.tar.gz",
        },
        {
          "app261": "no-extension",
          "app382": "no-extension",
          "app490": "no-extension",
          "app789": "no-extension",
          "batchZip47": "no-extension",
          "docConv165": "no-extension",
          "docConv204": "no-extension",
          "historyStorage41": "no-extension",
          "name": "no-extension",
        },
        {
          "app261": "archive.pdf",
          "app382": "archive.pdf",
          "app490": "archive.pdf",
          "app789": "archive.pdf",
          "batchZip47": "archive.pdf",
          "docConv165": "archive.pdf",
          "docConv204": "archive.pdf",
          "historyStorage41": "archive.pdf",
          "name": "archive.pdf.pdf",
        },
        {
          "app261": "",
          "app382": "",
          "app490": "",
          "app789": "",
          "batchZip47": "",
          "docConv165": "",
          "docConv204": "",
          "historyStorage41": "",
          "name": ".pdf",
        },
        {
          "app261": "v1",
          "app382": "v1",
          "app490": "v1",
          "app789": "v1",
          "batchZip47": "v1",
          "docConv165": "v1",
          "docConv204": "v1",
          "historyStorage41": "v1",
          "name": "v1.2",
        },
        {
          "app261": "ملف الحصة",
          "app382": "ملف الحصة",
          "app490": "ملف الحصة",
          "app789": "ملف الحصة",
          "batchZip47": "ملف الحصة",
          "docConv165": "ملف الحصة",
          "docConv204": "ملف الحصة",
          "historyStorage41": "ملف الحصة",
          "name": "ملف الحصة",
        },
        {
          "app261": "a.tar.gz",
          "app382": "a.tar.gz",
          "app490": "a.tar.gz",
          "app789": "a.tar.gz",
          "batchZip47": "a.tar.gz",
          "docConv165": "a.tar.gz",
          "docConv204": "a.tar.gz",
          "historyStorage41": "a.tar.gz",
          "name": "a.tar.gz.pdf",
        },
        {
          "app261": "file",
          "app382": "file",
          "app490": "file",
          "app789": "file",
          "batchZip47": "file",
          "docConv165": "file",
          "docConv204": "file",
          "historyStorage41": "file",
          "name": "file.PDF",
        },
        {
          "app261": "File",
          "app382": "File",
          "app490": "File",
          "app789": "File",
          "batchZip47": "File",
          "docConv165": "File",
          "docConv204": "File",
          "historyStorage41": "File",
          "name": "File.PdF",
        },
        {
          "app261": "notes",
          "app382": "notes",
          "app490": "notes",
          "app789": "notes",
          "batchZip47": "notes",
          "docConv165": "notes",
          "docConv204": "notes",
          "historyStorage41": "notes",
          "name": "notes.DOCX",
        },
        {
          "app261": "notes",
          "app382": "notes",
          "app490": "notes",
          "app789": "notes",
          "batchZip47": "notes",
          "docConv165": "notes",
          "docConv204": "notes",
          "historyStorage41": "notes",
          "name": "notes.TXT",
        },
        {
          "app261": "notes",
          "app382": "notes",
          "app490": "notes",
          "app789": "notes",
          "batchZip47": "notes",
          "docConv165": "notes",
          "docConv204": "notes",
          "historyStorage41": "notes",
          "name": "notes.MD",
        },
        {
          "app261": "x",
          "app382": "x",
          "app490": "x",
          "app789": "x",
          "batchZip47": "x",
          "docConv165": "x",
          "docConv204": "x",
          "historyStorage41": "x",
          "name": "x.doc",
        },
        {
          "app261": "x",
          "app382": "x",
          "app490": "x",
          "app789": "x",
          "batchZip47": "x",
          "docConv165": "x",
          "docConv204": "x",
          "historyStorage41": "x",
          "name": "x.docm",
        },
        {
          "app261": "a",
          "app382": "a",
          "app490": "a",
          "app789": "a",
          "batchZip47": "a",
          "docConv165": "a",
          "docConv204": "a",
          "historyStorage41": "a",
          "name": "a.b",
        },
        {
          "app261": "",
          "app382": "",
          "app490": "",
          "app789": "",
          "batchZip47": "",
          "docConv165": "",
          "docConv204": "",
          "historyStorage41": "",
          "name": ".docx",
        },
        {
          "app261": "no-extension",
          "app382": "no-extension",
          "app490": "no-extension",
          "app789": "no-extension",
          "batchZip47": "no-extension",
          "docConv165": "no-extension",
          "docConv204": "no-extension",
          "historyStorage41": "no-extension",
          "name": "no-extension",
        },
        {
          "app261": "ملف الحصة",
          "app382": "ملف الحصة",
          "app490": "ملف الحصة",
          "app789": "ملف الحصة",
          "batchZip47": "ملف الحصة",
          "docConv165": "ملف الحصة",
          "docConv204": "ملف الحصة",
          "historyStorage41": "ملف الحصة",
          "name": "ملف الحصة",
        },
      ]
    `);
  });

  it('App.tsx:725 is its own variant: strips .docx only', () => {
    expect(NAMES.map((n) => ({ name: n, app725: D10.call(n) }))).toMatchInlineSnapshot(`
      [
        {
          "app725": "ملف الحصة.pdf",
          "name": "ملف الحصة.pdf",
        },
        {
          "app725": "ملف الحصة.PDF",
          "name": "ملف الحصة.PDF",
        },
        {
          "app725": "ملف الحصة",
          "name": "ملف الحصة.docx",
        },
        {
          "app725": "ملف الحصة.md",
          "name": "ملف الحصة.md",
        },
        {
          "app725": "ملف الحصة.txt",
          "name": "ملف الحصة.txt",
        },
        {
          "app725": "ملف الحصة.doc",
          "name": "ملف الحصة.doc",
        },
        {
          "app725": "ملف.الحصة.المرحلة.الثانية.pdf",
          "name": "ملف.الحصة.المرحلة.الثانية.pdf",
        },
        {
          "app725": "ملف الحصة.final.v2.pdf",
          "name": "ملف الحصة.final.v2.pdf",
        },
        {
          "app725": "archive.tar.gz",
          "name": "archive.tar.gz",
        },
        {
          "app725": "no-extension",
          "name": "no-extension",
        },
        {
          "app725": "archive.pdf.pdf",
          "name": "archive.pdf.pdf",
        },
        {
          "app725": ".pdf",
          "name": ".pdf",
        },
        {
          "app725": "v1.2",
          "name": "v1.2",
        },
        {
          "app725": "ملف الحصة",
          "name": "ملف الحصة",
        },
        {
          "app725": "a.tar.gz.pdf",
          "name": "a.tar.gz.pdf",
        },
        {
          "app725": "file.PDF",
          "name": "file.PDF",
        },
        {
          "app725": "File.PdF",
          "name": "File.PdF",
        },
        {
          "app725": "notes",
          "name": "notes.DOCX",
        },
        {
          "app725": "notes.TXT",
          "name": "notes.TXT",
        },
        {
          "app725": "notes.MD",
          "name": "notes.MD",
        },
        {
          "app725": "x.doc",
          "name": "x.doc",
        },
        {
          "app725": "x.docm",
          "name": "x.docm",
        },
        {
          "app725": "a.b",
          "name": "a.b",
        },
        {
          "app725": "",
          "name": ".docx",
        },
        {
          "app725": "no-extension",
          "name": "no-extension",
        },
        {
          "app725": "ملف الحصة",
          "name": "ملف الحصة",
        },
      ]
    `);
  });

  it('R4 documentStructuralAuditor: extension strip AND underscore-to-space', () => {
    expect([...NAMES, 'my_file_name.pdf', 'a_b_c.docx', 'ملف_الحصة.pdf'].map((n) => ({ name: n, out: D16.call(n) }))).toMatchInlineSnapshot(`
      [
        {
          "name": "ملف الحصة.pdf",
          "out": "ملف الحصة",
        },
        {
          "name": "ملف الحصة.PDF",
          "out": "ملف الحصة",
        },
        {
          "name": "ملف الحصة.docx",
          "out": "ملف الحصة",
        },
        {
          "name": "ملف الحصة.md",
          "out": "ملف الحصة",
        },
        {
          "name": "ملف الحصة.txt",
          "out": "ملف الحصة",
        },
        {
          "name": "ملف الحصة.doc",
          "out": "ملف الحصة.doc",
        },
        {
          "name": "ملف.الحصة.المرحلة.الثانية.pdf",
          "out": "ملف.الحصة.المرحلة.الثانية",
        },
        {
          "name": "ملف الحصة.final.v2.pdf",
          "out": "ملف الحصة.final.v2",
        },
        {
          "name": "archive.tar.gz",
          "out": "archive.tar.gz",
        },
        {
          "name": "no-extension",
          "out": "no-extension",
        },
        {
          "name": "archive.pdf.pdf",
          "out": "archive.pdf",
        },
        {
          "name": ".pdf",
          "out": "",
        },
        {
          "name": "v1.2",
          "out": "v1.2",
        },
        {
          "name": "ملف الحصة",
          "out": "ملف الحصة",
        },
        {
          "name": "a.tar.gz.pdf",
          "out": "a.tar.gz",
        },
        {
          "name": "file.PDF",
          "out": "file",
        },
        {
          "name": "File.PdF",
          "out": "File",
        },
        {
          "name": "notes.DOCX",
          "out": "notes",
        },
        {
          "name": "notes.TXT",
          "out": "notes",
        },
        {
          "name": "notes.MD",
          "out": "notes",
        },
        {
          "name": "x.doc",
          "out": "x.doc",
        },
        {
          "name": "x.docm",
          "out": "x.docm",
        },
        {
          "name": "a.b",
          "out": "a.b",
        },
        {
          "name": ".docx",
          "out": "",
        },
        {
          "name": "no-extension",
          "out": "no-extension",
        },
        {
          "name": "ملف الحصة",
          "out": "ملف الحصة",
        },
        {
          "name": "my_file_name.pdf",
          "out": "my file name",
        },
        {
          "name": "a_b_c.docx",
          "out": "a b c",
        },
        {
          "name": "ملف_الحصة.pdf",
          "out": "ملف الحصة",
        },
      ]
    `);
  });
});

describe('D. cross-variant divergence on one row per filename', () => {
  it('R1 (.pdf only) vs R2 (.docx|.pdf|.txt|.md) vs R3 (any last extension) vs R4 (+ underscores)', () => {
    expect(
      NAMES.map((n) => ({
        name: n,
        R1: ov1.call(n),
        R2: '(site removed)',
        R3: D7.call(n),
        R4: D16.call(n),
        allEqual: new Set([ov1.call(n), D7.call(n), D16.call(n)]).size === 1,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "R1": "ملف الحصة",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "allEqual": true,
          "name": "ملف الحصة.pdf",
        },
        {
          "R1": "ملف الحصة",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "allEqual": true,
          "name": "ملف الحصة.PDF",
        },
        {
          "R1": "ملف الحصة.docx",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "allEqual": false,
          "name": "ملف الحصة.docx",
        },
        {
          "R1": "ملف الحصة.md",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "allEqual": false,
          "name": "ملف الحصة.md",
        },
        {
          "R1": "ملف الحصة.txt",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "allEqual": false,
          "name": "ملف الحصة.txt",
        },
        {
          "R1": "ملف الحصة.doc",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة.doc",
          "allEqual": false,
          "name": "ملف الحصة.doc",
        },
        {
          "R1": "ملف.الحصة.المرحلة.الثانية",
          "R2": "(site removed)",
          "R3": "ملف.الحصة.المرحلة.الثانية",
          "R4": "ملف.الحصة.المرحلة.الثانية",
          "allEqual": true,
          "name": "ملف.الحصة.المرحلة.الثانية.pdf",
        },
        {
          "R1": "ملف الحصة.final.v2",
          "R2": "(site removed)",
          "R3": "ملف الحصة.final.v2",
          "R4": "ملف الحصة.final.v2",
          "allEqual": true,
          "name": "ملف الحصة.final.v2.pdf",
        },
        {
          "R1": "archive.tar.gz",
          "R2": "(site removed)",
          "R3": "archive.tar",
          "R4": "archive.tar.gz",
          "allEqual": false,
          "name": "archive.tar.gz",
        },
        {
          "R1": "no-extension",
          "R2": "(site removed)",
          "R3": "no-extension",
          "R4": "no-extension",
          "allEqual": true,
          "name": "no-extension",
        },
        {
          "R1": "archive.pdf",
          "R2": "(site removed)",
          "R3": "archive.pdf",
          "R4": "archive.pdf",
          "allEqual": true,
          "name": "archive.pdf.pdf",
        },
        {
          "R1": "",
          "R2": "(site removed)",
          "R3": "",
          "R4": "",
          "allEqual": true,
          "name": ".pdf",
        },
        {
          "R1": "v1.2",
          "R2": "(site removed)",
          "R3": "v1",
          "R4": "v1.2",
          "allEqual": false,
          "name": "v1.2",
        },
        {
          "R1": "ملف الحصة",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "allEqual": true,
          "name": "ملف الحصة",
        },
        {
          "R1": "a.tar.gz",
          "R2": "(site removed)",
          "R3": "a.tar.gz",
          "R4": "a.tar.gz",
          "allEqual": true,
          "name": "a.tar.gz.pdf",
        },
        {
          "R1": "file",
          "R2": "(site removed)",
          "R3": "file",
          "R4": "file",
          "allEqual": true,
          "name": "file.PDF",
        },
        {
          "R1": "File",
          "R2": "(site removed)",
          "R3": "File",
          "R4": "File",
          "allEqual": true,
          "name": "File.PdF",
        },
        {
          "R1": "notes.DOCX",
          "R2": "(site removed)",
          "R3": "notes",
          "R4": "notes",
          "allEqual": false,
          "name": "notes.DOCX",
        },
        {
          "R1": "notes.TXT",
          "R2": "(site removed)",
          "R3": "notes",
          "R4": "notes",
          "allEqual": false,
          "name": "notes.TXT",
        },
        {
          "R1": "notes.MD",
          "R2": "(site removed)",
          "R3": "notes",
          "R4": "notes",
          "allEqual": false,
          "name": "notes.MD",
        },
        {
          "R1": "x.doc",
          "R2": "(site removed)",
          "R3": "x",
          "R4": "x.doc",
          "allEqual": false,
          "name": "x.doc",
        },
        {
          "R1": "x.docm",
          "R2": "(site removed)",
          "R3": "x",
          "R4": "x.docm",
          "allEqual": false,
          "name": "x.docm",
        },
        {
          "R1": "a.b",
          "R2": "(site removed)",
          "R3": "a",
          "R4": "a.b",
          "allEqual": false,
          "name": "a.b",
        },
        {
          "R1": ".docx",
          "R2": "(site removed)",
          "R3": "",
          "R4": "",
          "allEqual": false,
          "name": ".docx",
        },
        {
          "R1": "no-extension",
          "R2": "(site removed)",
          "R3": "no-extension",
          "R4": "no-extension",
          "allEqual": true,
          "name": "no-extension",
        },
        {
          "R1": "ملف الحصة",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "allEqual": true,
          "name": "ملف الحصة",
        },
      ]
    `);
  });

  it('the specific cases the task asks about, one line each', () => {
    const probes = [
      { case: 'ends .pdf', name: 'ملف الحصة.pdf' },
      { case: 'ends .docx', name: 'ملف الحصة.docx' },
      { case: 'ends .md', name: 'ملف الحصة.md' },
      { case: 'ends .txt', name: 'ملف الحصة.txt' },
      { case: 'double extension a.tar.gz.pdf', name: 'a.tar.gz.pdf' },
      { case: 'no extension', name: 'no-extension' },
      { case: 'leading dot only', name: '.pdf' },
      { case: 'internal dots', name: 'ملف.الحصة.المرحلة.الثانية.pdf' },
      { case: 'internal dots, unknown last ext', name: 'ملف.الحصة.المرحلة.الثانية.docm' },
      { case: 'version-like, no real extension', name: 'v1.2' },
      { case: 'repeated extension', name: 'archive.pdf.pdf' },
      { case: 'uppercase extension', name: 'ملف الحصة.PDF' },
      { case: 'R3 must not cross a slash', name: 'dir.name/file' },
      { case: 'R3 must not cross a slash, with pdf', name: 'dir.name/file.pdf' },
    ];
    expect(
      probes.map((p) => ({
        ...p,
        R1: ov1.call(p.name),
        R2: '(site removed)',
        R3: D7.call(p.name),
        R4: D16.call(p.name),
        APP725_docxOnly: D10.call(p.name),
        DISAGREE: new Set([ov1.call(p.name), D7.call(p.name), D16.call(p.name)]).size > 1,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "APP725_docxOnly": "ملف الحصة.pdf",
          "DISAGREE": false,
          "R1": "ملف الحصة",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "case": "ends .pdf",
          "name": "ملف الحصة.pdf",
        },
        {
          "APP725_docxOnly": "ملف الحصة",
          "DISAGREE": true,
          "R1": "ملف الحصة.docx",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "case": "ends .docx",
          "name": "ملف الحصة.docx",
        },
        {
          "APP725_docxOnly": "ملف الحصة.md",
          "DISAGREE": true,
          "R1": "ملف الحصة.md",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "case": "ends .md",
          "name": "ملف الحصة.md",
        },
        {
          "APP725_docxOnly": "ملف الحصة.txt",
          "DISAGREE": true,
          "R1": "ملف الحصة.txt",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "case": "ends .txt",
          "name": "ملف الحصة.txt",
        },
        {
          "APP725_docxOnly": "a.tar.gz.pdf",
          "DISAGREE": false,
          "R1": "a.tar.gz",
          "R2": "(site removed)",
          "R3": "a.tar.gz",
          "R4": "a.tar.gz",
          "case": "double extension a.tar.gz.pdf",
          "name": "a.tar.gz.pdf",
        },
        {
          "APP725_docxOnly": "no-extension",
          "DISAGREE": false,
          "R1": "no-extension",
          "R2": "(site removed)",
          "R3": "no-extension",
          "R4": "no-extension",
          "case": "no extension",
          "name": "no-extension",
        },
        {
          "APP725_docxOnly": ".pdf",
          "DISAGREE": false,
          "R1": "",
          "R2": "(site removed)",
          "R3": "",
          "R4": "",
          "case": "leading dot only",
          "name": ".pdf",
        },
        {
          "APP725_docxOnly": "ملف.الحصة.المرحلة.الثانية.pdf",
          "DISAGREE": false,
          "R1": "ملف.الحصة.المرحلة.الثانية",
          "R2": "(site removed)",
          "R3": "ملف.الحصة.المرحلة.الثانية",
          "R4": "ملف.الحصة.المرحلة.الثانية",
          "case": "internal dots",
          "name": "ملف.الحصة.المرحلة.الثانية.pdf",
        },
        {
          "APP725_docxOnly": "ملف.الحصة.المرحلة.الثانية.docm",
          "DISAGREE": true,
          "R1": "ملف.الحصة.المرحلة.الثانية.docm",
          "R2": "(site removed)",
          "R3": "ملف.الحصة.المرحلة.الثانية",
          "R4": "ملف.الحصة.المرحلة.الثانية.docm",
          "case": "internal dots, unknown last ext",
          "name": "ملف.الحصة.المرحلة.الثانية.docm",
        },
        {
          "APP725_docxOnly": "v1.2",
          "DISAGREE": true,
          "R1": "v1.2",
          "R2": "(site removed)",
          "R3": "v1",
          "R4": "v1.2",
          "case": "version-like, no real extension",
          "name": "v1.2",
        },
        {
          "APP725_docxOnly": "archive.pdf.pdf",
          "DISAGREE": false,
          "R1": "archive.pdf",
          "R2": "(site removed)",
          "R3": "archive.pdf",
          "R4": "archive.pdf",
          "case": "repeated extension",
          "name": "archive.pdf.pdf",
        },
        {
          "APP725_docxOnly": "ملف الحصة.PDF",
          "DISAGREE": false,
          "R1": "ملف الحصة",
          "R2": "(site removed)",
          "R3": "ملف الحصة",
          "R4": "ملف الحصة",
          "case": "uppercase extension",
          "name": "ملف الحصة.PDF",
        },
        {
          "APP725_docxOnly": "dir.name/file",
          "DISAGREE": false,
          "R1": "dir.name/file",
          "R2": "(site removed)",
          "R3": "dir.name/file",
          "R4": "dir.name/file",
          "case": "R3 must not cross a slash",
          "name": "dir.name/file",
        },
        {
          "APP725_docxOnly": "dir.name/file.pdf",
          "DISAGREE": false,
          "R1": "dir.name/file",
          "R2": "(site removed)",
          "R3": "dir.name/file",
          "R4": "dir.name/file",
          "case": "R3 must not cross a slash, with pdf",
          "name": "dir.name/file.pdf",
        },
      ]
    `);
  });
});

describe('D. input adapters: the fallback differs between the two families', () => {
  it('empty string and undefined filenames', () => {
    const capture = (fn: (n: string) => string, n: string): string => {
      try {
        return fn(n);
      } catch (err) {
        return `${(err as Error).name}: ${(err as Error).message}`;
      }
    };
    expect({
      empty_string: {
        R1_outputViewer: capture(ov1.call, ''),
        R2_layoutEngine: '(site removed)',
        R3_app490: capture(D7.call, ''),
        R4_auditor: capture(D16.call, ''),
        APP725: capture(D10.call, ''),
      },
      undefined: {
        R1_outputViewer: capture(ov1.call, undefined as unknown as string),
        R2_layoutEngine: '(site removed)',
        R3_app490: capture(D7.call, undefined as unknown as string),
        R4_auditor: capture(D16.call, undefined as unknown as string),
        APP725: capture(D10.call, undefined as unknown as string),
      },
      whitespace_only: {
        R1: ov1.call('   '),
        R2: '(site removed)',
        R3: D7.call('   '),
        R4: D16.call('   '),
      },
    }).toMatchInlineSnapshot(`
      {
        "empty_string": {
          "APP725": "",
          "R1_outputViewer": "document",
          "R2_layoutEngine": "(site removed)",
          "R3_app490": "",
          "R4_auditor": "",
        },
        "undefined": {
          "APP725": "TypeError: Cannot read properties of undefined (reading 'replace')",
          "R1_outputViewer": "document",
          "R2_layoutEngine": "(site removed)",
          "R3_app490": "TypeError: Cannot read properties of undefined (reading 'replace')",
          "R4_auditor": "TypeError: Cannot read properties of undefined (reading 'replace')",
        },
        "whitespace_only": {
          "R1": "   ",
          "R2": "(site removed)",
          "R3": "   ",
          "R4": "   ",
        },
      }
    `);
  });


});