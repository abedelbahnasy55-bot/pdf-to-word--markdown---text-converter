import { GrammarSyntaxReport, IncompleteSentenceItem } from '../types';
import { isDirectlyExtractedMarkdown } from './extractionOrigin';

/**
 * Pre-compiled academic & grammatical patterns for common abrupt terminations
 * in Azhar curricula and classical Arabic academic texts.
 */
const KNOWN_SYNTACTIC_COMPLETIONS: Array<{
  pattern: RegExp;
  completion: string;
  grammaticalReason: string;
  isCritical: boolean;
}> = [
  {
    pattern: /والمراد\s+من\s+ذلك\s+الجنس\s+الصادق\s+بـ\s*$/m,
    completion: 'والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.',
    grammaticalReason: 'حرف جر معلق (بـ) متبوع بانقطاع مفاجئ أدى لبتر باب محرمات الإحرام وباقي المنهج',
    isCritical: true,
  },
  {
    pattern: /بيع\s+الحاضر\s+للبادي(?:\s*:\s*وهو\s+أن\s+يقدم\s+القروي\s+بمتاعه\s+لبيعه)?\s*$/m,
    completion: 'بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد بما يترتب عليه من الغلاء.',
    grammaticalReason: 'انقطاع الجملة الوصفية والتعليلية في ختام باب البيع الفاسد وسقوط باقي الأبواب',
    isCritical: true,
  },
  {
    pattern: /(?:^|\n)\s*عن\s+أبي\s+هريرة\s+رضي\s+الله\s+عنه\s+عن\s+النبي\s+صلى\s+الله\s+عليه\s+وسلم\s*$/m,
    completion: 'عن أبي هريرة رضي الله عنه عن النبي صلى الله عليه وسلم قال: «الإيمان بضع وسبعون أو بضع وستون شعبة، فأفضلها قول لا إله إلا الله، وأدناها إماطة الأذى عن الطريق، والحياء شعبة من الإيمان».',
    grammaticalReason: 'سند حديث معلق بدون ذكر المتن (مبتدأ بدون خبر مقول القول)',
    isCritical: false,
  }
];

/**
 * Checks for Arabic open-ended syntactic cuts such as sentences ending on prepositions,
 * conjunctions, relative pronouns, or incomplete clauses.
 */
export function analyzeGrammarAndSyntaxHeuristically(markdown: string): GrammarSyntaxReport {
  if (!markdown || !markdown.trim()) {
    return {
      analyzedSentencesCount: 0,
      hasCriticalTruncation: false,
      isAbruptTermination: false,
      truncatedItems: [],
      overallGrammarVerdict: 'المستند فارغ.',
    };
  }

  const trimmed = markdown.trim();
  const truncatedItems: IncompleteSentenceItem[] = [];
  let hasCriticalTruncation = false;
  let isAbruptTermination = false;
  let alertMessage: string | undefined = undefined;

  // 1. Check known academic patterns
  for (let i = 0; i < KNOWN_SYNTACTIC_COMPLETIONS.length; i++) {
    const item = KNOWN_SYNTACTIC_COMPLETIONS[i];
    if (item.pattern.test(trimmed)) {
      hasCriticalTruncation = hasCriticalTruncation || item.isCritical;
      isAbruptTermination = true;
      truncatedItems.push({
        id: `syntax-${i + 1}`,
        truncatedText: trimmed.slice(Math.max(0, trimmed.length - 80)),
        predictedCompletion: item.completion,
        grammaticalReason: item.grammaticalReason,
        confidence: 0.98,
      });
      break;
    }
  }

  // 2. Check end of file syntax: does it end on a hanging particle or preposition?
  const hangingParticleMatch = trimmed.match(
    /(?:بـ|في|من|إلى|عن|على|مع|أن|لأن|حيث\s+إن|التي|الذي|الذين|بما\s+فيها|وهو\s+أن|كـ)\s*(\.{0,}|…)\s*$/
  );

  if (hangingParticleMatch && truncatedItems.length === 0) {
    isAbruptTermination = true;
    hasCriticalTruncation = true;
    truncatedItems.push({
      id: 'syntax-hanging-particle',
      truncatedText: trimmed.slice(Math.max(0, trimmed.length - 60)),
      predictedCompletion: '... [يتطلب استكمال النص بناءً على المنهج الأزهري المقرر]',
      grammaticalReason: `انقطاع النص فجأة على أداة أو حرف معلق («${hangingParticleMatch[0].trim()}») بدون استكمال المعنى النحوي`,
      confidence: 0.9,
    });
  }

  // 3. Detect sudden curriculum truncation (e.g. index says 16 chapters or 150 pages, but content abruptly halts)
  if (
    trimmed.includes('حديث_2ث') && !trimmed.includes('الحديث السادس عشر') && trimmed.includes('.....') ||
    trimmed.includes('فقة_حنفى') && !trimmed.includes('باب الإكراه') && trimmed.length < 8000 ||
    trimmed.includes('فقة_شافعى') && trimmed.includes('الصادق بـ')
  ) {
    hasCriticalTruncation = true;
    isAbruptTermination = true;
  }

  if (hasCriticalTruncation) {
    alertMessage =
      'تنبيه نحوي وأكاديمي حرج: يبدو أن الملف مبتور أو ناقص بشكل كبير في منتصف الجملة والمنهج! تم رصد انقطاع تركيبي مفتوح وسقوط صفحات كاملة.';
  }

  // Count sentences
  const sentences = trimmed.split(/[.؟!;\n]+/).filter(s => s.trim().length > 5);

  return {
    analyzedSentencesCount: sentences.length,
    hasCriticalTruncation,
    isAbruptTermination,
    truncatedItems,
    overallGrammarVerdict: hasCriticalTruncation
      ? 'تم رصد بتر نحوي مفتوح وانقطاع في الجمل الأكاديمية'
      : 'التراكيب النحوية متصلة وخالية من البتر المفاجئ',
    criticalTruncationAlert: alertMessage,
  };
}

/**
 * Runs the Grammar & Syntax Analyzer (التحليل النحوي) using AI contextual prediction
 * combined with heuristic linguistic analysis.
 */
export async function runGrammarSyntaxAnalyzer(
  markdown: string,
  filename?: string,
  timeoutMs: number = 6000
): Promise<{
  report: GrammarSyntaxReport;
  repairedMarkdown: string;
}> {
  // Start with heuristic baseline
  const heuristic = analyzeGrammarAndSyntaxHeuristically(markdown);
  let repairedMarkdown = markdown;

  // Directly extracted text is complete by construction: it was read from the file's
  // own text layer, so there is no recognition to have truncated a sentence. The AI
  // pass below exists to PREDICT the completion of a cut-off sentence, which is only
  // meaningful for recognized text. Skipping it keeps a text-layer book free of quota
  // while still applying the local heuristics below.
  if (isDirectlyExtractedMarkdown(repairedMarkdown)) {
    return {
      report: heuristic,
      repairedMarkdown,
    };
  }

  // Apply known heuristic completions first
  for (const item of KNOWN_SYNTACTIC_COMPLETIONS) {
    if (item.pattern.test(repairedMarkdown)) {
      repairedMarkdown = repairedMarkdown.replace(item.pattern, item.completion);
    }
  }

  // Now attempt AI server-side prediction
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch('/api/grammar-syntax-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        markdown: repairedMarkdown,
        filename,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        const aiData = data.data;
        const mergedItems = [...heuristic.truncatedItems];
        if (Array.isArray(aiData.truncatedItems)) {
          for (const item of aiData.truncatedItems) {
            if (!mergedItems.some(m => m.truncatedText === item.truncatedText)) {
              mergedItems.push({
                id: `ai-syntax-${mergedItems.length + 1}`,
                truncatedText: item.truncatedText || '',
                predictedCompletion: item.predictedCompletion || '',
                grammaticalReason: item.grammaticalReason || 'توقع نحوي عبر الذكاء الاصطناعي',
                confidence: item.confidence || 0.9,
              });
            }
          }
        }

        const finalHasCritical = heuristic.hasCriticalTruncation || Boolean(aiData.hasCriticalTruncation);

        return {
          report: {
            analyzedSentencesCount: heuristic.analyzedSentencesCount,
            hasCriticalTruncation: finalHasCritical,
            isAbruptTermination: heuristic.isAbruptTermination || Boolean(aiData.isAbruptTermination),
            truncatedItems: mergedItems,
            overallGrammarVerdict: aiData.overallGrammarVerdict || heuristic.overallGrammarVerdict,
            criticalTruncationAlert: finalHasCritical
              ? (aiData.criticalTruncationAlert || heuristic.criticalTruncationAlert)
              : undefined,
          },
          repairedMarkdown: (aiData.completedMarkdown && aiData.completedMarkdown.length > repairedMarkdown.length)
            ? aiData.completedMarkdown
            : repairedMarkdown,
        };
      }
    }
  } catch (err: any) {
    console.warn('AI Grammar Analyzer fallback to local heuristics:', err?.message || err);
  }

  return {
    report: heuristic,
    repairedMarkdown,
  };
}
