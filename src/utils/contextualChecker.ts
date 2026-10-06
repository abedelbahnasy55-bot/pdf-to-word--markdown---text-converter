import { autoFixQuranicErrors } from './quranAuditor';
import { isDirectlyExtractedMarkdown } from './extractionOrigin';

export interface ContextualCheckResult {
  correctedMarkdown: string;
  isAiVerified: boolean;
  fixedCount: number;
  message?: string;
}

/**
 * Runs the AI Contextual Checker unit in the conversion pipeline.
 * Compares Quranic verses and Hadiths against reference canonical databases,
 * rectifying OCR misreads, runaway dots, and contextual omissions before presenting to the user.
 */
export async function runContextualChecker(
  markdown: string,
  subjectHint?: string,
  timeoutMs: number = 7000
): Promise<ContextualCheckResult> {
  // Step 1: Immediate local canonical baseline rectification
  const ruleResult = autoFixQuranicErrors(markdown);
  let baseMarkdown = ruleResult.correctedText;
  let fixedCount = ruleResult.fixedCount;

  // Step 2: Skip the AI pass entirely when the document arrived via direct text
  // extraction.
  //
  // The AI contextual check corrects OCR damage. Direct extraction reads the text
  // layer that is already embedded in the file, so there is no OCR damage to
  // correct, and the only thing the call accomplished was spending two requests of
  // quota to rewrite text that was already exact. The local rule engine has already
  // applied the same canonical corrections in step 1, so skipping loses no
  // correctness and keeps a text-layer book entirely free.
  if (isDirectlyExtractedMarkdown(baseMarkdown)) {
    return {
      correctedMarkdown: baseMarkdown,
      isAiVerified: false,
      fixedCount,
      message: 'تم التدقيق عبر محرك القواعد الشرعية المعتمدة',
    };
  }

  // Step 3: Query the Server AI Contextual Checker Endpoint
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch('/api/contextual-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        markdown: baseMarkdown,
        subjectHint,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data?.correctedMarkdown) {
        const returnedText = data.data.correctedMarkdown;

        // Anti-truncation safeguard: If the returned text lost more than 20% of the original content
        // on a large document, do NOT overwrite the full document with a truncated stub!
        if (baseMarkdown.length > 5000 && returnedText.length < baseMarkdown.length * 0.8) {
          console.warn(`[ContextualChecker] Prevented document truncation: original ${baseMarkdown.length} chars vs AI ${returnedText.length} chars. Keeping full document intact.`);
          return {
            correctedMarkdown: baseMarkdown,
            isAiVerified: false,
            fixedCount,
            message: 'تم تدقيق كافة الصفحات بالكامل عبر محرك القواعد الشرعية المعتمدة مع الحفاظ على كامل الوثيقة دون أي نقصان',
          };
        }

        // Run rule verification one more time on AI output to ensure absolute precision
        const finalRuleCheck = autoFixQuranicErrors(returnedText);
        return {
          correctedMarkdown: finalRuleCheck.correctedText,
          isAiVerified: Boolean(data.data.isAiVerified),
          fixedCount: fixedCount + (data.data.isAiVerified ? 1 : 0),
          message: data.data.isAiVerified
            ? 'تم الفحص السياقي الذكي ومطابقة المصحف والسنة النبوية بنجاح'
            : 'تم التدقيق عبر محرك القواعد الشرعية المعتمدة',
        };
      }
    }
  } catch (err: any) {
    // Graceful offline or timeout fallback to the canonical rule engine
    console.warn('AI Contextual Checker network check bypassed, using canonical rule engine:', err?.message || err);
  }

  return {
    correctedMarkdown: baseMarkdown,
    isAiVerified: false,
    fixedCount,
    message: 'تم التدقيق عبر محرك القواعد الشرعية المعتمدة',
  };
}
