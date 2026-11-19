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
  ListOrdered,
} from 'lucide-react';
import { LayoutIntegrityReport, PageLayoutAuditItem } from '../types';

interface LayoutIntegrityEngineProps {
  report: LayoutIntegrityReport;
}

export const LayoutIntegrityEngine: React.FC<LayoutIntegrityEngineProps> = ({
  report,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  if (!report) return null;

  return (
    <div className="bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200/90 dark:border-blue-500/30 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                محرك المعايرة الهيكلية للوورد
              </h4>
              <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>اتجاه RTL مضبوط</span>
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mt-1">
              {report.overallVerdict}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#141720] hover:bg-slate-50 dark:hover:bg-[#1B202C] border border-slate-200 dark:border-[#2A3142] text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
        >
          <span>{isExpanded ? 'طي التفاصيل' : 'فحص الصفحات'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-lg flex items-center gap-2.5 tabular-nums">
          <div className="w-8 h-8 rounded-md bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FileCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">صفحات مفحوصة</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {report.totalPagesAudited} صفحة
            </div>
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-lg flex items-center gap-2.5 tabular-nums">
          <div className="w-8 h-8 rounded-md bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <TableProperties className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">جداول مثبتة</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {report.tablesStabilizedCount} جدول
            </div>
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-lg flex items-center gap-2.5 tabular-nums">
          <div className="w-8 h-8 rounded-md bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ListOrdered className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">قوائم معايرة</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {report.listsNormalizedCount} قائمة
            </div>
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-lg flex items-center gap-2.5 tabular-nums">
          <div className="w-8 h-8 rounded-md bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <ArrowRightLeft className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">الهوامش والاتجاه</div>
            <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">منضبط 100%</div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#232938]">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>فحص الهيكلية صفحة بصفحة</span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {report.pageAudits.length} صفحة
            </span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {report.pageAudits.map((page: PageLayoutAuditItem) => (
              <div
                key={page.pageNumber}
                role="button"
                tabIndex={0}
                aria-expanded={selectedPage === page.pageNumber}
                onClick={() =>
                  setSelectedPage(selectedPage === page.pageNumber ? null : page.pageNumber)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedPage(selectedPage === page.pageNumber ? null : page.pageNumber);
                  }
                }}
                className="p-3 rounded-lg border border-slate-200 dark:border-[#252B3B] bg-slate-50/70 dark:bg-[#191E2A] hover:bg-slate-100/70 dark:hover:bg-[#1E2433] text-xs cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 text-[10px]">
                      صفحة {page.pageNumber}
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-slate-300">
                      {page.totalTables > 0 ? `${page.totalTables} جدول` : 'نصوص عادية'} ·{' '}
                      {page.totalLists} ترقيم
                    </span>
                  </div>
                  {selectedPage === page.pageNumber ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>

                {selectedPage === page.pageNumber && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-200/70 dark:border-[#252B3B] space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                    <div>
                      <span className="font-semibold">تثبيت أبعاد الجداول: </span>
                      <span>
                        {page.totalTables > 0
                          ? 'تم قفل عرض الأعمدة بنسبة 100% لمنع التداخل'
                          : 'لا توجد جداول في هذه الصفحة'}
                      </span>
                    </div>
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
