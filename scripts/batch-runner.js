#!/usr/bin/env node
/**
 * Standalone Local CLI Batch Runner v2.0 for Massive Book Collections (150+ books, 10+ GB).
 *
 * Upgraded Publication-Grade Pipeline:
 * - Uses unified /shared/typographyDocxCore.js + /shared/arabicPipelineCore.js for 100% parity with the web app.
 * - Calibrated dual-script Word (.docx) fonts (default: Amiri 14pt + Plus Jakarta Sans 14pt, 1.5 line spacing) with strict
 *   bilingual Arabic-English bidi isolation ("الكلام المتداخل").
 * - 4-Tier Resilient Offline-First Extraction Waterfall (works even if the converter server is down):
 *     1. Remote Converter Server (/api/convert-pdf) with automatic circuit breaker
 *     2. Direct Multi-Model Gemini Vision OCR (when GEMINI_API_KEY env or --api-key is set)
 *     3. Local Zero-Quota Digital PDF Extraction (pdf-parse)
 *     4. Native Offline DOCX XML / Markdown / Text QA Repair & Re-Typesetting
 * - Scheduled ZIP bundling every N books and automatic resumption via batch_resume.json.
 *
 * Usage:
 *   node batch-runner.js --input="D:/books" --output="D:/output" --bundle-size=15 --font-profile=bilingual_publication
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveSharedModulePath(filename) {
  const localBundled = path.join(SCRIPT_DIR, 'shared', filename);
  if (fs.existsSync(localBundled)) {
    return pathToFileURL(localBundled).href;
  }
  const repoShared = path.join(SCRIPT_DIR, '..', 'shared', filename);
  if (fs.existsSync(repoShared)) {
    return pathToFileURL(repoShared).href;
  }
  throw new Error(`Shared module missing: ${filename}. Re-download the full CLI/MCP ZIP bundle.`);
}

let sharedPipeline = null;
let sharedTypography = null;
let PDFDocument;
let docxLib;
let JSZip;
let PDFParseClass = null;
let GoogleGenAIClass = null;

async function ensureDependencies() {
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

      const [pipelineMod, typoMod] = await Promise.all([
        import(resolveSharedModulePath('arabicPipelineCore.js')),
        import(resolveSharedModulePath('typographyDocxCore.js')),
      ]);
      sharedPipeline = pipelineMod;
      sharedTypography = typoMod;
      return true;
    } catch {
      return false;
    }
  };

  if (await tryLoad()) return;

  process.stdout.write('\n📦 الحزم البرمجية غير مثبتة محلياً، جاري التثبيت التلقائي الآن... ');
  try {
    const { execSync } = await import('node:child_process');
    execSync('npm install --no-audit --no-fund', { cwd: SCRIPT_DIR, stdio: 'ignore' });
    if (await tryLoad()) {
      console.log('✅ تم التثبيت بنجاح!\n');
      return;
    }
  } catch {}

  console.error('\n' + '='.repeat(68));
  console.error('❌ تنبيه: الحزم البرمجية المطلوبة (pdf-lib, docx, jszip, pdf-parse, @google/genai) غير مثبتة!');
  console.error('--------------------------------------------------------------------');
  console.error('👉 لتثبيت الحزم فوراً:');
  console.error('   • Linux / macOS:  chmod +x install.sh && ./install.sh');
  console.error('   • Windows:        install.bat');
  console.error('   • يدوياً:          npm install');
  console.error('='.repeat(68) + '\n');
  process.exit(1);
}

// Parse arguments
const args = process.argv.slice(2);
function getArg(flag, shortFlag, defaultValue = '') {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
    if (a === flag || (shortFlag && a === shortFlag)) {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        return args[i + 1];
      }
      return 'true';
    }
  }
  return defaultValue;
}

const inputDir = getArg('--input', '-i');
const outputDir = getArg('--output', '-o', './converted_output');
const bundleSize = parseInt(getArg('--bundle-size', '-b', '15'), 10) || 15;
const serverUrl = getArg(
  '--server',
  '-s',
  process.env.CONVERTER_SERVER_URL || 'https://ais-dev-wpsct27fdufcpry5x6ikjn-685461883733.europe-west2.run.app'
).replace(/\/+$/, '');
const apiKey = getArg('--api-key', '-k', process.env.GEMINI_API_KEY || '');
const fontProfile = getArg('--font-profile', '-f', 'bilingual_publication');
const customArabicFont = getArg('--arabic-font', '', '');
const customEnglishFont = getArg('--english-font', '', '');
const customArabicSize = parseFloat(getArg('--arabic-size', '', '0')) || undefined;
const customEnglishSize = parseFloat(getArg('--english-size', '', '0')) || undefined;
const directionPref = getArg('--direction', '-d', 'auto');
const extractionMode = getArg('--mode', '-m', 'auto'); // auto | server | offline

const OCR_MODELS_FALLBACK = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

const MASTER_OCR_SYSTEM_PROMPT = `You are a master document transcription, OCR, and typesetting specialist for all languages and fields (Arabic, Islamic/Azhari heritage, English, STEM, and bilingual texts).
Transcribe every single word, table, footnote, Quranic verse (in authentic Uthmani script strictly inside ﴿...﴾ with full harakat), and diacritic VERBATIM with ZERO omissions.
- Multi-column pages: transcribe right column first for RTL, then left column, in full.
- Use standard Markdown pipe tables (| Col 1 | Col 2 |); NEVER use Arabic 'ا' as column separator.
- Strip scanner watermarks (CamScanner/Adobe Scan) and stray margin artifacts ("شمخ").
- Separate Arabic and embedded English terms cleanly with natural spaces.
- Put an isolated "---PAGE_BREAK---" line at the end of every original PDF page.
OUTPUT DIRECTLY AS PRISTINE MARKDOWN ONLY.`;

const serverCircuit = {
  isDown: false,
  downUntil: 0,
};
const modelCoolDowns = {};

function printBanner() {
  console.log('\n=======================================================================');
  console.log('   مُشغّل التيرمينال المتطور لتحويل الكتب (CLI Batch Runner v2.0)');
  console.log('   جودة مطبعية مزدوجة الخطوط + عمل كامل دون إنترنت أو عند تعطل السيرفر');
  console.log('=======================================================================\n');
}

if (!inputDir) {
  printBanner();
  console.error('❌ خطأ: يرجى تحديد مجلد الكتب عبر المعامل --input');
  console.log('مثال للاستخدام:');
  console.log('  node batch-runner.js --input="./my_books" --output="./converted" --bundle-size=15 --font-profile=bilingual_publication\n');
  process.exit(1);
}

if (!fs.existsSync(inputDir)) {
  console.error(`❌ خطأ: المجلد المحدد غير موجود: ${inputDir}`);
  process.exit(1);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const SUPPORTED_EXTS = new Set(['.pdf', '.docx', '.md', '.markdown', '.txt', '.png', '.jpg', '.jpeg', '.webp']);

function findSupportedFiles(dir) {
  const list = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory() && !ent.name.startsWith('.') && ent.name !== 'converted_output') {
      list.push(...findSupportedFiles(full));
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (SUPPORTED_EXTS.has(ext)) {
        const stats = fs.statSync(full);
        list.push({
          name: ent.name,
          ext,
          path: full,
          sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
          sizeBytes: stats.size,
        });
      }
    }
  }
  return list;
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
  }
  return text;
}

function getReadyModels() {
  const now = Date.now();
  const ready = OCR_MODELS_FALLBACK.filter((m) => !modelCoolDowns[m] || modelCoolDowns[m] <= now);
  return ready.length > 0
    ? ready
    : [...OCR_MODELS_FALLBACK].sort((a, b) => (modelCoolDowns[a] || 0) - (modelCoolDowns[b] || 0));
}

function recordModelCooldown(model, errMsg) {
  const now = Date.now();
  const m = errMsg.match(/retry in ([0-9.]+)s/i);
  const retrySec = m ? Math.ceil(parseFloat(m[1])) : undefined;
  if (errMsg.includes('404') || errMsg.includes('NOT_FOUND')) {
    modelCoolDowns[model] = now + 10 * 60 * 1000;
  } else if (errMsg.includes('GenerateRequestsPerDay')) {
    modelCoolDowns[model] = now + 12 * 3600 * 1000;
  } else if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
    modelCoolDowns[model] = now + (retrySec ? Math.min(60, retrySec + 2) : 14) * 1000;
  } else {
    modelCoolDowns[model] = now + 90 * 1000;
  }
}

async function extractDigitalPdfLocally(pdfBuffer) {
  if (!PDFParseClass) return { hasDigitalText: false, markdown: '', totalPages: 0 };
  const parser = new PDFParseClass({ data: new Uint8Array(pdfBuffer) });
  try {
    const parsed = await parser.getText({ lineThreshold: 4 });
    const pageTexts =
      parsed.pages && parsed.pages.length > 0 ? parsed.pages.map((p) => p.text || '') : [parsed.text || ''];
    const totalPages = parsed.total || pageTexts.length || 1;
    const nonEmptyPages = pageTexts.filter((p) => p.replace(/\s+/g, '').length > 15);
    const totalNonWs = pageTexts.join('').replace(/\s+/g, '').length;
    if (totalNonWs <= 50 || nonEmptyPages.length < Math.max(1, Math.floor(totalPages * 0.4))) {
      return { hasDigitalText: false, markdown: '', totalPages };
    }

    const formatted = pageTexts
      .map((page) =>
        page
          .split('\n')
          .map((line) => {
            const t = line.trim();
            if (!t) return '';
            if (/^(الوحدة|الدرس|الباب|الفصل|المبحث|المطلب|المقدمة|Unit|Chapter|Lesson|PART)\b/i.test(t)) {
              return `## ${t}`;
            }
            if (/^(س\s*\d+|السؤال\s+(الأول|الثاني|الثالث|الرابع|الخامس)|\d+[.\-)])\s+/i.test(t)) {
              return `\n### ${t}`;
            }
            return t;
          })
          .join('\n')
      )
      .filter((p) => p.trim().length > 0);

    return {
      hasDigitalText: true,
      markdown: sharedPipeline.toStandardArabicCore(formatted.join('\n\n---PAGE_BREAK---\n\n')),
      totalPages,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extractDocxLocally(docxBuffer) {
  const zip = await JSZip.loadAsync(docxBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('word/document.xml missing inside DOCX.');
  const docXml = await docFile.async('string');

  const decodeXml = (s) =>
    s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

  const paras = docXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  const blocks = [];
  for (const p of paras) {
    const hasBreak = /<w:br\b[^>]*w:type=["']page["']|<w:lastRenderedPageBreak\b/.test(p);
    if (hasBreak && blocks.length > 0) blocks.push('\n---PAGE_BREAK---\n');
    const styleMatch = p.match(/<w:pStyle\b[^>]*w:val=["']([^"']+)["']/i);
    const styleVal = styleMatch ? styleMatch[1] : '';
    let level = 0;
    const hMatch = styleVal.match(/Heading\s*([1-4])/i);
    if (hMatch) level = parseInt(hMatch[1], 10);

    const texts = [];
    const tRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let m;
    while ((m = tRegex.exec(p)) !== null) {
      texts.push(decodeXml(m[1]));
    }
    const line = texts.join('').trim();
    if (!line) continue;
    blocks.push(level > 0 ? `${'#'.repeat(level)} ${line}` : line);
  }
  return blocks.join('\n\n');
}

async function convertChunkResilient(base64Data, rawBytes, filename, mimeType = 'application/pdf') {
  const now = Date.now();
  const tryRemote = extractionMode !== 'offline' && !(serverCircuit.isDown && now < serverCircuit.downUntil);

  if (tryRemote) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), 150000);
      try {
        const res = await fetch(`${serverUrl}/api/convert-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            pdfBase64: base64Data,
            filename,
            options: { direction: directionPref, preserveHandwriting: true },
          }),
        }).finally(() => clearTimeout(timeoutHandle));

        if (res.ok) {
          const data = await res.json();
          if (data?.success && data?.data?.markdown) {
            serverCircuit.isDown = false;
            return { markdown: data.data.markdown, method: 'remote_server' };
          }
        } else if (res.status === 429) {
          const errText = await res.text().catch(() => '');
          let waitSec = 14;
          try {
            waitSec = Math.max(10, JSON.parse(errText)?.retryAfterSeconds || 14);
          } catch {}
          process.stdout.write(`\n      ⏳ Rate limit 429 — انتظار (${waitSec}ث)... `);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        } else if (res.status >= 500) {
          serverCircuit.isDown = true;
          serverCircuit.downUntil = Date.now() + 90_000;
          break;
        }
      } catch {
        serverCircuit.isDown = true;
        serverCircuit.downUntil = Date.now() + 90_000;
        break;
      }
    }
  }

  // Tier 2: Direct Gemini Vision OCR
  if (apiKey) {
    try {
      if (!GoogleGenAIClass) {
        const genaiMod = await import('@google/genai');
        GoogleGenAIClass = genaiMod.GoogleGenAI;
      }
      const ai = new GoogleGenAIClass({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const cleanB64 = base64Data.replace(/^data:[^;]+;base64,/, '');
      for (const model of getReadyModels()) {
        try {
          const isGemini4 = model.startsWith('gemini-4-');
          const res = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  { inlineData: { mimeType, data: cleanB64 } },
                  { text: `Transcribe "${filename}" verbatim into pristine Markdown with tables, harakat, and ---PAGE_BREAK--- markers.` },
                ],
              },
            ],
            config: {
              systemInstruction: MASTER_OCR_SYSTEM_PROMPT,
              maxOutputTokens: 32768,
              ...(isGemini4 ? {} : { temperature: 0.0 }),
            },
          });
          if (res?.text?.trim()) {
            return { markdown: unwrapModelMarkdownResponse(res.text), method: `direct_gemini:${model}` };
          }
        } catch (gemErr) {
          recordModelCooldown(model, gemErr?.message || String(gemErr));
        }
      }
    } catch {}
  }

  // Tier 3: Local Zero-Quota Digital PDF Extraction
  if (mimeType === 'application/pdf' && rawBytes) {
    const digital = await extractDigitalPdfLocally(rawBytes);
    if (digital.hasDigitalText && digital.markdown.trim().length > 20) {
      return { markdown: digital.markdown, method: 'offline_digital_pdf_parse' };
    }
  }

  throw new Error(
    `تعذر التحويل للحزمة "${filename}": السيرفر غير متاح، ومفتاح GEMINI_API_KEY غير متوفر لمعالجة الصفحات المصورة (Scanned OCR).`
  );
}

async function run() {
  printBanner();
  await ensureDependencies();

  const typoConfig = sharedTypography.resolveTypographyConfig({
    fontProfile,
    ...(customArabicFont ? { arabicFont: customArabicFont } : {}),
    ...(customEnglishFont ? { englishFont: customEnglishFont } : {}),
    ...(customArabicSize ? { arabicSizePt: customArabicSize } : {}),
    ...(customEnglishSize ? { englishSizePt: customEnglishSize } : {}),
  });

  console.log(`📁 مجلد المصدر:   ${inputDir}`);
  console.log(`💾 مجلد المخرجات: ${outputDir}`);
  console.log(`✒️  نسق الخطوط:    ${typoConfig.profile.labelArabic} (${typoConfig.arabicFont} ${typoConfig.arabicBodyPt}pt / ${typoConfig.englishFont} ${typoConfig.englishBodyPt}pt)`);
  console.log(`📦 حجم حزمة ZIP:  كل ${bundleSize} كتاباً`);
  console.log(`🌐 وضع المحرك:    ${extractionMode === 'offline' ? 'محلي كامل (Offline Only)' : serverUrl}\n`);

  const allFiles = findSupportedFiles(inputDir);
  if (allFiles.length === 0) {
    console.log('⚠️ لم يتم العثور على أي كتب مدعومة (.pdf, .docx, .md, images) في المجلد المحدد.');
    return;
  }

  const totalBytes = allFiles.reduce((a, b) => a + b.sizeBytes, 0);
  console.log(`🔍 تم العثور على ${allFiles.length} ملفاً بحجم إجمالي: ${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} جيجابايت.`);

  const resumeFile = path.join(outputDir, 'batch_resume.json');
  let resume = { completed: [], failed: [], bundleIndex: 1 };
  if (fs.existsSync(resumeFile)) {
    try {
      resume = JSON.parse(fs.readFileSync(resumeFile, 'utf-8'));
      if (!Array.isArray(resume.completed)) resume.completed = [];
      if (!Array.isArray(resume.failed)) resume.failed = [];
      if (!resume.bundleIndex) resume.bundleIndex = 1;
    } catch {
      resume = { completed: [], failed: [], bundleIndex: 1 };
    }
  }

  const completedSet = new Set(resume.completed);
  const remaining = allFiles.filter((p) => !completedSet.has(p.path));

  if (completedSet.size > 0) {
    console.log(`🔄 استئناف العمل: تم تجاوز ${completedSet.size} كتاباً محولاً مسبقاً.`);
  }
  console.log(`🚀 الملفات المتبقية للتحويل: ${remaining.length} ملفاً.\n`);

  let currentBatch = [];

  for (let i = 0; i < remaining.length; i++) {
    const item = remaining[i];
    const currentIndex = completedSet.size + 1;
    console.log(`[${currentIndex}/${allFiles.length}] جاري معالجة: ${item.name} (${item.sizeMB} MB)...`);

    let fileBytes = null;
    try {
      fileBytes = fs.readFileSync(item.path);
      if (!fileBytes || fileBytes.length === 0) throw new Error('الملف فارغ (0 بايت).');

      let rawMarkdown = '';
      let totalPages = 1;
      let usedMethod = 'offline_pipeline';

      if (item.ext === '.md' || item.ext === '.markdown' || item.ext === '.txt') {
        rawMarkdown = fs.readFileSync(item.path, 'utf-8');
        usedMethod = 'offline_markdown_typeset';
      } else if (item.ext === '.docx') {
        rawMarkdown = await extractDocxLocally(fileBytes);
        usedMethod = 'offline_docx_repair';
      } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(item.ext)) {
        const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
        const b64 = `data:${mimeMap[item.ext]};base64,${fileBytes.toString('base64')}`;
        const chunkRes = await convertChunkResilient(b64, null, item.name, mimeMap[item.ext]);
        rawMarkdown = chunkRes.markdown;
        usedMethod = chunkRes.method;
      } else {
        const srcDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
        totalPages = srcDoc.getPageCount();
        console.log(`   📄 إجمالي الصفحات: ${totalPages} صفحة`);

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

        const mdPieces = [];
        for (let p = 0; p < totalPages; p += chunkSize) {
          const endP = Math.min(p + chunkSize, totalPages);
          process.stdout.write(`   ⏳ معالجة الصفحات ${p + 1}-${endP}... `);

          const chunkDoc = await PDFDocument.create();
          const indices = [];
          for (let idx = p; idx < endP; idx++) indices.push(idx);
          const copied = await chunkDoc.copyPages(srcDoc, indices);
          for (const page of copied) chunkDoc.addPage(page);

          const chunkBytes = await chunkDoc.save();
          const b64 = `data:application/pdf;base64,${Buffer.from(chunkBytes).toString('base64')}`;
          const chunkRes = await convertChunkResilient(b64, chunkBytes, `${item.name} (pages ${p + 1}-${endP})`, 'application/pdf');
          mdPieces.push(chunkRes.markdown);
          usedMethod = chunkRes.method;
          console.log(`✅ (${usedMethod})`);

          if (p + chunkSize < totalPages && usedMethod.startsWith('remote_server')) {
            await new Promise((r) => setTimeout(r, 3200));
          }
        }
        rawMarkdown = mdPieces.map((m) => (m || '').trim()).filter(Boolean).join('\n\n---PAGE_BREAK---\n\n');
      }

      const refined = sharedPipeline.runFullRefinementPipeline(rawMarkdown);
      const effectiveRtl =
        directionPref === 'rtl' ? true : directionPref === 'ltr' ? false : refined.isRtl;

      const baseName = item.name.replace(/\.[^/.]+$/, '');
      const mdPath = path.join(outputDir, `${baseName}.md`);
      fs.writeFileSync(mdPath, refined.markdown, 'utf-8');

      const docxBinary = await sharedTypography.buildDocxBinary(
        {
          title: baseName,
          markdown: refined.markdown,
          isRtl: effectiveRtl,
          direction: directionPref,
          fontProfile,
          ...(customArabicFont ? { arabicFont: customArabicFont } : {}),
          ...(customEnglishFont ? { englishFont: customEnglishFont } : {}),
          ...(customArabicSize ? { arabicSizePt: customArabicSize } : {}),
          ...(customEnglishSize ? { englishSizePt: customEnglishSize } : {}),
          author: 'PDF to Word Converter CLI v2.0',
        },
        { docx: docxLib, JSZip }
      );

      const docxPath = path.join(outputDir, `${baseName}.docx`);
      fs.writeFileSync(docxPath, Buffer.from(docxBinary));
      console.log(`   🎉 تم الحفظ بنجاح (جودة QA: ${refined.qaReport.qualityScore}% | المحرك: ${usedMethod}): ${baseName}.docx\n`);

      completedSet.add(item.path);
      resume.completed = Array.from(completedSet);
      fs.writeFileSync(resumeFile, JSON.stringify(resume, null, 2));

      currentBatch.push({
        name: item.name,
        totalPages,
        docxPath,
        mdPath,
        qaScore: refined.qaReport.qualityScore,
        method: usedMethod,
      });

      if (currentBatch.length >= bundleSize || i === remaining.length - 1) {
        const bNum = resume.bundleIndex++;
        console.log(`📦 جاري تجميع حزمة ZIP رقم ${bNum} (${currentBatch.length} كتاباً)...`);
        const zip = new JSZip();
        const zipName = `حزمة_الكتب_المضغوطة_${bNum}_عدد_${currentBatch.length}_كتاب.zip`;
        const zipPath = path.join(outputDir, zipName);

        const indexLines = [
          '====================================================',
          `حزمة الكتب المحولة المجدولة رقم: ${bNum}`,
          `تاريخ الإنشاء: ${new Date().toLocaleString('ar-EG')}`,
          `عدد الكتب في هذه الحزمة: ${currentBatch.length}`,
          `نسق الخطوط: ${typoConfig.profile.labelArabic}`,
          '====================================================\n',
        ];

        for (const b of currentBatch) {
          if (fs.existsSync(b.docxPath)) zip.file(path.basename(b.docxPath), fs.readFileSync(b.docxPath));
          if (fs.existsSync(b.mdPath)) zip.file(`نصوص_Markdown/${path.basename(b.mdPath)}`, fs.readFileSync(b.mdPath));
          indexLines.push(`• ${b.name} (${b.totalPages} صفحة | جودة QA: ${b.qaScore}% | المحرك: ${b.method})`);
        }

        zip.file('فهرس_الحزمة_والإحصائيات.txt', indexLines.join('\n'));
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
        fs.writeFileSync(zipPath, zipBuffer);
        console.log(`✨ تم إنشاء الحزمة بنجاح: ${zipName}\n`);

        currentBatch = [];
        fs.writeFileSync(resumeFile, JSON.stringify(resume, null, 2));
      }
    } catch (err) {
      console.error(`❌ تعثر تحويل ${item.name}: ${err.message}\n`);
      resume.failed.push({ file: item.path, error: err.message, timestamp: new Date().toISOString() });
      fs.writeFileSync(resumeFile, JSON.stringify(resume, null, 2));
    } finally {
      fileBytes = null;
    }
  }

  console.log('🏁 اكتملت جميع دورات التحويل بنجاح! المخرجات محفوظة في:');
  console.log(`   ${path.resolve(outputDir)}\n`);
}

run().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
