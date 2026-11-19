import React from 'react';
import {
  Layers,
  UploadCloud,
  Search,
  CheckSquare,
  Square,
  Trash2,
  RefreshCw,
  ListTree,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatBytes } from '../../utils/historyStorage';
import { CustomSelect } from '../ui/CustomSelect';
import { ORGANIZATION_OPTIONS } from '../../config/compilerOptions';
import type { CompilerSourceItem } from '../../utils/smartCompilerEngine';
import type { UnitFilterEntry } from '../../model/compiler';
import type { OrganizationMode, RepetitionPolicy } from '../../../shared/smartCompilerCore';

interface SourcesSidebarProps {
  mobilePane: 'sources' | 'chat' | 'canvas';
  isSourcesDrawerOpen: boolean;
  availableSources: CompilerSourceItem[];
  filteredSources: CompilerSourceItem[];
  selectedSourceIds: string[];
  onSelectAll: () => void;
  onClearSelection: () => void;
  isDragOver: boolean;
  onChangeDragOver: (over: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFilesAdded: (files: FileList | File[]) => void;
  sourceSearch: string;
  onChangeSourceSearch: (q: string) => void;
  expandedSourceOutlineId: string | null;
  onToggleExpandOutline: (id: string) => void;
  manualUnitFilters: Record<string, UnitFilterEntry>;
  onToggleSource: (id: string) => void;
  onRemoveUploadedSource: (id: string) => void;
  onToggleLessonUnitState: (sourceId: string, heading: string, mode: 'include' | 'exclude') => void;
  onResetSourceUnitFilter: (sourceId: string) => void;
  organizationModeOverride: OrganizationMode | 'auto';
  onChangeOrganizationMode: (mode: OrganizationMode | 'auto') => void;
  repetitionPolicy: RepetitionPolicy;
  onChangeRepetitionPolicy: (policy: RepetitionPolicy) => void;
}

export const SourcesSidebar: React.FC<SourcesSidebarProps> = ({
  mobilePane,
  isSourcesDrawerOpen,
  availableSources,
  filteredSources,
  selectedSourceIds,
  onSelectAll,
  onClearSelection,
  isDragOver,
  onChangeDragOver,
  fileInputRef,
  onFilesAdded,
  sourceSearch,
  onChangeSourceSearch,
  expandedSourceOutlineId,
  onToggleExpandOutline,
  manualUnitFilters,
  onToggleSource,
  onRemoveUploadedSource,
  onToggleLessonUnitState,
  onResetSourceUnitFilter,
  organizationModeOverride,
  onChangeOrganizationMode,
  repetitionPolicy,
  onChangeRepetitionPolicy,
}) => {
  return (
    <aside
      className={`${
        mobilePane === 'sources' ? 'flex' : 'hidden'
      } ${
        isSourcesDrawerOpen ? 'lg:flex lg:w-[300px] xl:w-[320px] shrink-0' : 'lg:hidden'
      } bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl overflow-hidden flex-col lg:h-full transition-colors`}
    >
      <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100">المصادر والملفات</h2>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
          >
            تحديد الكل
          </button>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
          >
            تفريغ
          </button>
        </div>
      </div>

      {/* Direct File Dropzone inside Studio */}
      <div className="p-3 border-b border-slate-100 dark:border-[#232938] shrink-0">
        <div
          role="button"
          tabIndex={0}
          aria-label="رفع ملفات PDF أو Word أو صور جديدة إلى الاستوديو"
          onDragOver={(e) => {
            e.preventDefault();
            onChangeDragOver(true);
          }}
          onDragLeave={() => onChangeDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            onChangeDragOver(false);
            if (e.dataTransfer.files?.length) onFilesAdded(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`border border-dashed rounded-lg px-3 py-2.5 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            isDragOver
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/15'
              : 'border-slate-300 dark:border-[#2A3142] hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50/60 dark:bg-[#10131C]'
          }`}
        >
          <UploadCloud className="w-4 h-4 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
          <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
            رفع ملفات PDF / Word / صور جديدة
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            تُحوَّل تلقائياً قبل التجميع وتُضاف للسجل
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                onFilesAdded(e.target.files);
                e.target.value = '';
              }
            }}
          />
        </div>

        {availableSources.length > 3 && (
          <div className="relative mt-2.5">
            <input
              type="text"
              value={sourceSearch}
              onChange={(e) => onChangeSourceSearch(e.target.value)}
              placeholder="بحث باسم الكتاب أو السنة..."
              className="w-full text-xs pr-7 pl-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#10131C] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2" />
          </div>
        )}
      </div>

      {/* Sources List (scrollable flex-1) */}
      <div className="divide-y divide-slate-100 dark:divide-[#232938] flex-1 overflow-y-auto min-h-[180px]">
        {filteredSources.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 dark:text-slate-500">
            لا توجد مصادر بعد. ارفع ملفاً أعلاه أو حوّل ملفات من الشاشة الرئيسية.
          </div>
        ) : (
          filteredSources.map((src) => {
            const isSelected = selectedSourceIds.includes(src.id);
            const isOutlineOpen = expandedSourceOutlineId === src.id;
            const unitFilter = manualUnitFilters[src.id] || {
              includeUnits: [],
              excludeUnits: [],
            };
            const activeFilterCount =
              unitFilter.includeUnits.length + unitFilter.excludeUnits.length;

            return (
              <div
                key={src.id}
                className={`transition-colors ${
                  isSelected
                    ? 'bg-blue-50/50 dark:bg-blue-500/10'
                    : 'hover:bg-slate-50/80 dark:hover:bg-[#171B26]'
                }`}
              >
                <div
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-label={src.title}
                  tabIndex={0}
                  onClick={() => onToggleSource(src.id)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onToggleSource(src.id);
                    }
                  }}
                  className="px-3 py-2.5 flex items-start gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 text-blue-600 dark:text-blue-400 shrink-0"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate" title={src.fileName}>
                        {src.title}
                      </p>
                      {src.origin === 'upload' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveUploadedSource(src.id);
                          }}
                          className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-0.5 cursor-pointer"
                          title="إزالة الملف المرفوع"
                          aria-label={`إزالة الملف المرفوع ${src.title}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1 tabular-nums">
                      <span>
                        {src.origin === 'batch'
                          ? 'دفعة حالية'
                          : src.origin === 'history'
                          ? 'السجل المحفوظ'
                          : 'مرفوع حديثاً'}
                      </span>
                      <span>·</span>
                      <span>{formatBytes(src.fileSize)}</span>
                      {src.totalPages > 0 && (
                        <>
                          <span>·</span>
                          <span>{src.totalPages} صفحة</span>
                        </>
                      )}
                    </div>

                    <div className="text-[10px] mt-1 flex flex-wrap items-center gap-1.5">
                      {src.status === 'ready' && (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">جاهز</span>
                      )}
                      {src.status === 'pending_conversion' && (
                        <span className="text-amber-700 dark:text-amber-400 font-semibold">بانتظار التحويل الآلي</span>
                      )}
                      {src.status === 'converting' && (
                        <span className="text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          جاري التحويل...
                        </span>
                      )}
                      {src.status === 'error' && (
                        <span className="text-red-600 dark:text-red-400 font-semibold">{src.error || 'تعذر التحويل'}</span>
                      )}
                      {src.detectedYears.length > 0 && (
                        <span className="text-slate-400 dark:text-slate-500 truncate tabular-nums">
                          · سنوات: {src.detectedYears.slice(0, 3).join('، ')}
                        </span>
                      )}

                      {src.status === 'ready' && src.outline.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpandOutline(src.id);
                          }}
                          className={`mr-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold cursor-pointer ${
                            activeFilterCount > 0
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white dark:bg-[#1B202C] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#2A3142] hover:border-blue-400'
                          }`}
                          title="استعراض فهرس الدروس لتحديد أو استبعاد دروس معينة"
                        >
                          <ListTree className="w-3 h-3" />
                          <span>
                            الفهرس ({src.outline.length})
                            {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
                          </span>
                          {isOutlineOpen ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Interactive TOC Lesson / Chapter Filter Drawer */}
                {isOutlineOpen && src.outline.length > 0 && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mx-3 mb-2.5 p-2 rounded-lg bg-slate-50 dark:bg-[#10131C] border border-slate-200 dark:border-[#232938] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 pb-1 border-b border-slate-200 dark:border-[#232938]">
                      <span className="font-bold">انتقاء أو استبعاد الدروس:</span>
                      {activeFilterCount > 0 && (
                        <button
                          type="button"
                          onClick={() => onResetSourceUnitFilter(src.id)}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                        >
                          إعادة ضبط
                        </button>
                      )}
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {src.outline.slice(0, 35).map((entry, idx) => {
                        const isIncluded = unitFilter.includeUnits.includes(entry.heading);
                        const isExcluded = unitFilter.excludeUnits.includes(entry.heading);
                        return (
                          <div
                            key={`${entry.heading}-${idx}`}
                            className="flex items-center justify-between gap-1.5 text-[10px] py-0.5 border-b border-slate-100 dark:border-[#1E2433] last:border-0"
                          >
                            <span
                              className={`truncate flex-1 ${
                                isExcluded
                                  ? 'line-through text-slate-400 dark:text-slate-600'
                                  : isIncluded
                                  ? 'font-bold text-blue-700 dark:text-blue-400'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                              title={entry.heading}
                            >
                              {entry.heading}
                              <span className="text-slate-400 dark:text-slate-500 mr-1 tabular-nums">
                                (ص {entry.pageNumber})
                              </span>
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => onToggleLessonUnitState(src.id, entry.heading, 'include')}
                                className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                                  isIncluded
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-white dark:bg-[#1B202C] border border-slate-200 dark:border-[#2A3142] text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                                }`}
                                title="تضمين هذا الدرس"
                                aria-label={`تضمين الدرس ${entry.heading}`}
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => onToggleLessonUnitState(src.id, entry.heading, 'exclude')}
                                className={`px-1.5 py-0.5 rounded font-bold cursor-pointer ${
                                  isExcluded
                                    ? 'bg-red-600 text-white'
                                    : 'bg-white dark:bg-[#1B202C] border border-slate-200 dark:border-[#2A3142] text-slate-600 dark:text-slate-300 hover:border-red-400'
                                }`}
                                title="استبعاد هذا الدرس"
                                aria-label={`استبعاد الدرس ${entry.heading}`}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Organization Mode & Repetition Policy */}
      <div className="p-3 border-t border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] space-y-3 shrink-0">
        <div className="space-y-1">
          <span className="block text-[11px] font-bold text-slate-800 dark:text-slate-200">
            نمط الترتيب والهيكلة:
          </span>
          <CustomSelect<OrganizationMode | 'auto'>
            value={organizationModeOverride}
            onChange={onChangeOrganizationMode}
            options={ORGANIZATION_OPTIONS}
            ariaLabel="نمط الترتيب والهيكلة"
            menuPlacement="top"
            size="sm"
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
            سياسة الأسئلة المتكررة:
          </p>
          <div className="space-y-1.5 text-[11px]">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="repPolicy"
                checked={repetitionPolicy === 'preserve_across_exams'}
                onChange={() => onChangeRepetitionPolicy('preserve_across_exams')}
                className="mt-0.5 accent-blue-600"
              />
              <span className="text-slate-600 dark:text-slate-400 leading-snug">
                <strong className="text-slate-900 dark:text-slate-100">حماية التكرار المفيد:</strong> إبقاء كل امتحان بسياقه دون حذف المشترك.
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="repPolicy"
                checked={repetitionPolicy === 'preserve_with_frequency_note'}
                onChange={() => onChangeRepetitionPolicy('preserve_with_frequency_note')}
                className="mt-0.5 accent-blue-600"
              />
              <span className="text-slate-600 dark:text-slate-400 leading-snug">
                <strong className="text-slate-900 dark:text-slate-100">حماية مع التوثيق:</strong> الإبقاء مع تدوين سنوات الورود.
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="repPolicy"
                checked={repetitionPolicy === 'deduplicate_bank'}
                onChange={() => onChangeRepetitionPolicy('deduplicate_bank')}
                className="mt-0.5 accent-blue-600"
              />
              <span className="text-slate-600 dark:text-slate-400 leading-snug">
                <strong className="text-slate-900 dark:text-slate-100">بنك أسئلة موحد:</strong> دمج التكرار المتطابق وجمع المصادر تحته.
              </span>
            </label>
          </div>
        </div>
      </div>
    </aside>
  );
};
