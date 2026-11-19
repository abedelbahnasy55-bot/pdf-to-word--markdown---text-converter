import React, { useMemo, useState, useEffect } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  Layers,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { ConversionResult } from '../types';
import {
  runMicroscopicAudit,
  MicroscopicAuditResult,
} from '../utils/microscopicAuditEngine';
import {
  TextCleanerEngine,
  CleanerRuleItem,
  CleanerAuditReport,
} from '../../shared/textCleanerEngine';
import { TextProcessor } from '../../shared/textProcessor';
import { StrictQAGatesEngine } from '../utils/strictQAGatesEngine';
import { toStandardArabic } from '../../shared/arabicText';
import { polishBilingualBoundariesCore } from '../../shared/arabicPipelineCore';
import { CustomSelect } from './ui';

interface EmbeddedMicroscopicAuditPanelProps {
  result: ConversionResult;
  onApplyMarkdownUpdate: (payload: {
    markdown: string;
    plainText: string;
    microscopicAuditReport: MicroscopicAuditResult;
    textCleanerReport?: CleanerAuditReport;
  }) => void;
}

function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return text.split(/\s+/).filter((w) => w.length > 0);
}

function stripMarkdownToPlain(md: string): string {
  return md
    .replace(/^---\s*$/gm, '\n------------------------\n')
    .replace(/\\text\{([^\}]+)\}/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<\/?(?:mark|u|ins|s|sup|sub)(?:\s[^>]*)?>/gi, '')
    .replace(/\$\$?([^\$]+)\$\$?/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .trim();
}

type CleanerCategory = 'table_header' | 'margin_noise' | 'fiqh_typo' | 'spelling' | 'custom';

const CATEGORY_OPTIONS: Array<{ value: CleanerCategory; label: string }> = [
  { value: 'fiqh_typo', label: 'مصطلح / خطأ لغوي' },
  { value: 'table_header', label: 'فواصل جداول' },
  { value: 'margin_noise', label: 'شوائب هوامش' },
  { value: 'spelling', label: 'إملاء عام' },
  { value: 'custom', label: 'مخصص' },
];

export const EmbeddedMicroscopicAuditPanel: React.FC<EmbeddedMicroscopicAuditPanelProps> = ({
  result,
  onApplyMarkdownUpdate,
}) => {
  const [sourceText, setSourceText] = useState(
    result.sourceExtractText || result.plainText || ''
  );
  const [targetMarkdown, setTargetMarkdown] = useState(result.markdown || '');
  const [activeSubTab, setActiveSubTab] = useState<'diff' | 'quran' | 'fiqh' | 'omissions'>('diff');
  const [copiedTarget, setCopiedTarget] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const [cleanerEngine] = useState(() => new TextCleanerEngine());
  const [cleanerRules, setCleanerRules] = useState<CleanerRuleItem[]>(() =>
    cleanerEngine.getRules()
  );
  const [isCleanerModalOpen, setIsCleanerModalOpen] = useState(false);
  const [lastCleanerReport, setLastCleanerReport] = useState<CleanerAuditReport | null>(
    result.textCleanerReport || null
  );
  const [ruleSearchQuery, setRuleSearchQuery] = useState('');

  const [newPattern, setNewPattern] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [newCategory, setNewCategory] = useState<CleanerCategory>('fiqh_typo');
  const [newSubject, setNewSubject] = useState('عام');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    setSourceText(result.sourceExtractText || result.plainText || '');
    setTargetMarkdown(result.markdown || '');
    setLastCleanerReport(result.textCleanerReport || null);
  }, [result.fileName, result.markdown, result.sourceExtractText]);

  useEffect(() => {
    if (!isCleanerModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCleanerModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCleanerModalOpen]);

  const auditResult: MicroscopicAuditResult = useMemo(() => {
    if (
      result.microscopicAuditReport &&
      targetMarkdown === result.markdown &&
      sourceText === (result.sourceExtractText || result.plainText || '')
    ) {
      return result.microscopicAuditReport;
    }
    return runMicroscopicAudit(sourceText, targetMarkdown);
  }, [
    sourceText,
    targetMarkdown,
    result.markdown,
    result.sourceExtractText,
    result.plainText,
    result.microscopicAuditReport,
  ]);

  const { summary, quranicReport, fiqhTermsReport, missingSegments } = auditResult;

  const commitTextUpdate = (nextMarkdown: string, cleanerReport?: CleanerAuditReport) => {
    const qaResult = StrictQAGatesEngine.auditAndRepair(
      polishBilingualBoundariesCore(TextProcessor.process(toStandardArabic(nextMarkdown))),
      result.fileName || 'document'
    );
    const finalMd = qaResult.repairedText;
    const nextAudit = runMicroscopicAudit(sourceText, finalMd);
    setTargetMarkdown(finalMd);
    onApplyMarkdownUpdate({
      markdown: finalMd,
      plainText: stripMarkdownToPlain(finalMd),
      microscopicAuditReport: nextAudit,
      textCleanerReport: cleanerReport || lastCleanerReport || undefined,
    });
  };

  const handleRunTextCleanerOnDocument = () => {
    const report = cleanerEngine.cleanText(targetMarkdown);
    setLastCleanerReport(report);
    const freshAudit = runMicroscopicAudit(sourceText, report.cleanedText);
    commitTextUpdate(freshAudit.autoHealedMarkdown || report.cleanedText, report);
  };

  const handleApplyManualEdits = () => {
    const freshAudit = runMicroscopicAudit(sourceText, targetMarkdown);
    commitTextUpdate(freshAudit.autoHealedMarkdown || targetMarkdown);
  };

  const handleToggleRule = (id: string) => {
    cleanerEngine.toggleRule(id);
    setCleanerRules(cleanerEngine.getRules());
  };

  const handleRemoveRule = (id: string) => {
    cleanerEngine.removeRule(id);
    setCleanerRules(cleanerEngine.getRules());
  };

  const handleResetRules = () => {
    const reset = cleanerEngine.resetToDefault();
    setCleanerRules(reset);
  };

  const handleAddCustomRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPattern.trim()) return;
    cleanerEngine.addRule({
      patternStr: newPattern.trim(),
      flags: 'g',
      replacement: newReplacement,
      category: newCategory,
      subject: newSubject || 'عام',
      description: newDescription || `تصحيح تلقائي لـ ${newPattern}`,
      enabled: true,
    });
    setCleanerRules(cleanerEngine.getRules());
    setNewPattern('');
    setNewReplacement('');
    setNewDescription('');
  };

  const handleCopyTarget = async () => {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(targetMarkdown);
      setCopiedTarget(true);
      setTimeout(() => setCopiedTarget(false), 2000);
    } catch {
      setCopyError(true);
    }
  };

  const isHealthyFidelity = summary.wordFidelityRatio >= 93 && summary.missingParagraphsCount === 0;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="border border-slate-200 dark:border-[#232938] rounded-xl bg-slate-50/60 dark:bg-[#11141C] p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{summary.overallVerdict}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {summary.targetWords} من {summary.sourceWords} كلمة
              </span>
              {lastCleanerReport && lastCleanerReport.totalReplacements > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                    {lastCleanerReport.totalReplacements} إصلاح قاموس تلقائي
                  </span>
                </>
              )}
            </div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
              نتائج التدقيق المجهري التلقائي ومطابقة الأصل
            </h4>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              id="btn-rerun-microscopic-cleaner"
              onClick={handleRunTextCleanerOnDocument}
              className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="إعادة تشغيل التنظيف الآلي وتوثيق الآيات بالرسم العثماني على المستند"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>إعادة التنظيف والتدقيق</span>
            </button>

            <button
              type="button"
              id="btn-manage-cleaner-dictionary"
              onClick={() => setIsCleanerModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#171B26] hover:bg-slate-100 dark:hover:bg-[#1E2433] border border-slate-200 dark:border-[#2A3142] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="إضافة أو تخصيص قواعد القاموس المرجعي"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              <span>قواعد القاموس ({cleanerRules.filter((r) => r.enabled).length})</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-slate-200 dark:divide-[#232938] border border-slate-200 dark:border-[#232938] bg-white dark:bg-[#141720] rounded-lg overflow-hidden">
          <div className="p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">نسبة تطابق الكلمات</div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5 flex items-center gap-1.5">
              <span>{summary.wordFidelityRatio}%</span>
              {isHealthyFidelity ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
            </div>
          </div>

          <div className="p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">الآيات بالرسم العثماني</div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
              {summary.quranicUthmaniCompliance}%
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 mr-1.5">
                ({summary.quranicVersesCount} آية)
              </span>
            </div>
          </div>

          <div className="p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">مصطلحات موثقة</div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
              {fiqhTermsReport.length}
            </div>
          </div>

          <div className="p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">الأسئلة المرقمة المحفوظة</div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
              {summary.questionsPreservedInTarget} /{' '}
              {summary.questionsDetectedInSource || summary.questionsPreservedInTarget}
            </div>
          </div>

          <div className="p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">السواقط النصية المرصودة</div>
            <div
              className={`text-lg font-bold tabular-nums mt-0.5 ${
                summary.missingParagraphsCount === 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {summary.missingParagraphsCount}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Tabs Bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#1B202C] rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setActiveSubTab('diff')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'diff'
              ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>المقارنة المتزامنة (Diff)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('quran')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'quran'
              ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>سجل الآيات العثمانية ({quranicReport.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('fiqh')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'fiqh'
              ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>المصطلحات ({fiqhTermsReport.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('omissions')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'omissions'
              ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>كاشف السواقط ({missingSegments.length})</span>
        </button>
      </div>

      {activeSubTab === 'diff' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-slate-200 dark:border-[#232938] rounded-xl p-4 bg-white dark:bg-[#141720] flex flex-col h-[460px]">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-[#232938]">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  المستخرج الخام من الملف الأصلي
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {tokenizeWords(sourceText).length} كلمة
                </span>
              </div>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                dir="rtl"
                className="w-full flex-1 mt-3 p-3 text-xs leading-relaxed text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#0F1219] border border-slate-200 dark:border-[#2A3142] rounded-lg resize-none font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="border border-slate-200 dark:border-[#232938] rounded-xl p-4 bg-white dark:bg-[#141720] flex flex-col h-[460px]">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-[#232938]">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  النص المدقق الجاهز للتصدير (Word / Markdown)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyTarget}
                    className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] rounded-md transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    {copiedTarget ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>تم النسخ</span>
                      </>
                    ) : copyError ? (
                      <>
                        <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span>تعذر النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>نسخ</span>
                      </>
                    )}
                  </button>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {tokenizeWords(targetMarkdown).length} كلمة
                  </span>
                </div>
              </div>
              <textarea
                value={targetMarkdown}
                onChange={(e) => setTargetMarkdown(e.target.value)}
                dir="rtl"
                className="w-full flex-1 mt-3 p-3 text-xs leading-relaxed text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#0F1219] border border-slate-200 dark:border-[#2A3142] rounded-lg resize-none font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {targetMarkdown !== result.markdown && (
            <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-xs">
              <span className="text-emerald-900 dark:text-emerald-200 font-semibold">
                توجد تعديلات يدوية غير محفوظة في معاينة Word.
              </span>
              <button
                type="button"
                onClick={handleApplyManualEdits}
                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                اعتماد التعديلات للمستند وتحديث الوورد
              </button>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'quran' && (
        <div className="border border-slate-200 dark:border-[#232938] rounded-xl p-5 bg-white dark:bg-[#141720] space-y-3">
          {quranicReport.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500 dark:text-slate-400">
              لم تُرصد آيات قرآنية من السور المفهرسة في هذا المستند.
            </div>
          ) : (
            quranicReport.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-lg border border-slate-200 dark:border-[#252B3B] bg-slate-50/50 dark:bg-[#191E2A] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      سورة {item.surahName} · آية {item.ayahNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      {item.hasOrnamentalBrackets ? 'موثقة بالأقواس ﴿ ﴾' : 'تحتاج تغليف أقواس'}
                    </span>
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100 font-arabic leading-relaxed">
                    {item.targetSnippet}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeSubTab === 'fiqh' && (
        <div className="border border-slate-200 dark:border-[#232938] rounded-xl p-5 bg-white dark:bg-[#141720]">
          {fiqhTermsReport.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500 dark:text-slate-400">
              لا توجد مصطلحات فقهية متخصصة مرصودة في هذا المستند.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {fiqhTermsReport.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-slate-200 dark:border-[#252B3B] bg-slate-50/60 dark:bg-[#191E2A] flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      {item.term}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.category}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                    {item.status === 'omission_detected' ? 'سقط محتمل' : 'مطابق'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'omissions' && (
        <div className="border border-slate-200 dark:border-[#232938] rounded-xl p-5 bg-white dark:bg-[#141720]">
          {missingSegments.length === 0 ? (
            <div className="p-6 text-center rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/10">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
              <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                تم التحقق: لا يوجد أي سقوط للفقرات أو المسائل
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                كافة النصوص المستخرجة محفوظة في ملف Word المجهز للتنزيل.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {missingSegments.map((segment, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/10 space-y-1"
                >
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-300">
                    فقرة من الأصل تحتاج مراجعة ({idx + 1}):
                  </div>
                  <div className="text-xs text-slate-800 dark:text-slate-200 font-mono leading-relaxed">
                    {segment}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isCleanerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white dark:bg-[#141720] rounded-2xl border border-slate-200 dark:border-[#232938] shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#232938] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                    إدارة قواعد القاموس المرجعي التلقائي
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    تُطبق هذه القواعد تلقائياً داخل مسار التحويل مع كل ملف جديد.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="إغلاق نافذة إدارة قواعد القاموس"
                onClick={() => setIsCleanerModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1B202C] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-5">
              <form
                onSubmit={handleAddCustomRule}
                className="p-4 bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#252B3B] rounded-xl space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>إضافة قاعدة تصحيح جديدة للمحرك التلقائي</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      النص الخاطئ / النمط
                    </label>
                    <input
                      type="text"
                      value={newPattern}
                      onChange={(e) => setNewPattern(e.target.value)}
                      placeholder="مثال: بأنًّا"
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#2A3142] rounded-lg font-mono text-slate-900 dark:text-slate-100"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      النص الصحيح البديل
                    </label>
                    <input
                      type="text"
                      value={newReplacement}
                      onChange={(e) => setNewReplacement(e.target.value)}
                      placeholder="مثال: باتًّا"
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#2A3142] rounded-lg font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      التصنيف
                    </label>
                    <CustomSelect
                      value={newCategory}
                      onChange={(val) => setNewCategory(val as CleanerCategory)}
                      options={CATEGORY_OPTIONS}
                      ariaLabel="تصنيف القاعدة"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      المادة
                    </label>
                    <input
                      type="text"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#2A3142] rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      الوصف
                    </label>
                    <input
                      type="text"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="سبب التصحيح"
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#2A3142] rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>حفظ في القاموس التلقائي</span>
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    القواعد المفعلة ({cleanerRules.filter((r) => r.enabled).length} من{' '}
                    {cleanerRules.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2" />
                      <input
                        type="text"
                        value={ruleSearchQuery}
                        onChange={(e) => setRuleSearchQuery(e.target.value)}
                        placeholder="بحث في القواعد..."
                        className="pr-8 pl-3 py-1 text-xs bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#2A3142] rounded-lg w-44 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleResetRules}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>إعادة ضبط</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {cleanerRules
                    .filter(
                      (r) =>
                        !ruleSearchQuery ||
                        r.description.includes(ruleSearchQuery) ||
                        r.patternStr.includes(ruleSearchQuery) ||
                        r.subject.includes(ruleSearchQuery)
                    )
                    .map((rule) => (
                      <div
                        key={rule.id}
                        className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
                          rule.enabled
                            ? 'bg-white dark:bg-[#141720] border-slate-200 dark:border-[#252B3B]'
                            : 'bg-slate-50 dark:bg-[#11141C] border-slate-200 dark:border-[#232938] opacity-60'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => handleToggleRule(rule.id)}
                            className="mt-1 w-4 h-4 rounded text-emerald-600 border-slate-300 cursor-pointer accent-emerald-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                              <span className="font-bold text-slate-900 dark:text-slate-100">
                                {rule.patternStr}
                              </span>
                              <span className="text-slate-400">➔</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                {rule.replacement || '(إزالة)'}
                              </span>
                              <span className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                                · {rule.subject}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                              {rule.description}
                            </p>
                          </div>
                        </div>

                        {rule.isCustom && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRule(rule.id)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="حذف القاعدة المخصصة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-[#232938] flex items-center justify-end gap-2 bg-slate-50 dark:bg-[#11141C] rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsCleanerModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1E2433] bg-slate-100 dark:bg-[#1B202C] rounded-lg transition-colors cursor-pointer"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => {
                  handleRunTextCleanerOnDocument();
                  setIsCleanerModalOpen(false);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تطبيق الآن على المستند</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
