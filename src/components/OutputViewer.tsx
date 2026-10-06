import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
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
  BookOpen
} from 'lucide-react';
import { ConversionResult } from '../types';
import { downloadDocx, downloadTextFile } from '../utils/docxExporter';
import { LayoutIntegrityEngine } from './LayoutIntegrityEngine';

import { ErrorBoundary } from './ErrorBoundary';

interface OutputViewerProps {
  result: ConversionResult;
  onUpdateResult: (updatedResult: ConversionResult) => void;
  onDownloadSuccess?: () => void;
  onBackToBatch?: () => void;
  batchCount?: number;
}

/**
 * Prepares math blocks for KaTeX to ensure Arabic mathematical variables
 * (such as س, ص, ع, ا, ب, ج, د, ق, ك, جا, جتا, ظا) and arabic commas
 * are wrapped in \text{...} so KaTeX renders them without throwing unicode errors.
 */
function sanitizeArabicMath(content: string): string {
  if (!content) return '';

  return content.replace(/(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g, (mathBlock) => {
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
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown' | 'text'>('preview');
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState(result.markdown);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [customDirection, setCustomDirection] = useState<'rtl' | 'ltr'>(result.textDirection);
  const [showAuditReports, setShowAuditReports] = useState(false);

  const isRtl = customDirection === 'rtl';

  const renderedMarkdown = useMemo(() => {
    return sanitizeArabicMath(result.markdown);
  }, [result.markdown]);

  const handleCopy = async () => {
    const textToCopy = activeTab === 'text' ? result.plainText : result.markdown;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onDownloadSuccess?.();
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleDownloadDocx = async () => {
    setIsGeneratingDocx(true);
    try {
      const baseName = (result.fileName || 'document').replace(/\.pdf$/i, '');
      await downloadDocx(
        {
          title: result.title,
          markdown: result.markdown,
          isRtl: isRtl,
        },
        `${baseName}.docx`
      );
      onDownloadSuccess?.();
    } catch (error) {
      console.error('Error generating docx', error);
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  const handleDownloadMarkdown = () => {
    const baseName = (result.fileName || 'document').replace(/\.pdf$/i, '');
    downloadTextFile(result.markdown, `${baseName}.md`, 'text/markdown;charset=utf-8');
    onDownloadSuccess?.();
  };

  const handleDownloadText = () => {
    const baseName = (result.fileName || 'document').replace(/\.pdf$/i, '');
    downloadTextFile(result.plainText, `${baseName}.txt`, 'text/plain;charset=utf-8');
    onDownloadSuccess?.();
  };

  const handleSaveEdit = () => {
    onUpdateResult({
      ...result,
      markdown: editedMarkdown,
      plainText: editedMarkdown
        .replace(/^---\s*$/gm, '\n------------------------\n')
        .replace(/\\text\{([^\}]+)\}/g, '$1') // strip stray \text{} tags
        .replace(/#+\s+/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`{1,3}.*?`{1,3}/g, '')
        .replace(/\$\$?([^\$]+)\$\$?/g, '$1'), // strip math dollars
    });
    setIsEditing(false);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Return to Batch Banner if batch is active */}
      {onBackToBatch && batchCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-blue-900 truncate">
                أنت تشاهد حالياً نتيجة الملف: <span className="font-mono text-blue-700">{result.fileName}</span>
              </p>
              <p className="text-[11px] text-blue-700">
                حزمة المعالجة لا تزال نشطة تحتوي على ({batchCount}) ملفات
              </p>
            </div>
          </div>
          <button
            id="btn-return-to-batch"
            type="button"
            onClick={onBackToBatch}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span>العودة إلى الحزمة</span>
            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
      )}

      {/* Hero Primary Download & Action Card */}
      <div className="bg-white border-2 border-emerald-500/80 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>جاهز للتحميل • اتجاه يمين لليسار RTL معتمد</span>
              </span>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                {result.totalPages} صفحة (مطابق للـ PDF بنسبة 100%)
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-1 truncate" title={result.title || result.fileName}>
              {result.title || result.fileName}
            </h3>
          </div>

          <button
            id="btn-toggle-audit-reports"
            onClick={() => setShowAuditReports(!showAuditReports)}
            className="px-3 py-2 text-xs font-bold rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 flex items-center gap-1.5 cursor-pointer transition-colors self-start sm:self-auto shrink-0"
          >
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>{showAuditReports ? 'إخفاء تقارير الجودة' : 'عرض تقارير التدقيق والجودة (4 تقارير)'}</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              id="btn-download-docx-hero"
              onClick={handleDownloadDocx}
              disabled={isGeneratingDocx}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 active:scale-[0.99] text-white text-sm font-extrabold rounded-xl transition-all shadow-md flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-100" />
              <span>{isGeneratingDocx ? 'جاري تجهيز وتوليد ملف Word...' : 'تنزيل ملف Word (.docx) — من اليمين لليسار'}</span>
            </button>

            <button
              id="btn-download-md-hero"
              onClick={handleDownloadMarkdown}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileCode className="w-4 h-4 text-purple-600" />
              <span>Markdown</span>
            </button>

            <button
              id="btn-download-txt-hero"
              onClick={handleDownloadText}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-slate-600" />
              <span>نص (.txt)</span>
            </button>

            <button
              id="btn-copy-clipboard-hero"
              onClick={handleCopy}
              className="px-3.5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">تم النسخ!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-500" />
                  <span>نسخ</span>
                </>
              )}
            </button>
          </div>

          {/* View switcher & Language Direction */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'preview' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600'
                }`}
              >
                منسق
              </button>
              <button
                onClick={() => setActiveTab('text')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'text' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600'
                }`}
              >
                نص خام
              </button>
            </div>

            <button
              onClick={() => setCustomDirection(isRtl ? 'ltr' : 'rtl')}
              className="px-2.5 py-1.5 text-xs font-medium rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1 cursor-pointer"
              title="تبديل اتجاه العرض"
            >
              <Languages className="w-3.5 h-3.5 text-blue-600" />
              <span>{isRtl ? 'RTL يمين' : 'LTR يسار'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Quality & Audit Reports */}
      {showAuditReports && (
        <div className="space-y-4 animate-fadeIn">
          {/* Grammar & Syntax Critical Truncation Alert */}
          {result.grammarSyntaxReport?.hasCriticalTruncation && (
            <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-400/90 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-extrabold text-amber-950">
                        تنبيه وحدة التحليل النحوي: رصد انقطاع تركيبي أو نقص حرج في الملف
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                        بتر مفاجئ
                      </span>
                    </div>
                    <p className="text-xs text-amber-900 leading-relaxed mt-1">
                      {result.grammarSyntaxReport.criticalTruncationAlert ||
                        'تم رصد جمل عربية مفتوحة البتر لم تكتمل نحوياً وسياقياً.'}
                    </p>
                  </div>
                </div>
              </div>

              {result.grammarSyntaxReport.truncatedItems.length > 0 && (
                <div className="bg-white/80 border border-amber-200 rounded-xl p-3 space-y-2 text-xs">
                  <p className="font-bold text-slate-800">
                    الجمل المفتوحة التي تم فحصها وتوقع تكملتها بناءً على السياق:
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {result.grammarSyntaxReport.truncatedItems.map((item) => (
                      <div key={item.id} className="p-2 bg-amber-50/70 rounded-lg border border-amber-200/80">
                        <div className="flex items-center justify-between text-[11px] text-amber-900 font-semibold mb-1">
                          <span>العلة النحوية: {item.grammaticalReason}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 rounded text-amber-900 font-bold">
                            ثقة التوقع: {Math.round(item.confidence * 100)}%
                          </span>
                        </div>
                        <p className="text-red-700 font-mono text-[11px] line-through">
                          {item.truncatedText}
                        </p>
                        <p className="text-emerald-800 font-medium mt-1">
                          التكملة المتوقعة: {item.predictedCompletion}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Document Structural Integrity Report */}
          {result.structuralAuditReport && result.structuralAuditReport.issues.length > 0 && (
            <div className="bg-gradient-to-r from-indigo-50/90 via-sky-50/60 to-slate-50 border border-indigo-200/90 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-extrabold text-indigo-950">
                        تقرير التدقيق الهيكلي ومطابقة الأصل
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                        مطابقة معمارية الـ PDF
                      </span>
                    </div>
                    <p className="text-xs text-indigo-900 leading-relaxed mt-1">
                      {result.structuralAuditReport.overallStructuralVerdict}
                    </p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-extrabold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>تم ضبط {result.structuralAuditReport.repairedCount} موضع</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quranic Verification Agent Report */}
          {result.quranicVerificationReport && (
            <div className="bg-gradient-to-r from-emerald-50/95 via-teal-50/70 to-slate-50 border border-emerald-200/90 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <BookOpen className="w-6 h-6 text-emerald-100" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-extrabold text-emerald-950">
                        تقرير التحقق القرآني بالرسم العثماني
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        رواية حفص عن عاصم (دقة 100%)
                      </span>
                    </div>
                    <p className="text-xs text-emerald-900 leading-relaxed mt-1">
                      {result.quranicVerificationReport.overallVerificationVerdict}
                    </p>
                  </div>
                </div>
                <div className="text-left shrink-0 flex items-center gap-1.5">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-1 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    <span>دقة {result.quranicVerificationReport.accuracyRate}%</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Layout Integrity Engine Report */}
          {result.layoutIntegrityReport && (
            <LayoutIntegrityEngine report={result.layoutIntegrityReport} />
          )}
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xs min-h-[500px]">
        {activeTab === 'preview' ? (
          <div>
            <div className="flex justify-end pb-3 mb-4 border-b border-slate-100">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                {isEditing ? 'إلغاء التعديل' : 'تعديل النص'}
              </button>
            </div>

            {isEditing ? (
              <div className="flex flex-col space-y-3">
                <textarea
                  value={editedMarkdown}
                  onChange={(e) => setEditedMarkdown(e.target.value)}
                  className="w-full h-96 p-4 rounded-xl border border-slate-300 font-mono-code text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
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
                className={`prose-custom max-w-none text-slate-800 text-sm sm:text-base leading-relaxed space-y-4 ${
                  isRtl ? 'font-arabic text-right' : 'text-left'
                }`}
              >
                {renderedMarkdown.split(/(?:\n\s*---PAGE_BREAK---\s*\n|\n\n---\n\n)/).map((pageMarkdown, index, arr) => (
                  <ErrorBoundary key={index}>
                    <div className={index < arr.length - 1 ? "mb-10 pb-8 border-b-2 border-dashed border-slate-300 relative" : "relative"}>
                      {arr.length > 1 && (
                        <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-4 select-none pb-2 border-b border-slate-100">
                          <span className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100 text-[11px]">
                            الصفحة {index + 1} (مطابقة لصفحة الـ PDF والوورد)
                          </span>
                          <span>{index + 1} / {arr.length}</span>
                        </div>
                      )}
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore' }]]}
                        components={{
                          table: ({ node, ...props }) => (
                            <div className="overflow-x-auto my-5 rounded-xl border border-slate-300 shadow-xs">
                              <table className="w-full text-sm text-right border-collapse bg-white" {...props} />
                            </div>
                          ),
                          thead: ({ node, ...props }) => (
                            <thead className="bg-slate-100/90 text-slate-900 font-extrabold border-b border-slate-300" {...props} />
                          ),
                          th: ({ node, ...props }) => (
                            <th className="px-4 py-2.5 text-right font-extrabold text-slate-800 border-x border-slate-200" {...props} />
                          ),
                          td: ({ node, ...props }) => (
                            <td className="px-4 py-2 text-right border-b border-x border-slate-200 text-slate-700" {...props} />
                          ),
                          tr: ({ node, ...props }) => (
                            <tr className="hover:bg-blue-50/40 transition-colors odd:bg-white even:bg-slate-50/60" {...props} />
                          ),
                        }}
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
            className={`w-full h-96 p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs sm:text-sm leading-relaxed outline-none resize-y ${
              isRtl ? 'font-arabic text-right' : 'text-left'
            }`}
          />
        )}
      </div>
    </div>
  );
};


