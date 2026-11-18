#!/usr/bin/env node
/**
 * Model Context Protocol (MCP) Server for PDF & Book to Word/Markdown Conversion.
 *
 * Publication-Grade v2.0 Features:
 * - Calibrated dual-script Word (.docx) typography (default: Amiri 14pt + Plus Jakarta Sans 14pt, 1.5x line spacing)
 *   with strict script segmentation so interleaved Arabic & English text ("الكلام المتداخل") renders in perfect order.
 * - Full shared linguistic & QA refinement pipeline matching the web application 1:1.
 * - 4-Tier Resilient Offline-First Extraction Waterfall:
 *     Tier 1: Remote Converter Server (with automatic circuit breaker when offline/5xx)
 *     Tier 2: Direct Multi-Model Gemini Vision OCR using full verbatim system instruction
 *     Tier 3: Local Zero-Quota Digital PDF Text Extraction (pdf-parse)
 *     Tier 4: Native Offline DOCX / Markdown / Image processing & QA repair
 *
 * Implements MCP JSON-RPC 2.0 over standard I/O (stdio).
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves shared core modules cleanly both inside the monorepo (../shared/*)
 * and inside standalone extracted ZIP bundles (./shared/*).
 */
function resolveSharedModulePath(filename) {
  const localBundled = path.join(SCRIPT_DIR, 'shared', filename);
  if (fs.existsSync(localBundled)) {
    return pathToFileURL(localBundled).href;
  }
  const repoShared = path.join(SCRIPT_DIR, '..', 'shared', filename);
  if (fs.existsSync(repoShared)) {
    return pathToFileURL(repoShared).href;
  }
  throw new Error(`Shared pipeline module not found: ${filename}. Please re-download the complete CLI/MCP bundle.`);
}

let sharedPipeline = null;
let sharedTypography = null;

async function ensureSharedModules() {
  if (sharedPipeline && sharedTypography) {
    return { sharedPipeline, sharedTypography };
  }
  const pipelineUrl = resolveSharedModulePath('arabicPipelineCore.js');
  const typoUrl = resolveSharedModulePath('typographyDocxCore.js');
  sharedPipeline = await import(pipelineUrl);
  sharedTypography = await import(typoUrl);
  return { sharedPipeline, sharedTypography };
}

let PDFDocument;
let docxLib;
let JSZip;
let PDFParseClass = null;
let GoogleGenAIClass = null;
let depsLoaded = false;

export async function ensureDependencies() {
  if (depsLoaded) return true;

  const tryLoad = async () => {
    try {
      const [pdfLibMod, docxMod, jszipMod] = await Promise.all([
        import('pdf-lib'),
        import('docx'),
        import('jszip'),
      ]);
      PDFDocument = pdfLibMod.PDFDocument;
      docxLib = docxMod;
      JSZip = jszipMod.default || jszipMod;

      // Optional offline enhancers (loaded cleanly if installed)
      try {
        const pdfParseMod = await import('pdf-parse');
        PDFParseClass = pdfParseMod.PDFParse || pdfParseMod.default?.PDFParse || null;
      } catch {
        PDFParseClass = null;
      }
      try {
        const genaiMod = await import('@google/genai');
        GoogleGenAIClass = genaiMod.GoogleGenAI || null;
      } catch {
        GoogleGenAIClass = null;
      }

      await ensureSharedModules();
      depsLoaded = true;
      return true;
    } catch {
      return false;
    }
  };

  if (await tryLoad()) return true;

  logInfo('Dependencies missing. Attempting auto-installation via npm...');
  try {
    const { execSync } = await import('node:child_process');
    execSync('npm install --no-audit --no-fund', { cwd: SCRIPT_DIR, stdio: 'ignore' });
    if (await tryLoad()) {
      logInfo('Dependencies successfully auto-installed.');
      return true;
    }
  } catch {}

  logInfo('⚠️ Required packages (pdf-lib, docx, jszip, pdf-parse, @google/genai) are not installed yet.');
  logInfo('👉 Run "./install.sh" (Linux/Mac), "install.bat" (Windows), or "npm install".');
  return false;
}

const SERVER_NAME = 'pdf-to-word-mcp-server';
const SERVER_VERSION = '2.0.0';
const PROTOCOL_VERSION = '2024-11-05';

const DEFAULT_SERVER_URL = (
  process.env.CONVERTER_SERVER_URL ||
  'https://pdf-to-word-markdown-text-converter.ai.studio'
).replace(/\/+$/, '');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const TEAM_ACCESS_CODE = process.env.TEAM_ACCESS_CODE || '';

let cachedTeamSessionToken = '';
async function getTeamAuthHeaders() {
  if (!TEAM_ACCESS_CODE) return {};
  if (cachedTeamSessionToken) return { 'X-Team-Session': cachedTeamSessionToken };
  try {
    const authRes = await fetch(`${DEFAULT_SERVER_URL}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: TEAM_ACCESS_CODE, rememberDevice: true }),
    });
    const authJson = await authRes.json().catch(() => null);
    if (authRes.ok && authJson?.sessionToken) {
      cachedTeamSessionToken = authJson.sessionToken;
      return { 'X-Team-Session': cachedTeamSessionToken };
    }
  } catch {}
  return {};
}

// Multi-model matrix prioritized by free-tier headroom & modern availability
const OCR_MODELS_FALLBACK = [
  'gemini-4-hydrogen',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
];

const MASTER_OCR_SYSTEM_PROMPT = `You are a master document transcription, OCR, and typesetting specialist for all languages and fields (English books, scientific & mathematical publications, STEM, literature, as well as classical and modern Arabic books, Islamic texts, Azhar curricula, and exam papers).
Your mission is to transcribe the attached document into pristine, professional, high-fidelity Markdown with 100% VERBATIM accuracy, strictly respecting the source language, orientation, and layout.

### Strict Core Guidelines (دستور النسخ الحرفي المطلق وتجريم أي تصرف أو تحريف):

1. **Zero Omission & Verbatim Guarantee (حظر الحذف أو التلخيص أو الاقتطاع)**:
   - Transcribe EVERY SINGLE WORD, sentence, line, footnote, header, table, exercise, question, and answer.
   - NEVER summarize, paraphrase, rewrite, shorten, or skip any content under any circumstances!
   - Preserve exact words and sentence meaning without guessing or semantic drift.

2. **Multi-Column & Side-Column Full Extraction (دقة الصفحات متعددة الأعمدة والحواشي)**:
   - For multi-column pages (two columns, or main text + margin commentary): transcribe each column completely in proper reading order (Right-to-Left for Arabic: right column first in full, then left column in full).
   - NEVER drop or skip one of the columns!

3. **Holy Quranic Verses in Authentic Uthmani Script (الآيات القرآنية بالرسم العثماني المعتمد)**:
   - Every single Quranic verse, partial ayah, or phrase (whether standalone, after قال تعالى or قوله تعالى, or quoted) MUST be transcribed in 100% authentic Uthmani script with full diacritical marks (تَشْكِيل كَامِل) and strictly wrapped between ornamental brackets: ﴿...﴾.
   - Example: قال تعالى: ﴿عَمَّ يَتَسَاءَلُونَ﴾.

4. **Arabic Diacritics & Vocalization (التشكيل الدقيق وضبط الكلمات)**:
   - Carefully preserve all Arabic vocalization and diacritical marks (حركات، شدة، تنوين، سكون) exactly as printed in the original document.

5. **Tables, Grids & Vocabulary Matrices (دقة الجداول والمصفوفات)**:
   - Transcribe all tables, comparison grids, exam questions/answers, and vocabulary matrices into standard Markdown tables:
     | العمود الأول | العمود الثاني | العمود الثالث |
     | :--- | :--- | :--- |
     | محتوى الخلية | محتوى الخلية | محتوى الخلية |
   - NEVER collapse multi-column tabular data into jumbled single lines of text.
   - STRICT RULE ON TABLE HEADERS: NEVER use the Arabic letter 'ا' as a column separator in table headers. EVERY table column MUST be separated by standard Markdown pipe characters (|) with spaces.
   - STRICT RULE ON FOOTNOTE & NOISE CLEANUP: NEVER output scanner artifact footnote noise or broken margin identifiers (such as the word "شمخ" or stray superscript symbols "^(١)").

6. **Cover Page Full Integrity (سلامة صفحة الغلاف)**:
   - When transcribing a title or cover page, capture every title, subtitle, author, department, and publisher without omissions.

7. **Footnotes Preservation & Separation (الهوامش والحواشي السفلية)**:
   - Separate footnotes from the body text and place them at the bottom of the page in standard Markdown footnote format:
     ---
     **Footnotes / الهوامش:**
     [^1]: Note content...

8. **Strict Page Parity Marker (تطابق الصفحات 1:1)**:
   - Insert an isolated line containing strictly "---PAGE_BREAK---" at the end of every original PDF page to ensure 1:1 page correspondence in Word and export formats.

9. **Numbering & Question Sequences (أرقام الأسئلة والتمارين)**:
   - Preserve the exact literal numbering: (1. , ١. , (1) , (١) , أ- , ب-). Do NOT renumber or drop question numbers.

10. **Sanitization**:
    - Strip scanner/app watermarks (e.g. "CamScanner", "Created with Photo-to-PDF", "Adobe Scan").
    - Ban runaway dot chains (compress "......" to ".....").

11. **Bilingual & Mixed Arabic-English Precision**:
    - Keep embedded English technical terms, acronyms, citations, and mathematical variables accurate with clean whitespace separation from surrounding Arabic words.

OUTPUT DIRECTLY AS PRISTINE MARKDOWN ONLY (Do not wrap in JSON).`;

// Circuit breaker & per-model cooldown state
const serverCircuit = {
  isDown: false,
  downUntil: 0,
  consecutiveFailures: 0,
  lastError: null,
};

const modelCoolDowns = {};

const TYPOGRAPHY_ARG_SCHEMA = {
  font_profile: {
    type: 'string',
    enum: ['bilingual_publication', 'heritage_azhari', 'academic_editorial', 'modern_crisp', 'cairo_modern'],
    description:
      'Typography preset pairing calibrated Arabic & English fonts (default: bilingual_publication -> Amiri 14pt + Plus Jakarta Sans 14pt, 1.5 line spacing)',
  },
  arabic_font: {
    type: 'string',
    description: 'Optional custom Arabic font family override (default: "Amiri"; alternatives: "Traditional Arabic", "Sakkal Majalla", "Cairo")',
  },
  english_font: {
    type: 'string',
    description: 'Optional custom English/Latin font family override (default: "Plus Jakarta Sans"; alternatives: "Calibri", "Times New Roman", "Segoe UI")',
  },
  arabic_font_size: {
    type: 'number',
    description: 'Optional Arabic base body size in points (9-28pt, default 14pt)',
  },
  english_font_size: {
    type: 'number',
    description: 'Optional English base body size in points (8-24pt, default 14pt)',
  },
  direction: {
    type: 'string',
    enum: ['auto', 'rtl', 'ltr'],
    description: 'Document base direction (default: auto)',
  },
};

// Tool definitions for MCP
const TOOLS = [
  {
    name: 'scan_books_directory',
    description:
      'Scans a local directory for PDF, Word (.docx), Markdown (.md/.txt), and scanned image files, calculating file counts and sizes.',
    inputSchema: {
      type: 'object',
      properties: {
        directory_path: {
          type: 'string',
          description: 'Absolute or relative path to the folder containing books',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to scan subdirectories recursively (default: true)',
        },
      },
      required: ['directory_path'],
    },
  },
  {
    name: 'convert_book_to_word',
    description:
      'Converts a single PDF, scanned image, Markdown, or DOCX book into publication-grade Word (.docx) and cleaned Markdown (.md) using the full QA pipeline and automatic offline fallback when the server is down.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the input book (.pdf, .png, .jpg, .docx, .md, .txt) on the local system',
        },
        output_dir: {
          type: 'string',
          description: 'Folder where converted .docx and .md files should be saved (defaults to source folder)',
        },
        extraction_mode: {
          type: 'string',
          enum: ['auto', 'server_first', 'local_ocr', 'digital_only'],
          description: 'Extraction routing strategy (default: auto with server circuit breaker & offline fallback)',
        },
        deep_verify: {
          type: 'boolean',
          description: 'Run optional AI contextual & Quranic Uthmani verification pass when API is reachable (default: false)',
        },
        ...TYPOGRAPHY_ARG_SCHEMA,
      },
      required: ['file_path'],
    },
  },
  {
    name: 'batch_convert_folder',
    description:
      'Executes sequential, low-memory batch conversion on an entire folder (PDF, DOCX, images, Markdown). Automatically applies full QA gates, calibrated typography, resume state, and scheduled ZIP bundles.',
    inputSchema: {
      type: 'object',
      properties: {
        input_dir: {
          type: 'string',
          description: 'Folder containing the source books',
        },
        output_dir: {
          type: 'string',
          description: 'Folder where output files and scheduled ZIP bundles will be saved',
        },
        bundle_size: {
          type: 'number',
          description: 'Number of books per scheduled ZIP archive bundle (default: 15)',
        },
        extraction_mode: {
          type: 'string',
          enum: ['auto', 'server_first', 'local_ocr', 'digital_only'],
          description: 'Extraction routing strategy (default: auto)',
        },
        ...TYPOGRAPHY_ARG_SCHEMA,
      },
      required: ['input_dir'],
    },
  },
  {
    name: 'get_batch_status',
    description: 'Checks the current batch progress, failed items, and resume state of a conversion directory.',
    inputSchema: {
      type: 'object',
      properties: {
        output_dir: {
          type: 'string',
          description: 'The output folder where books are being converted',
        },
      },
      required: ['output_dir'],
    },
  },
  {
    name: 'audit_and_repair_document',
    description:
      'Runs the complete offline Arabic/bilingual linguistic normalization, structural cleaner, and Strict QA Gates audit on any Markdown, Text, or Word (.docx) file, exporting a repaired .docx and QA quality score.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to existing .md, .txt, or .docx file to audit and repair',
        },
        output_dir: {
          type: 'string',
          description: 'Optional output directory for the repaired .docx and .md files',
        },
        ...TYPOGRAPHY_ARG_SCHEMA,
      },
      required: ['file_path'],
    },
  },
  {
    name: 'export_markdown_to_docx',
    description:
      'Converts raw Markdown text or a local .md file directly into a calibrated bilingual Word (.docx) document completely offline with strict Arabic/English script isolation.',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description: 'Markdown content to convert (optional if input_file is supplied)',
        },
        input_file: {
          type: 'string',
          description: 'Path to a local .md or .txt file (optional if markdown string is supplied)',
        },
        output_path: {
          type: 'string',
          description: 'Full output file path for the generated .docx file',
        },
        title: {
          type: 'string',
          description: 'Document title',
        },
        ...TYPOGRAPHY_ARG_SCHEMA,
      },
      required: ['output_path'],
    },
  },
  {
    name: 'check_pipeline_health',
    description:
      'Diagnoses live converter server reachability, offline Gemini OCR readiness, zero-quota digital PDF extractor readiness, and available Word typography profiles.',
    inputSchema: {
      type: 'object',
      properties: {
        probe_server: {
          type: 'boolean',
          description: 'Whether to actively ping the configured remote converter server /api/health (default: true)',
        },
      },
    },
  },
];

function sendResponse(id, result, error = null) {
  const payload = { jsonrpc: '2.0', id };
  if (error) payload.error = error;
  else payload.result = result;
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function logInfo(...args) {
  process.stderr.write(`[MCP Server] ${args.join(' ')}\n`);
}

function extractTypographyOptions(args = {}) {
  return {
    fontProfile: args.font_profile || process.env.MCP_FONT_PROFILE || 'bilingual_publication',
    arabicFont: args.arabic_font || process.env.MCP_ARABIC_FONT || undefined,
    englishFont: args.english_font || process.env.MCP_ENGLISH_FONT || undefined,
    arabicSizePt:
      typeof args.arabic_font_size === 'number' ? args.arabic_font_size : undefined,
    englishSizePt:
      typeof args.english_font_size === 'number' ? args.english_font_size : undefined,
    direction: args.direction || 'auto',
  };
}

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Pure-Node DOCX -> Structured Markdown extractor using JSZip (zero browser DOM dependency).
 */
export async function extractMarkdownFromDocxBuffer(docxBuffer) {
  const zip = await JSZip.loadAsync(docxBuffer);
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) {
    throw new Error('ملف Word غير صالح (لا يحتوي على word/document.xml).');
  }
  const xmlText = await docEntry.async('text');

  // Parse footnotes if present
  const footnotesMap = {};
  const fnEntry = zip.file('word/footnotes.xml');
  if (fnEntry) {
    const fnXml = await fnEntry.async('text');
    const fnBlocks = fnXml.match(/<w:footnote\b[^>]*>[\s\S]*?<\/w:footnote>/g) || [];
    for (const block of fnBlocks) {
      const idMatch = block.match(/w:id="([^"]+)"/);
      const typeMatch = block.match(/w:type="([^"]+)"/);
      if (typeMatch && (typeMatch[1] === 'separator' || typeMatch[1] === 'continuationSeparator')) {
        continue;
      }
      if (idMatch) {
        const texts = [...block.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
          decodeXmlEntities(m[1])
        );
        footnotesMap[idMatch[1]] = texts.join('').trim();
      }
    }
  }

  const bodyMatch = xmlText.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/);
  const bodyXml = bodyMatch ? bodyMatch[1] : xmlText;

  // Tokenize top-level tables and paragraphs inside w:body
  const mdBlocks = [];
  const blockRegex = /(<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>)/g;
  let bMatch;

  const parseParagraphXml = (pXml) => {
    let hasPageBreak = /<w:br[^>]*w:type="page"|<w:lastRenderedPageBreak\b/.test(pXml);
    const styleMatch = pXml.match(/<w:pStyle[^>]*w:val="([^"]+)"/i);
    let headingLevel = 0;
    if (styleMatch) {
      const s = styleMatch[1].toLowerCase();
      if (s.includes('heading1') || s === 'title' || s === 'h1') headingLevel = 1;
      else if (s.includes('heading2') || s === 'subtitle' || s === 'h2') headingLevel = 2;
      else if (s.includes('heading3') || s === 'h3') headingLevel = 3;
      else if (s.includes('heading4') || s === 'h4') headingLevel = 4;
    }

    const isList = /<w:numPr\b/.test(pXml);
    const runs = pXml.match(/<w:r\b[\s\S]*?<\/w:r>/g) || [];
    let fullText = '';
    for (const run of runs) {
      const rPr = (run.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/) || [''])[0];
      const isBold = /<w:b(?:\s|\/|>)/.test(rPr) && !/<w:b\s+w:val="(?:false|0)"/.test(rPr);
      const isItalic = /<w:i(?:\s|\/|>)/.test(rPr) && !/<w:i\s+w:val="(?:false|0)"/.test(rPr);
      const tMatches = [...run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)];
      let rText = tMatches.map((m) => decodeXmlEntities(m[1])).join('');
      const fnRefMatch = run.match(/<w:footnoteReference[^>]*w:id="([^"]+)"/);
      if (fnRefMatch && footnotesMap[fnRefMatch[1]]) {
        rText += `[^${fnRefMatch[1]}]`;
      }
      if (!rText) continue;
      if (headingLevel === 0 && rText.trim()) {
        if (isBold && isItalic) fullText += `***${rText}***`;
        else if (isBold) fullText += `**${rText}**`;
        else if (isItalic) fullText += `*${rText}*`;
        else fullText += rText;
      } else {
        fullText += rText;
      }
    }
    return { text: fullText.trim(), headingLevel, isList, hasPageBreak };
  };

  while ((bMatch = blockRegex.exec(bodyXml)) !== null) {
    const token = bMatch[0];
    if (token.startsWith('<w:tbl')) {
      const trs = token.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
      const tableRows = [];
      for (const tr of trs) {
        const tcs = tr.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
        const cells = [];
        for (const tc of tcs) {
          const ps = tc.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
          const cellText = ps
            .map((p) => parseParagraphXml(p).text)
            .filter(Boolean)
            .join(' ');
          cells.push(cellText.replace(/\|/g, '\\|'));
        }
        if (cells.length > 0) tableRows.push(cells);
      }
      if (tableRows.length > 0) {
        const cols = Math.max(...tableRows.map((r) => r.length));
        const pad = (r) => {
          const copy = [...r];
          while (copy.length < cols) copy.push('');
          return copy;
        };
        mdBlocks.push('');
        mdBlocks.push(`| ${pad(tableRows[0]).join(' | ')} |`);
        mdBlocks.push(`| ${Array(cols).fill('---').join(' | ')} |`);
        for (let r = 1; r < tableRows.length; r++) {
          mdBlocks.push(`| ${pad(tableRows[r]).join(' | ')} |`);
        }
        mdBlocks.push('');
      }
    } else {
      const parsed = parseParagraphXml(token);
      if (parsed.hasPageBreak && mdBlocks.length > 0) {
        mdBlocks.push('\n---PAGE_BREAK---\n');
      }
      if (!parsed.text) {
        mdBlocks.push('');
      } else if (parsed.headingLevel > 0) {
        mdBlocks.push(`${'#'.repeat(parsed.headingLevel)} ${parsed.text}`);
      } else if (parsed.isList) {
        mdBlocks.push(`- ${parsed.text}`);
      } else {
        mdBlocks.push(parsed.text);
      }
    }
  }

  for (const [id, note] of Object.entries(footnotesMap)) {
    if (note) mdBlocks.push(`[^${id}]: ${note}`);
  }

  return mdBlocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Local Zero-Quota Digital PDF Text Extractor (Tier 3 offline fallback).
 */
export async function extractDigitalPdfLocally(pdfBuffer) {
  if (!PDFParseClass) {
    return { hasDigitalText: false, markdown: '', totalPages: 0, recoveredPages: 0 };
  }
  const { sharedPipeline } = await ensureSharedModules();
  const parser = new PDFParseClass({ data: new Uint8Array(pdfBuffer) });
  try {
    const parsed = await parser.getText({ lineThreshold: 4 });
    const pageTexts =
      parsed.pages && parsed.pages.length > 0
        ? parsed.pages.map((p) => p.text || '')
        : [parsed.text || ''];
    const totalPages = parsed.total || pageTexts.length || 1;
    const nonEmptyPages = pageTexts.filter((p) => p.replace(/\s+/g, '').length > 15);
    const totalNonWs = pageTexts.join('').replace(/\s+/g, '').length;

    const hasDigitalText =
      totalNonWs > 50 && nonEmptyPages.length >= Math.max(1, Math.floor(totalPages * 0.4));

    if (!hasDigitalText) {
      return { hasDigitalText: false, markdown: '', totalPages, recoveredPages: nonEmptyPages.length };
    }

    const formattedPages = pageTexts
      .map((page) => {
        const lines = page.split('\n');
        return lines
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return '';
            if (
              /^(الوحدة|الدرس|الباب|الفصل|المبحث|المطلب|المقدمة|سلسلة|كتاب|المذكرة|Unit|Chapter|Lesson|PART|MODULE)\b/i.test(
                trimmed
              )
            ) {
              return `## ${trimmed}`;
            }
            if (
              /^(س\s*\d+|السؤال\s+(الأول|الثاني|الثالث|الرابع|الخامس)|\d+[.\-)])\s+/i.test(trimmed)
            ) {
              return `\n### ${trimmed}`;
            }
            return trimmed;
          })
          .join('\n');
      })
      .filter((p) => p.trim().length > 0);

    const joined = sharedPipeline.toStandardArabicCore(
      formattedPages.join('\n\n---PAGE_BREAK---\n\n')
    );

    return {
      hasDigitalText: true,
      markdown: joined,
      totalPages,
      recoveredPages: nonEmptyPages.length,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function unwrapModelMarkdownResponse(raw) {
  let text = (raw || '').trim();
  if (text.startsWith('```markdown')) {
    text = text.replace(/^```markdown\s*/i, '').replace(/```\s*$/, '').trim();
  } else if (text.startsWith('```') && text.endsWith('```')) {
    const inner = text.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
    try {
      const parsed = JSON.parse(inner);
      text = typeof parsed?.markdown === 'string' ? parsed.markdown : inner;
    } catch {
      text = inner;
    }
  } else if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.markdown === 'string') text = parsed.markdown;
    } catch {}
  }
  return text;
}

function getReadyGeminiModels() {
  const now = Date.now();
  const ready = OCR_MODELS_FALLBACK.filter((m) => !modelCoolDowns[m] || modelCoolDowns[m] <= now);
  if (ready.length > 0) return ready;
  return [...OCR_MODELS_FALLBACK].sort((a, b) => (modelCoolDowns[a] || 0) - (modelCoolDowns[b] || 0));
}

function recordModelCooldown(modelName, errMsg) {
  const now = Date.now();
  let retrySec;
  const match = errMsg.match(/retry in ([0-9.]+)s/i) || errMsg.match(/retryDelay"?:\s*"(\d+)s"/i);
  if (match) retrySec = Math.ceil(parseFloat(match[1]));

  if (errMsg.includes('404') || errMsg.includes('NOT_FOUND') || errMsg.includes('no longer available')) {
    modelCoolDowns[modelName] = now + 10 * 60 * 1000;
  } else if (
    errMsg.includes('GenerateRequestsPerDay') ||
    (errMsg.includes('free_tier_requests') && (errMsg.includes('500') || (retrySec && retrySec > 300)))
  ) {
    modelCoolDowns[modelName] = now + (retrySec ? (retrySec + 10) * 1000 : 12 * 3600 * 1000);
  } else if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || /rate limit/i.test(errMsg)) {
    modelCoolDowns[modelName] = now + (retrySec ? Math.min(60, retrySec + 2) : 14) * 1000;
  } else if (errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || /peak demand|high demand|overloaded/i.test(errMsg)) {
    modelCoolDowns[modelName] = now + 2 * 60 * 1000;
  }
}

async function callDirectGeminiOcr(base64Data, filename, mimeType = 'application/pdf') {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }
  if (!GoogleGenAIClass) {
    const genaiMod = await import('@google/genai');
    GoogleGenAIClass = genaiMod.GoogleGenAI;
  }

  const ai = new GoogleGenAIClass({
    apiKey: GEMINI_API_KEY,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const cleanB64 = base64Data.replace(/^data:[^;]+;base64,/, '').trim();
  const userPrompt = `Transcribe this document "${filename}" into pristine, 100% VERBATIM Markdown matching its exact source layout and language:
- ABSOLUTE ZERO OMISSIONS: Transcribe every word, column, table, and footnote without summarizing or skipping anything.
- Preserve all tables using valid Markdown pipes (| Column 1 | Column 2 |).
- Preserve all Arabic diacritics (تَشْكِيل) and render Quranic verses in authentic Uthmani script strictly inside ﴿...﴾.
- Preserve interleaved English terms cleanly with accurate spelling and punctuation.
- Include "---PAGE_BREAK---" at the end of each original page.`;

  const modelsToTry = getReadyGeminiModels();
  let lastErr = null;

  for (const model of modelsToTry) {
    const isGemini4 = model.startsWith('gemini-4-');
    const config = {
      systemInstruction: MASTER_OCR_SYSTEM_PROMPT,
      maxOutputTokens: 32768,
      ...(isGemini4 ? {} : { temperature: 0.0 }),
    };

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: cleanB64 } },
              { text: userPrompt },
            ],
          },
        ],
        config,
      });

      if (response?.text && response.text.trim()) {
        delete modelCoolDowns[model];
        return unwrapModelMarkdownResponse(response.text);
      }
    } catch (err) {
      const msg = err?.message || String(err);
      lastErr = err;
      recordModelCooldown(model, msg);
      logInfo(`Direct Gemini model ${model} fallback (${msg.slice(0, 90)})...`);
    }
  }

  throw lastErr || new Error('All local Gemini OCR models are temporarily unavailable.');
}

async function runOptionalDeepContextualVerify(markdown) {
  if (!GEMINI_API_KEY || !markdown || markdown.length > 28000) return { markdown, verified: false };
  const arabicCount = (markdown.match(/[\u0600-\u06FF]/g) || []).length;
  if (arabicCount < 20) return { markdown, verified: false };

  try {
    if (!GoogleGenAIClass) {
      const genaiMod = await import('@google/genai');
      GoogleGenAIClass = genaiMod.GoogleGenAI;
    }
    const ai = new GoogleGenAIClass({
      apiKey: GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const systemInstruction = `أنت وحدة التدقيق السياقي الذكي: صحح أي تصحيف في الآيات القرآنية وضعها بالرسم العثماني بين ﴿...﴾ واضبط الأحاديث والمصطلحات دون حذف أو تلخيص أو إزالة علامات ---PAGE_BREAK--- إطلاقاً.`;

    for (const model of getReadyGeminiModels().slice(0, 3)) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: `دقق النص التالي دون أي اختصار:\n\n${markdown}`,
          config: {
            systemInstruction,
            maxOutputTokens: 16384,
            ...(model.startsWith('gemini-4-') ? {} : { temperature: 0.0 }),
          },
        });
        const out = unwrapModelMarkdownResponse(res?.text || '');
        if (!out) continue;
        // Strict anti-truncation and page-break parity guards
        if (markdown.length > 4000 && out.length < markdown.length * 0.78) continue;
        const origBreaks = (markdown.match(/---PAGE_BREAK---/g) || []).length;
        const outBreaks = (out.match(/---PAGE_BREAK---/g) || []).length;
        if (origBreaks > 0 && outBreaks < origBreaks) continue;
        return { markdown: out, verified: true };
      } catch (e) {
        recordModelCooldown(model, e?.message || String(e));
      }
    }
  } catch {}
  return { markdown, verified: false };
}

/**
 * Checks whether the configured remote server is reachable (circuit-aware).
 */
export async function checkServerConnectivity(forceProbe = false) {
  const now = Date.now();
  if (!forceProbe && serverCircuit.isDown && now < serverCircuit.downUntil) {
    return { ok: false, reason: serverCircuit.lastError || 'Circuit breaker open (offline fallback active)' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${DEFAULT_SERVER_URL}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (res.ok) {
      serverCircuit.isDown = false;
      serverCircuit.consecutiveFailures = 0;
      serverCircuit.lastError = null;
      const body = await res.json().catch(() => ({}));
      return { ok: true, details: body };
    }
    const err = `Server health status ${res.status}`;
    serverCircuit.consecutiveFailures++;
    if (res.status >= 500) {
      serverCircuit.isDown = true;
      serverCircuit.downUntil = now + 90_000;
    }
    serverCircuit.lastError = err;
    return { ok: false, reason: err };
  } catch (err) {
    serverCircuit.isDown = true;
    serverCircuit.downUntil = now + 90_000;
    serverCircuit.consecutiveFailures++;
    serverCircuit.lastError = err?.message || 'Server unreachable';
    return { ok: false, reason: serverCircuit.lastError };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resilient multi-tier chunk converter with offline server circuit-breaking and local fallbacks.
 */
async function convertChunkResilient(base64Data, rawBytes, filename, mimeType = 'application/pdf', extractionMode = 'auto') {
  // Explicit digital-only mode for PDFs
  if (extractionMode === 'digital_only' && mimeType === 'application/pdf' && rawBytes) {
    const digital = await extractDigitalPdfLocally(rawBytes);
    if (digital.hasDigitalText) {
      return { markdown: digital.markdown, method: 'local_digital_pdf' };
    }
    throw new Error(`الملف ${filename} لا يحتوي على طبقة نصوص رقمية للاستخراج المباشر (Scanned PDF).`);
  }

  let lastError = null;
  const maxAttempts = extractionMode === 'local_ocr' ? 2 : 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Tier 1: Primary remote converter server (skip if circuit is open or user requested local_ocr)
    const serverAllowed =
      extractionMode !== 'local_ocr' &&
      !(serverCircuit.isDown && Date.now() < serverCircuit.downUntil);

    if (serverAllowed) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), 180000);
      try {
        const teamHeaders = await getTeamAuthHeaders();
        const res = await fetch(`${DEFAULT_SERVER_URL}/api/convert-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...teamHeaders },
          signal: controller.signal,
          body: JSON.stringify({
            pdfBase64: base64Data,
            filename,
            options: { direction: 'rtl', preserveHandwriting: true },
          }),
        }).finally(() => clearTimeout(timeoutHandle));

        if (res.ok) {
          const data = await res.json();
          if (data?.success && data?.data?.markdown) {
            serverCircuit.isDown = false;
            serverCircuit.consecutiveFailures = 0;
            return { markdown: data.data.markdown, method: 'remote_server' };
          }
        } else {
          const errText = await res.text().catch(() => '');
          lastError = new Error(`Server returned ${res.status}: ${errText.slice(0, 120)}`);
          if (res.status >= 500 || res.status === 404) {
            serverCircuit.consecutiveFailures++;
            serverCircuit.isDown = true;
            serverCircuit.downUntil = Date.now() + 90_000;
            serverCircuit.lastError = lastError.message;
            logInfo(`Remote server unavailable (${res.status}). Switching to offline local OCR/extraction!`);
          }
        }
      } catch (netErr) {
        lastError = netErr;
        serverCircuit.consecutiveFailures++;
        serverCircuit.isDown = true;
        serverCircuit.downUntil = Date.now() + 90_000;
        serverCircuit.lastError = netErr?.message || String(netErr);
        logInfo(`Remote server unreachable (${serverCircuit.lastError}). Activating offline fallback mode!`);
      }
    }

    // Tier 2: Local direct Gemini Vision OCR with full verbatim system instruction
    if (GEMINI_API_KEY) {
      try {
        const md = await callDirectGeminiOcr(base64Data, filename, mimeType);
        if (md) return { markdown: md, method: 'local_gemini_ocr' };
      } catch (geminiErr) {
        lastError = geminiErr;
      }
    }

    // Tier 3: Zero-quota local digital PDF extraction when server + Gemini fail or key absent
    if (mimeType === 'application/pdf' && rawBytes) {
      try {
        const digital = await extractDigitalPdfLocally(rawBytes);
        if (digital.hasDigitalText) {
          logInfo(`Extracted digital text layer locally for ${filename} (${digital.recoveredPages} pages, 0 quota).`);
          return { markdown: digital.markdown, method: 'local_digital_pdf' };
        }
      } catch (digErr) {
        lastError = digErr;
      }
    }

    if (attempt < maxAttempts) {
      const waitSec = Math.min(18, attempt * 4);
      logInfo(`Retry wait (${waitSec}s) for ${filename} [${attempt}/${maxAttempts}]...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
  }

  throw (
    lastError ||
    new Error(
      `تعذرت معالجة ${filename}: السيرفر غير متاح ومفتاح GEMINI_API_KEY غير متوفر محلياً والملف لا يحتوي نصاً رقمياً.`
    )
  );
}

/**
 * Scans a folder for PDF, DOCX, Markdown, Text, and Image files.
 */
export async function handleScanDirectory(dirPath, recursive = true) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory does not exist: ${dirPath}`);
  }

  const results = [];
  const supportedExts = ['.pdf', '.docx', '.md', '.markdown', '.txt', '.png', '.jpg', '.jpeg', '.webp'];

  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (recursive && !ent.name.startsWith('.') && ent.name !== 'node_modules') {
          scan(full);
        }
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (supportedExts.includes(ext)) {
          const stats = fs.statSync(full);
          results.push({
            name: ent.name,
            path: full,
            sizeBytes: stats.size,
            sizeMB: parseFloat((stats.size / (1024 * 1024)).toFixed(2)),
            ext,
          });
        }
      }
    }
  }

  scan(dirPath);
  const totalBytes = results.reduce((acc, r) => acc + r.sizeBytes, 0);

  return {
    directory: dirPath,
    totalFiles: results.length,
    totalSizeBytes: totalBytes,
    totalSizeGB: (totalBytes / (1024 * 1024 * 1024)).toFixed(2),
    files: results,
  };
}

/**
 * Runs complete shared refinement + strict QA gates + optional contextual check + calibrated DOCX generation.
 */
async function refineAndExportDocument({
  title,
  rawMarkdown,
  outputDir,
  baseName,
  typoOptions,
  deepVerify = false,
  writeMarkdown = true,
  customDocxOutPath = null,
}) {
  const { sharedPipeline, sharedTypography } = await ensureSharedModules();

  let workingMarkdown = rawMarkdown || '';
  let deepVerified = false;
  if (deepVerify) {
    const check = await runOptionalDeepContextualVerify(workingMarkdown);
    workingMarkdown = check.markdown;
    deepVerified = check.verified;
  }

  const refined = sharedPipeline.runFullRefinementPipeline(workingMarkdown);
  const effectiveDirection =
    typoOptions.direction === 'rtl'
      ? true
      : typoOptions.direction === 'ltr'
      ? false
      : refined.isRtl;

  let mdOutPath = null;
  if (writeMarkdown && outputDir) {
    mdOutPath = path.join(outputDir, `${baseName}.md`);
    fs.writeFileSync(mdOutPath, refined.markdown, 'utf-8');
  }

  const docxUint8 = await sharedTypography.buildDocxBinary(
    {
      title: title || baseName,
      markdown: refined.markdown,
      isRtl: effectiveDirection,
      direction: typoOptions.direction || 'auto',
      author: 'PDF to Word MCP Converter v2.0',
      typography: typoOptions,
    },
    { docx: docxLib, JSZip }
  );

  const docxOutPath = customDocxOutPath || path.join(outputDir, `${baseName}.docx`);
  const docxDir = path.dirname(docxOutPath);
  if (!fs.existsSync(docxDir)) fs.mkdirSync(docxDir, { recursive: true });
  fs.writeFileSync(docxOutPath, Buffer.from(docxUint8));

  return {
    docxPath: docxOutPath,
    markdownPath: mdOutPath,
    refined,
    deepVerified,
    isRtl: effectiveDirection,
  };
}

/**
 * Converts a single book/file (.pdf, image, .docx, .md, .txt) into publication-grade .docx and .md.
 */
export async function handleConvertBook(filePath, customOutputDir, options = {}) {
  await ensureDependencies();
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const outputDir = customOutputDir || path.dirname(filePath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const typoOptions = extractTypographyOptions(options);
  const extractionMode = options.extraction_mode || 'auto';
  const deepVerify = Boolean(options.deep_verify);

  logInfo(`Processing: ${fileName} (mode=${extractionMode}, profile=${typoOptions.fontProfile})`);

  let rawMarkdown = '';
  let totalPages = 1;
  let extractionMethod = 'local';

  if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    rawMarkdown = fs.readFileSync(filePath, 'utf-8');
    extractionMethod = 'local_text_retypeset';
    totalPages = Math.max(1, (rawMarkdown.match(/---PAGE_BREAK---/g) || []).length + 1);
  } else if (ext === '.docx') {
    const buf = fs.readFileSync(filePath);
    rawMarkdown = await extractMarkdownFromDocxBuffer(buf);
    extractionMethod = 'local_docx_upgrade';
    totalPages = Math.max(1, (rawMarkdown.match(/---PAGE_BREAK---/g) || []).length + 1);
  } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    const imgBytes = fs.readFileSync(filePath);
    const mime =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const b64 = `data:${mime};base64,${imgBytes.toString('base64')}`;
    const res = await convertChunkResilient(b64, null, fileName, mime, extractionMode);
    rawMarkdown = res.markdown;
    extractionMethod = res.method;
  } else if (ext === '.pdf') {
    let fileBytes = fs.readFileSync(filePath);
    if (!fileBytes || fileBytes.length === 0) {
      throw new Error(`File is empty (0 bytes): ${fileName}`);
    }

    let srcDoc = null;
    try {
      srcDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
    } catch (pdfErr) {
      throw new Error(`Could not parse PDF: ${pdfErr.message}`);
    }

    totalPages = srcDoc.getPageCount();
    const serverOffline = serverCircuit.isDown && Date.now() < serverCircuit.downUntil;

    // Fast whole-file digital extraction check if offline without API key or in digital_only mode
    if (extractionMode === 'digital_only' || ((serverOffline || extractionMode !== 'local_ocr') && !GEMINI_API_KEY && serverOffline)) {
      const digital = await extractDigitalPdfLocally(fileBytes);
      if (digital.hasDigitalText) {
        rawMarkdown = digital.markdown;
        extractionMethod = 'local_digital_pdf';
      }
    }

    if (!rawMarkdown) {
      const avgBytesPerPage = totalPages > 0 ? fileBytes.length / totalPages : 0;
      const chunkSize =
        avgBytesPerPage > 1024 * 1024
          ? 2
          : avgBytesPerPage > 500 * 1024
          ? 3
          : totalPages > 50
          ? 6
          : totalPages > 15
          ? 4
          : 2;

      const markdownChunks = [];
      const methodsUsed = new Set();

      for (let p = 0; p < totalPages; p += chunkSize) {
        const endP = Math.min(p + chunkSize, totalPages);
        const chunkDoc = await PDFDocument.create();
        const indices = [];
        for (let idx = p; idx < endP; idx++) indices.push(idx);
        const copied = await chunkDoc.copyPages(srcDoc, indices);
        for (const page of copied) chunkDoc.addPage(page);

        const chunkUint8 = await chunkDoc.save();
        const base64 = `data:application/pdf;base64,${Buffer.from(chunkUint8).toString('base64')}`;

        logInfo(`  -> Converting pages ${p + 1}-${endP} of ${totalPages}...`);
        const chunkRes = await convertChunkResilient(
          base64,
          Buffer.from(chunkUint8),
          `${fileName} (pages ${p + 1}-${endP})`,
          'application/pdf',
          extractionMode
        );
        markdownChunks.push(chunkRes.markdown);
        methodsUsed.add(chunkRes.method);

        if (p + chunkSize < totalPages) {
          await new Promise((r) => setTimeout(r, chunkRes.method === 'local_digital_pdf' ? 50 : 3200));
        }
      }

      rawMarkdown = markdownChunks
        .map((c) => (c || '').trim())
        .filter(Boolean)
        .join('\n\n---PAGE_BREAK---\n\n');
      extractionMethod = Array.from(methodsUsed).join('+');
    }

    fileBytes = null;
    srcDoc = null;
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }

  const exported = await refineAndExportDocument({
    title: baseName,
    rawMarkdown,
    outputDir,
    baseName,
    typoOptions,
    deepVerify,
  });

  return {
    bookName: fileName,
    totalPages,
    docxPath: exported.docxPath,
    markdownPath: exported.markdownPath,
    extractionMethod,
    detectedLanguage: exported.refined.detectedLanguage,
    direction: exported.isRtl ? 'rtl' : 'ltr',
    fontProfile: typoOptions.fontProfile,
    qaScore: exported.refined.qaReport.qualityScore,
    autoFixedCount: exported.refined.autoFixedCount,
    deepVerified: exported.deepVerified,
    verdictArabic: exported.refined.qaReport.verdictArabic,
    status: 'completed',
  };
}

/**
 * Offline QA audit & repair for existing .md, .txt, or .docx files.
 */
export async function handleAuditAndRepair(filePath, customOutputDir, options = {}) {
  await ensureDependencies();
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }
  const outputDir = customOutputDir || path.dirname(filePath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const baseName = `${fileName.replace(/\.[^/.]+$/, '')}_audited`;
  const typoOptions = extractTypographyOptions(options);

  let rawMarkdown = '';
  if (ext === '.docx') {
    rawMarkdown = await extractMarkdownFromDocxBuffer(fs.readFileSync(filePath));
  } else if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    rawMarkdown = fs.readFileSync(filePath, 'utf-8');
  } else {
    throw new Error(`audit_and_repair_document supports .md, .txt, and .docx (received ${ext})`);
  }

  const exported = await refineAndExportDocument({
    title: fileName.replace(/\.[^/.]+$/, ''),
    rawMarkdown,
    outputDir,
    baseName,
    typoOptions,
  });

  return {
    sourceFile: filePath,
    repairedDocxPath: exported.docxPath,
    repairedMarkdownPath: exported.markdownPath,
    qualityScore: exported.refined.qaReport.qualityScore,
    overallPassed: exported.refined.qaReport.overallPassed,
    autoFixedCount: exported.refined.autoFixedCount,
    metrics: exported.refined.qaReport.metrics,
    verdictArabic: exported.refined.qaReport.verdictArabic,
  };
}

/**
 * Direct offline Markdown -> calibrated Word (.docx) exporter.
 */
export async function handleExportMarkdownToDocx(args = {}) {
  await ensureDependencies();
  let markdown = args.markdown || '';
  if (!markdown && args.input_file) {
    if (!fs.existsSync(args.input_file)) {
      throw new Error(`Input file not found: ${args.input_file}`);
    }
    markdown = fs.readFileSync(args.input_file, 'utf-8');
  }
  if (!markdown) {
    throw new Error('Either "markdown" string or valid "input_file" path is required.');
  }

  const outputPath = path.resolve(args.output_path);
  const baseName = path.basename(outputPath, path.extname(outputPath));
  const typoOptions = extractTypographyOptions(args);

  const exported = await refineAndExportDocument({
    title: args.title || baseName,
    rawMarkdown: markdown,
    outputDir: path.dirname(outputPath),
    baseName,
    typoOptions,
    writeMarkdown: false,
    customDocxOutPath: outputPath,
  });

  return {
    docxPath: exported.docxPath,
    fontProfile: typoOptions.fontProfile,
    direction: exported.isRtl ? 'rtl' : 'ltr',
    detectedLanguage: exported.refined.detectedLanguage,
    qaScore: exported.refined.qaReport.qualityScore,
    autoFixedCount: exported.refined.autoFixedCount,
    status: 'completed',
  };
}

/**
 * Diagnostics tool reporting server reachability, local Gemini key, pdf-parse readiness, and typography profiles.
 */
export async function handleCheckPipelineHealth(probeServer = true) {
  await ensureDependencies();
  const { sharedTypography } = await ensureSharedModules();
  const serverStatus = await checkServerConnectivity(probeServer);

  return {
    mcpServer: SERVER_NAME,
    version: SERVER_VERSION,
    serverUrl: DEFAULT_SERVER_URL,
    remoteServerReachable: serverStatus.ok,
    remoteServerStatus: serverStatus.ok ? 'online' : `offline_fallback_active (${serverStatus.reason})`,
    offlineCapabilities: {
      directGeminiOcrReady: Boolean(GEMINI_API_KEY && GoogleGenAIClass),
      localDigitalPdfExtractorReady: Boolean(PDFParseClass),
      localDocxUpgradeAndAuditReady: Boolean(docxLib && JSZip),
      sharedQaPipelineLoaded: Boolean(sharedPipeline),
    },
    availableTypographyProfiles: Object.values(sharedTypography.TYPOGRAPHY_PROFILES).map((p) => ({
      id: p.id,
      arabicFont: p.arabicFont,
      arabicBodyPt: p.arabicBodyPt,
      englishFont: p.englishFont,
      englishBodyPt: p.englishBodyPt,
      labelArabic: p.labelArabic,
    })),
  };
}

/**
 * Batch folder conversion with scheduled ZIP bundles and resume state.
 */
export async function handleBatchConvert(inputDir, customOutputDir, bundleSize = 15, options = {}) {
  await ensureDependencies();
  const scan = await handleScanDirectory(inputDir, true);
  const supported = scan.files.filter((f) =>
    ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp'].includes(f.ext)
  );

  const outputDir = customOutputDir || path.join(inputDir, 'converted_output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const resumeFilePath = path.join(outputDir, 'batch_resume.json');
  let resumeState = { completed: [], failed: [], bundleIndex: 1 };
  if (fs.existsSync(resumeFilePath)) {
    try {
      resumeState = JSON.parse(fs.readFileSync(resumeFilePath, 'utf-8'));
      if (!Array.isArray(resumeState.completed)) resumeState.completed = [];
      if (!Array.isArray(resumeState.failed)) resumeState.failed = [];
      if (!resumeState.bundleIndex) resumeState.bundleIndex = 1;
    } catch {
      resumeState = { completed: [], failed: [], bundleIndex: 1 };
    }
  }

  const completedSet = new Set(resumeState.completed);
  const remaining = supported.filter((f) => !completedSet.has(f.path));

  logInfo(
    `Total books: ${supported.length}, Already converted: ${completedSet.size}, Remaining: ${remaining.length}`
  );

  let currentBatchFiles = [];
  let totalProcessed = completedSet.size;

  for (let i = 0; i < remaining.length; i++) {
    const file = remaining[i];
    logInfo(`[${i + 1}/${remaining.length}] Converting: ${file.name}`);

    try {
      const res = await handleConvertBook(file.path, outputDir, options);
      completedSet.add(file.path);
      resumeState.completed = Array.from(completedSet);
      fs.writeFileSync(resumeFilePath, JSON.stringify(resumeState, null, 2));

      currentBatchFiles.push(res);
      totalProcessed++;

      if (currentBatchFiles.length >= bundleSize || i === remaining.length - 1) {
        const batchNum = resumeState.bundleIndex++;
        const zip = new JSZip();
        const zipName = `حزمة_الكتب_المضغوطة_${batchNum}_عدد_${currentBatchFiles.length}_كتاب.zip`;
        const zipPath = path.join(outputDir, zipName);

        const summaryLines = [
          '====================================================',
          `حزمة الكتب المحولة المجدولة رقم: ${batchNum}`,
          `تاريخ الإنشاء: ${new Date().toLocaleString('ar-EG')}`,
          `عدد الكتب في هذه الحزمة: ${currentBatchFiles.length}`,
          `نسق الخطوط: ${options.font_profile || 'bilingual_publication'}`,
          '====================================================\n',
        ];

        for (const item of currentBatchFiles) {
          if (fs.existsSync(item.docxPath)) {
            zip.file(path.basename(item.docxPath), fs.readFileSync(item.docxPath));
          }
          if (item.markdownPath && fs.existsSync(item.markdownPath)) {
            zip.file(`نصوص_markdown/${path.basename(item.markdownPath)}`, fs.readFileSync(item.markdownPath));
          }
          summaryLines.push(
            `• ${item.bookName} (${item.totalPages} صفحة | جودة QA: ${item.qaScore}% | المحرك: ${item.extractionMethod})`
          );
        }

        zip.file('فهرس_الحزمة_والإحصائيات.txt', summaryLines.join('\n'));
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
        fs.writeFileSync(zipPath, zipBuffer);
        logInfo(`-> Created scheduled bundle ZIP: ${zipName}`);

        currentBatchFiles = [];
        fs.writeFileSync(resumeFilePath, JSON.stringify(resumeState, null, 2));
      }
    } catch (err) {
      logInfo(`Error converting ${file.name}: ${err.message}`);
      resumeState.failed.push({
        file: file.path,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
      fs.writeFileSync(resumeFilePath, JSON.stringify(resumeState, null, 2));
    }
  }

  return {
    totalBooks: supported.length,
    completedBooks: totalProcessed,
    failedBooks: resumeState.failed.length,
    outputDirectory: outputDir,
    serverFallbackMode: serverCircuit.isDown ? 'offline_pipeline_active' : 'remote_server_connected',
    message: `Batch conversion finished successfully. All documents packaged in ${outputDir}.`,
  };
}

/**
 * Handle incoming JSON-RPC line.
 */
export async function processLine(line) {
  if (!line || !line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    sendResponse(null, null, { code: -32700, message: 'Parse error' });
    return;
  }

  const { id, method, params } = msg;

  if (method === 'initialize') {
    sendResponse(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }

  if (method === 'notifications/initialized') return;

  if (method === 'ping') {
    sendResponse(id, {});
    return;
  }

  if (method === 'tools/list') {
    sendResponse(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {};
    try {
      if (
        [
          'convert_book_to_word',
          'batch_convert_folder',
          'audit_and_repair_document',
          'export_markdown_to_docx',
          'check_pipeline_health',
        ].includes(name)
      ) {
        const ok = await ensureDependencies();
        if (!ok) {
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    error:
                      'Required packages (pdf-lib, docx, jszip, pdf-parse, @google/genai) are not installed.',
                    code: 'DEPENDENCY_MISSING',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          });
          return;
        }
      }

      let resultData;
      if (name === 'scan_books_directory') {
        resultData = await handleScanDirectory(args.directory_path, args.recursive);
      } else if (name === 'convert_book_to_word') {
        resultData = await handleConvertBook(args.file_path, args.output_dir, args);
      } else if (name === 'batch_convert_folder') {
        resultData = await handleBatchConvert(
          args.input_dir,
          args.output_dir,
          args.bundle_size || 15,
          args
        );
      } else if (name === 'get_batch_status') {
        const resumePath = path.join(args.output_dir, 'batch_resume.json');
        resultData = fs.existsSync(resumePath)
          ? JSON.parse(fs.readFileSync(resumePath, 'utf-8'))
          : { status: 'no_batch_in_progress', message: 'No active batch state found in output directory' };
      } else if (name === 'audit_and_repair_document') {
        resultData = await handleAuditAndRepair(args.file_path, args.output_dir, args);
      } else if (name === 'export_markdown_to_docx') {
        resultData = await handleExportMarkdownToDocx(args);
      } else if (name === 'check_pipeline_health') {
        resultData = await handleCheckPipelineHealth(args.probe_server !== false);
      } else {
        sendResponse(id, null, { code: -32601, message: `Tool not found: ${name}` });
        return;
      }

      sendResponse(id, {
        content: [{ type: 'text', text: JSON.stringify(resultData, null, 2) }],
      });
    } catch (toolErr) {
      sendResponse(id, {
        content: [{ type: 'text', text: `Error executing ${name}: ${toolErr.message}` }],
        isError: true,
      });
    }
    return;
  }

  if (id !== undefined) {
    sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
  }
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: null,
    terminal: false,
  });

  rl.on('line', (line) => {
    processLine(line).catch((err) => {
      logInfo('Unexpected handler error:', err);
    });
  });

  logInfo(`${SERVER_NAME} v${SERVER_VERSION} started (Resilient Offline-Capable Pipeline Ready).`);
  ensureDependencies().catch(() => {});
}
