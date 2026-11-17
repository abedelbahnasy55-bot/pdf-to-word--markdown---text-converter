/**
 * Shared Semantic Search & Vector Ranking Core
 * النواة المشتركة للبحث الدلالي بالمتجهات وتفكيك الأسئلة والمواضيع العربية
 *
 * Pure deterministic utilities shared between Express server, React UI, and Vitest.
 */

export type SemanticPassageKind = 'question' | 'topic' | 'lesson';
export type SemanticKindFilter = 'all' | 'question' | 'topic_lesson';

export interface SearchablePassage {
  id: string;
  sourceId: string;
  sourceTitle: string;
  kind: SemanticPassageKind;
  heading: string;
  pageNumber: number;
  text: string;
  snippet: string;
  textHash: string;
}

export interface SemanticSearchResultItem {
  passageId: string;
  sourceId: string;
  sourceTitle: string;
  kind: SemanticPassageKind;
  heading: string;
  pageNumber: number;
  snippet: string;
  score: number;
  matchPercent: number;
  matchReason: string;
}

export interface SemanticSearchResponse {
  results: SemanticSearchResultItem[];
  totalSearched: number;
  mode: 'vector-embedding' | 'lexical-fallback';
  cachedHits: number;
  embeddedCount: number;
}

const ARABIC_INDIC_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

const HEADING_LINE_REGEX = /^#{1,4}\s+(.+)$/;
const LESSON_HEADING_REGEX =
  /^(?:الدرس|الباب|الفصل|الوحدة|المبحث|المطلب|القسم|الموضوع|كتاب)\b/i;
const QUESTION_START_REGEX =
  /^(?:(?:#{1,6}\s*)?(?:\*\*)?(?:<u>)?(?:س\s*[0-9٠-٩]+|السؤال\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|[0-9٠-٩]+)|[0-9٠-٩]+\s*[-–.)]\s+|[(（][0-9٠-٩]+[)）]|(?:أعرب|اعرب|اضبط|علل|اختر|تخير|أكمل|اكمل|عرف|عرّف|ما\s+حكم|بيّن\s+الحكم|بين\s+الحكم|وضح|وضّح|اذكر|اشرح|قارن|صوّب|صوب|استخرج|بم\s+تفسر|دلل|هات|ما\s+المقصود|اقرأ\s+(?:القطعة|الفقرة|النص))))/i;

export function normalizeArabicForSearch(text: string): string {
  return (text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // strip tashkeel & tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (ch) => ARABIC_INDIC_MAP[ch] || ch)
    .replace(/[﴿﴾«»"“”'’()\[\]{}.,،؛:؟?!ـ*_`~|\\/#-]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeDeterministicTextHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `sem_${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}_${input.length}`;
}

export function stripToEmbeddingPlainText(markdown: string): string {
  return (markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<\/?(?:u|ins|mark|sup|sub|s|b|i|em|strong)(?:\s[^>]*)?>/gi, '')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, '$1')
    .replace(/[*`_>|]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSafeMarkdownSnippet(rawMarkdown: string, maxChars = 340): string {
  const cleaned = (rawMarkdown || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (cleaned.length <= maxChars) return cleaned;

  let slice = cleaned.slice(0, maxChars);
  // Avoid cutting inside an inline HTML tag like <u ...
  const lastOpenBracket = slice.lastIndexOf('<');
  const lastCloseBracket = slice.lastIndexOf('>');
  if (lastOpenBracket > lastCloseBracket) {
    slice = slice.slice(0, lastOpenBracket);
  }
  slice = slice.trimEnd() + '…';

  // Auto-close any unclosed <u>, <ins>, or <mark> tags so Markdown preview never leaks styling
  const openU = (slice.match(/<u>/gi) || []).length;
  const closeU = (slice.match(/<\/u>/gi) || []).length;
  if (openU > closeU) {
    slice += '</u>'.repeat(openU - closeU);
  }
  const openIns = (slice.match(/<ins>/gi) || []).length;
  const closeIns = (slice.match(/<\/ins>/gi) || []).length;
  if (openIns > closeIns) {
    slice += '</ins>'.repeat(openIns - closeIns);
  }
  const openMark = (slice.match(/<mark>/gi) || []).length;
  const closeMark = (slice.match(/<\/mark>/gi) || []).length;
  if (openMark > closeMark) {
    slice += '</mark>'.repeat(openMark - closeMark);
  }
  return slice;
}

export function buildSearchablePassages(
  sources: Array<{ id: string; title: string; markdown: string }>,
  kindFilter: SemanticKindFilter = 'all'
): SearchablePassage[] {
  const passages: SearchablePassage[] = [];

  for (const src of sources) {
    const rawMd = (src.markdown || '').trim();
    if (!rawMd) continue;

    const pages = rawMd.split(/\n*---PAGE_BREAK---\n*/);
    let currentHeading = src.title;
    let sourceSequence = 0;

    const pushPassage = (
      kind: SemanticPassageKind,
      heading: string,
      pageNumber: number,
      blockMarkdown: string
    ) => {
      const plain = stripToEmbeddingPlainText(blockMarkdown);
      if (plain.length < 18) return;

      const trimmedPlain = plain.slice(0, 1200);
      const snippet = buildSafeMarkdownSnippet(blockMarkdown, 340);
      const hashInput = `${heading}|${trimmedPlain}`;
      sourceSequence++;

      passages.push({
        id: `${src.id}::p${pageNumber}::${sourceSequence}`,
        sourceId: src.id,
        sourceTitle: src.title,
        kind,
        heading: heading || src.title,
        pageNumber,
        text: trimmedPlain,
        snippet,
        textHash: computeDeterministicTextHash(hashInput),
      });
    };

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const pageNumber = pageIdx + 1;
      const lines = pages[pageIdx].split(/\r?\n/);

      let bufferLines: string[] = [];
      let bufferKind: SemanticPassageKind = LESSON_HEADING_REGEX.test(currentHeading)
        ? 'lesson'
        : 'topic';
      let bufferHeading = currentHeading;

      const flushBuffer = () => {
        if (bufferLines.length === 0) return;
        const joined = bufferLines.join('\n').trim();
        if (joined) {
          pushPassage(bufferKind, bufferHeading, pageNumber, joined);
        }
        bufferLines = [];
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          // Paragraph boundary: flush if buffer is substantial
          if (bufferLines.join('\n').length >= 360) {
            flushBuffer();
          } else if (bufferLines.length > 0 && bufferLines[bufferLines.length - 1] !== '') {
            bufferLines.push('');
          }
          continue;
        }

        const headingMatch = trimmed.match(HEADING_LINE_REGEX);
        if (headingMatch) {
          flushBuffer();
          currentHeading = headingMatch[1].replace(/[*_`]/g, '').trim() || src.title;
          bufferHeading = currentHeading;
          bufferKind = LESSON_HEADING_REGEX.test(currentHeading) ? 'lesson' : 'topic';
          bufferLines.push(trimmed);
          continue;
        }

        const isQuestionLine = QUESTION_START_REGEX.test(trimmed);
        if (isQuestionLine) {
          // If previous buffer was a non-question short Arabic passage (like a grammar excerpt right before "أعرب ما تحته خط"),
          // keep a brief context tail when previous buffer is small, otherwise flush cleanly.
          const currentJoined = bufferLines.join('\n').trim();
          const hasUnderlinedContext =
            bufferKind !== 'question' &&
            currentJoined.length > 0 &&
            currentJoined.length <= 280 &&
            (/<u>/i.test(currentJoined) || /(?:اقرأ|القطعة|الفقرة|النص)/.test(currentJoined));

          if (!hasUnderlinedContext && currentJoined.length > 0) {
            flushBuffer();
          }
          bufferKind = 'question';
          bufferHeading = currentHeading;
          bufferLines.push(trimmed);

          if (bufferLines.join('\n').length >= 650) {
            flushBuffer();
          }
          continue;
        }

        bufferLines.push(trimmed);
        if (bufferLines.join('\n').length >= 620) {
          flushBuffer();
        }
      }

      flushBuffer();
    }

    // Fallback for tiny 1-page sources with short sentences
    if (!passages.some((p) => p.sourceId === src.id)) {
      const plain = stripToEmbeddingPlainText(rawMd);
      if (plain.length >= 6) {
        passages.push({
          id: `${src.id}::p1::fallback`,
          sourceId: src.id,
          sourceTitle: src.title,
          kind: 'topic',
          heading: src.title,
          pageNumber: 1,
          text: plain.slice(0, 1200),
          snippet: buildSafeMarkdownSnippet(rawMd, 340),
          textHash: computeDeterministicTextHash(`${src.title}|${plain.slice(0, 1200)}`),
        });
      }
    }
  }

  if (kindFilter === 'question') {
    return passages.filter((p) => p.kind === 'question');
  }
  if (kindFilter === 'topic_lesson') {
    return passages.filter((p) => p.kind === 'topic' || p.kind === 'lesson');
  }
  return passages;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function stripLightArabicPrefix(token: string): string {
  if (token.length < 4) return token;
  if (token.startsWith('وال') && token.length > 5) return token.slice(3);
  if (token.startsWith('بال') && token.length > 5) return token.slice(3);
  if (token.startsWith('كال') && token.length > 5) return token.slice(3);
  if (token.startsWith('فال') && token.length > 5) return token.slice(3);
  if (token.startsWith('لل') && token.length > 4) return token.slice(2);
  if (token.startsWith('ال') && token.length > 4) return token.slice(2);
  if (/^[وبفكل]/.test(token) && token.length >= 5) return token.slice(1);
  return token;
}

export function computeArabicLexicalScore(query: string, passageText: string): number {
  const normQuery = normalizeArabicForSearch(query);
  const normPassage = normalizeArabicForSearch(passageText);
  if (!normQuery || !normPassage) return 0;

  const queryTokens = normQuery
    .split(' ')
    .filter((t) => t.length >= 2);
  if (queryTokens.length === 0) return 0;

  const passageWords = normPassage.split(' ').filter(Boolean);
  const passageStemSet = new Set<string>();
  for (const w of passageWords) {
    passageStemSet.add(w);
    passageStemSet.add(stripLightArabicPrefix(w));
  }

  let matchedWeight = 0;
  for (const qt of queryTokens) {
    const qStem = stripLightArabicPrefix(qt);
    if (passageStemSet.has(qt) || passageStemSet.has(qStem)) {
      matchedWeight += 1;
    } else if (
      qStem.length >= 3 &&
      passageWords.some((pw) => pw.includes(qStem) || (pw.length >= 4 && qStem.includes(stripLightArabicPrefix(pw))))
    ) {
      matchedWeight += 0.65;
    }
  }

  const coverage = matchedWeight / queryTokens.length;
  const exactPhraseBonus = normQuery.length >= 4 && normPassage.includes(normQuery) ? 0.25 : 0;

  return Math.min(1, coverage * 0.85 + exactPhraseBonus);
}

export function rankSemanticPassagesHybrid(params: {
  query: string;
  passages: SearchablePassage[];
  queryVector?: number[] | null;
  passageVectors?: Map<string, number[]>;
  topK?: number;
  minScore?: number;
  mode?: 'vector-embedding' | 'lexical-fallback';
}): SemanticSearchResultItem[] {
  const {
    query,
    passages,
    queryVector = null,
    passageVectors = new Map<string, number[]>(),
    topK = 12,
    minScore = 0.18,
    mode = 'vector-embedding',
  } = params;

  const hasVectors =
    mode === 'vector-embedding' &&
    Array.isArray(queryVector) &&
    queryVector.length > 0;

  const effectiveThreshold = hasVectors ? minScore : Math.min(minScore, 0.14);

  const scored: SemanticSearchResultItem[] = [];
  for (const p of passages) {
    const lexSim = computeArabicLexicalScore(query, `${p.heading} ${p.text}`);
    let vecSim = 0;

    if (hasVectors && queryVector) {
      const vec = passageVectors.get(p.textHash);
      if (vec && vec.length === queryVector.length) {
        vecSim = Math.max(0, cosineSimilarity(queryVector, vec));
      }
    }

    const combinedScore =
      hasVectors && vecSim > 0
        ? Math.min(1, 0.78 * vecSim + 0.22 * lexSim + (vecSim >= 0.45 && lexSim >= 0.4 ? 0.05 : 0))
        : lexSim;

    if (combinedScore < effectiveThreshold) continue;

    let matchReason = 'صلة موضوعية بالاستعلام';
    if (!hasVectors || vecSim === 0) {
      matchReason = lexSim >= 0.65 ? 'تطابق لفظي قوي (بحث معجمي)' : 'تطابق في الكلمات والجذور (وضع احتياطي)';
    } else if (vecSim >= 0.68 && lexSim >= 0.35) {
      matchReason = 'تطابق دلالي ولفظي قوي';
    } else if (vecSim >= 0.56) {
      matchReason = 'تقارب دلالي مرتفع في المعنى';
    } else if (lexSim >= 0.45) {
      matchReason = 'تطابق دلالي واصطلاحي مشترك';
    }

    scored.push({
      passageId: p.id,
      sourceId: p.sourceId,
      sourceTitle: p.sourceTitle,
      kind: p.kind,
      heading: p.heading,
      pageNumber: p.pageNumber,
      snippet: p.snippet,
      score: Number(combinedScore.toFixed(4)),
      matchPercent: Math.min(99, Math.max(1, Math.round(combinedScore * 100))),
      matchReason,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, topK));
}
