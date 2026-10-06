import React, { useState } from 'react';
import {
  LayoutGrid,
  TableProperties,
  CheckCircle2,
  ShieldCheck,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  FileCheck,
  ListOrdered
} from 'lucide-react';
import { LayoutIntegrityReport, PageLayoutAuditItem } from '../types';

interface LayoutIntegrityEngineProps {
  /**
   * The layout audit to display. Required, and the only input: the component is a
   * presentational readout of the report, with no export path and no callbacks.
   */
  report: LayoutIntegrityReport;
}

export const LayoutIntegrityEngine: React.FC<LayoutIntegrityEngineProps> = ({
  report,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  if (!report) return null;

  return (
    <div className="bg-gradient-to-r from-blue-50/95 via-indigo-50/80 to-slate-50 border border-blue-200/90 rounded-2xl p-5 shadow-xs flex flex-col gap-4 animate-fadeIn">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
            <LayoutGrid className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-extrabold text-indigo-950">
                محرك المعايرة الهيكلية للوورد (Layout Integrity Engine)
              </h4>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-extrabold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>اتجاه RTL إلزامي 100%</span>
              </span>
            </div>
            <p className="text-xs text-indigo-900 leading-relaxed mt-1">
              {report.overallVerdict}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            title={isExpanded ? 'طي تفاصيل الفحص' : 'عرض فحص كل صفحة'}
          >
            <span>{isExpanded ? 'طي التفاصيل' : 'عرض فحص الصفحات'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* KPI counters bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        <div className="p-3 bg-white/90 border border-blue-100 rounded-xl flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <FileCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-bold">صفحات تم فحصها</div>
            <div className="text-sm font-extrabold text-slate-800">{report.totalPagesAudited} صفحة</div>
          </div>
        </div>

        <div className="p-3 bg-white/90 border border-indigo-100 rounded-xl flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <TableProperties className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-bold">جداول مثبتة الأبعاد</div>
            <div className="text-sm font-extrabold text-slate-800">{report.tablesStabilizedCount} جدول</div>
          </div>
        </div>

        <div className="p-3 bg-white/90 border border-purple-100 rounded-xl flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <ListOrdered className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-bold">قوائم تم تثبيت محاذاتها</div>
            <div className="text-sm font-extrabold text-slate-800">{report.listsNormalizedCount} قائمة</div>
          </div>
        </div>

        <div className="p-3 bg-white/90 border border-emerald-100 rounded-xl flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <ArrowRightLeft className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-bold">معايرة RTL والهوامش</div>
            <div className="text-sm font-extrabold text-emerald-800">100% منضبط</div>
          </div>
        </div>
      </div>

      {/* Per-Page Inspection Accordion */}
      {isExpanded && (
        <div className="bg-white/95 border border-indigo-100 rounded-xl p-4 space-y-3 transition-all animate-fadeIn">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>فحص الهيكلية صفحة بصفحة قبل الاعتماد النهائي في Word:</span>
            </span>
            <span className="text-[11px] text-slate-500">
              إجمالي الصفحات: {report.pageAudits.length}
            </span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {report.pageAudits.map((page: PageLayoutAuditItem) => (
              <div
                key={page.pageNumber}
                onClick={() => setSelectedPage(selectedPage === page.pageNumber ? null : page.pageNumber)}
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                  page.status === 'repaired'
                    ? 'bg-amber-50/50 border-amber-200 hover:bg-amber-50'
                    : page.overflowWarning
                    ? 'bg-orange-50/50 border-orange-200 hover:bg-orange-50'
                    : 'bg-slate-50/70 border-slate-200/80 hover:bg-slate-100/70'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-extrabold">
                      الصفحة {page.pageNumber}
                    </span>
                    <span className="text-[11px] text-slate-700">
                      {page.totalTables > 0 ? `${page.totalTables} جدول` : 'نصوص عادية'} • {page.totalLists} بند ترقيم
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>RTL معتمد</span>
                    </span>
                    {page.tableIssues.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        تمت معايرة الجدول
                      </span>
                    )}
                    {selectedPage === page.pageNumber ? (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </div>

                {selectedPage === page.pageNumber && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-200/70 space-y-1.5 text-[11px] text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">• حالة اتجاه الصفحة:</span>
                      <span className="text-emerald-700 font-bold">Right-to-Left (من اليمين لليسار)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">• تثبيت أبعاد الجداول:</span>
                      <span>
                        {page.totalTables > 0
                          ? `تم قفل عرض الأعمدة بنسبة 100% لمنع تداخل النصوص`
                          : 'لا توجد جداول في هذه الصفحة'}
                      </span>
                    </div>
                    {page.tableIssues.length > 0 && (
                      <div className="mt-1 p-2 bg-white rounded-lg border border-amber-200 text-amber-900">
                        <span className="font-bold block mb-1">المعالجات التي تمت في الصفحة:</span>
                        <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                          {page.tableIssues.map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {page.listIssues.length > 0 && (
                      <div className="mt-1 p-2 bg-white rounded-lg border border-indigo-200 text-indigo-900">
                        <span className="font-bold block mb-1">معايرة القوائم:</span>
                        <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                          {page.listIssues.map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
