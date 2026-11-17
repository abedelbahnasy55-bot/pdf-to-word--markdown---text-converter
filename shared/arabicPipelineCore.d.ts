export interface QAFindingItem {
  code: string;
  messageArabic: string;
}

export interface QAReportSummary {
  overallPassed: boolean;
  qualityScore: number;
  repairedCount: number;
  repairedText: string;
  findings: QAFindingItem[];
  metrics?: {
    totalLines: number;
    totalChars: number;
    punctIssuesRemaining: number;
    hamzaIssuesRemaining: number;
    leakedTagsCount: number;
  };
  verdictArabic: string;
}

export interface FidelitySummary {
  sourceWords: number;
  targetWords: number;
  wordFidelityRatio: number;
  quranicVersesCount: number;
  tablesCount: number;
}

export interface FullRefinementResult {
  markdown: string;
  plainText: string;
  isRtl: boolean;
  detectedLanguage: string;
  qaReport: QAReportSummary;
  fidelitySummary?: FidelitySummary;
  autoFixedCount: number;
}

export function toStandardArabicCore(text: string): string;
export function countArabicCharactersCore(text: string): number;
export function countLatinCharactersCore(text: string): number;
export function isRightToLeftTextCore(text: string): boolean;
export function containsArabicCore(text: string): boolean;
export function unwrapFakeMathCore(text: string): string;
export function pruneRunningHeadersCore(markdown: string): string;
export function explodeMultipleChoicesCore(text: string): string;
export function cleanKnownPatternsAndTablesCore(raw: string): { text: string; patternFixes: number };
export function polishBilingualBoundariesCore(markdown: string): string;
export function normalizeMarkdownTablesCore(markdown: string): string;
export function runStrictQAGatesCore(rawMarkdown: string): QAReportSummary;
export function auditTextFidelityCore(sourceText: string, targetMarkdown: string): FidelitySummary;
export function markdownToPlainTextCore(markdown: string): string;
export function runFullRefinementPipeline(rawMarkdown: string): FullRefinementResult;
