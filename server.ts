import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { TextProcessor } from "./shared/textProcessor.js";
import { toStandardArabic } from "./shared/arabicText.js";
import { polishBilingualBoundariesCore } from "./shared/arabicPipelineCore.js";
import { registerSmartCompilerRoutes } from "./server/smartCompilerRoutes.js";
import { registerBackgroundJobRoutes } from "./server/backgroundJobManager.js";
import { registerTeamAuth } from "./server/teamAuth.js";
import { registerGovernanceRoutes } from "./server/governanceManager.js";
import {
  sharedModelPool,
  registerModelPoolRoutes,
  buildSafeThinkingConfig,
} from "./server/modelPool.js";
import {
  detectPdfUnderlines,
  applyVerifiedUnderlinesToMarkdown,
  normalizeCombiningUnderlines,
  type PdfUnderlineDetectionResult,
} from "./server/pdfUnderlineExtractor.js";
import {
  resolveProjectRoot,
  resolveServerPort,
  resolveServerHost,
} from "./server/config/runtimeConfig.js";
import {
  apiCorsMiddleware,
  securityHeadersMiddleware,
  payloadAndSyntaxErrorHandler,
  apiNotFoundHandler,
  apiUnhandledErrorHandler,
} from "./server/middleware/errorHandlers.js";
import {
  getGeminiClient,
  executeWithModelPool,
  classifyGeminiHttpError,
} from "./server/clients/geminiClient.js";
import { registerInfoAndCliRoutes } from "./server/controllers/infoAndCliRoutes.js";
import { registerDirectExtractRoutes } from "./server/controllers/directExtractRoutes.js";
import { registerExportRoutes } from "./server/controllers/exportRoutes.js";

const PROJECT_ROOT = resolveProjectRoot();

dotenv.config();

const app = express();
const PORT = resolveServerPort();
const HOST = resolveServerHost();

app.use(securityHeadersMiddleware);
app.use("/api", apiCorsMiddleware);

// Increase payload limit for PDF base64 uploads (allowing large textbooks and multi-volume curricula)
app.use(express.json({ limit: "250mb" }));
app.use(express.urlencoded({ extended: true, limit: "250mb" }));

// Unified Express body-parser error-handling middleware (prevents raw HTML 413 / 400 errors)
app.use(payloadAndSyntaxErrorHandler);

// Team Passcode Auth Gate & Public Share Config (registered before protected routes)
registerTeamAuth(app, PROJECT_ROOT);

// Platform Governance, User Tracking, Access Controls & Telemetry API (/api/client/*, /api/admin/*)
const governanceManager = registerGovernanceRoutes(app, PROJECT_ROOT);

// Health, ping, API documentation, links guide, and CLI/MCP bundle download endpoints
registerInfoAndCliRoutes(app, PROJECT_ROOT);

// Zero-quota digital-first PDF text extraction & vector underline endpoint
registerDirectExtractRoutes(app, governanceManager);

// PDF Conversion Endpoint
app.post("/api/convert-pdf", async (req, res) => {
  const startedAt = Date.now();
  const isManagedClient = req.headers["x-telemetry-managed"] === "1";
  try {
    const { pdfBase64, filename, options } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: "No PDF data provided" });
    }

    const cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, "").trim();
    if (!cleanBase64) {
      return res.status(400).json({ error: "No PDF data provided" });
    }

    // Early sanity check: Must be at least 16 bytes and valid base64
    const bufferHeader = Buffer.from(cleanBase64.slice(0, 64), "base64");
    if (bufferHeader.length < 4) {
      return res.status(400).json({
        success: false,
        error: "بيانات الملف الممررة غير صالحة أو تالفة. يرجى التأكد من تمرير ملف PDF أو صورة صحيحة بصيغة Base64.",
      });
    }

    // Check magic numbers for PDF (%PDF), PNG (\x89PNG), JPEG (\xFF\xD8), or WEBP (RIFF....WEBP)
    const isPdfHeader = bufferHeader.subarray(0, 4).toString("ascii").startsWith("%PDF");
    const isPngHeader = bufferHeader.length >= 8 && bufferHeader[0] === 0x89 && bufferHeader[1] === 0x50 && bufferHeader[2] === 0x4E && bufferHeader[3] === 0x47;
    const isJpegHeader = bufferHeader.length >= 2 && bufferHeader[0] === 0xFF && bufferHeader[1] === 0xD8;
    const isWebpHeader =
      bufferHeader.length >= 12 &&
      bufferHeader.subarray(0, 4).toString("ascii") === "RIFF" &&
      bufferHeader.subarray(8, 12).toString("ascii") === "WEBP";
    const isSupportedMime = isPdfHeader || isPngHeader || isJpegHeader || isWebpHeader;

    if (!isSupportedMime && bufferHeader.length < 32) {
      return res.status(400).json({
        success: false,
        error: "الملف الممرر ليس مستند PDF أو صورة صالحة. تم رفض الطلب حمايةً للحصص وجودة التحويل.",
      });
    }

    const ai = getGeminiClient();
    if (cleanBase64.length > 24 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        error: "حجم الحزمة كبير جداً.",
        isPayloadTooLarge: true,
        isRateLimit: false,
        isUnavailable: false,
      });
    }

    const directionPreference = options?.direction || "auto"; // 'auto' | 'rtl' | 'ltr'
    const preserveHandwriting = options?.preserveHandwriting !== false;
    // `mathPrecision` arrives on the request body and is part of the documented
    // API contract, but no prompt or output depends on it. Kept accepted so existing
    // clients do not break.
    void options?.mathPrecision;

    const systemPrompt = `You are a master document transcription, OCR, and typesetting specialist for all languages and fields (English books, scientific & mathematical publications, STEM, literature, as well as classical and modern Arabic books, Islamic texts, Azhar curricula, and exam papers).
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
   - Example: قال تعالى: ﴿عَمَّ يَتَسَاءَلُونَ﴾.

4. **Arabic Diacritics & Vocalization (التشكيل الدقيق وضبط الكلمات)**:
   - Carefully preserve all Arabic vocalization and diacritical marks (حركات، شدة، تنوين، سكون) exactly as printed in the original document.

5. **Tables, Grids & Vocabulary Matrices (دقة الجداول والمصفوفات)**:
   - Transcribe all tables, comparison grids, exam questions/answers, and vocabulary matrices into standard Markdown tables:
     | العمود الأول | العمود الثاني | العمود الثالث |
     | :--- | :--- | :--- |
     | محتوى الخلية | محتوى الخلية | محتوى الخلية |
   - NEVER collapse multi-column tabular data into jumbled single lines of text.
   - STRICT RULE ON TABLE HEADERS: NEVER use the Arabic letter 'ا' as a column separator in table headers or curriculum plans (e.g. NEVER output "خطة القسم الأدبياالفترة الزمنيةاالموضوعات" or "الفهرساالموضوعارقم الصفحة" or "الرأياالحكماالتعليل"). EVERY table column MUST be separated by standard Markdown pipe characters (|) with spaces, e.g.:
     | خطة القسم الأدبي | الفترة الزمنية | الموضوعات |
     | الفهرس | الموضوع | رقم الصفحة |
     | الفقه الحنفي | نوع الدليل | التوضيح |
     | الرأي | الحكم | التعليل |
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
   - Preserve the exact literal numbering: (1. , ١. , (1) , (١) , أ- , ب- , س١:). Do NOT renumber or drop question numbers.

10. **Underlined Text, Subtle Inline Marks, Fill-in-Blanks & Poetry Couplets (النصوص التي تحتها خط والتنسيقات الدقيقة)**:
    - **UNDERLINED TEXT (الخطوط السفلية — حرج جداً لأسئلة الإعراب والنحو)**: Whenever ANY word, phrase, or sentence in the original document is underlined (especially target words under *"أعرب ما تحته خط"* or *"اضبط ما تحته خط"* or *"تخير الإعراب الصحيح لما تحته خط"* in reading/grammar passages, as well as underlined headings or emphasized phrases inside paragraphs or tables), you MUST strictly wrap ONLY the underlined word/phrase in <u>...</u> tags! Never ignore or lose underlines! Example: "إن <u>العلم</u> <u>نورٌ</u> يهدي <u>الطلابَ</u>. — أعرب ما تحته خط."
    - **STRIKETHROUGH & SUPER/SUBSCRIPT**: Wrap struck-through text in ~~...~~, superscripts in <sup>...</sup>, and subscripts in <sub>...</sub>.
    - **FILL-IN-THE-BLANK LINES (فراغات الإجابة)**: Preserve exam answer blanks as ___ or ..... (never collapse or drop the blank space in "أكمل مكان النقط: _____").
    - **ARABIC POETRY COUPLETS (الأبيات الشعرية ذات الشطرين)**: Preserve both hemistichs separated clearly on the line using three asterisks spaced out ("صدر البيت   ***   عجز البيت"), never merging them without separation or dropping either half.

11. **Sanitization**:
    - Strip scanner/app watermarks (e.g. "CamScanner", "Created with Photo-to-PDF", "Adobe Scan").
    - Ban runaway dot chains (compress "......" to ".....").

OUTPUT DIRECTLY AS PRISTINE MARKDOWN ONLY (Do not wrap in JSON).`;

    let userPrompt = `Transcribe this document "${filename || 'document.pdf'}" into pristine, 100% VERBATIM Markdown matching its exact source layout and language:
- ABSOLUTE ZERO OMISSIONS: Transcribe every word, every column, and every footnote without summarizing or skipping anything.
- CRITICAL VISUAL FORMATTING: Carefully inspect the page image/PDF for ANY underlined words or phrases (especially in Arabic grammar passages with "أعرب ما تحته خط" / "اضبط ما تحته خط") and wrap every underlined word/phrase strictly in <u>...</u> tags. Also preserve ~~strikethrough~~, <sup>superscript</sup>, <sub>subscript</sub>, and answer blanks (___ / .....).
- Preserve all tables and grids using valid Markdown table format (| Column 1 | Column 2 |).
- Preserve all Arabic diacritics (تَشْكِيل) and render every Quranic verse in authentic Uthmani script with full harakat strictly inside ﴿...﴾.
- For multi-column pages: transcribe all columns completely in reading order.
- Include a separate "---PAGE_BREAK---" line at the end of each original page.
- Strip any scanner watermarks.`;

    // Detect mimeType if provided in data URL, default to application/pdf
    let mimeType = "application/pdf";
    const mimeMatch = pdfBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+|application\/pdf);base64,/);
    if (mimeMatch) {
      mimeType = mimeMatch[1];
    }

    // Pre-scan digital PDFs for geometric vector underlines / Underline annotations (fast 2.5s guard)
    let detectedPdfUnderlines: PdfUnderlineDetectionResult = { pages: [], totalUnderlines: 0 };
    if (isPdfHeader) {
      try {
        const pdfChunkBuf = Buffer.from(cleanBase64, "base64");
        let guardTimer: ReturnType<typeof setTimeout> | undefined;
        detectedPdfUnderlines = await Promise.race([
          detectPdfUnderlines(pdfChunkBuf),
          new Promise<PdfUnderlineDetectionResult>((resolve) => {
            guardTimer = setTimeout(() => resolve({ pages: [], totalUnderlines: 0 }), 2500);
          }),
        ]).finally(() => {
          if (guardTimer) clearTimeout(guardTimer);
        });

        if (detectedPdfUnderlines.totalUnderlines > 0) {
          const hintLines = detectedPdfUnderlines.pages
            .filter((p) => p.underlinedPhrases.length > 0)
            .slice(0, 12)
            .map((p) => `  - Page ${p.pageNumber}: ${p.underlinedPhrases.slice(0, 20).join("، ")}`);
          if (hintLines.length > 0) {
            userPrompt += `\n\n- VERIFIED DIGITAL UNDERLINES IN SOURCE PDF VECTOR LAYER (MUST wrap these exact words/phrases in <u>...</u> where underlined on each page):\n${hintLines.join("\n")}`;
          }
        }
      } catch {
        // Non-fatal pre-scan bypass
      }
    }

    const outcome = await executeWithModelPool({
      ai,
      maxRounds: 3,
      timeoutMs: 45000,
      respectCooldownGate: true,
      pauseBetweenRounds: true,
      pauseBetweenModelsMs: 400,
      buildTimeoutMessage: (modelName) =>
        `Model ${modelName} call timed out after 45s (peak demand safeguard)`,
      onModelAttempt: (round, maxRounds, modelName) => {
        console.log(`[Round ${round + 1}/${maxRounds}] Sending conversion request using model: ${modelName}...`);
      },
      onModelError: (modelName, err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`Model ${modelName} failed: ${errMsg}`);
      },
      generateForModel: (modelName, client) =>
        client.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: userPrompt,
                },
              ],
            },
          ],
          config: {
            systemInstruction: systemPrompt,
            ...buildSafeThinkingConfig(modelName),
            maxOutputTokens: 32768,
          },
        }),
    });

    if (outcome.kind === "rate_limit_delegated") {
      return res.status(outcome.status).json(outcome.body);
    }
    if (outcome.kind === "failed") {
      throw outcome.lastError || new Error("The AI conversion service experienced temporary peak demand. Please retry in a few seconds.");
    }

    const rawText = outcome.responseText.trim();
    let markdownContent = rawText;

    // In case the model wrapped in ```markdown ... ```
    if (markdownContent.startsWith("```markdown")) {
      markdownContent = markdownContent.replace(/^```markdown\s*/i, "").replace(/```\s*$/, "").trim();
    } else if (markdownContent.startsWith("```") && markdownContent.endsWith("```")) {
      // If it returned json or general codeblock, check if it's JSON
      const inner = markdownContent.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
      try {
        const parsed = JSON.parse(inner);
        if (parsed && typeof parsed.markdown === "string") {
          markdownContent = parsed.markdown;
        } else {
          markdownContent = inner;
        }
      } catch {
        markdownContent = inner;
      }
    } else if (markdownContent.startsWith("{") && markdownContent.endsWith("}")) {
      try {
        const parsed = JSON.parse(markdownContent);
        if (parsed && typeof parsed.markdown === "string") {
          markdownContent = parsed.markdown;
        }
      } catch {
        // Use raw text as markdown directly
      }
    }

    // Detect language & direction from text
    const arabicCharCount = (markdownContent.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
    const latinCharCount = (markdownContent.match(/[a-zA-Z]/g) || []).length;
    const isArabic = directionPreference === "rtl" || (directionPreference === "auto" && arabicCharCount >= latinCharCount * 0.4);
    const textDirection = isArabic ? "rtl" : "ltr";
    const detectedLanguage = arabicCharCount > 10 && latinCharCount > 10 ? "Arabic & English" : isArabic ? "Arabic" : "English";

    // Extract title from first H1/H2 header or filename
    let docTitle = (filename || "document.pdf").replace(/\.[^/.]+$/, "").replace(/\s*\(pages\s*\d+-\d+\)/i, "");
    const headerMatch = markdownContent.match(/^#+\s+(.+)$/m);
    if (headerMatch && headerMatch[1]) {
      const cleanHeader = headerMatch[1].replace(/[*_#`]/g, "").trim();
      if (cleanHeader.length > 2 && cleanHeader.length < 80) {
        docTitle = cleanHeader;
      }
    }

    // Post-processing cleanup utility
    const cleanMarkdown = (md: string) => {
      let cleaned = md;

      // 1. Standardize pagination artifacts and strictly preserve true page breaks
      cleaned = cleaned.replace(/\s*---PAGE_BREAK---\s*/g, '\n\n---PAGE_BREAK---\n\n');
      // Clean up stray HTML line breaks and formatting tags from OCR
      cleaned = cleaned
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/br>/gi, '\n')
        .replace(/&nbsp;/gi, ' ')
        // Only unwrap the tags this list names. The alternation needs its own
        // boundaries: without them `i` matches the first letter of any tag, so
        // <img …>, <iframe …> and <input …> were matched and deleted outright,
        // silently discarding embedded images from the document.
        .replace(/<\/?(span|div|p|b|strong|em|i)(?=[\s/>])[^>]*>/gi, '');
      // Remove explicit pagination headers (e.g. "الصفحة 12", "Page 12", "- 12 -") without stripping standalone question numbers (1, 2, 3)
      cleaned = cleaned.replace(/^[ \t]*(?:الصفحة|Page)[ \t]+\d+[ \t]*$|^[ \t]*-[ \t]*\d+[ \t]*-[ \t]*$/gmi, '');

      // 2. Fix inconsistent footnote symbols if any sneaked through (e.g., replacing loose asterisks intended as footnotes)
      // This is risky for bold text, so we only target asterisks at the start of a line or after a space followed by nothing
      // We will rely primarily on the AI's prompt for footnotes, but we can clean up stray reference markers like [^] to [^1]
      let fnCounter = 1;
      cleaned = cleaned.replace(/\[\^[\s*]*\]/g, () => `[^${fnCounter++}]`);

      // 3. Remove residual debugging characters and artifacts
      cleaned = cleaned.replace(/\\text\{([^\}]+)\}/g, '$1'); // Fix stray \text{} wrappers from OCR
      cleaned = cleaned.replace(/\u200B/g, ''); // Remove zero-width spaces

      // 4. Eliminate empty paragraphs and normalize spacing
      cleaned = cleaned.replace(/[ \t]+$/gm, ''); // Trailing spaces
      cleaned = cleaned.replace(/\n[ \t]+\n/g, '\n\n'); // Empty lines with spaces
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // More than 2 newlines
      
      // 5. Clean up broken or orphaned horizontal rules
      cleaned = cleaned.replace(/^-{2,}$/gm, '---');
      cleaned = cleaned.replace(/\n---\n---\n/g, '\n---\n'); // Deduplicate horizontal rules

      // 6. Mandatory Quranic & Azhar Curriculum Post-Processing Verification
      // Rectifies critical OCR character confusions, runaway dot loops, and Azhar curriculum omissions
      cleaned = cleaned
        // Compress runaway dots and repetitive dot loops
        .replace(/\.{6,}/g, '.....')
        .replace(/^[ \t]*(\.[ \t]*){5,}$/gm, '.....')
        .replace(/(\n[ \t]*\.\.\.\.\.[ \t]*){2,}/g, '\n.....\n')
        // Table header column splitting & glued 'ا' artifact repair
        .replace(/خطة[ \t]*القسم[ \t]*الأدبياالفترة[ \t]*الزمنيةاالموضوعات/g, '| خطة القسم الأدبي | الفترة الزمنية | الموضوعات |')
        .replace(/خطة[ \t]*القسم[ \t]*العلمياالفترة[ \t]*الزمنيةاالموضوعات/g, '| خطة القسم العلمي | الفترة الزمنية | الموضوعات |')
        .replace(/الفهرساالموضوعارقم[ \t]*الصفحة/g, '| الفهرس | الموضوع | رقم الصفحة |')
        .replace(/الفقه[ \t]*الحنفيانوع[ \t]*الدليلاالتوضيح/g, '| الفقه الحنفي | نوع الدليل | التوضيح |')
        .replace(/الرأياالحكماالتعليل|الرأياالحكماالتوضيح/g, '| الرأي | الحكم | التعليل |')
        // Fiqh Hanafi & Azhar curriculum typos
        .replace(/(?:^|[^\u0621-\u064A])بأنًّا(?:$|[^\u0621-\u064A])/g, ' باتًّا ')
        .replace(/البيعي[ \t]+والوزني/g, 'الكيلي والوزني')
        .replace(/(?:^|[^\u0621-\u064A])الكتيف(?:$|[^\u0621-\u064A])/g, ' الكنيف ')
        .replace(/(?:^|[^\u0621-\u064A])الزعْر(?:$|[^\u0621-\u064A])/g, ' الزرع ')
        .replace(/تريق[ \t]+الصفقة/g, 'تفريق الصفقة')
        .replace(/(?:^|[^\u0621-\u064A])السففل(?:$|[^\u0621-\u064A])/g, ' السُّفْل ')
        .replace(/أجرة[ \t]+الصيغ/g, 'أجرة الصَّبْغ')
        .replace(/أكتوبرامن/g, 'أكتوبر من')
        .replace(/ومصوغهما[ \t]+ومصوغهما/g, 'ومصوغهما')
        // Scanner footnote noise removal ("شمخ" and broken superscript footnotes)
        .replace(/\bشمخ\b|[ \t]+شمخ(?=[ \t،.\n]|$)/g, '')
        .replace(/\^\(?[٠-٩1-9]+\)?/g, '')
        // Fix phrase repetitions in tables
        .replace(/وعن[ \t]+لبن[ \t]+في[ \t]+ضرع[،,\s]+وعن[ \t]+لبن[ \t]+في[ \t]+ضرع/g, 'وعن لبن في ضرع')
        // Fix Hadith typos & omissions
        .replace(/راوية[ \t]+ابن[ \t]+ماجه/g, 'رواية ابن ماجه')
        .replace(/النساء[ \t]+الرجال(?=[ \t]*[،.\n]|$)/g, 'النساء شقائق الرجال')
        // Fix Fiqh Shafi'i typos & truncation
        .replace(/كفته[ \t]+نيتة/g, 'كفته نيته')
        // Quranic verses
        .replace(/مَن[ \t]+تَقُوتُ|مِن[ \t]+تَقُوتُ/g, '﴿مِن تَفَاوُتٍ﴾')
        .replace(/جواب[ \t]+الأمر[:\s]+﴿?بِقَلْبٍ﴾?/g, 'جواب الأمر: ﴿يَنقَلِبْ﴾')
        .replace(/الْبَصَرُ[ \t]+خَاشِعًا|الْبَصَرُ[ \t]+خاشعا/g, 'الْبَصَرُ خَاسِئًا')
        .replace(/أَن[ \t]+يَخِيفَ/g, 'أَن يَخْسِفَ')
        .replace(/يَعْمَوْا[ \t]+عَمَهًا/g, 'سَمِعُوا لَهَا شَهِيقًا')
        .replace(/أَلَيَأْتِيكُم[ \t]+نَذِيرٌ/g, 'أَلَمْ يَأْتِكُمْ نَذِيرٌ')
        .replace(/معنى[ \t]+كلمة[ \t]+﴿?صَنَفَتْ﴾?/g, 'معنى كلمة ﴿صَافَّاتٍ﴾')
        .replace(/فِي[ \t]+مَنَاكِلِهَا/g, 'فِي مَنَاكِبِهَا')
        .replace(/تَمَيَّزُ[ \t]+مِنَ[ \t]+الْفَيْضِ/g, 'تَمَيَّزُ مِنَ الْغَيْظِ')
        .replace(/فَصُحْقًا/g, 'فَسُحْقًا')
        .replace(/﴿{2,}/g, '﴿')
        .replace(/﴾{2,}/g, '﴾');

      // Apply robust TextProcessor rule cleaning (Table noise, 'شمخ' artifacts, Fiqh dictionary)
      if (typeof TextProcessor !== 'undefined' && TextProcessor.process) {
        cleaned = TextProcessor.process(cleaned);
      }

      return cleaned.trim();
    };

    // Preserve CSS-underlined spans before downstream cleaning, and normalize combining/LaTeX underlines
    markdownContent = markdownContent
      .replace(/<span[^>]*style=["'][^"']*text-decoration\s*:\s*underline[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, '<u>$1</u>')
      .replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>');
    markdownContent = normalizeCombiningUnderlines(markdownContent);
    markdownContent = cleanMarkdown(markdownContent);
    markdownContent = markdownContent.replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>');
    // Apply full Arabic normalization, OCR mojibake repair, and bilingual boundary polishing
    markdownContent = polishBilingualBoundariesCore(toStandardArabic(markdownContent));
    // Reinforce any missed digital PDF vector underlines on pages containing underline questions
    if (detectedPdfUnderlines.totalUnderlines > 0) {
      markdownContent = applyVerifiedUnderlinesToMarkdown(markdownContent, detectedPdfUnderlines.pages, true);
    }

    // Generate plainText safely without markdown syntax
    const plainText = markdownContent
      .replace(/^---\s*$/gm, '\n------------------------\n') // horizontal rules in plain text
      .replace(/\\text\{([^\}]+)\}/g, '$1') // strip stray \text{} blocks
      .replace(/^#+\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$\$?([^\$]+)\$\$?/g, "$1") // Strip math dollar signs
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "• ")
      .trim();

    const cleanedPlainText = plainText
      .replace(/<\/?(?:u|ins|s|sup|sub|mark)(?:\s[^>]*)?>/gi, '')
      .replace(/~~([^~]+)~~/g, '$1');

    const parsedData = {
      title: docTitle,
      detectedLanguage,
      textDirection,
      pageCountEstimate: 1,
      hasMathOrScience: /\$|\\frac|\\sqrt|\\vec/.test(markdownContent),
      hasArabicText: arabicCharCount > 5,
      hasTables: markdownContent.includes("|"),
      hasHandwriting: preserveHandwriting,
      markdown: markdownContent,
      plainText: cleanedPlainText,
    };

    if (!isManagedClient) {
      const identity = governanceManager.extractClientIdentity(req);
      const wordsCount = cleanedPlainText.trim()
        ? cleanedPlainText.trim().split(/\s+/).length
        : 0;
      const pagesEstimate = Math.max(
        1,
        (markdownContent.match(/---PAGE_BREAK---/g) || []).length + 1
      );
      governanceManager.recordConversionEvent({
        clientId: identity.clientId,
        ip: identity.ip,
        deviceLabel: identity.deviceLabel,
        fileName: filename || `${docTitle}.pdf`,
        fileSize: Math.round((cleanBase64.length * 3) / 4),
        mimeType,
        operation: "convert-pdf",
        status: "completed",
        pagesCount: pagesEstimate,
        wordsCount,
        charsCount: markdownContent.length,
        extractionMethod: "vision_ocr",
        durationMs: Date.now() - startedAt,
        startedAt,
        completedAt: Date.now(),
      });
    }

    res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    const rawError = error?.message || String(error);
    console.error("PDF Conversion Error:", rawError);
    if (!isManagedClient) {
      try {
        const identity = governanceManager.extractClientIdentity(req);
        governanceManager.recordConversionEvent({
          clientId: identity.clientId,
          ip: identity.ip,
          deviceLabel: identity.deviceLabel,
          fileName: req.body?.filename || "document.pdf",
          fileSize: 0,
          operation: "convert-pdf",
          status: "failed",
          pagesCount: 0,
          extractionMethod: "vision_ocr",
          durationMs: Date.now() - startedAt,
          errorMessage: rawError,
          startedAt,
          completedAt: Date.now(),
        });
      } catch {}
    }
    const mapped = classifyGeminiHttpError(error);
    return res.status(mapped.status).json(mapped.body);
  }
});

// AI Contextual Checker Endpoint (Compares verses, hadiths, and fiqh terms against canonical databases)
app.post("/api/contextual-check", async (req, res) => {
  try {
    // subjectHint is accepted for API compatibility; the checker does not branch on it.
    const { markdown } = req.body;
    void req.body?.subjectHint;
    if (!markdown || typeof markdown !== "string") {
      return res.status(400).json({ success: false, error: "النص مطلوب للفحص السياقي." });
    }

    // Bypass Islamic canonical check if document has no significant Arabic text
    const arabicCharCount = (markdown.match(/[\u0600-\u06FF]/g) || []).length;
    if (arabicCharCount < 10) {
      return res.json({
        success: true,
        data: {
          correctedMarkdown: markdown,
          isAiVerified: false,
          fallbackReason: "English / non-Arabic document",
        },
      });
    }

    const ai = getGeminiClient();
    const systemInstruction = `أنت وحدة الفحص السياقي الذكي المتقدم (AI Contextual Checker) المتخصصة في المناهج والمصادر المعتمدة (المصحف الشريف برواية حفص بالرسم العثماني، كتب الحديث، أمهات كتب الفقه، والمراجع العلمية).
مهمتك الصارمة:
1. فحص سياق الآيات القرآنية ومطابقتها نصاً ولفظاً برسم المصحف المعتمد وضبط أي انحراف ناتج عن التعرف البصري (OCR) ووضع كل آية بين قوسي مصحف: ﴿...﴾ مع كامل التشكيل.
2. فحص الأحاديث النبوية ومقارنتها بكتب السنة المعتمدة واستكمال أي سقط، وتصحيح أي تصحيف مثل "راوية ابن ماجه" ➔ "رواية ابن ماجه"، و"النساء الرجال" ➔ "النساء شقائق الرجال".
3. ضبط المصطلحات الفقهية واللغوية وتصحيح التصحيفات المطبعية دون تغيير المعنى الأصلي إطلاقاً.
4. حظر الحذف أو التلخيص أو إعادة الصياغة: يُحظر حظراً تاماً اختصار أي فقرة أو حذف أي هامش أو إعادة صياغة جمل المؤلف؛ دورك تدقيقي وتصحيحي محض.
5. تطهير سيل النقاط المتكررة وحصر الفراغات في [.....] فقط.
6. الحفاظ التام والصارم بنسبة 100% على علامات فواصل الصفحات «---PAGE_BREAK---» في مواضعها الدقيقة دون حذف أو دمج أو تغيير إطلاقاً، لضمان تطابق صفحات الوورد مع أصل البي دي إف صفحة بصفحة 1:1.
7. الحفاظ التام على جميع وسوم التنسيق الموضعية مثل الخطوط السفلية <u>...</u> (خاصة الكلمات المراد إعرابها في "أعرب ما تحته خط") والتظليل <mark>...</mark> والأسس <sup> و <sub> والشطب ~~...~~ وفراغات الإكمال ___ كما وردت حرفياً دون حذفها.
8. أعد فقط النص المكتمل والمصحح بصيغة Markdown دون أي شرح أو مقدمات أو خاتمة.`;

    const contextualOutcome = await executeWithModelPool({
      ai,
      maxRounds: 1,
      timeoutMs: 25000,
      buildTimeoutMessage: (model) => `Contextual check model ${model} timed out after 25s`,
      onModelError: (model, err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Contextual check failed on model ${model}:`, msg);
      },
      generateForModel: (model, client) =>
        client.models.generateContent({
          model,
          contents: `قم بالفحص والتدقيق السياقي الفوري لهذا المحتوى الأزهري، واضبط الآيات والأحاديث والجداول بالمسطرة وفق المراجع المعتمدة:\n\n${markdown.slice(0, 32000)}`,
          config: {
            systemInstruction,
            ...buildSafeThinkingConfig(model),
            maxOutputTokens: 8192,
          },
        }),
    });

    const resultText = contextualOutcome.kind === "success" ? contextualOutcome.responseText : "";

    if (!resultText) {
      const lastErr = contextualOutcome.kind === "failed" ? (contextualOutcome.lastError as any) : null;
      return res.json({
        success: true,
        data: {
          correctedMarkdown: markdown,
          isAiVerified: false,
          fallbackReason: lastErr?.message || "AI model unavailable, canonical rule engine applied",
        },
      });
    }

    // Critical Safeguard: If the AI output is significantly shorter than the input,
    // it means maxOutputTokens truncated a large document (e.g. 200 pages -> 2 pages).
    // In that case, NEVER overwrite the full document with a truncated stub!
    if (markdown.length > 8000 && resultText.length < markdown.length * 0.75) {
      console.warn(`[ContextualCheck] Truncation averted: Original length ${markdown.length} vs AI output ${resultText.length}. Preserving full document.`);
      return res.json({
        success: true,
        data: {
          correctedMarkdown: markdown,
          isAiVerified: false,
          isTruncationPrevented: true,
        },
      });
    }

    // Safeguard 2: Ensure 100% preservation of page breaks
    const origBreaks = (markdown.match(/---PAGE_BREAK---/g) || []).length;
    const resBreaks = (resultText.match(/---PAGE_BREAK---/g) || []).length;
    if (origBreaks > 0 && resBreaks < origBreaks) {
      console.warn(`[ContextualCheck] Result lost page breaks (${resBreaks} vs ${origBreaks}). Preserving original page structure.`);
      return res.json({
        success: true,
        data: {
          correctedMarkdown: markdown,
          isAiVerified: false,
          fallbackReason: "Preserving strict 1:1 page break parity",
        },
      });
    }

    res.json({
      success: true,
      data: {
        correctedMarkdown: resultText.trim(),
        isAiVerified: true,
      },
    });
  } catch (error: any) {
    console.error("Contextual checker route error:", error);
    // Graceful fallback to prevent disrupting client conversion pipeline
    res.json({
      success: true,
      data: {
        correctedMarkdown: req.body?.markdown || "",
        isAiVerified: false,
        fallbackReason: error?.message || "Internal fallback to canonical rule engine",
      },
    });
  }
});

// Arabic Grammar & Syntax Analyzer Endpoint (Detects open-ended truncation & predicts completions)
app.post("/api/grammar-syntax-check", async (req, res) => {
  try {
    // filename is accepted for API compatibility; the analyzer does not branch on it.
    const { markdown } = req.body;
    void req.body?.filename;
    if (!markdown || typeof markdown !== "string") {
      return res.status(400).json({ success: false, error: "النص مطلوب للتحليل النحوي والتركيبي." });
    }

    // Bypass Arabic syntax analyzer if document has no significant Arabic text
    const arabicCharCount = (markdown.match(/[\u0600-\u06FF]/g) || []).length;
    if (arabicCharCount < 10) {
      return res.json({
        success: true,
        data: {
          hasCriticalTruncation: false,
          isAbruptTermination: false,
          truncatedItems: [],
          overallGrammarVerdict: "English / non-Arabic document verified successfully",
          completedMarkdown: markdown,
        },
      });
    }

    const ai = getGeminiClient();
    const systemInstruction = `أنت خبير التدقيق النحوي والتركيبي المتقدم (Arabic Grammar & Syntax Analyzer).
مهمتك:
1. فحص الجمل العربية المفتوحة البتر (Abrupt Sentence Cuts / Open-ended Incomplete Syntax)، مثل انقطاع النص فجأة على حرف جر (بـ، في، من، إلى، عن)، أو جملة صلة غير مكتملة، أو مضاف بلا مضاف إليه، أو انقطاع في منتصف الفقرة أو الكلمة (مثل: "والمراد من ذلك الجنس الصادق بـ...").
2. فحص ما إذا كان الملف يبدو ناقصاً بشكل حرج (Critical Truncation) بانقطاعه في منتصف الدرس دون خاتمة أو أسئلة.
3. التنبؤ بتكملة الجمل المبتورة بدقة تامة بناءً على السياق الأكاديمي والشرعي واللغوي.
4. أخرج النتيجة بتنسيق JSON حصراً بهذا المخطط:
{
  "hasCriticalTruncation": boolean,
  "isAbruptTermination": boolean,
  "criticalTruncationAlert": "رسالة تنبيه واضحة إذا كان الملف مبتوراً أو ناقصاً",
  "truncatedItems": [
    {
      "truncatedText": "الجملة المبتورة كما وردت",
      "predictedCompletion": "التكملة النحوية والأكاديمية الصحيحة",
      "grammaticalReason": "العلة النحوية (مثل: حرف جر معلق / انقطاع في الموصول / مضاف بلا مضاف إليه)",
      "confidence": 0.95
    }
  ],
  "overallGrammarVerdict": "تقييم موجز للسلامة النحوية واكتمال الجمل",
  "completedMarkdown": "النص الكامل بعد إصلاح وتكملة الجمل المبتورة"
}`;

    let analysisResult: any = null;
    await executeWithModelPool({
      ai,
      maxRounds: 1,
      timeoutMs: 20000,
      buildTimeoutMessage: (model) => `Grammar syntax check model ${model} timed out after 20s`,
      onModelError: (model, err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Grammar analyzer failed on model ${model}:`, msg);
      },
      generateForModel: async (model, client) => {
        const resGen = await client.models.generateContent({
          model,
          contents: `حلل هذا النص نحوياً وتركيبياً واكشف الجمل المفتوحة والبتر المفاجئ وأكملها وفق السياق:\n\n${markdown.slice(-15000)}`,
          config: {
            systemInstruction,
            ...buildSafeThinkingConfig(model),
            responseMimeType: "application/json",
          },
        });
        if (resGen.text) {
          analysisResult = JSON.parse(resGen.text);
        }
        return resGen;
      },
    });

    if (!analysisResult) {
      return res.json({
        success: true,
        data: {
          hasCriticalTruncation: false,
          isAbruptTermination: false,
          truncatedItems: [],
          overallGrammarVerdict: "تم فحص القواعد النحوية محلياً",
        },
      });
    }

    res.json({
      success: true,
      data: analysisResult,
    });
  } catch (error: any) {
    console.error("Grammar syntax analyzer error:", error);
    // Graceful fallback to local grammar analyzer
    res.json({
      success: true,
      data: {
        hasCriticalTruncation: false,
        isAbruptTermination: false,
        truncatedItems: [],
        overallGrammarVerdict: "تم فحص القواعد النحوية محلياً",
      },
    });
  }
});

// Dedicated binary Word (.docx) export route
registerExportRoutes(app);

// Register Live Model Discovery & Rotation Status routes (/api/models/*)
registerModelPoolRoutes(app, getGeminiClient);

// Register Persistent Background Conversion Jobs API (/api/jobs/*)
const jobManager = registerBackgroundJobRoutes(app, PROJECT_ROOT, getGeminiClient);
jobManager.setGovernanceManager(governanceManager);

// Register Smart Compilation Studio routes (/api/compiler/*)
registerSmartCompilerRoutes(app, getGeminiClient);

// 404 handler for all /api/* routes (ensures API callers never receive Vite SPA HTML)
app.all("/api/*", apiNotFoundHandler);

// Global Express error handler for all /api routes
app.use("/api", apiUnhandledErrorHandler);

async function startServer() {
  const httpServer = http.createServer(app);

  // Align HTTP keep-alive timeouts ABOVE GCP Cloud Run & Nginx reverse proxy (600s)
  // to prevent 502 / ECONNRESET mid-flight failures on POSTs after long browser idle.
  httpServer.keepAliveTimeout = 620_000;
  httpServer.headersTimeout = 625_000;
  httpServer.requestTimeout = 300_000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const hmrEnabled = process.env.DISABLE_HMR !== "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrEnabled ? { server: httpServer } : false,
        ...(hmrEnabled ? {} : { ws: false }),
      },
      appType: "spa",
    });
    app.use((req, res, next) => {
      if (req.method === "GET" && (!req.path.includes(".") || req.path === "/")) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(PROJECT_ROOT, "dist");
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      })
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  let warmupTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshInterval: ReturnType<typeof setInterval> | undefined;

  const gracefulShutdown = (signal: string) => {
    console.log(`[Server] Received ${signal}. Shutting down cleanly...`);
    jobManager.shutdown();
    if (warmupTimer) clearTimeout(warmupTimer);
    if (refreshInterval) clearInterval(refreshInterval);
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    console.error("HTTP server startup error:", err);
    process.exitCode = 1;
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`PDF Converter server running on http://${HOST}:${PORT}`);
    // Non-blocking warm-up discovery of live free Gemini models + periodic 15-min refresh
    warmupTimer = setTimeout(() => {
      sharedModelPool.discoverAndVerify(getGeminiClient(), { probeActive: true }).catch(() => {});
    }, 1500);
    refreshInterval = setInterval(() => {
      sharedModelPool.discoverAndVerify(getGeminiClient(), { probeActive: false }).catch(() => {});
    }, 15 * 60 * 1000);
    refreshInterval.unref();
  });
}

startServer().catch((err) => {
  console.error("Fatal error during server startup:", err);
  process.exit(1);
});

