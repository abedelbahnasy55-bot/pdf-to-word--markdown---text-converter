import type { Express } from "express";
import { GoogleGenAI, Type } from "@google/genai";
import {
  buildDeterministicPlan,
  deterministicExtractFromChunk,
  applyDeterministicRefinement,
  type CompilationPlan,
  type CompilerSourceCatalogItem,
  type CompilationDirective,
  type RepetitionPolicy,
} from "../shared/smartCompilerCore.js";
import {
  computeDeterministicTextHash,
  rankSemanticPassagesHybrid,
  type SearchablePassage,
} from "../shared/semanticSearchCore.js";
import { sharedModelPool } from "./modelPool.js";

const EMBEDDING_MODEL = "gemini-embedding-2";
const MAX_EMBEDDING_CACHE = 3000;
const semanticEmbeddingCache = new Map<string, number[]>();

function rememberEmbedding(key: string, vec: number[]) {
  if (!key || !Array.isArray(vec) || vec.length === 0) return;
  if (semanticEmbeddingCache.size >= MAX_EMBEDDING_CACHE) {
    const oldestKey = semanticEmbeddingCache.keys().next().value;
    if (oldestKey) semanticEmbeddingCache.delete(oldestKey);
  }
  semanticEmbeddingCache.set(key, vec);
}

async function embedWithTimeout(
  ai: GoogleGenAI,
  contents: string | string[],
  timeoutMs: number = 20000
): Promise<number[][]> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new Error(`Embedding timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    const response = await Promise.race([
      ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents,
      }),
      timeoutPromise,
    ]);
    const list = response?.embeddings || [];
    return list.map((e) => (Array.isArray(e?.values) ? e.values : []));
  } finally {
    if (handle) clearTimeout(handle);
  }
}

async function generateBatchEmbeddings(
  ai: GoogleGenAI,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];
  try {
    const vectors = await embedWithTimeout(ai, texts, 20000);
    if (vectors.length === texts.length && vectors.every((v) => v.length > 0)) {
      return vectors;
    }
  } catch (batchErr: any) {
    // Some gateways restrict multi-content embedContent calls; fallback gracefully to bounded concurrent single calls
    if (texts.length === 1) throw batchErr;
  }

  const results: number[][] = new Array(texts.length);
  const CONCURRENCY = 6;
  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const slice = texts.slice(i, i + CONCURRENCY);
    const sliceVectors = await Promise.all(
      slice.map(async (item) => {
        const res = await embedWithTimeout(ai, item, 15000);
        return res[0] || [];
      })
    );
    for (let j = 0; j < sliceVectors.length; j++) {
      results[i + j] = sliceVectors[j];
    }
  }
  return results;
}

async function generateWithTimeout(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0],
  timeoutMs: number = 35000
) {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new Error(`Compiler timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([ai.models.generateContent(params), timeoutPromise]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}

async function runCompilerModelCascade(
  ai: GoogleGenAI,
  buildParams: (model: string) => Parameters<GoogleGenAI["models"]["generateContent"]>[0],
  timeoutMs: number = 35000
): Promise<{ text: string; modelUsed: string }> {
  let lastError: unknown = null;
  const modelsToTry = sharedModelPool.getCandidateModels();
  for (const model of modelsToTry) {
    try {
      const response = await generateWithTimeout(ai, buildParams(model), timeoutMs);
      const text = response?.text || "";
      if (text.trim().length > 0) {
        sharedModelPool.recordSuccess(model);
        return { text, modelUsed: model };
      }
    } catch (err) {
      lastError = err;
      sharedModelPool.classifyAndRecordError(model, err);
      console.warn(`[SmartCompiler] Model ${model} failed:`, (err as any)?.message || err);
    }
  }
  throw lastError || new Error("جميع نماذج التجميع مشغولة مؤقتاً.");
}

function countQuranVerses(text: string): number {
  return (text.match(/﴿[^﴾]+﴾/g) || []).length;
}

export function registerSmartCompilerRoutes(
  app: Express,
  getGeminiClient: () => GoogleGenAI
) {
  // 1. AI Compilation Planner Route
  app.post("/api/compiler/plan", async (req, res) => {
    try {
      const { instruction, repetitionPolicy, sources } = req.body as {
        instruction?: string;
        repetitionPolicy?: RepetitionPolicy;
        sources?: CompilerSourceCatalogItem[];
      };

      if (!instruction || !Array.isArray(sources) || sources.length === 0) {
        return res.status(400).json({
          success: false,
          error: "يرجى إدخال أمر التجميع واختيار مصدر واحد على الأقل.",
        });
      }

      const policy: RepetitionPolicy = repetitionPolicy || "preserve_across_exams";
      const deterministicFallback = buildDeterministicPlan(instruction, policy, sources);

      const catalogSummary = sources.map((s) => ({
        id: s.id,
        title: s.title,
        fileName: s.fileName,
        totalPages: s.totalPages,
        wordCount: s.wordCount,
        detectedYears: s.detectedYears,
        outlineHeadings: s.outline.slice(0, 20).map((o) => ({
          heading: o.heading,
          page: o.pageNumber,
          years: o.years,
          hasQuestions: o.hasQuestions,
        })),
        sampleSnippet: s.sampleSnippet.slice(0, 400),
      }));

      const systemInstruction = `أنت المهندس الأكاديمي المسؤول عن تخطيط وتنظيم استخراج وتجميع الكتب والامتحانات (Document & Compilation Planner).
يدعم النظام ملفاً واحداً (مثل استخراج أسئلة كتاب مرتبة حسب الدروس والفهرس مع تضمين دروس واستبعاد دروس أخرى) أو عدة ملفات معاً.
مهمتك تحليل طلب المستخدم وتفاصيل المصادر وإنتاج خطة دقيقة بصيغة JSON:
قواعد أساسية صارمة:
1. organizationMode: اختر "by_book_order" إذا كان المستخدم يريد الأسئلة أو المحتوى مرتباً حسب ترتيب الدروس أو الفهرس في الكتاب أو عند العمل على كتاب دروس واحد؛ واختر "by_exam_year" للامتحانات السنوية، و "by_source" للتجميع حسب الكتاب، و "unified_bank" لبنك الأسئلة المدمج.
2. لكل مصدر في sourceDirectives: حدد extractionMode بدقة (questions_only لاستخلاص الأسئلة فقط دون الشرح، exams_only للامتحانات، specific_sections لدروس محددة، answers_only للإجابات، full_content للمحتوى كاملاً).
3. الفلترة بالدروس: ضع الدروس أو الأبواب المطلوبة فقط في targetUnits (إن حددها)، وضع الدروس أو الأبواب التي طلب المستخدم تركها أو استبعادها (مثل "وسيب درس كذا") في excludeUnits!
4. احترم سياسة التكرار "${policy}": لا تدمج الأسئلة المتكررة بين سنوات امتحان مختلفة إلا إذا طُلب بنك موحد بدون تكرار.
5. أرجع جميع معرفات sourceId الموجودة في الكتالوج مطابقة 100% دون تغيير.`;

      try {
        const ai = getGeminiClient();
        const { text, modelUsed } = await runCompilerModelCascade(
          ai,
          (model) => ({
            model,
            contents: `طلب المستخدم:\n"${instruction}"\n\nسياسة التكرار المختارة من الواجهة: ${policy}\n\nكتالوج المصادر:\n${JSON.stringify(catalogSummary, null, 2)}`,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  compilationTitle: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  organizationMode: { type: Type.STRING },
                  yearSortOrder: { type: Type.STRING },
                  answersPlacement: { type: Type.STRING },
                  effectiveRepetitionPolicy: { type: Type.STRING },
                  includeTableOfContents: { type: Type.BOOLEAN },
                  unifyQuestionNumbering: { type: Type.BOOLEAN },
                  detectedYears: { type: Type.ARRAY, items: { type: Type.STRING } },
                  assistantSummary: { type: Type.STRING },
                  sourceDirectives: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        sourceId: { type: Type.STRING },
                        sourceTitle: { type: Type.STRING },
                        include: { type: Type.BOOLEAN },
                        extractionMode: { type: Type.STRING },
                        targetKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                        targetYears: { type: Type.ARRAY, items: { type: Type.STRING } },
                        targetUnits: { type: Type.ARRAY, items: { type: Type.STRING } },
                        excludeUnits: { type: Type.ARRAY, items: { type: Type.STRING } },
                        rationale: { type: Type.STRING },
                      },
                      required: ["sourceId", "include", "extractionMode", "rationale"],
                    },
                  },
                },
                required: [
                  "compilationTitle",
                  "organizationMode",
                  "answersPlacement",
                  "effectiveRepetitionPolicy",
                  "assistantSummary",
                  "sourceDirectives",
                ],
              },
            },
          }),
          25000
        );

        const parsed = JSON.parse(text) as Partial<CompilationPlan>;
        // Merge safely with deterministic baseline to guarantee valid IDs and enums
        const validOrgModes = new Set([
          "by_book_order",
          "by_exam_year",
          "by_source",
          "by_topic",
          "unified_bank",
        ]);
        const validAnsModes = new Set(["inline", "appendix", "exclude"]);
        const validRepModes = new Set([
          "preserve_across_exams",
          "preserve_with_frequency_note",
          "deduplicate_bank",
        ]);
        const validExModes = new Set([
          "questions_only",
          "exams_only",
          "full_content",
          "specific_sections",
          "answers_only",
        ]);

        const directiveMap = new Map<string, CompilationDirective>();
        for (const d of parsed.sourceDirectives || []) {
          if (d && d.sourceId) {
            directiveMap.set(d.sourceId, {
              sourceId: d.sourceId,
              sourceTitle: d.sourceTitle || d.sourceId,
              include: Boolean(d.include),
              extractionMode: validExModes.has(d.extractionMode) ? d.extractionMode : "full_content",
              targetKeywords: Array.isArray(d.targetKeywords) ? d.targetKeywords : [],
              targetYears: Array.isArray(d.targetYears) ? d.targetYears : [],
              targetUnits: Array.isArray(d.targetUnits) ? d.targetUnits : [],
              excludeUnits: Array.isArray(d.excludeUnits) ? d.excludeUnits : [],
              rationale: d.rationale || "",
            });
          }
        }

        const mergedDirectives = deterministicFallback.sourceDirectives.map((def) => {
          const matched = directiveMap.get(def.sourceId);
          return matched ? { ...def, ...matched, sourceTitle: def.sourceTitle } : def;
        });

        const finalPlan: CompilationPlan = {
          compilationTitle: parsed.compilationTitle || deterministicFallback.compilationTitle,
          subtitle: parsed.subtitle || deterministicFallback.subtitle,
          organizationMode: validOrgModes.has(parsed.organizationMode || "")
            ? (parsed.organizationMode as CompilationPlan["organizationMode"])
            : deterministicFallback.organizationMode,
          yearSortOrder: parsed.yearSortOrder === "asc" ? "asc" : deterministicFallback.yearSortOrder,
          answersPlacement: validAnsModes.has(parsed.answersPlacement || "")
            ? (parsed.answersPlacement as CompilationPlan["answersPlacement"])
            : deterministicFallback.answersPlacement,
          effectiveRepetitionPolicy: validRepModes.has(parsed.effectiveRepetitionPolicy || "")
            ? (parsed.effectiveRepetitionPolicy as RepetitionPolicy)
            : policy,
          includeTableOfContents:
            typeof parsed.includeTableOfContents === "boolean"
              ? parsed.includeTableOfContents
              : true,
          unifyQuestionNumbering:
            typeof parsed.unifyQuestionNumbering === "boolean"
              ? parsed.unifyQuestionNumbering
              : deterministicFallback.unifyQuestionNumbering,
          detectedYears:
            Array.isArray(parsed.detectedYears) && parsed.detectedYears.length > 0
              ? parsed.detectedYears
              : deterministicFallback.detectedYears,
          sourceDirectives: mergedDirectives,
          assistantSummary: parsed.assistantSummary || deterministicFallback.assistantSummary,
          usedFallback: false,
        };

        return res.json({ success: true, data: finalPlan, modelUsed });
      } catch (aiErr: any) {
        console.warn("[SmartCompiler /plan] Using deterministic fallback:", aiErr?.message || aiErr);
        return res.json({ success: true, data: deterministicFallback, modelUsed: "deterministic-fallback" });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || "تعذر إنشاء خطة التجميع.",
      });
    }
  });

  // 2. Selective Verbatim Source Chunk Extraction Route
  app.post("/api/compiler/extract", async (req, res) => {
    try {
      const {
        sourceTitle,
        chunkIndex = 0,
        contextHeader = "",
        chunkMarkdown,
        directive,
        instruction,
      } = req.body as {
        sourceTitle?: string;
        chunkIndex?: number;
        contextHeader?: string;
        chunkMarkdown?: string;
        directive?: CompilationDirective;
        instruction?: string;
      };

      if (!chunkMarkdown || !directive) {
        return res.status(400).json({ success: false, error: "محتوى الجزء والتوجيه مطلوبان." });
      }

      if (!directive.include) {
        return res.json({
          success: true,
          data: {
            sourceId: directive.sourceId,
            sourceTitle: sourceTitle || directive.sourceTitle,
            chunkIndex,
            sectionLabel: contextHeader || sourceTitle || directive.sourceTitle,
            markdown: "",
            itemsCount: 0,
          },
        });
      }

      // Fast path when user wants full content of this source without selective slicing
      const isSimpleFullInclude =
        directive.extractionMode === "full_content" &&
        directive.targetUnits.length === 0 &&
        (!directive.excludeUnits || directive.excludeUnits.length === 0) &&
        directive.targetYears.length === 0;

      if (isSimpleFullInclude) {
        const directBlock = deterministicExtractFromChunk(
          chunkMarkdown,
          directive,
          sourceTitle || directive.sourceTitle,
          chunkIndex,
          contextHeader
        );
        return res.json({ success: true, data: directBlock, modelUsed: "verbatim-direct" });
      }

      const fallbackBlock = deterministicExtractFromChunk(
        chunkMarkdown,
        directive,
        sourceTitle || directive.sourceTitle,
        chunkIndex,
        contextHeader
      );

      const modeInstructions: Record<string, string> = {
        questions_only:
          "استخرج الأسئلة والتدريبات والاختبارات فقط (وإجاباتها المرفقة بها إن وُجدت في النص) مع الحفاظ الدقيق على عنوان كل درس/باب (##) فوق أسئلته وبالترتيب الأصلي في الكتاب. احذف الشرح النظري الخالص الذي لا يحتوي على أسئلة، ولا تختصر صيغة أي سؤال إطلاقاً.",
        exams_only:
          "استخرج نماذج الامتحانات وبنود الأسئلة وترويسات السنوات والأدوار والأقسام (علمي/أدبي) كاملةً دون حذف أي فرع من السؤال.",
        specific_sections: `استخرج فقط الأقسام والدروس المطابقة لهذه الأهداف: ${directive.targetUnits.join("، ") || directive.targetKeywords.join("، ") || "المحتوى المطلوب"}.`,
        answers_only: "استخرج نماذج الإجابات والحلول فقط مع رقم كل سؤال وإجابته.",
        full_content: "استخرج المحتوى المطابق بالكامل بأمانة تامة.",
      };

      const excludeInstruction =
        directive.excludeUnits && directive.excludeUnits.length > 0
          ? `الدروس/الأبواب المستبعدة (يُمنع تضمينها تماماً): ${directive.excludeUnits.join("، ")}`
          : "لا توجد دروس مستبعدة";

      const includeInstruction =
        directive.targetUnits && directive.targetUnits.length > 0
          ? `الدروس/الأبواب المطلوبة حصراً: ${directive.targetUnits.join("، ")}`
          : "جميع الدروس غير المستبعدة";

      const systemInstruction = `أنت أداة استخلاص نصي أمين (Verbatim Extractor) للتراث والمناهج والامتحانات العربية.
المصدر الحالي: "${sourceTitle || directive.sourceTitle}"
السياق الموضعي للجزء: "${contextHeader}"
نمط الاستخلاص المطلوب (${directive.extractionMode}): ${modeInstructions[directive.extractionMode] || ""}
${includeInstruction}
${excludeInstruction}
السنوات المستهدفة إن وجدت: ${directive.targetYears.length > 0 ? directive.targetYears.join("، ") : "كل السنوات المتاحة"}

قواعد الأمانة النصية الصارمة (مخالفتها مرفوضة):
1. يُمنع منعاً باتاً تلخيص الأسئلة أو إعادة صياغتها أو تأليف أسئلة غير موجودة في النص المرفق.
2. يُمنع منعاً باتاً تعديل أو اختصار أي آية قرآنية محصورة بين ﴿...﴾ أو أي حديث نبوي أو متن شرعي.
3. احتفظ بالعناوين والتسلسل الأصلي للدروس والأبواب والسنوات (## عنوان الدرس / ## امتحان ...) بصيغة Markdown واضحة قبل أسئلة كل درس، ولا تُدرج أي درس ورد في قائمة الاستبعاد.
4. حافظ بدقة على جميع الوسوم والتنسيقات الدقيقة داخل النص مثل الكلمات المسطّر تحتها («<u>...</u>» خاصة في أسئلة الإعراب والضبط مثل «أعرب ما تحته خط»)، و«<mark>...</mark>» و«<sup>» و«<sub>» و«~~...~~» وفراغات الإكمال («___» أو «.....»).
5. لا تحذف سؤالاً بحجة تشابهه مع سؤال آخر؛ أخرج كل ما يطابق الطلب داخل هذا الجزء كما ورد.
6. إذا لم يحتوِ هذا الجزء على أي محتوى مطابق للطلب، أرجع hasMatch: false و extractedMarkdown فارغاً.`;

      try {
        const ai = getGeminiClient();
        const { text, modelUsed } = await runCompilerModelCascade(
          ai,
          (model) => ({
            model,
            contents: `تعليمات المستخدم العامة: "${instruction || ""}"\n\nنص الجزء المراد الاستخلاص الانتقائي منه:\n\n${chunkMarkdown.slice(0, 26000)}`,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  hasMatch: { type: Type.BOOLEAN },
                  sectionLabel: { type: Type.STRING },
                  yearHint: { type: Type.STRING },
                  itemsCount: { type: Type.NUMBER },
                  extractedMarkdown: { type: Type.STRING },
                },
                required: ["hasMatch", "extractedMarkdown", "itemsCount"],
              },
            },
          }),
          35000
        );

        const parsed = JSON.parse(text) as {
          hasMatch: boolean;
          sectionLabel?: string;
          yearHint?: string;
          itemsCount?: number;
          extractedMarkdown: string;
        };

        const aiMd = (parsed.extractedMarkdown || "").trim();
        // Safeguard: If AI returned suspiciously empty despite strong deterministic match, keep fallback
        if (!parsed.hasMatch && fallbackBlock.itemsCount >= 2 && fallbackBlock.markdown.length > 200) {
          return res.json({ success: true, data: fallbackBlock, modelUsed: "deterministic-guard" });
        }

        return res.json({
          success: true,
          data: {
            sourceId: directive.sourceId,
            sourceTitle: sourceTitle || directive.sourceTitle,
            chunkIndex,
            sectionLabel: parsed.sectionLabel || fallbackBlock.sectionLabel,
            yearHint: parsed.yearHint || fallbackBlock.yearHint,
            markdown: parsed.hasMatch ? aiMd : "",
            itemsCount: parsed.hasMatch ? parsed.itemsCount || 1 : 0,
          },
          modelUsed,
        });
      } catch (aiErr: any) {
        console.warn("[SmartCompiler /extract] Using deterministic fallback:", aiErr?.message || aiErr);
        return res.json({ success: true, data: fallbackBlock, modelUsed: "deterministic-fallback" });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || "تعذر استخلاص المقطع.",
      });
    }
  });

  // 3. Interactive Conversational Refinement Route (Live Edits Before Word Export)
  app.post("/api/compiler/refine", async (req, res) => {
    try {
      const { currentMarkdown, editRequest, compilationTitle } = req.body as {
        currentMarkdown?: string;
        editRequest?: string;
        compilationTitle?: string;
      };

      if (!currentMarkdown || !editRequest) {
        return res.status(400).json({
          success: false,
          error: "المستند الحالي ونص التعديل المطلوب مطلوبان.",
        });
      }

      // First try exact structural deterministic handlers (works safely on 100-page anthologies!)
      const detResult = applyDeterministicRefinement(currentMarkdown, editRequest);
      if (detResult.applied) {
        return res.json({
          success: true,
          data: {
            updatedMarkdown: detResult.updatedMarkdown,
            assistantReply: detResult.description,
            mode: "deterministic-structural",
          },
        });
      }

      // Guard against truncating giant compilations in single LLM output
      const MAX_SINGLE_PASS_CHARS = 24000;
      if (currentMarkdown.length > MAX_SINGLE_PASS_CHARS) {
        // Section-by-section refinement along ---PAGE_BREAK--- boundaries
        const sections = currentMarkdown.split(/\n*---PAGE_BREAK---\n*/);
        const updatedSections: string[] = [];
        const ai = getGeminiClient();

        const systemInstruction = `أنت محرر أكاديمي محترف. طبّق التعديل المطلوب بدقة على هذا القسم من التجميعة "${compilationTitle || ""}".
قواعد صارمة:
1. لا تحذف أو تختصر أي سؤال أو فقرة إلا إذا طلب المستخدم حذفها صراحةً.
2. حافظ على جميع الآيات القرآنية ﴿...﴾ بنفس الرسم العثماني دون تغيير حرف واحد، وكذلك وسوم التسطير («<u>...</u>») والتمييز («<mark>...</mark>») والشطب («~~...~~») والأسس («<sup>»/«<sub>») وفراغات الإكمال («___»).
3. أرجع Markdown النظيف والمنسق لهذا القسم فقط دون شروحات إضافية.`;

        for (const sec of sections) {
          const trimmed = sec.trim();
          if (!trimmed || /^##\s+فهرس المحتويات/.test(trimmed)) {
            updatedSections.push(trimmed);
            continue;
          }
          try {
            const { text } = await runCompilerModelCascade(
              ai,
              (model) => ({
                model,
                contents: `التعديل المطلوب على التجميعة: "${editRequest}"\n\nمحتوى القسم:\n${trimmed}`,
                config: { systemInstruction },
              }),
              30000
            );
            const cleanOut = text.replace(/^```(?:markdown)?\n?/i, "").replace(/\n?```$/i, "").trim();
            const inputVerses = countQuranVerses(trimmed);
            const outputVerses = countQuranVerses(cleanOut);
            const isDeleteRequest = /(?:احذف|امسح|استبعد|أزل)/.test(editRequest);

            if (
              cleanOut.length > 0 &&
              (isDeleteRequest || cleanOut.length >= trimmed.length * 0.72) &&
              outputVerses >= inputVerses
            ) {
              updatedSections.push(cleanOut);
            } else {
              updatedSections.push(trimmed);
            }
          } catch {
            updatedSections.push(trimmed);
          }
        }

        return res.json({
          success: true,
          data: {
            updatedMarkdown: updatedSections.filter(Boolean).join("\n\n---PAGE_BREAK---\n\n"),
            assistantReply: `تم تنفيذ التعديل المطلوب («${editRequest}») عبر أقسام التجميعة مع الحفاظ الكامل على سلامة النصوص والآيات.`,
            mode: "sectioned-ai-refine",
          },
        });
      }

      // Standard single-pass AI refinement for documents <= 24k chars
      try {
        const ai = getGeminiClient();
        const systemInstruction = `أنت محرر أكاديمي ومُنسّق كتب احترافي. نفّذ طلب التعديل التفاعلي التالي على مستند التجميعة بصيغة Markdown.
قواعد صارمة:
1. حافظ على فواصل الصفحات «---PAGE_BREAK---» بين الأقسام الرئيسية والامتحانات.
2. حافظ على سلامة الآيات القرآنية ﴿...﴾ والأحاديث والنصوص الشرعية بنسبة 100%، واحتفظ بوسوم التسطير («<u>...</u>») وفراغات الإكمال («___») والتنسيقات الدقيقة.
3. لا تقم بتلخيص الأسئلة أو بترها؛ أعد المستند الكامل بعد التعديل في formattedMarkdown مع ملخص عربي موجز لما تم في summaryReply.`;

        const { text, modelUsed } = await runCompilerModelCascade(
          ai,
          (model) => ({
            model,
            contents: `طلب التعديل من المستخدم:\n"${editRequest}"\n\nالمستند الحالي:\n${currentMarkdown}`,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  formattedMarkdown: { type: Type.STRING },
                  summaryReply: { type: Type.STRING },
                },
                required: ["formattedMarkdown", "summaryReply"],
              },
            },
          }),
          35000
        );

        const parsed = JSON.parse(text) as { formattedMarkdown: string; summaryReply: string };
        const candidate = (parsed.formattedMarkdown || "").trim();
        const isDeleteRequest = /(?:احذف|امسح|استبعد|أزل)/.test(editRequest);

        if (
          !candidate ||
          (!isDeleteRequest && candidate.length < currentMarkdown.length * 0.65) ||
          countQuranVerses(candidate) < countQuranVerses(currentMarkdown)
        ) {
          return res.json({
            success: true,
            data: {
              updatedMarkdown: currentMarkdown,
              assistantReply:
                "تم تعليق التعديل الآلي لحماية المستند من أي بتر محتمل أو تغيّر في الآيات القرآنية. يمكنك صياغة تعديل أدق أو استخدام التحرير المباشر.",
              mode: "safety-preserved",
            },
          });
        }

        return res.json({
          success: true,
          data: {
            updatedMarkdown: candidate,
            assistantReply: parsed.summaryReply || "تم تنفيذ التعديل المطلوب وتحديث المعاينة.",
            mode: modelUsed,
          },
        });
      } catch (aiErr: any) {
        return res.json({
          success: true,
          data: {
            updatedMarkdown: currentMarkdown,
            assistantReply: `تعذر تطبيق التعديل التلقائي حالياً (${aiErr?.message || "انقطاع مؤقت"}). يمكنك تعديل النص مباشرة من تبويب «تحرير يدوي سريع» أو طلب إعادة الترتيب/نقل الإجابات.`,
            mode: "unavailable-fallback",
          },
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || "تعذر تطبيق التعديل.",
      });
    }
  });

  // 4. Conversational Document Q&A / TOC Inspector Route
  app.post("/api/compiler/ask", async (req, res) => {
    try {
      const { question, sources } = req.body as {
        question?: string;
        sources?: Array<{
          id: string;
          title: string;
          totalPages: number;
          wordCount: number;
          detectedYears: string[];
          outline: Array<{ heading: string; pageNumber: number; hasQuestions: boolean }>;
          relevantExcerpts?: string;
        }>;
      };

      if (!question || !Array.isArray(sources) || sources.length === 0) {
        return res.status(400).json({
          success: false,
          error: "السؤال والمصادر المختارة مطلوبان.",
        });
      }

      const fallbackLines = sources.map((s) => {
        const outlinePreview = s.outline
          .slice(0, 15)
          .map(
            (o, idx) =>
              `  ${idx + 1}. ${o.heading} (ص ${o.pageNumber}${o.hasQuestions ? " · أسئلة" : ""})`
          )
          .join("\n");
        return `• **${s.title}** (${s.totalPages} صفحة · ${s.wordCount} كلمة${
          s.detectedYears.length > 0 ? ` · سنوات: ${s.detectedYears.join("، ")}` : ""
        })\n${outlinePreview || "  (لا توجد عناوين فرعية مفهرسة)"}`;
      });

      const localFallbackAnswer = `تحليل المصادر المحددة (${sources.length}):\n\n${fallbackLines.join(
        "\n\n"
      )}\n\nيمكنك الآن أن تطلب مني استخراج أسئلة دروس محددة (مثل: «هات أسئلة الدرس الأول والثاني وسيب الثالث») أو تجميعها في ملف Word أو Markdown أو Text.`;

      try {
        const ai = getGeminiClient();
        const systemInstruction = `أنت المحرر الأكاديمي المختص لتحليل الكتب والمناهج والامتحانات العربية.
أجب عن سؤال المستخدم بدقة واعتماداً على فهارس ومقتطفات المصادر المرفقة فقط دون تأليف دروس غير موجودة.
قدم إجابة واضحة ومنظمة بالعربية (وإذا سأل عن الفهرس أو الدروس فاعرضها مرتبة بأرقام الصفحات، ثم اقترح عليه أمر استخراج مناسب إن لزم).`;

        const { text, modelUsed } = await runCompilerModelCascade(
          ai,
          (model) => ({
            model,
            contents: `سؤال المستخدم:\n"${question}"\n\nبيانات المصادر وفهارسها:\n${JSON.stringify(
              sources,
              null,
              2
            ).slice(0, 26000)}`,
            config: { systemInstruction },
          }),
          25000
        );

        return res.json({
          success: true,
          data: {
            answer: text.trim() || localFallbackAnswer,
            modelUsed,
          },
        });
      } catch {
        return res.json({
          success: true,
          data: {
            answer: localFallbackAnswer,
            modelUsed: "deterministic-outline-inspector",
          },
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || "تعذر تحليل المصادر.",
      });
    }
  });

  // 5. Semantic Vector Search Across All Uploaded & Converted Passages
  app.post("/api/compiler/semantic-search", async (req, res) => {
    try {
      const {
        query,
        passages,
        topK = 12,
        minScore = 0.18,
      } = req.body as {
        query?: string;
        passages?: SearchablePassage[];
        topK?: number;
        minScore?: number;
      };

      const cleanQuery = (query || "").trim();
      if (!cleanQuery) {
        return res.status(400).json({
          success: false,
          error: "يرجى إدخال عبارة البحث الدلالي.",
        });
      }

      if (!Array.isArray(passages) || passages.length === 0) {
        return res.json({
          success: true,
          data: {
            results: [],
            totalSearched: 0,
            mode: "vector-embedding",
            cachedHits: 0,
            embeddedCount: 0,
          },
        });
      }

      const safeTopK = Math.min(30, Math.max(1, Number(topK) || 12));
      const safeMinScore = Number.isFinite(Number(minScore)) ? Number(minScore) : 0.18;
      const boundedPassages: SearchablePassage[] = passages.slice(0, 300).map((p) => ({
        ...p,
        text: (p.text || "").slice(0, 1200),
        textHash: p.textHash || computeDeterministicTextHash(`${p.heading || ""}|${p.text || ""}`),
      }));

      const queryCacheKey = `q::${computeDeterministicTextHash(cleanQuery)}`;
      let queryVector = semanticEmbeddingCache.get(queryCacheKey) || null;
      const passageVectors = new Map<string, number[]>();
      const missingPassagesMap = new Map<string, string>();
      let cachedHits = 0;

      for (const p of boundedPassages) {
        const cached = semanticEmbeddingCache.get(p.textHash);
        if (cached && cached.length > 0) {
          passageVectors.set(p.textHash, cached);
          cachedHits++;
        } else if (p.text.trim().length > 0 && !missingPassagesMap.has(p.textHash)) {
          missingPassagesMap.set(p.textHash, `${p.heading ? `${p.heading}: ` : ""}${p.text}`);
        }
      }

      let embeddedCount = 0;
      let mode: "vector-embedding" | "lexical-fallback" = "vector-embedding";

      try {
        const ai = getGeminiClient();

        // Collect all texts needing fresh embeddings (query if uncached + uncached unique passages)
        const pendingKeys: string[] = [];
        const pendingTexts: string[] = [];
        let querySlotIdx = -1;

        if (!queryVector) {
          querySlotIdx = 0;
          pendingKeys.push(queryCacheKey);
          pendingTexts.push(cleanQuery);
        }

        for (const [hashKey, contentText] of missingPassagesMap.entries()) {
          pendingKeys.push(hashKey);
          pendingTexts.push(contentText);
        }

        const BATCH_SIZE = 64;
        for (let offset = 0; offset < pendingTexts.length; offset += BATCH_SIZE) {
          const batchTexts = pendingTexts.slice(offset, offset + BATCH_SIZE);
          const batchKeys = pendingKeys.slice(offset, offset + BATCH_SIZE);
          const vectors = await generateBatchEmbeddings(ai, batchTexts);

          for (let j = 0; j < batchKeys.length; j++) {
            const vec = vectors[j];
            const key = batchKeys[j];
            if (Array.isArray(vec) && vec.length > 0) {
              rememberEmbedding(key, vec);
              if (offset + j === querySlotIdx) {
                queryVector = vec;
              } else {
                passageVectors.set(key, vec);
              }
              embeddedCount++;
            }
          }
        }

        if (!queryVector || queryVector.length === 0) {
          mode = "lexical-fallback";
        }
      } catch (embedErr: any) {
        console.warn(
          "[SmartCompiler /semantic-search] Embedding unavailable, falling back to lexical ranking:",
          embedErr?.message || embedErr
        );
        mode = "lexical-fallback";
      }

      const results = rankSemanticPassagesHybrid({
        query: cleanQuery,
        passages: boundedPassages,
        queryVector,
        passageVectors,
        topK: safeTopK,
        minScore: safeMinScore,
        mode,
      });

      return res.json({
        success: true,
        data: {
          results,
          totalSearched: boundedPassages.length,
          mode,
          cachedHits,
          embeddedCount,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || "تعذر تنفيذ البحث الدلالي.",
      });
    }
  });
}
