export interface ConversionOptions {
  /**
   * Pages per AI request. Read at documentConverter.ts and passed to the chunker.
   *
   * `'balanced'` is the fallback when unset. The previous value was selected in the
   * UI and could be overridden; there is now a single fixed value, in
   * CONVERSION_DEFAULTS below.
   */
  quotaOptimization?: 'maximum_savings' | 'balanced' | 'high_fidelity';

  /**
   * Process a page subset. Read at documentConverter.ts and honoured by the chunker.
   * Always unset: there is no control that sets it.
   */
  pageRange?: {
    enabled: boolean;
    startPage: number;
    endPage: number;
  };
}

/**
 * The one configuration every conversion runs with.
 *
 * `quotaOptimization: 'maximum_savings'` is chosen so a document of any size is
 * absorbed rather than refused: the AI is asked for 12-15 pages per request instead
 * of 8-10, which cuts the request count per thousand pages by roughly a third. That
 * headroom is what makes the escalation below affordable, since a request that fails
 * or times out still consumes quota.
 *
 * `extractionEngine` is deliberately left unset. The converter starts every PDF with
 * the zero-quota direct text extractor and escalates to the AI only when a page has no
 * text layer to read, which is the case that genuinely needs it. A text-layer book
 * therefore costs no quota at all and, because its text is read rather than
 * recognized, is also more faithful than AI OCR, which can only ever hallucinate
 * words it cannot actually see.
 */
export const CONVERSION_DEFAULTS: ConversionOptions = {
  quotaOptimization: 'maximum_savings',
};

export interface QuranErrorItem {
  id: string;
  category: 'quran_verse' | 'irab_grammar' | 'balagha' | 'exercise_exam' | 'typography';
  severity: 'critical' | 'warning' | 'minor';
  location: string;
  foundText: string;
  correctText: string;
  surah: string;
  ayahNumber?: number | string;
  explanation: string;
  contextSentence?: string;
}

export interface QuranAuditResult {
  totalErrors: number;
  criticalErrorsCount: number;
  warningsCount: number;
  qualityScore: number;
  errors: QuranErrorItem[];
  hasQuranicDistortion: boolean;
  summary: string;
}

export interface DiffSegment {
  type: 'unchanged' | 'modified' | 'added' | 'removed';
  originalText?: string;
  wordText?: string;
  hasQuranError?: boolean;
  quranErrorText?: string;
  quranCorrectText?: string;
  lineNumber: number;
}

export interface DocumentComparisonResult {
  similarityScore: number;
  totalLinesOriginal: number;
  totalLinesWord: number;
  missingContentCount: number;
  modifiedContentCount: number;
  identicalContentCount: number;
  originalAudit: QuranAuditResult;
  wordAudit: QuranAuditResult;
  diffSegments: DiffSegment[];
  summaryReport: {
    overallVerdict: string;
    hasCriticalQuranErrors: boolean;
    missingSections: string[];
    recommendations: string[];
  };
}

export type ProcessingStageId =
  | 'image_denoise'
  | 'extraction'
  | 'contextual'
  | 'grammar'
  | 'structural'
  | 'quranic_verification'
  | 'layout_integrity'
  | 'finalizing';

export interface StageStatus {
  id: ProcessingStageId;
  title: string;
  subtitle: string;
  status: 'pending' | 'in_progress' | 'completed';
  progress: number; // 0 to 100
}

export interface ConversionProgress {
  currentChunk: number;
  totalChunks: number;
  startPage: number;
  endPage: number;
  totalPages: number;
  percentage: number;
  phase: 'reading' | 'splitting' | 'converting' | 'merging' | 'completed';
  activeStage?: ProcessingStageId;
  stages?: StageStatus[];
  statusMessage?: string;
  isRateLimited?: boolean;
  rateLimitCountdownSec?: number;
  isDailyQuotaExhausted?: boolean;
  canDirectExtract?: boolean;
  hasPausedError?: boolean;
  pausedErrorMessage?: string;
  processedChunksCount?: number;
  partialMarkdown?: string;
}

export interface ConversionResumeState {
  completedChunks: number;
  markdownPieces: string[];
  plainTextPieces: string[];
  docTitle?: string;
  detectedLang?: string;
  docTextDirection?: 'rtl' | 'ltr';
  hasMath?: boolean;
  hasArabic?: boolean;
  hasTables?: boolean;
  hasHandwriting?: boolean;
}

export interface IncompleteSentenceItem {
  id: string;
  truncatedText: string;
  predictedCompletion: string;
  grammaticalReason: string;
  contextLocation?: string;
  confidence: number;
}

export interface GrammarSyntaxReport {
  analyzedSentencesCount: number;
  hasCriticalTruncation: boolean;
  isAbruptTermination: boolean;
  truncatedItems: IncompleteSentenceItem[];
  overallGrammarVerdict: string;
  criticalTruncationAlert?: string;
}

export interface StructuralIssueItem {
  id: string;
  category: 'missing_header' | 'mismatched_numbering' | 'displaced_footnote' | 'missing_footnote';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  foundSnippet?: string;
  fixedSnippet?: string;
  location?: string;
  isRepaired: boolean;
}

export interface StructuralAuditReport {
  analyzedSectionsCount: number;
  totalIssuesCount: number;
  missingHeadersCount: number;
  numberingIssuesCount: number;
  footnoteIssuesCount: number;
  repairedCount: number;
  issues: StructuralIssueItem[];
  overallStructuralVerdict: string;
  hasStructuralFlaws: boolean;
}

export interface QuranicVerseMatchItem {
  id: string;
  foundSnippet: string;
  surahName: string;
  surahNumber: number;
  ayahNumber: number;
  canonicalUthmani: string;
  normalizedFound: string;
  matchSimilarity: number;
  discrepanciesCount: number;
  fixedSnippet: string;
  isCorrected: boolean;
  notes?: string;
}

export interface QuranicVerificationReport {
  totalVersesDetected: number;
  totalVersesVerified: number;
  correctedVersesCount: number;
  accuracyRate: number; // 0 to 100
  verifiedVerses: QuranicVerseMatchItem[];
  overallVerificationVerdict: string;
  hasUthmaniDiscrepancies: boolean;
}

export interface PageLayoutAuditItem {
  pageNumber: number;
  totalTables: number;
  totalLists: number;
  isRtlCompliant: boolean;
  tableIssues: string[];
  listIssues: string[];
  overflowWarning: boolean;
  status: 'perfect' | 'repaired' | 'warning';
}

export interface LayoutIntegrityReport {
  totalPagesAudited: number;
  tablesStabilizedCount: number;
  listsNormalizedCount: number;
  rtlEnforcedCount: number;
  overallLayoutScore: number; // 0 to 100
  overallVerdict: string;
  isAllPagesValid: boolean;
  pageAudits: PageLayoutAuditItem[];
}

export interface ConversionResult {
  detectedLanguage: string;
  textDirection: 'rtl' | 'ltr';
  pageCountEstimate?: number;
  totalPages?: number;
  totalChunksProcessed?: number;
  hasMathOrScience?: boolean;
  hasArabicText?: boolean;
  hasTables?: boolean;
  hasHandwriting?: boolean;
  title: string;
  markdown: string;
  plainText: string;
  fileName?: string;
  fileSize?: number;
  conversionDurationMs?: number;
  isAutoAudited?: boolean;
  autoFixedCount?: number;
  fixedItemsSummary?: string[];
  grammarSyntaxReport?: GrammarSyntaxReport;
  structuralAuditReport?: StructuralAuditReport;
  quranicVerificationReport?: QuranicVerificationReport;
  layoutIntegrityReport?: LayoutIntegrityReport;
}

export interface SavedConversion {
  id: string;
  timestamp: number;
  fileName: string;
  fileSize?: number;
  totalPages?: number;
  title: string;
  result: ConversionResult;
  isDownloaded: boolean;
}
