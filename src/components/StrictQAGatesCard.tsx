import React from 'react';
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  BookOpen,
} from 'lucide-react';
import { StrictQAReport, QAGateItem, QuoteAuditFinding } from '../utils/strictQAGatesEngine';
import { Badge } from './ui';

interface StrictQAGatesCardProps {
  report: StrictQAReport;
}

export const StrictQAGatesCard: React.FC<StrictQAGatesCardProps> = ({ report }) => {
  if (!report) return null;

  return (
    <div className="bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-200/80 dark:border-emerald-500/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                بوابات الجودة الصارمة ومطابقة الاقتباسات
              </h4>
              <Badge variant={report.overallPassed ? 'success' : 'warning'} size="sm">
                {report.overallPassed ? 'معتمد رسمياً' : 'يحتاج مراجعة'}
              </Badge>
            </div>
            <p className="text-xs text-emerald-900 dark:text-emerald-300/90 leading-relaxed mt-0.5">
              {report.verdictArabic}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 tabular-nums">
          <div className="text-right">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">درجة الجودة</p>
            <p className="text-lg font-extrabold text-emerald-800 dark:text-emerald-300">
              {report.qualityScore}%
            </p>
          </div>
          <div className="w-11 h-11 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-extrabold text-xs">
            {report.passedGatesCount}/{report.totalGates}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {report.gates.map((gate: QAGateItem) => (
          <div
            key={gate.id}
            className={`p-3.5 rounded-lg border transition-colors ${
              gate.passed
                ? 'bg-white dark:bg-[#141720] border-emerald-200 dark:border-[#232938] text-slate-800 dark:text-slate-200'
                : 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-950 dark:text-amber-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {gate.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <span className="text-xs font-bold">{gate.name}</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  gate.passed
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200'
                }`}
              >
                {gate.passed ? 'ناجح' : 'مراجعة'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              {gate.descriptionArabic}
            </p>
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#232938] flex items-center justify-between text-[10px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
              <span>
                القياس:{' '}
                <strong className="text-slate-800 dark:text-slate-200 font-mono">
                  {gate.measuredValue}
                </strong>
              </span>
              <span>{gate.thresholdText}</span>
            </div>
          </div>
        ))}
      </div>

      {report.findings.length > 0 && (
        <div className="bg-white dark:bg-[#141720] border border-emerald-200 dark:border-[#232938] rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                ملاحظات تدقيق الاقتباسات والأحاديث والرموز
              </h5>
            </div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
              {report.findings.length} مواضع
            </span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {report.findings.map((f: QuoteAuditFinding, idx: number) => (
              <div
                key={idx}
                className={`p-2 rounded-lg border text-xs flex flex-col gap-1 ${
                  f.isRepaired
                    ? 'bg-emerald-50/60 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25'
                    : 'bg-slate-50 dark:bg-[#191E2A] border-slate-200 dark:border-[#252B3B]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[#232938] text-slate-800 dark:text-slate-200 text-[10px]">
                    {f.code}
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold text-[10px]">
                    {f.isRepaired ? 'تم الإصلاح تلقائياً' : 'تنبيه تدقيق'}
                  </span>
                </div>
                <p className="text-slate-800 dark:text-slate-200 font-medium text-[11px]">
                  {f.messageArabic}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.repairedCount > 0 && (
        <div className="flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-200 bg-emerald-100/70 dark:bg-emerald-500/15 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 tabular-nums">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>تم إجراء {report.repairedCount} تحسيناً تلقائياً وفق معايير المحرك الهيكلي</span>
          </div>
          <span className="text-[11px] font-mono text-emerald-800 dark:text-emerald-300">
            {report.metrics.totalLines} سطر · {report.metrics.headingsCount} عنوان
          </span>
        </div>
      )}
    </div>
  );
};
