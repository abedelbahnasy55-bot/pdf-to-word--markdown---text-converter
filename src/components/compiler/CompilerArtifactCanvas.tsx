import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  BookOpen,
  Eye,
  ShieldCheck,
  Edit3,
  BookmarkPlus,
  Maximize2,
  Copy,
  Check,
  FileText,
  FileCode,
  RefreshCw,
  Download,
} from 'lucide-react';
import { remarkInlineHtmlPlugin } from '../../utils/remarkInlineHtmlPlugin';
import { EmbeddedMicroscopicAuditPanel } from '../EmbeddedMicroscopicAuditPanel';
import { ErrorBoundary } from '../ErrorBoundary';
import { CustomSelect } from '../ui/CustomSelect';
import { FONT_PROFILE_OPTIONS } from '../../config/compilerOptions';
import type { FontProfileId } from '../../utils/docxExporter';
import type { CompiledAnthologyResult } from '../../utils/smartCompilerEngine';
import type { ConversionResult } from '../../types';

interface CompilerArtifactCanvasProps {
  mobilePane: 'sources' | 'chat' | 'canvas';
  compiledAnthology: CompiledAnthologyResult | null;
  renderedPages: string[];
  activeOutputTab: 'preview' | 'audit' | 'edit';
  onChangeOutputTab: (tab: 'preview' | 'audit' | 'edit') => void;
  manualMarkdown: string;
  onChangeManualMarkdown: (md: string) => void;
  fontProfile: FontProfileId;
  onChangeFontProfile: (profile: FontProfileId) => void;
  isExportingDocx: boolean;
  isSavingToHistory: boolean;
  copiedOutput: boolean;
  onApplyManualEdit: () => void;
  onApplyAuditUpdate: (payload: {
    markdown: string;
    plainText: string;
    microscopicAuditReport: ConversionResult['microscopicAuditReport'];
    textCleanerReport: ConversionResult['textCleanerReport'];
  }) => void;
  onSaveToHistory: () => void;
  onOpenInFullViewer: (res: ConversionResult) => void;
  onCopyOutput: () => void;
  onExportPlainText: () => void;
  onExportMarkdown: () => void;
  onExportWord: () => void;
}

export const CompilerArtifactCanvas: React.FC<CompilerArtifactCanvasProps> = ({
  mobilePane,
  compiledAnthology,
  renderedPages,
  activeOutputTab,
  onChangeOutputTab,
  manualMarkdown,
  onChangeManualMarkdown,
  fontProfile,
  onChangeFontProfile,
  isExportingDocx,
  isSavingToHistory,
  copiedOutput,
  onApplyManualEdit,
  onApplyAuditUpdate,
  onSaveToHistory,
  onOpenInFullViewer,
  onCopyOutput,
  onExportPlainText,
  onExportMarkdown,
  onExportWord,
}) => {
  const auditSummary = compiledAnthology?.result.microscopicAuditReport?.summary;

  return (
    <section
      className={`${
        mobilePane === 'canvas' ? 'flex' : 'hidden lg:flex'
      } flex-1 lg:flex-[1.2] min-w-0 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl flex-col h-[660px] lg:h-full transition-colors overflow-hidden`}
    >
      {!compiledAnthology ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 bg-slate-50/40 dark:bg-[#10131C]">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#1B202C] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-[#232938] flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            منصة المعاينة والتحرير النهائي
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            بمجرد إرسال أمر التجميع أو الاستخراج في المحادثة، سيظهر هنا المستند المنسق بالكامل مع تقرير التطابق المجهري وسلامة الرسم العثماني، مع إمكانية التعديل المباشر والتصدير إلى Word و Markdown.
          </p>
        </div>
      ) : (
        <>
          {/* Sticky Artifact Canvas Header + Metrics Strip */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] space-y-2.5 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                  {compiledAnthology.result.title}
                </h2>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5 tabular-nums">
                  <span>{compiledAnthology.sectionCount} قسم</span>
                  <span>·</span>
                  <span>{compiledAnthology.result.totalPages || 1} صفحة</span>
                  <span>·</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    تطابق مجهري {auditSummary?.wordFidelityRatio ?? 100}%
                  </span>
                  <span>·</span>
                  <span className="text-blue-700 dark:text-blue-400 font-semibold">
                    عثماني {auditSummary?.quranicUthmaniCompliance ?? 100}%
                  </span>
                  {compiledAnthology.repetitionStats.preservedCrossExamRepeats > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        تكرار مفيد محفوظ: {compiledAnthology.repetitionStats.preservedCrossExamRepeats}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Sub-tabs + Secondary Quick Actions */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-[#10131C] p-0.5 rounded-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => onChangeOutputTab('preview')}
                  className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    activeOutputTab === 'preview'
                      ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>المعاينة المنسقة</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeOutputTab('audit')}
                  className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    activeOutputTab === 'audit'
                      ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>التدقيق المجهري</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeOutputTab('edit')}
                  className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    activeOutputTab === 'edit'
                      ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>تحرير المصدر</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onSaveToHistory}
                  disabled={isSavingToHistory}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
                  title="حفظ التجميعة في السجل الدائم"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>حفظ</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenInFullViewer(compiledAnthology.result)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
                  title="فتح في شاشة العرض الكاملة"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  <span>ملء الشاشة</span>
                </button>
              </div>
            </div>
          </div>

          {/* Output Reading / Editing Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-[#FCFCFA] dark:bg-[#10131C]">
            {activeOutputTab === 'preview' && (
              <ErrorBoundary>
                <article
                  dir={compiledAnthology.result.textDirection}
                  className="prose-custom max-w-[76ch] mx-auto space-y-4 text-sm sm:text-[15px] leading-relaxed font-arabic text-slate-800 dark:text-slate-200"
                >
                  {renderedPages.map((page, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && (
                        <div className="my-5 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 font-semibold tabular-nums">
                          <div className="flex-1 h-px bg-slate-200 dark:bg-[#232938]" />
                          <span>فاصل صفحة {idx + 1}</span>
                          <div className="flex-1 h-px bg-slate-200 dark:bg-[#232938]" />
                        </div>
                      )}
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath, remarkInlineHtmlPlugin]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {page}
                      </ReactMarkdown>
                    </React.Fragment>
                  ))}
                </article>
              </ErrorBoundary>
            )}

            {activeOutputTab === 'audit' && (
              <EmbeddedMicroscopicAuditPanel
                result={compiledAnthology.result}
                onApplyMarkdownUpdate={onApplyAuditUpdate}
              />
            )}

            {activeOutputTab === 'edit' && (
              <div className="space-y-3 h-full flex flex-col">
                <textarea
                  value={manualMarkdown}
                  onChange={(e) => onChangeManualMarkdown(e.target.value)}
                  dir="auto"
                  className="flex-1 min-h-[380px] w-full p-3.5 text-xs font-mono-code rounded-lg border border-slate-300 dark:border-[#2A3142] bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onApplyManualEdit}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    حفظ التعديل وإعادة التدقيق المجهري
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Publication Export Footer Bar with CustomSelect */}
          <div className="px-4 py-2.5 border-t border-slate-200 dark:border-[#232938] bg-slate-50/80 dark:bg-[#171B26] flex flex-wrap items-center justify-between gap-2 shrink-0">
            <CustomSelect<FontProfileId>
              value={fontProfile}
              onChange={onChangeFontProfile}
              options={FONT_PROFILE_OPTIONS}
              ariaLabel="نمط الخطوط والطباعة لملف Word"
              menuPlacement="top"
              size="sm"
              className="w-56"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onCopyOutput}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="نسخ المخرج بصيغة Markdown"
              >
                {copiedOutput ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                )}
                <span>{copiedOutput ? 'تم النسخ' : 'نسخ'}</span>
              </button>

              <button
                type="button"
                onClick={onExportPlainText}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="تنزيل بصيغة نص عادي (.txt)"
              >
                <FileText className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                <span>TXT</span>
              </button>

              <button
                type="button"
                onClick={onExportMarkdown}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="تنزيل بصيغة Markdown (.md)"
              >
                <FileCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>MD</span>
              </button>

              <button
                type="button"
                onClick={onExportWord}
                disabled={isExportingDocx}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {isExportingDocx ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Word (.docx)</span>
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
