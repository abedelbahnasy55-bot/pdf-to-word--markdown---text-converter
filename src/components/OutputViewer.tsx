import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkInlineHtmlPlugin } from '../utils/remarkInlineHtmlPlugin';
import {
  Download,
  Copy,
  Check,
  FileCode,
  FileText,
  Languages,
  Edit3,
  Layers,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  BookOpen,
} from 'lucide-react';
import { ConversionResult } from '../types';
import {
  downloadDocx,
  downloadTextFile,
  TYPOGRAPHY_PROFILES,
  FontProfileId,
} from '../utils/docxExporter';
import { LayoutIntegrityEngine } from './LayoutIntegrityEngine';
import { StrictQAGatesCard } from './StrictQAGatesCard';
import { EmbeddedMicroscopicAuditPanel } from './EmbeddedMicroscopicAuditPanel';
import { runMicroscopicAudit } from '../utils/microscopicAuditEngine';
import { CustomSelect } from './ui';
import { ErrorBoundary } from './ErrorBoundary';

interface OutputViewerProps {
  result: ConversionResult;
  onUpdateResult: (updatedResult: ConversionResult) => void;
  onDownloadSuccess?: () => void;
  onBackToBatch?: () => void;
  batchCount?: number;
}

function sanitizeArabicMath(content: string): string {
  if (!content) return '';

  return content.replace(/(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g, (mathBlock) => {
    const isSingleDollar = mathBlock.startsWith('$') && !mathBlock.startsWith('$$');
    if (isSingleDollar) {
      const inner = mathBlock.slice(1, -1).trim();
      const hasMathOperators =
        /[\^_\\]|[\+\*\/\=<>±×÷≤≥≠≈∑∫√]|\\(?:frac|sqrt|times|pm|approx|le|ge|neq|sum|int|sin|cos|tan|pi|alpha|beta|theta|gamma|delta|sigma|infty|parallel)/.test(
          inner
        );
      if (!hasMathOperators) {
        return inner;
      }
    }

    const textPlaceholders: string[] = [];
    let processed = mathBlock.replace(/\\text\{([^\}]+)\}/g, (_, inner) => {
      const idx = textPlaceholders.length;
      textPlaceholders.push(inner);
      return `__TXT_HOLD_${idx}__`;
    });

    processed = processed.replace(/([أ-يآإئؤء،ـة]+(?:\s+[أ-يآإئؤء،ـة]+)*)/g, '\\text{$1}');
    processed = processed.replace(/\/\//g, '\\parallel ');

    processed = processed.replace(/__TXT_HOLD_(\d+)__/g, (_, idx) => {
      return `\\text{${textPlaceholders[Number(idx)]}}`;
    });

    return processed;
  });
}

export const OutputViewer: React.FC<OutputViewerProps> = ({
  result,
  onUpdateResult,
  onDownloadSuccess,
  onBackToBatch,
  batchCount = 0,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'text' | 'audit'>('preview');
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState(result.markdown);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [customDirection, setCustomDirection] = useState<'rtl' | 'ltr'>(result.textDirection);
  const [fontProfile, setFontProfile] = useState<FontProfileId>('bilingual_publication');
  const [showAuditReports, setShowAuditReports] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRtl = customDirection === 'rtl';

  useEffect(() => {
    setEditedMarkdown(result.markdown);
  }, [result.markdown]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const renderedMarkdown = useMemo(() => sanitizeArabicMath(result.markdown), [result.markdown]);

  const effectiveMicroscopicAudit = useMemo(() => {
    return (
      result.microscopicAuditReport ||
      runMicroscopicAudit(result.sourceExtractText || result.plainText || '', result.markdown || '')
    );
  }, [
    result.microscopicAuditReport,
    result.sourceExtractText,
    result.plainText,
    result.markdown,
  ]);

  const fontProfileOptions = useMemo(
    () =>
      Object.values(TYPOGRAPHY_PROFILES).map((prof) => ({
        value: prof.id as FontProfileId,
        label: prof.labelArabic,
        description: `${prof.arabicFont} ${prof.arabicBodyPt}pt / ${prof.englishFont} ${prof.englishBodyPt}pt`,
      })),
    []
  );

  const handleCopy = async () => {
    const textToCopy = activeTab === 'text' ? result.plainText : result.markdown;
    setDownloadError(null);
    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setIsCopied(false);
        copyTimerRef.current = null;
      }, 2000);
      onDownloadSuccess?.();
    } catch (err) {
      console.error('Failed to copy', err);
      setDownloadError('تعذر النسخ التلقائي إلى الحافظة. يرجى تحديد النص ونسخه يدوياً.');
    }
  };

  const handleDownloadDocx = async () => {
    setIsGeneratingDocx(true);
    setDownloadError(null);
    try {
      const baseName = (result.fileName || result.title || 'document').replace(/\.[^/.]+$/, '');
      await downloadDocx(
        {
          title: result.title,
          markdown: result.markdown,
          isRtl,
          fontProfile,
        },
        `${baseName}.docx`
      );
      onDownloadSuccess?.();
    } catch (error: any) {
      console.error('Error generating docx', error);
      setDownloadError(error?.message || 'تعذر تجهيز ملف Word (.docx).');
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  const handleDownloadMarkdown = () => {
    const baseName = (result.fileName || result.title || 'document').replace(/\.[^/.]+$/, '');
    downloadTextFile(result.markdown, `${baseName}.md`, 'text/markdown;charset=utf-8');
    onDownloadSuccess?.();
  };

  const handleDownloadText = () => {
    const baseName = (result.fileName || result.title || 'document').replace(/\.[^/.]+$/, '');
    downloadTextFile(result.plainText, `${baseName}.txt`, 'text/plain;charset=utf-8');
    onDownloadSuccess?.();
  };

  const handleSaveEdit = () => {
    onUpdateResult({
      ...result,
      markdown: editedMarkdown,
      plainText: editedMarkdown
        .replace(/^---\s*$/gm, '\n------------------------\n')
        .replace(/\\text\{([^\}]+)\}/g, '$1')
        .replace(/#+\s+/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`{1,3}.*?`{1,3}/g, '')
        .replace(/\$\$?([^\$]+)\$\$?/g, '$1'),
    });
    setIsEditing(false);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      {onBackToBatch && batchCount > 0 && (
        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-blue-900 dark:text-blue-200 truncate">
                الملف المعروض: <span className="font-mono">{result.fileName}</span>
              </p>
              <p className="text-[11px] text-blue-700 dark:text-blue-300 tabular-nums">
                قائمة المعالجة تحتوي على {batchCount} ملفات
              </p>
            </div>
          </div>
          <button
            id="btn-return-to-batch"
            type="button"
            onClick={onBackToBatch}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span>العودة للقائمة</span>
            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
      )}

      {downloadError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{downloadError}</span>
        </div>
      )}

      {/* Primary Download & Action Card */}
      <div className="bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#232938]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>جاهز ومُدقق تلقائياً</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{result.totalPages || 1} صفحة</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                تطابق الكلمات {effectiveMicroscopicAudit.summary.wordFidelityRatio}%
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                الرسم العثماني {effectiveMicroscopicAudit.summary.quranicUthmaniCompliance}%
              </span>
              <span aria-hidden="true">·</span>
              <span
                className={`tabular-nums font-semibold ${
                  effectiveMicroscopicAudit.summary.missingParagraphsCount === 0
                    ? 'text-slate-600 dark:text-slate-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                السواقط {effectiveMicroscopicAudit.summary.missingParagraphsCount}
              </span>
              <button
                type="button"
                onClick={() => setShowAuditReports((prev) => !prev)}
                className="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] px-2.5 py-1 rounded-md cursor-pointer transition-colors whitespace-nowrap shrink-0 mr-auto sm:mr-2"
              >
                {showAuditReports ? 'إخفاء تقارير الجودة' : 'تقارير الجودة'}
              </button>
            </div>
            <h3
              className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1.5 truncate"
              title={result.title || result.fileName}
            >
              {result.title || result.fileName}
            </h3>
          </div>
        </div>

        {/* Action Buttons & Custom Dropdown Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              id="btn-download-docx-hero"
              type="button"
              onClick={handleDownloadDocx}
              disabled={isGeneratingDocx}
              className="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4 text-white" />
              <span>{isGeneratingDocx ? 'جاري تجهيز Word...' : 'تنزيل Word (.docx)'}</span>
            </button>

            <button
              id="btn-download-md-hero"
              type="button"
              onClick={handleDownloadMarkdown}
              className="px-3 py-2 bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Markdown</span>
            </button>

            <button
              id="btn-download-txt-hero"
              type="button"
              onClick={handleDownloadText}
              className="px-3 py-2 bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>نص (.txt)</span>
            </button>

            <button
              id="btn-copy-clipboard-hero"
              type="button"
              onClick={handleCopy}
              className="px-3 py-2 border border-slate-200 dark:border-[#2A3142] hover:bg-slate-50 dark:hover:bg-[#1B202C] text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-300 font-bold">تم النسخ</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>نسخ</span>
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-[#1B202C] p-1 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'preview'
                    ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                منسق
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'text'
                    ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                نص خام
              </button>
              <button
                type="button"
                id="btn-tab-microscopic-audit"
                onClick={() => setActiveTab('audit')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  activeTab === 'audit'
                    ? 'bg-white dark:bg-[#141720] text-emerald-700 dark:text-emerald-300 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>التدقيق المجهري</span>
              </button>
            </div>

            <CustomSelect
              value={fontProfile}
              onChange={(val) => setFontProfile(val as FontProfileId)}
              options={fontProfileOptions}
              ariaLabel="نمط الخطوط المعاير في Word"
              className="w-56"
            />

            <button
              type="button"
              onClick={() => setCustomDirection(isRtl ? 'ltr' : 'rtl')}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#171B26] hover:bg-slate-50 dark:hover:bg-[#1E2433] text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
              title="تبديل اتجاه العرض"
            >
              <Languages className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{isRtl ? 'RTL يمين' : 'LTR يسار'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Quality & Audit Reports */}
      {showAuditReports && (
        <div className="space-y-4">
          {result.strictQAReport && <StrictQAGatesCard report={result.strictQAReport} />}

          {result.grammarSyntaxReport?.hasCriticalTruncation && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                    تنبيه التحليل النحوي: رصد انقطاع تركيبي محتمل
                  </h4>
                  <p className="text-xs text-amber-900 dark:text-amber-200/90 leading-relaxed mt-1">
                    {result.grammarSyntaxReport.criticalTruncationAlert ||
                      'تم رصد جمل عربية مفتوحة البتر لم تكتمل نحوياً وسياقياً.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {result.quranicVerificationReport && (
            <div className="bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                    {result.detectedLanguage === 'English' || !result.hasArabicText
                      ? 'تقرير التدقيق اللغوي والتيبوغرافي'
                      : 'تقرير التحقق القرآني بالرسم العثماني'}
                  </h4>
                  <p className="text-xs text-emerald-900 dark:text-emerald-300/90 leading-relaxed mt-1">
                    {result.quranicVerificationReport.overallVerificationVerdict}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs font-bold shrink-0 tabular-nums">
                دقة {result.quranicVerificationReport.accuracyRate}%
              </span>
            </div>
          )}

          {result.layoutIntegrityReport && (
            <LayoutIntegrityEngine report={result.layoutIntegrityReport} />
          )}
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="bg-white dark:bg-[#141720] border border-slate-200/80 dark:border-[#232938] rounded-xl p-5 sm:p-8 min-h-[500px]">
        {activeTab === 'audit' ? (
          <EmbeddedMicroscopicAuditPanel
            result={result}
            onApplyMarkdownUpdate={({
              markdown,
              plainText,
              microscopicAuditReport,
              textCleanerReport,
            }) => {
              onUpdateResult({
                ...result,
                markdown,
                plainText,
                microscopicAuditReport,
                textCleanerReport: textCleanerReport || result.textCleanerReport,
              });
            }}
          />
        ) : activeTab === 'preview' ? (
          <div>
            <div className="flex justify-end pb-3 mb-4 border-b border-slate-100 dark:border-[#232938]">
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditing ? 'إلغاء التعديل' : 'تعديل النص'}</span>
              </button>
            </div>

            {isEditing ? (
              <div className="flex flex-col space-y-3">
                <textarea
                  value={editedMarkdown}
                  onChange={(e) => setEditedMarkdown(e.target.value)}
                  className="w-full h-96 p-4 rounded-xl border border-slate-300 dark:border-[#2A3142] bg-slate-50 dark:bg-[#0F1219] font-mono-code text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1B202C] rounded-lg cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                  >
                    حفظ التعديلات
                  </button>
                </div>
              </div>
            ) : (
              <div
                dir={isRtl ? 'rtl' : 'ltr'}
                className={`prose-custom max-w-none text-slate-800 dark:text-slate-200 text-sm sm:text-base leading-relaxed space-y-4 ${
                  isRtl ? 'font-arabic text-right' : 'text-left'
                }`}
              >
                {renderedMarkdown
                  .split(/(?:\n\s*---PAGE_BREAK---\s*\n|\n\n---\n\n)/)
                  .map((pageMarkdown, index, arr) => (
                    <ErrorBoundary key={index} variant="inline">
                      <div
                        className={
                          index < arr.length - 1
                            ? 'mb-8 pb-7 border-b border-dashed border-slate-300 dark:border-[#2A3142] relative'
                            : 'relative'
                        }
                      >
                        {arr.length > 1 && (
                          <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 font-semibold mb-4 select-none pb-2 border-b border-slate-100 dark:border-[#232938]">
                            <span className="text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 px-2.5 py-0.5 rounded text-[11px] tabular-nums">
                              الصفحة {index + 1}
                            </span>
                            <span className="tabular-nums">
                              {index + 1} / {arr.length}
                            </span>
                          </div>
                        )}
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath, remarkInlineHtmlPlugin]}
                          rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore' }]]}
                        >
                          {pageMarkdown}
                        </ReactMarkdown>
                      </div>
                    </ErrorBoundary>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <textarea
            readOnly
            dir={isRtl ? 'rtl' : 'ltr'}
            value={result.plainText}
            className={`w-full h-96 p-4 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-slate-50 dark:bg-[#0F1219] text-slate-800 dark:text-slate-200 text-xs sm:text-sm leading-relaxed outline-none resize-y ${
              isRtl ? 'font-arabic text-right' : 'text-left'
            }`}
          />
        )}
      </div>
    </div>
  );
};
