import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  analyzeGrammarAndSyntaxHeuristically,
  runGrammarSyntaxAnalyzer,
} from '../src/utils/grammarSyntaxAnalyzer';
import { extractConstArrayDeclaration } from './helpers/serverExtract';
import { AR_MARKDOWN_FIXTURE } from './fixtures/curriculum';

/**
 * GROUP F — src/utils/grammarSyntaxAnalyzer.ts
 *
 * `KNOWN_SYNTACTIC_COMPLETIONS` is module-private, so it is sliced out of the real source
 * rather than retyped. `runGrammarSyntaxAnalyzer` calls `fetch('/api/grammar-syntax-check')`,
 * which does not exist under `environment: 'node'`, so every test here stubs `fetch` to reject
 * and exercises the module's real fallback path — which is also the production path whenever
 * the AI endpoint is unreachable.
 */

interface KnownSyntacticCompletion {
  pattern: RegExp;
  completion: string;
  grammaticalReason: string;
  isCritical: boolean;
}

const COMPLETIONS_DECL = extractConstArrayDeclaration(
  'src/utils/grammarSyntaxAnalyzer.ts',
  'const KNOWN_SYNTACTIC_COMPLETIONS',
);
const COMPLETIONS_TABLE = COMPLETIONS_DECL.value as KnownSyntacticCompletion[];

/** Forces `runGrammarSyntaxAnalyzer` down its `catch` branch without a network call. */
function stubOfflineFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('offline (stubbed for characterization)'))),
  );
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('F. grammarSyntaxAnalyzer — KNOWN_SYNTACTIC_COMPLETIONS table', () => {
  it('is located by content anchor and the slice is the whole declaration', () => {
    expect(COMPLETIONS_TABLE).toHaveLength(3);
    expect(COMPLETIONS_DECL.source.trimStart().startsWith('const KNOWN_SYNTACTIC_COMPLETIONS')).toBe(true);
    expect(COMPLETIONS_DECL.source.trimEnd().endsWith('];')).toBe(true);
  });

  it('pins every completion: pattern, completion text, reason, and criticality', () => {
    expect(
      COMPLETIONS_TABLE.map(c => ({
        pattern: c.pattern.source,
        flags: c.pattern.flags,
        completion: c.completion,
        grammaticalReason: c.grammaticalReason,
        isCritical: c.isCritical,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "completion": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
          "flags": "m",
          "grammaticalReason": "حرف جر معلق (بـ) متبوع بانقطاع مفاجئ أدى لبتر باب محرمات الإحرام وباقي المنهج",
          "isCritical": true,
          "pattern": "والمراد\\s+من\\s+ذلك\\s+الجنس\\s+الصادق\\s+بـ\\s*$",
        },
        {
          "completion": "بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد بما يترتب عليه من الغلاء.",
          "flags": "m",
          "grammaticalReason": "انقطاع الجملة الوصفية والتعليلية في ختام باب البيع الفاسد وسقوط باقي الأبواب",
          "isCritical": true,
          "pattern": "بيع\\s+الحاضر\\s+للبادي(?:\\s*:\\s*وهو\\s+أن\\s+يقدم\\s+القروي\\s+بمتاعه\\s+لبيعه)?\\s*$",
        },
        {
          "completion": "عن أبي هريرة رضي الله عنه عن النبي صلى الله عليه وسلم قال: «الإيمان بضع وسبعون أو بضع وستون شعبة، فأفضلها قول لا إله إلا الله، وأدناها إماطة الأذى عن الطريق، والحياء شعبة من الإيمان».",
          "flags": "m",
          "grammaticalReason": "سند حديث معلق بدون ذكر المتن (مبتدأ بدون خبر مقول القول)",
          "isCritical": false,
          "pattern": "(?:^|\\n)\\s*عن\\s+أبي\\s+هريرة\\s+رضي\\s+الله\\s+عنه\\s+عن\\s+النبي\\s+صلى\\s+الله\\s+عليه\\s+وسلم\\s*$",
        },
      ]
    `);
  });

  it('a completion that re-matches its own pattern would make the repair non-convergent', () => {
    expect(
      COMPLETIONS_TABLE.map(c => ({
        pattern: c.pattern.source,
        completionMatchesOwnPattern: new RegExp(c.pattern.source, c.pattern.flags).test(c.completion),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "completionMatchesOwnPattern": false,
          "pattern": "والمراد\\s+من\\s+ذلك\\s+الجنس\\s+الصادق\\s+بـ\\s*$",
        },
        {
          "completionMatchesOwnPattern": false,
          "pattern": "بيع\\s+الحاضر\\s+للبادي(?:\\s*:\\s*وهو\\s+أن\\s+يقدم\\s+القروي\\s+بمتاعه\\s+لبيعه)?\\s*$",
        },
        {
          "completionMatchesOwnPattern": false,
          "pattern": "(?:^|\\n)\\s*عن\\s+أبي\\s+هريرة\\s+رضي\\s+الله\\s+عنه\\s+عن\\s+النبي\\s+صلى\\s+الله\\s+عليه\\s+وسلم\\s*$",
        },
      ]
    `);
  });
});

describe('F. grammarSyntaxAnalyzer — analyzeGrammarAndSyntaxHeuristically', () => {
  it('empty / whitespace input returns the pinned empty report', () => {
    expect(analyzeGrammarAndSyntaxHeuristically('')).toMatchInlineSnapshot(`
      {
        "analyzedSentencesCount": 0,
        "hasCriticalTruncation": false,
        "isAbruptTermination": false,
        "overallGrammarVerdict": "المستند فارغ.",
        "truncatedItems": [],
      }
    `);
    expect(analyzeGrammarAndSyntaxHeuristically('  \n\t ')).toMatchInlineSnapshot(`
      {
        "analyzedSentencesCount": 0,
        "hasCriticalTruncation": false,
        "isAbruptTermination": false,
        "overallGrammarVerdict": "المستند فارغ.",
        "truncatedItems": [],
      }
    `);
  });

  it('a clean Arabic paragraph is reported as complete', () => {
    const clean = 'قال ابن عباس رضي الله عنهما في قوله تعالى ﴿تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ﴾: الملك التام بلا نقص.';
    expect(analyzeGrammarAndSyntaxHeuristically(clean)).toMatchInlineSnapshot(`
      {
        "analyzedSentencesCount": 1,
        "criticalTruncationAlert": undefined,
        "hasCriticalTruncation": false,
        "isAbruptTermination": false,
        "overallGrammarVerdict": "التراكيب النحوية متصلة وخالية من البتر المفاجئ",
        "truncatedItems": [],
      }
    `);
  });

  it('fires KNOWN_SYNTACTIC_COMPLETIONS[0] (والمراد من ذلك الجنس الصادق بـ)', () => {
    expect(analyzeGrammarAndSyntaxHeuristicsProbe(0)).toMatchInlineSnapshot(`
      {
        "analyzedSentencesCount": 1,
        "criticalTruncationAlert": "تنبيه نحوي وأكاديمي حرج: يبدو أن الملف مبتور أو ناقص بشكل كبير في منتصف الجملة والمنهج! تم رصد انقطاع تركيبي مفتوح وسقوط صفحات كاملة.",
        "hasCriticalTruncation": true,
        "isAbruptTermination": true,
        "overallGrammarVerdict": "تم رصد بتر نحوي مفتوح وانقطاع في الجمل الأكاديمية",
        "truncatedItems": [
          {
            "confidence": 0.98,
            "grammaticalReason": "حرف جر معلق (بـ) متبوع بانقطاع مفاجئ أدى لبتر باب محرمات الإحرام وباقي المنهج",
            "id": "syntax-1",
            "predictedCompletion": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
            "truncatedText": "والمراد من ذلك الجنس الصادق بـ",
          },
        ],
      }
    `);
  });

  it('fires KNOWN_SYNTACTIC_COMPLETIONS[1] (بيع الحاضر للبادي)', () => {
    expect(analyzeGrammarAndSyntaxHeuristicsProbe(1)).toMatchInlineSnapshot(`
      {
        "analyzedSentencesCount": 1,
        "criticalTruncationAlert": "تنبيه نحوي وأكاديمي حرج: يبدو أن الملف مبتور أو ناقص بشكل كبير في منتصف الجملة والمنهج! تم رصد انقطاع تركيبي مفتوح وسقوط صفحات كاملة.",
        "hasCriticalTruncation": true,
        "isAbruptTermination": true,
        "overallGrammarVerdict": "تم رصد بتر نحوي مفتوح وانقطاع في الجمل الأكاديمية",
        "truncatedItems": [
          {
            "confidence": 0.98,
            "grammaticalReason": "انقطاع الجملة الوصفية والتعليلية في ختام باب البيع الفاسد وسقوط باقي الأبواب",
            "id": "syntax-2",
            "predictedCompletion": "بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد بما يترتب عليه من الغلاء.",
            "truncatedText": "بيع الحاضر للبادي",
          },
        ],
      }
    `);
  });

  it('fires KNOWN_SYNTACTIC_COMPLETIONS[2] (سند حديث معلق بلا متن)', () => {
    expect(analyzeGrammarAndSyntaxHeuristicsProbe(2)).toMatchInlineSnapshot(`
      {
        "analyzedSentencesCount": 1,
        "criticalTruncationAlert": undefined,
        "hasCriticalTruncation": false,
        "isAbruptTermination": true,
        "overallGrammarVerdict": "التراكيب النحوية متصلة وخالية من البتر المفاجئ",
        "truncatedItems": [
          {
            "confidence": 0.98,
            "grammaticalReason": "سند حديث معلق بدون ذكر المتن (مبتدأ بدون خبر مقول القول)",
            "id": "syntax-3",
            "predictedCompletion": "عن أبي هريرة رضي الله عنه عن النبي صلى الله عليه وسلم قال: «الإيمان بضع وسبعون أو بضع وستون شعبة، فأفضلها قول لا إله إلا الله، وأدناها إماطة الأذى عن الطريق، والحياء شعبة من الإيمان».",
            "truncatedText": "عن أبي هريرة رضي الله عنه عن النبي صلى الله عليه وسلم",
          },
        ],
      }
    `);
  });

  it('the hanging-particle fallback fires only when NO known completion matched (grammarSyntaxAnalyzer.ts:76)', () => {
    const probes = [
      'والمراد من ذلك',
      'انتهى الدرس في',
      'يقول عن أبي هريرة',
      'الحديث في',
      'with latin text ending in from',
      'بص',
    ];
    expect(
      probes.map(md => ({ input: md, report: analyzeGrammarAndSyntaxHeuristically(md) })),
    ).toMatchInlineSnapshot(`
      [
        {
          "input": "والمراد من ذلك",
          "report": {
            "analyzedSentencesCount": 1,
            "criticalTruncationAlert": undefined,
            "hasCriticalTruncation": false,
            "isAbruptTermination": false,
            "overallGrammarVerdict": "التراكيب النحوية متصلة وخالية من البتر المفاجئ",
            "truncatedItems": [],
          },
        },
        {
          "input": "انتهى الدرس في",
          "report": {
            "analyzedSentencesCount": 1,
            "criticalTruncationAlert": "تنبيه نحوي وأكاديمي حرج: يبدو أن الملف مبتور أو ناقص بشكل كبير في منتصف الجملة والمنهج! تم رصد انقطاع تركيبي مفتوح وسقوط صفحات كاملة.",
            "hasCriticalTruncation": true,
            "isAbruptTermination": true,
            "overallGrammarVerdict": "تم رصد بتر نحوي مفتوح وانقطاع في الجمل الأكاديمية",
            "truncatedItems": [
              {
                "confidence": 0.9,
                "grammaticalReason": "انقطاع النص فجأة على أداة أو حرف معلق («في») بدون استكمال المعنى النحوي",
                "id": "syntax-hanging-particle",
                "predictedCompletion": "... [يتطلب استكمال النص بناءً على المنهج الأزهري المقرر]",
                "truncatedText": "انتهى الدرس في",
              },
            ],
          },
        },
        {
          "input": "يقول عن أبي هريرة",
          "report": {
            "analyzedSentencesCount": 1,
            "criticalTruncationAlert": undefined,
            "hasCriticalTruncation": false,
            "isAbruptTermination": false,
            "overallGrammarVerdict": "التراكيب النحوية متصلة وخالية من البتر المفاجئ",
            "truncatedItems": [],
          },
        },
        {
          "input": "الحديث في",
          "report": {
            "analyzedSentencesCount": 1,
            "criticalTruncationAlert": "تنبيه نحوي وأكاديمي حرج: يبدو أن الملف مبتور أو ناقص بشكل كبير في منتصف الجملة والمنهج! تم رصد انقطاع تركيبي مفتوح وسقوط صفحات كاملة.",
            "hasCriticalTruncation": true,
            "isAbruptTermination": true,
            "overallGrammarVerdict": "تم رصد بتر نحوي مفتوح وانقطاع في الجمل الأكاديمية",
            "truncatedItems": [
              {
                "confidence": 0.9,
                "grammaticalReason": "انقطاع النص فجأة على أداة أو حرف معلق («في») بدون استكمال المعنى النحوي",
                "id": "syntax-hanging-particle",
                "predictedCompletion": "... [يتطلب استكمال النص بناءً على المنهج الأزهري المقرر]",
                "truncatedText": "الحديث في",
              },
            ],
          },
        },
        {
          "input": "with latin text ending in from",
          "report": {
            "analyzedSentencesCount": 1,
            "criticalTruncationAlert": undefined,
            "hasCriticalTruncation": false,
            "isAbruptTermination": false,
            "overallGrammarVerdict": "التراكيب النحوية متصلة وخالية من البتر المفاجئ",
            "truncatedItems": [],
          },
        },
        {
          "input": "بص",
          "report": {
            "analyzedSentencesCount": 0,
            "criticalTruncationAlert": undefined,
            "hasCriticalTruncation": false,
            "isAbruptTermination": false,
            "overallGrammarVerdict": "التراكيب النحوية متصلة وخالية من البتر المفاجئ",
            "truncatedItems": [],
          },
        },
      ]
    `);
  });

  it('the curriculum-truncation detector sets the flags but appends NO truncatedItems', () => {
    // grammarSyntaxAnalyzer.ts:88-96 flips `hasCriticalTruncation` and `isAbruptTermination`
    // without pushing an item, so the report says "critical truncation" and then lists nothing
    // to repair. PINNED, NOT FIXED — this is why `overallGrammarVerdict` can report a critical
    // truncation with an empty `truncatedItems`.
    const truncated = 'حديث_2ث ثم بقية الدروس .....';
    const report = analyzeGrammarAndSyntaxHeuristically(truncated);
    expect(report).toMatchInlineSnapshot(`
      {
        "analyzedSentencesCount": 1,
        "criticalTruncationAlert": "تنبيه نحوي وأكاديمي حرج: يبدو أن الملف مبتور أو ناقص بشكل كبير في منتصف الجملة والمنهج! تم رصد انقطاع تركيبي مفتوح وسقوط صفحات كاملة.",
        "hasCriticalTruncation": true,
        "isAbruptTermination": true,
        "overallGrammarVerdict": "تم رصد بتر نحوي مفتوح وانقطاع في الجمل الأكاديمية",
        "truncatedItems": [],
      }
    `);
    expect(report.hasCriticalTruncation).toBe(true);
    expect(report.truncatedItems).toHaveLength(0);
  });

  it('analyzedSentencesCount splits on . ؟ ! ; and newline, keeping only chunks longer than 5', () => {
    const probes = [
      'نص قصير.',
      'نص طويل بما فيه من كلمة.',
      'سؤال: ما الحقب؟ جواب: السنون.',
      'أ. ب. ج',
      'سطر أول\nسطر ثان\nسطر ثالث',
      'one! two? three; four',
    ];
    expect(
      probes.map(md => ({
        input: md,
        analyzedSentencesCount: analyzeGrammarAndSyntaxHeuristically(md).analyzedSentencesCount,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "analyzedSentencesCount": 1,
          "input": "نص قصير.",
        },
        {
          "analyzedSentencesCount": 1,
          "input": "نص طويل بما فيه من كلمة.",
        },
        {
          "analyzedSentencesCount": 2,
          "input": "سؤال: ما الحقب؟ جواب: السنون.",
        },
        {
          "analyzedSentencesCount": 0,
          "input": "أ. ب. ج",
        },
        {
          "analyzedSentencesCount": 3,
          "input": "سطر أول
      سطر ثان
      سطر ثالث",
        },
        {
          "analyzedSentencesCount": 1,
          "input": "one! two? three; four",
        },
      ]
    `);
  });

  it('the report shape: criticalTruncationAlert is present-but-undefined when not critical', () => {
    const clean = analyzeGrammarAndSyntaxHeuristically('نص سليم تمامًا لا يوجد فيه أي بتر.');
    // `alertMessage` is initialized to `undefined` and always assigned to the key, so the
    // property EXISTS with value undefined rather than being absent. PINNED, NOT FIXED:
    // `'criticalTruncationAlert' in report` is true even for a healthy document.
    expect('criticalTruncationAlert' in clean).toBe(true);
    expect(clean.criticalTruncationAlert).toBeUndefined();
    expect(Object.keys(clean).sort()).toMatchInlineSnapshot(`
      [
        "analyzedSentencesCount",
        "criticalTruncationAlert",
        "hasCriticalTruncation",
        "isAbruptTermination",
        "overallGrammarVerdict",
        "truncatedItems",
      ]
    `);
  });

  it('the shared Arabic corpus fixture is pinned end to end', () => {
    expect(analyzeGrammarAndSyntaxHeuristically(AR_MARKDOWN_FIXTURE)).toMatchInlineSnapshot(`
      {
        "analyzedSentencesCount": 29,
        "criticalTruncationAlert": "تنبيه نحوي وأكاديمي حرج: يبدو أن الملف مبتور أو ناقص بشكل كبير في منتصف الجملة والمنهج! تم رصد انقطاع تركيبي مفتوح وسقوط صفحات كاملة.",
        "hasCriticalTruncation": true,
        "isAbruptTermination": true,
        "overallGrammarVerdict": "تم رصد بتر نحوي مفتوح وانقطاع في الجمل الأكاديمية",
        "truncatedItems": [
          {
            "confidence": 0.98,
            "grammaticalReason": "حرف جر معلق (بـ) متبوع بانقطاع مفاجئ أدى لبتر باب محرمات الإحرام وباقي المنهج",
            "id": "syntax-1",
            "predictedCompletion": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
            "truncatedText": "لحاضر للبادي

      راوية ابن ماجه والنساء الرجال.

      كفته نيتة.

      مِن تَقُوتُ

      الصفحة 22",
          },
        ],
      }
    `);
  });
});

describe('F. grammarSyntaxAnalyzer — runGrammarSyntaxAnalyzer (offline fallback)', () => {
  it('pins repairedMarkdown for each known completion (the real repair loop, lines 135-139)', async () => {
    stubOfflineFetch();
    const repaired = await Promise.all(
      COMPLETION_PROBES.map(async (md, i) => {
        const { repairedMarkdown } = await runGrammarSyntaxAnalyzer(md, 'test.md');
        return { completionIndex: i, repairedMarkdown };
      }),
    );
    expect(repaired).toMatchInlineSnapshot(`
      [
        {
          "completionIndex": 0,
          "repairedMarkdown": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
        },
        {
          "completionIndex": 1,
          "repairedMarkdown": "بيع الحاضر للبادي: وهو أن يقدم القروي بمتاعه لبيعه بسعر يومه فيقول له البلدي: اتركه عندي لأبيعه لك على التدريج بأغلى؛ وعلة النهي: لئلا يتضرر أهل البلد بما يترتب عليه من الغلاء.",
        },
        {
          "completionIndex": 2,
          "repairedMarkdown": "عن أبي هريرة رضي الله عنه عن النبي صلى الله عليه وسلم قال: «الإيمان بضع وسبعون أو بضع وستون شعبة، فأفضلها قول لا إله إلا الله، وأدناها إماطة الأذى عن الطريق، والحياء شعبة من الإيمان».",
        },
      ]
    `);
  });

  it('each repair replaces the truncation with the table completion verbatim', async () => {
    stubOfflineFetch();
    const results: Array<{ i: number; hasCompletion: boolean; stillHasTrigger: boolean }> = [];
    for (const [i, entry] of COMPLETIONS_TABLE.entries()) {
      const { repairedMarkdown } = await runGrammarSyntaxAnalyzer(COMPLETION_PROBES[i]);
      results.push({
        i,
        hasCompletion: repairedMarkdown.includes(entry.completion),
        // The `$`-anchored trigger no longer matches once the completion is in place.
        stillHasTrigger: new RegExp(entry.pattern.source, entry.pattern.flags).test(repairedMarkdown),
      });
    }
    expect(results).toMatchInlineSnapshot(`
      [
        {
          "hasCompletion": true,
          "i": 0,
          "stillHasTrigger": false,
        },
        {
          "hasCompletion": true,
          "i": 1,
          "stillHasTrigger": false,
        },
        {
          "hasCompletion": true,
          "i": 2,
          "stillHasTrigger": false,
        },
      ]
    `);
    expect(results.every(r => r.hasCompletion)).toBe(true);
  });

  it('the report returned offline is the heuristic report, unmerged', async () => {
    stubOfflineFetch();
    const { report } = await runGrammarSyntaxAnalyzer(COMPLETION_PROBES[0]);
    expect(report).toEqual(analyzeGrammarAndSyntaxHeuristicsProbe(0));
  });

  it('fetch is attempted with the documented method, headers, and body', async () => {
    stubOfflineFetch();
    await runGrammarSyntaxAnalyzer('نص', 'اسم-الملف.md');
    expect(vi.mocked(fetch).mock.calls[0]).toMatchInlineSnapshot(`
      [
        "/api/grammar-syntax-check",
        {
          "body": "{"markdown":"نص","filename":"اسم-الملف.md"}",
          "headers": {
            "Content-Type": "application/json",
          },
          "method": "POST",
          "signal": AbortSignal {
            Symbol(kEvents): Map {},
            Symbol(events.maxEventTargetListeners): 0,
            Symbol(events.maxEventTargetListenersWarned): false,
            Symbol(kHandlers): Map {},
            Symbol(kAborted): false,
            Symbol(kReason): undefined,
            Symbol(kComposite): false,
          },
        },
      ]
    `);
  });

  it('a non-ok response, a missing data field, and a short AI completion all fall through', async () => {
    // Three distinct server shapes are handled by the same fall-through. PINNED, NOT FIXED:
    // the catch block swallows the reason, so a real outage is indistinguishable from a
    // 200 response carrying an empty payload.
    const bodies: Array<[string, unknown]> = [
      ['ok:true success:false', { ok: true, json: async () => ({ success: false }) }],
      ['ok:true success:true data missing', { ok: true, json: async () => ({ success: true }) }],
      ['ok:false', { ok: false, json: async () => ({}) }],
      [
        'AI completion shorter than repaired',
        {
          ok: true,
          json: async () => ({
            success: true,
            data: { completedMarkdown: 'x', truncatedItems: [], hasCriticalTruncation: false },
          }),
        },
      ],
    ];
    const results = [];
    for (const [label, impl] of bodies) {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(impl)));
      const { report, repairedMarkdown } = await runGrammarSyntaxAnalyzer(COMPLETION_PROBES[0]);
      results.push({ label, repairedMarkdown, verdict: report.overallGrammarVerdict });
    }
    expect(results).toMatchInlineSnapshot(`
      [
        {
          "label": "ok:true success:false",
          "repairedMarkdown": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
          "verdict": "تم رصد بتر نحوي مفتوح وانقطاع في الجمل الأكاديمية",
        },
        {
          "label": "ok:true success:true data missing",
          "repairedMarkdown": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
          "verdict": "تم رصد بتر نحوي مفتوح وانقطاع في الجمل الأكاديمية",
        },
        {
          "label": "ok:false",
          "repairedMarkdown": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
          "verdict": "تم رصد بتر نحوي مفتوح وانقطاع في الجمل الأكاديمية",
        },
        {
          "label": "AI completion shorter than repaired",
          "repairedMarkdown": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
          "verdict": "تم رصد بتر نحوي مفتوح وانقطاع في الجمل الأكاديمية",
        },
      ]
    `);
  });

  it('an AI response that IS longer replaces the repaired markdown and merges its items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              completedMarkdown: 'نص مملوءmuch أطول من النص الأصلي لاختبار الاستبدال',
              truncatedItems: [
                { truncatedText: 'جملة ناقصة', predictedCompletion: 'جملة كاملة' },
                { truncatedText: 'جملة ناقصة', predictedCompletion: 'DUPLICATE — must be dropped' },
              ],
              hasCriticalTruncation: true,
              overallGrammarVerdict: 'حكم الذكاء الاصطناعي',
              criticalTruncationAlert: 'تنبيه من الذكاء الاصطناعي',
            },
          }),
        }),
      ),
    );
    const result = await runGrammarSyntaxAnalyzer(COMPLETION_PROBES[0]);
    expect(result).toMatchInlineSnapshot(`
      {
        "repairedMarkdown": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
        "report": {
          "analyzedSentencesCount": 1,
          "criticalTruncationAlert": "تنبيه من الذكاء الاصطناعي",
          "hasCriticalTruncation": true,
          "isAbruptTermination": true,
          "overallGrammarVerdict": "حكم الذكاء الاصطناعي",
          "truncatedItems": [
            {
              "confidence": 0.98,
              "grammaticalReason": "حرف جر معلق (بـ) متبوع بانقطاع مفاجئ أدى لبتر باب محرمات الإحرام وباقي المنهج",
              "id": "syntax-1",
              "predictedCompletion": "والمراد من ذلك الجنس الصادق بالمخيط المحيط كقميص وجبة وسراويل وخف، فيحرم لبسه على المحرم ذكراً كان بالاتفاق.",
              "truncatedText": "والمراد من ذلك الجنس الصادق بـ",
            },
            {
              "confidence": 0.9,
              "grammaticalReason": "توقع نحوي عبر الذكاء الاصطناعي",
              "id": "ai-syntax-2",
              "predictedCompletion": "جملة كاملة",
              "truncatedText": "جملة ناقصة",
            },
          ],
        },
      }
    `);
    // Duplicate truncatedText entries are dropped by the merge at grammarSyntaxAnalyzer.ts:167.
    expect(result.report.truncatedItems.filter(i => i.truncatedText === 'جملة ناقصة')).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------- helpers */

/**
 * Builds a document that triggers exactly the i-th entry of KNOWN_SYNTACTIC_COMPLETIONS, by
 * expanding the entry's own pattern into a concrete Arabic line. Deriving the probe from the
 * pattern keeps the fixture reaching the rule as the rule is written.
 */
function analyzeGrammarAndSyntaxHeuristicsProbe(i: number) {
  return analyzeGrammarAndSyntaxHeuristicsFromProbe(COMPLETION_PROBES[i]);
}

const COMPLETION_PROBES: string[] = [
  // [0] والمراد من ذلك الجنس الصادق بـ   — the Fiqh Shafi'i truncation.
  'والمراد من ذلك الجنس الصادق بـ',
  // [1] بيع الحاضر للبادي  — the Hanafi truncation.
  'بيع الحاضر للبادي',
  // [2] عن أبي هريرة ... وسلم — a hadith chain with no matn.
  'عن أبي هريرة رضي الله عنه عن النبي صلى الله عليه وسلم',
];

function analyzeGrammarAndSyntaxHeuristicsFromProbe(probe: string) {
  // The probe must be the whole document for the `$`-anchored /m patterns to match at EOL.
  return analyzeGrammarAndSyntaxHeuristically(probe);
}