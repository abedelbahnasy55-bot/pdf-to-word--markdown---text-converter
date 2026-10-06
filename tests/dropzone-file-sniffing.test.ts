import { describe, it, expect } from 'vitest';
import { extractAttr, extractConstBlock, extractIfCondition, extractRawExpression } from './helpers/inlineExtract';
import { sourceSlice } from './helpers/sourceExtract';
import { FILE_CANDIDATES } from './fixtures/curriculum';

/**
 * GROUP E — Dropzone file-type sniffing.
 *
 *   E1  src/components/Dropzone.tsx   `const isPdf =` + the two lines after it
 *   E2  src/components/Dropzone.tsx   `if (isPdf || isImg || isWord)`
 *   E3  src/components/Dropzone.tsx   the `accept="..."` attribute of the file input
 *   E4  src/components/Dropzone.tsx   getFileIcon branches (`name.endsWith('.docx')...`, then `.pdf`)
 *   E5  src/components/Dropzone.tsx   `(f) => f.type.startsWith('image/')...` (de-noise banner)
 *
 * E1/E2/E3/E4 must agree about which files the app accepts; E5 is a second, separate image
 * test whose extension set is NOT the same as E1's. All of it is pinned below, including the
 * disagreement between the code predicate and the `accept` list.
 */
const E1 = extractConstBlock('src/components/Dropzone.tsx', 'const isPdf =', {
  count: 3,
  returnExpr: '({ isPdf, isImg, isWord, accepted: isPdf || isImg || isWord })',
});
const E2 = extractIfCondition('src/components/Dropzone.tsx', 'if (isPdf || isImg || isWord)');
const E3 = extractAttr('src/components/Dropzone.tsx', 'accept=', 'accept');
const E4doc = extractIfCondition('src/components/Dropzone.tsx', "if (name.endsWith('.docx') || name.endsWith('.doc'))");
const E4pdf = extractIfCondition('src/components/Dropzone.tsx', "if (name.endsWith('.pdf'))", { from: E4doc.startLine + 1 });
const E5 = extractRawExpression('src/components/Dropzone.tsx', '(f) => f.type.startsWith');

interface Sniffed {
  isPdf: boolean;
  isImg: boolean;
  isWord: boolean;
  accepted: boolean;
}

const sniff = (name: string, type: string): Sniffed => E1.fn({ file: { name, type } }) as Sniffed;
const E1accepted = (name: string, type: string): boolean => E2.fn({ isPdf: sniff(name, type).isPdf, isImg: sniff(name, type).isImg, isWord: sniff(name, type).isWord }) === true;

/**
 * What the `accept="..."` list means, implemented locally for comparison only.
 * Extension tokens (".pdf") match the file NAME case-insensitively; exact MIME tokens and
 * the `image/*` wildcard match the file TYPE. This mirrors how a browser file picker filters,
 * it is NOT production code, and it is what the two sources are compared against.
 */
const acceptListAllows = (name: string, type: string): boolean =>
  E3.tokens.some((token) =>
    token.startsWith('.')
      ? name.toLowerCase().endsWith(token.toLowerCase())
      : token.endsWith('/*')
        ? type.toLowerCase().startsWith(token.slice(0, -1).toLowerCase())
        : type.toLowerCase() === token.toLowerCase(),
  );

const EXTRA_FILES: Array<{ name: string; type: string; note: string }> = [
  { name: 'scan.tiff', type: 'image/tiff', note: 'tiff is in E5 only' },
  { name: 'scan.tiff', type: '', note: 'tiff with no MIME type' },
  { name: 'scan.gif', type: '', note: 'gif in E1 regex, no MIME type' },
  { name: 'scan.svg', type: '', note: 'svg in E1 regex, no MIME type' },
  { name: 'scan.gif', type: 'image/gif', note: 'gif with MIME type' },
  { name: 'scan.bmp', type: '', note: 'bmp in E1 regex, no MIME type' },
  { name: 'lecture.PDF', type: '', note: 'uppercase extension, empty type' },
  { name: 'lecture.pdf', type: 'image/png', note: 'name says pdf, type says png' },
  { name: 'archive.zip', type: 'application/zip', note: 'unsupported extension and type' },
  { name: 'weird.docx.pdf', type: 'application/pdf', note: 'both a docx and a pdf marker' },
  { name: 'image.png.exe', type: 'application/octet-stream', note: 'png is not the last extension' },
  { name: 'word', type: 'application/vnd.ms-word', note: 'type contains "word"' },
  { name: 'sheet.docx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', note: 'officedocument but not wordprocessingml' },
  { name: 'noext', type: 'image/png', note: 'image type with no extension' },
];

describe('E. provenance', () => {
  it('E1 the three predicates', () => {
    expect({ file: 'src/components/Dropzone.tsx', anchor: 'const isPdf =', source: E1.source, vars: E1.vars }).toMatchInlineSnapshot(`
      {
        "anchor": "const isPdf =",
        "file": "src/components/Dropzone.tsx",
        "source": "const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
      const isImg = file.type.startsWith('image/') || Boolean(file.name.match(/\\.(png|jpe?g|bmp|webp|gif|svg)$/i))
      const isWord = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc') || file.type.includes('word') || file.type.includes('officedocument')",
        "vars": [
          "file",
        ],
      }
    `);
  });

  it('E2 the accept decision, extracted separately from the same `if`', () => {
    expect({ anchor: 'if (isPdf || isImg || isWord)', expr: E2.expr, vars: E2.vars }).toMatchInlineSnapshot(`
      {
        "anchor": "if (isPdf || isImg || isWord)",
        "expr": "isPdf || isImg || isWord",
        "vars": [
          "isPdf",
          "isImg",
          "isWord",
        ],
      }
    `);
  });

  it('E2 is exactly the combination the three predicates describe', () => {
    const samples = [...FILE_CANDIDATES.map((f) => ({ name: f.name, type: f.type })), ...EXTRA_FILES];
    expect(samples.map((f) => E1accepted(f.name, f.type))).toMatchInlineSnapshot(`
      [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        false,
        false,
        false,
        true,
        true,
        false,
        true,
        true,
        true,
        true,
        true,
        true,
        false,
        true,
        false,
        true,
        true,
        true,
      ]
    `);
  });

  it('E3 the accept attribute', () => {
    expect({ anchor: 'accept=', value: E3.value, tokens: E3.tokens }).toMatchInlineSnapshot(`
      {
        "anchor": "accept=",
        "tokens": [
          ".pdf",
          ".docx",
          ".doc",
          "image/*",
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        "value": ".pdf,.docx,.doc,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }
    `);
  });

  it('E4 getFileIcon branches and the implicit default', () => {
    expect({
      docBranch: { anchor: "if (name.endsWith('.docx') || name.endsWith('.doc'))", expr: E4doc.expr },
      pdfBranch: { anchor: "if (name.endsWith('.pdf'))", expr: E4pdf.expr },
      fullFunction: sourceSlice('src/components/Dropzone.tsx', E4doc.startLine, E4pdf.startLine + 1),
    }).toMatchInlineSnapshot(`
      {
        "docBranch": {
          "anchor": "if (name.endsWith('.docx') || name.endsWith('.doc'))",
          "expr": "name.endsWith('.docx') || name.endsWith('.doc')",
        },
        "fullFunction": "    if (name.endsWith('.docx') || name.endsWith('.doc')) {
            return <FileText className="w-5 h-5 text-blue-600" />;
          }
          if (name.endsWith('.pdf')) {
            return <FileCode className="w-5 h-5 text-red-600" />;",
        "pdfBranch": {
          "anchor": "if (name.endsWith('.pdf'))",
          "expr": "name.endsWith('.pdf')",
        },
      }
    `);
  });

  it('E5 the de-noise image test — a DIFFERENT extension set from E1', () => {
    expect({ anchor: '(f) => f.type.startsWith', expr: E5.expr, vars: E5.vars }).toMatchInlineSnapshot(`
      {
        "anchor": "(f) => f.type.startsWith",
        "expr": "(f) => f.type.startsWith('image/') || /\\.(png|jpe?g|webp|bmp|tiff?)$/i.test(f.name)",
        "vars": [
          "f",
        ],
      }
    `);
  });
});

describe('E. the fixture file matrix', () => {
  it('per-file predicate verdicts', () => {
    expect(FILE_CANDIDATES.map((f) => ({ name: f.name, type: f.type, ...sniff(f.name, f.type) }))).toMatchInlineSnapshot(`
      [
        {
          "accepted": true,
          "isImg": false,
          "isPdf": true,
          "isWord": false,
          "name": "lecture-01.pdf",
          "type": "application/pdf",
        },
        {
          "accepted": true,
          "isImg": false,
          "isPdf": true,
          "isWord": false,
          "name": "lecture-01.PDF",
          "type": "",
        },
        {
          "accepted": true,
          "isImg": false,
          "isPdf": false,
          "isWord": true,
          "name": "notes.docx",
          "type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        {
          "accepted": true,
          "isImg": false,
          "isPdf": false,
          "isWord": true,
          "name": "notes.doc",
          "type": "application/msword",
        },
        {
          "accepted": true,
          "isImg": true,
          "isPdf": false,
          "isWord": false,
          "name": "scan.png",
          "type": "image/png",
        },
        {
          "accepted": true,
          "isImg": true,
          "isPdf": false,
          "isWord": false,
          "name": "scan.JPEG",
          "type": "",
        },
        {
          "accepted": true,
          "isImg": true,
          "isPdf": false,
          "isWord": false,
          "name": "scan.webp",
          "type": "",
        },
        {
          "accepted": false,
          "isImg": false,
          "isPdf": false,
          "isWord": false,
          "name": "noext",
          "type": "application/octet-stream",
        },
        {
          "accepted": false,
          "isImg": false,
          "isPdf": false,
          "isWord": false,
          "name": "notes.txt",
          "type": "text/plain",
        },
        {
          "accepted": false,
          "isImg": false,
          "isPdf": false,
          "isWord": false,
          "name": "fake.pdf.txt",
          "type": "text/plain",
        },
        {
          "accepted": true,
          "isImg": false,
          "isPdf": false,
          "isWord": true,
          "name": "wordless.docx",
          "type": "application/msword",
        },
      ]
    `);
  });

  it('code predicate vs the accept list, per fixture file', () => {
    expect(
      FILE_CANDIDATES.map((f) => ({
        name: f.name,
        type: f.type,
        codeAccepts: sniff(f.name, f.type).accepted,
        acceptListAllows: acceptListAllows(f.name, f.type),
        AGREE: sniff(f.name, f.type).accepted === acceptListAllows(f.name, f.type),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "AGREE": true,
          "acceptListAllows": true,
          "codeAccepts": true,
          "name": "lecture-01.pdf",
          "type": "application/pdf",
        },
        {
          "AGREE": true,
          "acceptListAllows": true,
          "codeAccepts": true,
          "name": "lecture-01.PDF",
          "type": "",
        },
        {
          "AGREE": true,
          "acceptListAllows": true,
          "codeAccepts": true,
          "name": "notes.docx",
          "type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        {
          "AGREE": true,
          "acceptListAllows": true,
          "codeAccepts": true,
          "name": "notes.doc",
          "type": "application/msword",
        },
        {
          "AGREE": true,
          "acceptListAllows": true,
          "codeAccepts": true,
          "name": "scan.png",
          "type": "image/png",
        },
        {
          "AGREE": false,
          "acceptListAllows": false,
          "codeAccepts": true,
          "name": "scan.JPEG",
          "type": "",
        },
        {
          "AGREE": false,
          "acceptListAllows": false,
          "codeAccepts": true,
          "name": "scan.webp",
          "type": "",
        },
        {
          "AGREE": true,
          "acceptListAllows": false,
          "codeAccepts": false,
          "name": "noext",
          "type": "application/octet-stream",
        },
        {
          "AGREE": true,
          "acceptListAllows": false,
          "codeAccepts": false,
          "name": "notes.txt",
          "type": "text/plain",
        },
        {
          "AGREE": true,
          "acceptListAllows": false,
          "codeAccepts": false,
          "name": "fake.pdf.txt",
          "type": "text/plain",
        },
        {
          "AGREE": true,
          "acceptListAllows": true,
          "codeAccepts": true,
          "name": "wordless.docx",
          "type": "application/msword",
        },
      ]
    `);
  });

  it('extended matrix: where the two disagree', () => {
    expect(
      EXTRA_FILES.map((f) => ({
        ...f,
        ...sniff(f.name, f.type),
        acceptListAllows: acceptListAllows(f.name, f.type),
        AGREE: sniff(f.name, f.type).accepted === acceptListAllows(f.name, f.type),
        deNoiseBannerE5: (E5.fn({ f: { name: f.name, type: f.type } }) as (f: { name: string; type: string }) => boolean)({ name: f.name, type: f.type }),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "AGREE": true,
          "acceptListAllows": true,
          "accepted": true,
          "deNoiseBannerE5": true,
          "isImg": true,
          "isPdf": false,
          "isWord": false,
          "name": "scan.tiff",
          "note": "tiff is in E5 only",
          "type": "image/tiff",
        },
        {
          "AGREE": true,
          "acceptListAllows": false,
          "accepted": false,
          "deNoiseBannerE5": true,
          "isImg": false,
          "isPdf": false,
          "isWord": false,
          "name": "scan.tiff",
          "note": "tiff with no MIME type",
          "type": "",
        },
        {
          "AGREE": false,
          "acceptListAllows": false,
          "accepted": true,
          "deNoiseBannerE5": false,
          "isImg": true,
          "isPdf": false,
          "isWord": false,
          "name": "scan.gif",
          "note": "gif in E1 regex, no MIME type",
          "type": "",
        },
        {
          "AGREE": false,
          "acceptListAllows": false,
          "accepted": true,
          "deNoiseBannerE5": false,
          "isImg": true,
          "isPdf": false,
          "isWord": false,
          "name": "scan.svg",
          "note": "svg in E1 regex, no MIME type",
          "type": "",
        },
        {
          "AGREE": true,
          "acceptListAllows": true,
          "accepted": true,
          "deNoiseBannerE5": true,
          "isImg": true,
          "isPdf": false,
          "isWord": false,
          "name": "scan.gif",
          "note": "gif with MIME type",
          "type": "image/gif",
        },
        {
          "AGREE": false,
          "acceptListAllows": false,
          "accepted": true,
          "deNoiseBannerE5": true,
          "isImg": true,
          "isPdf": false,
          "isWord": false,
          "name": "scan.bmp",
          "note": "bmp in E1 regex, no MIME type",
          "type": "",
        },
        {
          "AGREE": true,
          "acceptListAllows": true,
          "accepted": true,
          "deNoiseBannerE5": false,
          "isImg": false,
          "isPdf": true,
          "isWord": false,
          "name": "lecture.PDF",
          "note": "uppercase extension, empty type",
          "type": "",
        },
        {
          "AGREE": true,
          "acceptListAllows": true,
          "accepted": true,
          "deNoiseBannerE5": true,
          "isImg": true,
          "isPdf": true,
          "isWord": false,
          "name": "lecture.pdf",
          "note": "name says pdf, type says png",
          "type": "image/png",
        },
        {
          "AGREE": true,
          "acceptListAllows": false,
          "accepted": false,
          "deNoiseBannerE5": false,
          "isImg": false,
          "isPdf": false,
          "isWord": false,
          "name": "archive.zip",
          "note": "unsupported extension and type",
          "type": "application/zip",
        },
        {
          "AGREE": true,
          "acceptListAllows": true,
          "accepted": true,
          "deNoiseBannerE5": false,
          "isImg": false,
          "isPdf": true,
          "isWord": false,
          "name": "weird.docx.pdf",
          "note": "both a docx and a pdf marker",
          "type": "application/pdf",
        },
        {
          "AGREE": true,
          "acceptListAllows": false,
          "accepted": false,
          "deNoiseBannerE5": false,
          "isImg": false,
          "isPdf": false,
          "isWord": false,
          "name": "image.png.exe",
          "note": "png is not the last extension",
          "type": "application/octet-stream",
        },
        {
          "AGREE": false,
          "acceptListAllows": false,
          "accepted": true,
          "deNoiseBannerE5": false,
          "isImg": false,
          "isPdf": false,
          "isWord": true,
          "name": "word",
          "note": "type contains "word"",
          "type": "application/vnd.ms-word",
        },
        {
          "AGREE": true,
          "acceptListAllows": true,
          "accepted": true,
          "deNoiseBannerE5": false,
          "isImg": false,
          "isPdf": false,
          "isWord": true,
          "name": "sheet.docx",
          "note": "officedocument but not wordprocessingml",
          "type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        {
          "AGREE": true,
          "acceptListAllows": true,
          "accepted": true,
          "deNoiseBannerE5": true,
          "isImg": true,
          "isPdf": false,
          "isWord": false,
          "name": "noext",
          "note": "image type with no extension",
          "type": "image/png",
        },
      ]
    `);
  });

  it('divergence summary: files the code accepts but the accept list filters out', () => {
    const all = [...FILE_CANDIDATES.map((f) => ({ name: f.name, type: f.type })), ...EXTRA_FILES];
    expect(
      all
        .filter((f) => sniff(f.name, f.type).accepted && !acceptListAllows(f.name, f.type))
        .map((f) => ({ name: f.name, type: f.type, isImg: sniff(f.name, f.type).isImg })),
    ).toMatchInlineSnapshot(`
      [
        {
          "isImg": true,
          "name": "scan.JPEG",
          "type": "",
        },
        {
          "isImg": true,
          "name": "scan.webp",
          "type": "",
        },
        {
          "isImg": true,
          "name": "scan.gif",
          "type": "",
        },
        {
          "isImg": true,
          "name": "scan.svg",
          "type": "",
        },
        {
          "isImg": true,
          "name": "scan.bmp",
          "type": "",
        },
        {
          "isImg": false,
          "name": "word",
          "type": "application/vnd.ms-word",
        },
      ]
    `);
  });

  it('the reverse direction: files the accept list allows but the code rejects', () => {
    const all = [...FILE_CANDIDATES.map((f) => ({ name: f.name, type: f.type })), ...EXTRA_FILES];
    expect(
      all
        .filter((f) => !sniff(f.name, f.type).accepted && acceptListAllows(f.name, f.type))
        .map((f) => ({ name: f.name, type: f.type })),
    ).toMatchInlineSnapshot(`[]`);
  });
});

describe('E. image extension sets: E1 vs E5 vs the accept list', () => {
  it('the three image tests side by side over every image extension', () => {
    const exts = ['png', 'jpg', 'jpeg', 'jpe', 'JPG', 'bmp', 'webp', 'gif', 'svg', 'tiff', 'tif', 'avif', 'heic', 'pdf'];
    expect(
      exts.map((ext) => {
        const name = `scan.${ext}`;
        return {
          ext,
          E1_isImg: sniff(name, '').isImg,
          E5_deNoise: (E5.fn({ f: { name, type: '' } }) as (f: { name: string; type: string }) => boolean)({ name, type: '' }),
          E4docBranch: E4doc.fn({ name: name.toLowerCase() }) === true,
          E4pdfBranch: E4pdf.fn({ name: name.toLowerCase() }) === true,
          acceptListAllows: acceptListAllows(name, ''),
        };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "E1_isImg": true,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": true,
          "acceptListAllows": false,
          "ext": "png",
        },
        {
          "E1_isImg": true,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": true,
          "acceptListAllows": false,
          "ext": "jpg",
        },
        {
          "E1_isImg": true,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": true,
          "acceptListAllows": false,
          "ext": "jpeg",
        },
        {
          "E1_isImg": false,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": false,
          "acceptListAllows": false,
          "ext": "jpe",
        },
        {
          "E1_isImg": true,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": true,
          "acceptListAllows": false,
          "ext": "JPG",
        },
        {
          "E1_isImg": true,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": true,
          "acceptListAllows": false,
          "ext": "bmp",
        },
        {
          "E1_isImg": true,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": true,
          "acceptListAllows": false,
          "ext": "webp",
        },
        {
          "E1_isImg": true,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": false,
          "acceptListAllows": false,
          "ext": "gif",
        },
        {
          "E1_isImg": true,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": false,
          "acceptListAllows": false,
          "ext": "svg",
        },
        {
          "E1_isImg": false,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": true,
          "acceptListAllows": false,
          "ext": "tiff",
        },
        {
          "E1_isImg": false,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": true,
          "acceptListAllows": false,
          "ext": "tif",
        },
        {
          "E1_isImg": false,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": false,
          "acceptListAllows": false,
          "ext": "avif",
        },
        {
          "E1_isImg": false,
          "E4docBranch": false,
          "E4pdfBranch": false,
          "E5_deNoise": false,
          "acceptListAllows": false,
          "ext": "heic",
        },
        {
          "E1_isImg": false,
          "E4docBranch": false,
          "E4pdfBranch": true,
          "E5_deNoise": false,
          "acceptListAllows": true,
          "ext": "pdf",
        },
      ]
    `);
  });

  it('E1 accepts an image by EXTENSION even with an empty type; E5 accepts by type OR its own extension list', () => {
    const rows = [
      { name: 'scan.webp', type: '' },
      { name: 'scan.gif', type: '' },
      { name: 'scan.svg', type: '' },
      { name: 'scan.tiff', type: '' },
      { name: 'scan.unknownext', type: 'image/unknown' },
      { name: 'noext', type: 'image/png' },
    ];
    expect(
      rows.map((f) => ({
        ...f,
        E1_isImg: sniff(f.name, f.type).isImg,
        E5_deNoise: (E5.fn({ f }) as (x: { name: string; type: string }) => boolean)(f),
        equal: sniff(f.name, f.type).isImg === (E5.fn({ f }) as (x: { name: string; type: string }) => boolean)(f),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "E1_isImg": true,
          "E5_deNoise": true,
          "equal": true,
          "name": "scan.webp",
          "type": "",
        },
        {
          "E1_isImg": true,
          "E5_deNoise": false,
          "equal": false,
          "name": "scan.gif",
          "type": "",
        },
        {
          "E1_isImg": true,
          "E5_deNoise": false,
          "equal": false,
          "name": "scan.svg",
          "type": "",
        },
        {
          "E1_isImg": false,
          "E5_deNoise": true,
          "equal": false,
          "name": "scan.tiff",
          "type": "",
        },
        {
          "E1_isImg": true,
          "E5_deNoise": true,
          "equal": true,
          "name": "scan.unknownext",
          "type": "image/unknown",
        },
        {
          "E1_isImg": true,
          "E5_deNoise": true,
          "equal": true,
          "name": "noext",
          "type": "image/png",
        },
      ]
    `);
  });

  it('the word predicate is a substring test on the MIME type', () => {
    const rows = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-word',
      'application/officedocument',
      'image/wordart',
      'application/rtf',
      '',
    ];
    expect(
      rows.map((type) => {
        const f = { name: 'x', type };
        return { type, ...sniff(f.name, f.type) };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "accepted": true,
          "isImg": false,
          "isPdf": false,
          "isWord": true,
          "type": "application/msword",
        },
        {
          "accepted": true,
          "isImg": false,
          "isPdf": false,
          "isWord": true,
          "type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        {
          "accepted": true,
          "isImg": false,
          "isPdf": false,
          "isWord": true,
          "type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        {
          "accepted": true,
          "isImg": false,
          "isPdf": false,
          "isWord": true,
          "type": "application/vnd.ms-word",
        },
        {
          "accepted": true,
          "isImg": false,
          "isPdf": false,
          "isWord": true,
          "type": "application/officedocument",
        },
        {
          "accepted": true,
          "isImg": true,
          "isPdf": false,
          "isWord": true,
          "type": "image/wordart",
        },
        {
          "accepted": false,
          "isImg": false,
          "isPdf": false,
          "isWord": false,
          "type": "application/rtf",
        },
        {
          "accepted": false,
          "isImg": false,
          "isPdf": false,
          "isWord": false,
          "type": "",
        },
      ]
    `);
  });
});