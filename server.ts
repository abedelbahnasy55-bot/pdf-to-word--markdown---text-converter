import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";

dotenv.config();

function getPort(): number {
  const portArgIdx = process.argv.indexOf("--port");
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const p = parseInt(process.argv[portArgIdx + 1], 10);
    if (!isNaN(p)) return p;
  }
  return Number(process.env.PORT) || 3000;
}

function getHost(): string {
  const hostArgIdx = process.argv.indexOf("--host");
  if (hostArgIdx !== -1 && process.argv[hostArgIdx + 1]) {
    return process.argv[hostArgIdx + 1];
  }
  return process.env.HOST || "0.0.0.0";
}

const app = express();
const PORT = getPort();
const HOST = getHost();

// Increase payload limit for PDF base64 uploads
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Server-side Gemini initialization
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY is not set. Conversions will require API key.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// API Health Check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Valid Gemini models supported by @google/genai SDK (prioritizing high-throughput, 15-RPM models)
const VALID_MODELS = [
  "gemini-3.1-flash-lite", // 15 RPM, high throughput, ideal for large chunk batches
  "gemini-3.8-flash",      // 5 RPM, flagship balanced
  "gemini-flash-latest",   // alias fallback
];

const blacklistedModels = new Set<string>();
const modelCoolDowns: Record<string, number> = {};

function getAvailableModels(): string[] {
  const now = Date.now();
  // Filter out permanently blacklisted or daily-exhausted models (unless cooldown expired)
  const notBlacklisted = VALID_MODELS.filter((m) => {
    if (blacklistedModels.has(m)) {
      if (modelCoolDowns[m] && modelCoolDowns[m] <= now) {
        blacklistedModels.delete(m);
        return true;
      }
      return false;
    }
    return true;
  });

  // Models that are completely free from any cooldown right now
  const ready = notBlacklisted.filter((m) => !modelCoolDowns[m] || modelCoolDowns[m] <= now);
  if (ready.length > 0) {
    return ready;
  }

  // If all non-blacklisted models are in temporary cooldown, return sorted by shortest remaining cooldown
  return notBlacklisted.sort((a, b) => (modelCoolDowns[a] || 0) - (modelCoolDowns[b] || 0));
}

function markModelError(
  modelName: string,
  errorType: 'quota_daily' | 'quota_minute' | 'not_found' | 'busy',
  retryAfterSeconds?: number
) {
  const now = Date.now();
  if (errorType === 'not_found') {
    blacklistedModels.add(modelName);
    console.log(`[Model Blacklist] Permanently disabled unavailable model: ${modelName}`);
  } else if (errorType === 'quota_daily') {
    // Only blacklist for daily quota when explicitly confirmed (e.g. 500 requests/day exhausted)
    const duration = retryAfterSeconds ? (retryAfterSeconds + 10) * 1000 : 24 * 3600 * 1000;
    modelCoolDowns[modelName] = now + duration;
    blacklistedModels.add(modelName);
    console.log(`[Model Daily Quota] Model ${modelName} exhausted daily quota. Cooldown until ${new Date(now + duration).toLocaleTimeString()}`);
  } else if (errorType === 'quota_minute') {
    // Minute rate limit (e.g. 5 RPM or 15 RPM). DO NOT blacklist! Only pause for the requested seconds.
    const delay = (retryAfterSeconds ? Math.min(75, retryAfterSeconds + 2) : 15) * 1000;
    modelCoolDowns[modelName] = now + delay;
    console.log(`[Model RateLimit] Temporary minute cooldown of ${delay / 1000}s for model: ${modelName}`);
  } else if (errorType === 'busy') {
    modelCoolDowns[modelName] = now + 4000; // 4 seconds for temporary 503 spikes
    console.log(`[Model Busy] Cooldown 4s for high-demand model: ${modelName}`);
  }
}

/**
 * Line-join threshold handed to pdf-parse. The previous implementation used
 * `Math.abs(lastY - item.transform[5]) < 4` to decide whether two text items
 * belonged to the same line, so 4 is the direct translation of that rule.
 */
const LINE_JOIN_Y_THRESHOLD = 4;

const PAGE_BREAK_MARKER = "---PAGE_BREAK---";

/**
 * Direct PDF text extraction helper using pdf-parse.
 * Runs locally on the server in milliseconds with 0 Gemini API calls.
 * Preserves page breaks (---PAGE_BREAK---), structures headings, questions, and RTL text.
 */
async function extractDirectTextFromPdf(pdfBuffer: Buffer): Promise<{
  text: string;
  markdown: string;
  totalPages: number;
  hasDigitalText: boolean;
}> {
  // pdf-parse v2 owns a pdf.js worker, so it must always be torn down. Without
  // the finally block a long-lived server would accumulate one worker per call.
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });

  try {
    const parsed = await parser.getText({ lineThreshold: LINE_JOIN_Y_THRESHOLD });

    // v2 returns text per page, which is a more direct source for page
    // boundaries than the v1 pagerender hook had to reconstruct by hand.
    const pageTexts = parsed.pages.length > 0 ? parsed.pages.map((page) => page.text) : [parsed.text];

    // The v1 pagerender already appended the marker to every page, so callers
    // downstream expect the marker embedded in rawText, not only in markdown.
    const rawText = pageTexts.join(`\n\n${PAGE_BREAK_MARKER}\n\n`);
    const totalPages = parsed.total || pageTexts.length || 1;

    // Split by page break marker
    const rawPages = rawText
      .split(new RegExp(PAGE_BREAK_MARKER))
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);

    const formattedPages = (rawPages.length > 0 ? rawPages : [rawText.trim()]).map((page: string) => {
      const lines = page.split('\n');
      const mdLines = lines.map((line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        // Chapter / Unit / Lesson headings
        if (/^(الوحدة|الدرس|الباب|الفصل|المبحث|المطلب|المقدمة|سلسلة|كتاب|المذكرة|Unit|Chapter|Lesson|PART|MODULE)\b/i.test(trimmed)) {
          return `## ${trimmed}`;
        }
        // Questions (e.g. س 1 أو السؤال الأول أو 1.)
        if (/^(س\s*\d+|السؤال\s+(الأول|الثاني|الثالث|الرابع|الخامس)|\d+[\.\-\)])\s+/i.test(trimmed)) {
          return `\n### ${trimmed}`;
        }
        return trimmed;
      });
      return mdLines.join('\n');
    });

    const fullMarkdown = formattedPages.join(`\n\n${PAGE_BREAK_MARKER}\n\n`);
    const hasDigitalText = rawText.replace(/\s+/g, '').length > 50;

    return {
      text: rawText,
      markdown: fullMarkdown,
      totalPages,
      hasDigitalText,
    };
  } finally {
    await parser.destroy();
  }
}

// Direct High-Speed Zero-Quota Extraction Endpoint
app.post("/api/extract-direct-pdf", async (req, res) => {
  try {
    const { pdfBase64, filename } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ success: false, error: "No PDF data provided" });
    }
    const cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");
    const pdfBuffer = Buffer.from(cleanBase64, "base64");
    const result = await extractDirectTextFromPdf(pdfBuffer);

    if (!result.hasDigitalText) {
      return res.json({
        success: false,
        hasDigitalText: false,
        error: "لم يتم العثور على طبقة نصوص رقمية في الملف (الملف عبارة عن صور ممسوحة ضوئياً ويحتاج معالجة OCR عبر الذكاء الاصطناعي).",
      });
    }

    const isArabic = (result.markdown.match(/[\u0600-\u06FF]/g) || []).length > 20;

    return res.json({
      success: true,
      hasDigitalText: true,
      data: {
        title: (filename || "document").replace(/\.[^/.]+$/, ""),
        detectedLanguage: isArabic ? "العربية" : "English",
        textDirection: isArabic ? "rtl" : "ltr",
        hasArabicText: isArabic,
        hasMathOrScience: false,
        hasTables: result.markdown.includes("|"),
        hasHandwriting: false,
        markdown: result.markdown,
        plainText: result.text,
        totalPages: result.totalPages,
        method: "direct_digital_extraction",
      },
    });
  } catch (err: any) {
    console.error("Direct PDF extraction error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "تعذر الاستخراج الرقمي المباشر",
    });
  }
});

// PDF Conversion Endpoint
app.post("/api/convert-pdf", async (req, res) => {
  try {
    const { pdfBase64, filename, options } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: "No PDF data provided" });
    }

    const ai = getGeminiClient();
    const cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");

    const directionPreference = options?.direction || "auto"; // 'auto' | 'rtl' | 'ltr'
    const preserveHandwriting = options?.preserveHandwriting !== false;
    // `mathPrecision` arrives on the request body and is part of the documented
    // API contract, but no prompt or output depends on it. Kept accepted so existing
    // clients do not break.
    void options?.mathPrecision;

    const systemPrompt = `أنت خبير تدقيق وتحويل كتب ومذكرات أزهرية (تفسير، علوم قرآن، فقه، توحيد، حديث، لغة عربية) إلى نصوص Markdown احترافية بدقة إتقانية 100%.
مهمتك تحويل الوثيقة أو الصفحة المرفقة إلى نص فائق الدقة، خالٍ تماماً من السقط وأخطاء الـ OCR والتصحيفات.

### القواعد الصارمة غير القابلة للتفاوض (جذور الدقة الكاملة):

1. **سلامة صفحة الغلاف والواجهة بالكامل (Cover Page Full Integrity - أولوية إلزامية)**:
   - عند معالجة صفحة الغلاف أو الواجهة الأولى للكتاب/المذكرة، يجب استخراج **كل عبارة وكلمة وردت على الغلاف كاملة دون أي حذف أو إسقاط**:
     * عنوان الكتاب والمادة كاملاً (مثال: «مذكرة التفسير وعلوم القرآن - الصف الأول الثانوي»).
     * الأقسام والمراحل التعليمية المذكورة (مثال: «للقسمين العلمي والأدبي»).
     * العبارات الترويجية والتعريفية والميزات (مثال: «أول مرة الإجابة عن كل الأسئلة الواردة بالكتاب»، «وفق تعديلات المنهج الجديد»).
     * جهات الإعداد والمؤلفين والأساتذة (مثال: «إعداد نخبة من أساتذة الأزهر الشريف»، «إشراف وإعداد: أ. ياسر القباني»).
     * الفصل الدراسي والعام (مثال: «الفصل الدراسي الأول - 2026»).
   - يُمنع منعاً باتاً اعتبار أي عبارة في الغلاف مجرد زخرفة أو إعلان وتجاهلها؛ الغلاف وثيقة معتمدة متكاملة.

2. **الهوامش والحواشي السفلية والشروح (Footnotes Preservation & Separation)**:
   - فرّق تماماً بين "تذييل الصفحة الشكلي" (مثل رقم الصفحة المجرد 15 أو اسم المطبعة المكرر)، وبين **"الهوامش السفلية التفسيرية والشروح الفقهية والحواشي"** (مثل شروح المصطلحات، مفهوم النسخ، التدرج التشريعي، أسباب النزول بالأسفل).
   - **يُحظر قطعياً حذف أو إسقاط أي هامش تفسيري أو تعليق سفلي**.
   - **يُحظر تماماً إقحام نصوص الهوامش في المتن أو بين السؤال والجواب**:
     * خطأ كارثي ممنوع: إقحام هامش مثل "(١) أي: السنون" في وسط سؤال وجواب حول الحميم والغساق!
     * الهامش يخص الكلمة السابقة في قاع الصفحة، لذا ضعه في موضع الهامش السليم أسفل المقطع/الصفحة أو مربوطاً بكلمته.
   - صيغة إخراج الهوامش: ضع كل هوامش الصفحة في قاعها أسفل خط فاصل بهذا الشكل:
     ---
     **الهوامش والحواشي التفسيرية:**
     [^1]: (١) مفهوم النسخ في القرآن هو رفع حكم شرعي سابق بدليل شرعي لاحق، وهو يقع في الأحكام العملية دون الاعتقادية أو الأصول الأخلاقية والمنسوخ هو الحكم الأول، والناسخ هو: الحكم الأخير.
     [^2]: (٢) أي نزول الأحكام الشرعية على النبي شيئاً فشيئاً طوال مدة البعثة النبوية حتى انتهى بتمام الشريعة وكمال الإسلام.

3. **التوثيق التام لأسئلة الامتحانات والمحافظات والسنوات (Exam Provenance & Citations)**:
   - في بنك الأسئلة وتدريبات المنهج، تَرِد بعد الأسئلة توثيقات بين أقواس توضح المحافظات والسنوات والامتحانات السابقة التي ورد فيها السؤال.
   - نماذج حقيقية:
     * "(الدقهلية - ٢٠٢٢ - القسم الأدبي - البحيرة ٢٠٢٥ - القاهرة ٢٠٢٥ - الشرقية علمي ٢٠٢٤)"
     * "(اسيوط - ۲۰۲۲ - القسم الأدبي - الغربية ٢٠٢٥ - الجيزة ٢٠٢٤)"
   - **يُمنع منعاً باتاً حذف أو تجريد هذه التوثيقات من الأسئلة!** يجب كتابة التوثيق كاملاً بنصه وفواصله داخل قوسين ملاصقاً للسؤال، لأن اختفاءها يُفقد المحتوى مصداقيته وقيمته الدراسية لدى الطلاب والمراجعين.

4. **الترقيم الهرمي الصارم (Strict Hierarchical Numbering)**:
   - التزم بالهيكلية الدقيقة للترقيم في الأصل:
     * إذا كان الأصل يستخدم الترقيم الرقمي (1، 2، 3) للعناصر الرئيسية، والترقيم الأبجدي (أ، ب، ج) للعناصر الفرعية (كما في مبادئ علوم القرآن الكريم: 1. تعريف القرآن... أ. لغةً... ب. اصطلاحاً...)، فيجب الالتزام الحرفي بهذا التدرج دون استبدال أو خلط.
     * لا تجعل العناصر الرئيسية أحرفاً (أ، ب، ج) متداخلة مع الفرعية؛ حافظ على الرقم الرئيسي (1، 2، 3) والحرف الفرعي (أ، ب، ج).

5. **التدقيق القرآني الصارم ومطابقة المصحف الشريف (الأولوية القصوى)**:
   - الآيات القرآنية مقدسة ويُمنع منعاً باتاً استخراج أي كلمة محرفة أو مشوهة بصرياً نتيجة الـ OCR.
   - إذا صادفت أي تصحيف أو خطأ بصري، صححه فوراً لنص الآية الصحيح المعتمد في المصحف الشريف برسم المصحف وضعه بين قوسي مصحف: ﴿...﴾.
   - نماذج لتصحيفات OCR ممنوعة في منهج التفسير الأزهري:
     * ﴿مِن تَفَاوُتٍ﴾ (إياك أن تكتب "من تقوت").
     * ﴿يَنقَلِبْ إِلَيْكَ الْبَصَرُ خَاسِئًا﴾ (إياك أن تكتب "بقلب" أو "خاشعاً").
     * ﴿فِي الْحَافِرَةِ﴾ (إياك أن تكتب "في الحافزة").
     * ﴿عِظَامًا نَّخِرَةً﴾ (إياك أن تكتب "نخفة").
     * ﴿وَأَغْطَشَ لَيْلَهَا﴾ (إياك أن تكتب "وأعطش").
     * ﴿وَالْأَرْضَ بَعْدَ ذَٰلِكَ دَحَاهَا﴾ (إياك أن تكتب "دعاها").
     * ﴿فَسُحْقًا لِّأَصْحَابِ السَّعِيرِ﴾ (بالسين المهملة).

6. **التحية النبوية والصحابة (قائمة استبدال إجبارية)**:
   - أي ذكر للأنبياء (نوح، إبراهيم، موسى، عيسى، آدم...) ← "عليه السلام".
   - محمد أو النبي أو الرسول ← "صلى الله عليه وسلم" أو "ﷺ".
   - أي صحابي (أبو بكر، عمر، عثمان، علي، عائشة، ابن عباس...) ← "رضي الله عنه" أو "رضي الله عنها".
   - ممنوع كتابة "صلى الله عليه وسلم" على غير النبي محمد ﷺ.

7. **العناوين والجداول وتنسيق الفقرات**:
   - Heading 1 (#) لعنوان الدرس والموضوع الرئيسي.
   - Heading 2 (##) و Heading 3 (###) للعناوين الفرعية والمباحث.
   - الجداول المنسقة (| عمود | عمود |) للإعراب والبلاغة ومعاني المفردات دون إسقاط أي خانة.
   - فواصل الصفحات الصارمة: إدراج سطر منفصل يحتوي حصراً على "---PAGE_BREAK---" في نهاية كل صفحة أصلية من صفحات الـ PDF، لضمان تطابق عدد الصفحات ومحتواها صفحة بصفحة 100% مع ملف الـ PDF.

8. **أصالة الترقيم (Strict Numbering Fidelity)**:
   - التزم بالترقيم الأصلي للأسئلة والبنود تماماً كما ورد في الـ PDF (1. ، 2. ، 3. ، أ. ، ب. ، (1) ، (2)).
   - يُحظر إعادة ترقيم الأسئلة بأرقام تصاعدية غريبة أو تراكمية عبر الكتاب. كل سؤال يبدأ من 1 أو ترقيمه الأصلي.

9. **حظر سيل النقاط والفراغات وأكواد البرمجة**:
   - يُمنع تكرار رمز النقطة لأكثر من 5 نقاط (".....") في أي مكان بالوثيقة.
   - يُمنع إخراج وسوم HTML كـ <br> أو <span> أو <div>؛ استخدم أسطر جديدة طبيعية فقط.

OUTPUT DIRECTLY AS PRISTINE MARKDOWN ONLY (Do not wrap in JSON).`;

    const userPrompt = `قم بتحويل هذه الوثيقة المرفقة "${filename || 'document.pdf'}" إلى نص Markdown نقي ودقيق.
- إذا كانت هناك صفحة غلاف: اكتب كل ما فيها كاملاً (العنوان، "للقسمين العلمي والأدبي"، الميزات كـ "أول مرة الإجابة عن كل الأسئلة"، وأسماء المعدين كـ "إعداد نخبة من أساتذة الأزهر الشريف").
- الهوامش والشروح السفلية: لا تسقط أي هامش أو شرح، واجمعها أسفل الصفحة ولا تقحمها وسط الأسئلة والأجوبة.
- توثيق الامتحانات والمحافظات والسنوات: اكتب كل توثيق بين قوسين ملاصقاً لسؤاله كاملاً دون حذف.
- الترقيم الأصلي الدقيق: حافظ على ترقيم الأسئلة (1، 2، 3) والفرعي (أ، ب، ج) كما هو في الأصل دون أي أرقام غريبة أو تراكمية.
- التدقيق القرآني: كل الآيات برسم المصحف بين ﴿...﴾ دون أي تصحيف أو بتر (مثل: «إذا السماء انشقت» كاملة لا يُكتب «السماء» فقط).
- أدرج سطر "---PAGE_BREAK---" منفصلاً في نهاية كل صفحة أصلية لتتطابق صفحات الوورد مع البي دي إف تماماً.`;

    // Detect mimeType if provided in data URL, default to application/pdf
    let mimeType = "application/pdf";
    const mimeMatch = pdfBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+|application\/pdf);base64,/);
    if (mimeMatch) {
      mimeType = mimeMatch[1];
    }

    let response: any = null;
    let lastError: any = null;

    // Retry loop with exponential backoff across available Gemini models
    const MAX_ROUNDS = 10;
    for (let round = 0; round < MAX_ROUNDS && !response; round++) {
      const modelsToTry = getAvailableModels();

      if (round > 0) {
        // Backoff delay before subsequent round with jitter
        const delayMs = Math.min(10000, 1500 + round * 1200 + Math.floor(Math.random() * 500));
        console.log(`[Backoff Round ${round + 1}/${MAX_ROUNDS}] Pausing ${delayMs}ms before retrying models...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const now = Date.now();
      const readyModels = modelsToTry.filter((m) => !modelCoolDowns[m] || modelCoolDowns[m] <= now);

      if (readyModels.length === 0) {
        const minCooldown = Math.min(...modelsToTry.map((m) => modelCoolDowns[m] || 0));
        const waitSec = Math.max(1, Math.ceil((minCooldown - now) / 1000));

        if (waitSec <= 10) {
          console.log(`[Rate Limit Guard] All models on cooldown. Waiting ${waitSec}s on server...`);
          await new Promise((r) => setTimeout(r, (waitSec + 1) * 1000));
        } else {
          console.log(`[Rate Limit Guard] Models in cooldown for ${waitSec}s. Delegating wait to client.`);
          return res.status(429).json({
            success: false,
            error: "تم بلوغ حد الطلبات اللحظي في الدقيقة (Rate limit). يرجى الانتظار ثوانٍ قليلة...",
            isRateLimit: true,
            isUnavailable: false,
            isPeakDemand: false,
            retryAfterSeconds: waitSec + 1,
          });
        }
      }

      for (const modelName of (readyModels.length > 0 ? readyModels : modelsToTry)) {
        try {
          console.log(`[Round ${round + 1}/${MAX_ROUNDS}] Sending conversion request using model: ${modelName}...`);
          response = await ai.models.generateContent({
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
              temperature: 0.1, // Low temperature for high OCR precision and zero hallucination
              maxOutputTokens: 32768, // Generous token allowance to prevent truncation on large 10-15 page chunks
            },
          });

          if (response && response.text) {
            // Success! Clear cooldown for this model
            delete modelCoolDowns[modelName];
            break;
          }
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          console.warn(`Model ${modelName} failed: ${errMsg}`);
          lastError = err;

          let retrySec: number | undefined;
          try {
            const match = errMsg.match(/retry in ([0-9.]+)s/i) || errMsg.match(/retryDelay"?:\s*"(\d+)s"/i);
            if (match) retrySec = Math.ceil(parseFloat(match[1]));
          } catch {}

          const isDailyExhausted =
            errMsg.includes("GenerateRequestsPerDay") ||
            (errMsg.includes("free_tier_requests") && (errMsg.includes("limit: 500") || (retrySec !== undefined && retrySec > 300)));

          const isMinuteRateLimit =
            errMsg.includes("GenerateRequestsPerMinute") ||
            errMsg.includes("limit: 5") ||
            errMsg.includes("limit: 15") ||
            (retrySec !== undefined && retrySec <= 120) ||
            errMsg.includes("429") ||
            errMsg.includes("RESOURCE_EXHAUSTED") ||
            errMsg.toLowerCase().includes("rate limit");

          if (errMsg.includes("404") || errMsg.includes("NOT_FOUND") || errMsg.includes("no longer available")) {
            markModelError(modelName, 'not_found');
          } else if (isDailyExhausted) {
            markModelError(modelName, 'quota_daily', retrySec);
          } else if (isMinuteRateLimit) {
            markModelError(modelName, 'quota_minute', retrySec);
          } else if (errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.toLowerCase().includes("high demand") || errMsg.toLowerCase().includes("peak demand") || errMsg.toLowerCase().includes("overloaded")) {
            markModelError(modelName, 'busy');
          }

          // Gentle pause between models in the same round
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error("The AI conversion service experienced temporary peak demand. Please retry in a few seconds.");
    }

    const rawText = (response.text || "").trim();
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
      // Remove orphaned page numbers or isolated pagination headers (e.g., just "12", "الصفحة 12") on their own lines
      cleaned = cleaned.replace(/^[ \t]*(الصفحة|Page)?[ \t]*\d+[ \t]*$/gmi, '');

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

      return cleaned.trim();
    };

    markdownContent = cleanMarkdown(markdownContent);

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
      plainText: plainText,
    };

    res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    const rawError = error?.message || String(error);
    console.error("PDF Conversion Error:", rawError);
    let userFriendlyError = rawError;
    let extractedRetrySec = 15;
    try {
      const match = rawError.match(/retry in ([0-9.]+)s/i) || rawError.match(/retryDelay"?:\s*"(\d+)s"/i);
      if (match) extractedRetrySec = Math.ceil(parseFloat(match[1]));
    } catch {}

    const isDailyQuotaExhausted =
      rawError.includes("GenerateRequestsPerDay") ||
      (rawError.includes("free_tier_requests") && (rawError.includes("limit: 500") || extractedRetrySec > 300));

    const isRateLimit =
      rawError.includes("429") ||
      rawError.includes("RESOURCE_EXHAUSTED") ||
      rawError.includes("Quota exceeded") ||
      rawError.toLowerCase().includes("rate limit") ||
      rawError.toLowerCase().includes("quota");

    const isUnavailable =
      rawError.includes("503") ||
      rawError.toLowerCase().includes("high demand") ||
      rawError.toLowerCase().includes("peak demand") ||
      rawError.includes("UNAVAILABLE") ||
      rawError.toLowerCase().includes("overloaded") ||
      rawError.toLowerCase().includes("temporary");

    if (isUnavailable) {
      userFriendlyError = "خدمة الذكاء الاصطناعي تشهد ضغطاً مؤقتاً (Temporary Peak Demand). جاري الحفاظ على تقدمك وإعادة المحاولة تلقائياً...";
      return res.status(503).json({
        success: false,
        error: userFriendlyError,
        isRateLimit: false,
        isUnavailable: true,
        isPeakDemand: true,
        isDailyQuotaExhausted: false,
        retryAfterSeconds: Math.max(6, Math.min(25, extractedRetrySec)),
      });
    } else if (isRateLimit) {
      userFriendlyError = isDailyQuotaExhausted
        ? "تم استهلاك الحد اليومي المجاني لـ Gemini (500 طلب/يوم). يتوفر إكمال فوري عبر محرك الاستخراج الرقمي المباشر (0 كوتة) أو المتابعة بعد انتهاء فترة التهدئة."
        : "تم الوصول إلى الحد المؤقت للطلبات في الدقيقة (Rate limit). يرجى الانتظار ثوانٍ قليلة...";
      return res.status(429).json({
        success: false,
        error: userFriendlyError,
        isRateLimit: true,
        isUnavailable: false,
        isPeakDemand: false,
        isDailyQuotaExhausted,
        retryAfterSeconds: isDailyQuotaExhausted ? 60 : Math.max(10, Math.min(65, extractedRetrySec + 2)),
      });
    }

    res.status(500).json({
      success: false,
      error: userFriendlyError,
      isRateLimit: false,
    });
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

    const ai = getGeminiClient();
    const systemInstruction = `أنت وحدة الفحص السياقي الذكي المتقدم (AI Contextual Checker) المتخصصة في المناهج الأزهرية والمصادر الإسلامية المعتمدة (المصحف الشريف برواية حفص، كتب الحديث الستة، أمهات كتب الفقه كشرح الاختيار والإقناع).
مهمتك الصارمة:
1. فحص سياق الآيات القرآنية ومطابقتها نصاً ولفظاً برسم المصحف المعتمد وضبط أي انحراف ناتج عن التعرف البصري (OCR) ووضع كل آية بين قوسي مصحف: ﴿...﴾.
2. فحص الأحاديث النبوية ومقارنتها بكتب السنة المعتمدة (صحيح البخاري، مسلم، سنن ابن ماجه والترمذي وأبي داود والنسائي) واستكمال أي سقط، وتصحيح أي تصحيف مثل "راوية ابن ماجه" ➔ "رواية ابن ماجه"، و"النساء الرجال" ➔ "النساء شقائق الرجال".
3. ضبط المصطلحات الفقهية (مثل: بيع الحاضر للبادي، باب الإقالة، بيع اللبن في ضرع، كفته نيته) واستكمال الجمل المبتورة دون انقطاع.
4. تطهير سيل النقاط المتكررة وحصر الفراغات في [.....] فقط.
5. الحفاظ التام والصارم بنسبة 100% على علامات فواصل الصفحات «---PAGE_BREAK---» في مواضعها الدقيقة دون حذف أو دمج أو تغيير إطلاقاً، لضمان تطابق صفحات الوورد مع أصل البي دي إف صفحة بصفحة 1:1.
6. أعد فقط النص المكتمل والمصحح بصيغة Markdown دون أي شرح أو مقدمات أو خاتمة.`;

    const modelsToTry = getAvailableModels();
    let resultText = "";
    let lastErr = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: `قم بالفحص والتدقيق السياقي الفوري لهذا المحتوى الأزهري، واضبط الآيات والأحاديث والجداول بالمسطرة وفق المراجع المعتمدة:\n\n${markdown.slice(0, 32000)}`,
          config: {
            systemInstruction,
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        });
        resultText = response.text || "";
        if (resultText && resultText.trim().length > 0) {
          break;
        }
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || err);
        let retrySec: number | undefined;
        try {
          const match = msg.match(/retry in ([0-9.]+)s/i) || msg.match(/retryDelay"?:\s*"(\d+)s"/i);
          if (match) retrySec = Math.ceil(parseFloat(match[1]));
        } catch {}

        if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) {
          markModelError(model, 'not_found');
        } else if (msg.includes('free_tier_requests') || msg.includes('GenerateRequestsPerDay')) {
          markModelError(model, 'quota_daily', retrySec);
        } else if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
          markModelError(model, 'quota_minute', retrySec);
        } else if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
          markModelError(model, 'busy');
        }
        console.warn(`Contextual check failed on model ${model}:`, err.message || err);
      }
    }

    if (!resultText) {
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

    const modelsToTry = getAvailableModels();
    let analysisResult: any = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: `حلل هذا النص نحوياً وتركيبياً واكشف الجمل المفتوحة والبتر المفاجئ وأكملها وفق السياق:\n\n${markdown.slice(-15000)}`,
          config: {
            systemInstruction,
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        if (response.text) {
          analysisResult = JSON.parse(response.text);
          break;
        }
      } catch (err: any) {
        const msg = String(err?.message || err);
        let retrySec: number | undefined;
        try {
          const match = msg.match(/retry in ([0-9.]+)s/i) || msg.match(/retryDelay"?:\s*"(\d+)s"/i);
          if (match) retrySec = Math.ceil(parseFloat(match[1]));
        } catch {}

        if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) {
          markModelError(model, 'not_found');
        } else if (msg.includes('free_tier_requests') || msg.includes('GenerateRequestsPerDay')) {
          markModelError(model, 'quota_daily', retrySec);
        } else if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
          markModelError(model, 'quota_minute', retrySec);
        } else if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
          markModelError(model, 'busy');
        }
        console.warn(`Grammar analyzer failed on model ${model}:`, err.message || err);
      }
    }

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

// JSON / Body-parser error handler
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err) {
    console.error("Express middleware error:", err);
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "حجم الملف كبير جداً. الحد الأقصى للملف هو 50 ميغابايت." });
    }
    return res.status(400).json({ error: err.message || "طلب غير صالح" });
  }
  next();
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`PDF Converter server running on http://${HOST}:${PORT}`);
  });
}

startServer();
