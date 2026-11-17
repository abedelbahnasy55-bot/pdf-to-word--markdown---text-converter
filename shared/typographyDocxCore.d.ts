export type FontProfileId =
  | 'bilingual_publication'
  | 'heritage_azhari'
  | 'academic_editorial'
  | 'modern_crisp'
  | 'cairo_modern';

export interface TypographyOptions {
  fontProfile?: FontProfileId;
  arabicFont?: string;
  englishFont?: string;
  codeFont?: string;
  mathFont?: string;
  arabicSizePt?: number;
  englishSizePt?: number;
  lineSpacing?: number;
}

export interface TypographyProfileDefinition {
  id: FontProfileId;
  labelArabic: string;
  arabicFont: string;
  englishFont: string;
  codeFont: string;
  mathFont: string;
  arabicBodyPt: number;
  englishBodyPt: number;
  lineSpacing: number;
}

export interface ScriptSegment {
  text: string;
  isArabic: boolean;
}

export interface BuildDocxOptions extends TypographyOptions {
  title: string;
  markdown: string;
  isRtl?: boolean;
  direction?: 'rtl' | 'ltr' | 'auto';
  author?: string;
  typography?: TypographyOptions;
}

export const DOCX_MIME: string;
export const TYPOGRAPHY_PROFILES: Record<FontProfileId, TypographyProfileDefinition>;
export function resolveTypographyConfig(options?: TypographyOptions | { typography?: TypographyOptions }): any;
export function createDualScriptRunOptions(
  text: string,
  typoConfig: any,
  runIsArabic: boolean,
  role?: string,
  extra?: Record<string, any>
): any;
export function segmentByScript(text: string): ScriptSegment[];
export function resolveParagraphDirection(lineText: string, documentIsRtl: boolean): boolean;
export function sanitizeXmlString(input: unknown): string;
export function buildDocxBinary(
  options: BuildDocxOptions,
  deps: { docx: any; JSZip: any }
): Promise<Uint8Array>;
