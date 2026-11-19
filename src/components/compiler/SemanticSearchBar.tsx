import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Search,
  RefreshCw,
  ChevronUp,
  AlertCircle,
  Check,
  ListTree,
} from 'lucide-react';
import { remarkInlineHtmlPlugin } from '../../utils/remarkInlineHtmlPlugin';
import type {
  SemanticKindFilter,
  SemanticSearchResponse,
  SemanticSearchResultItem,
} from '../../../shared/semanticSearchCore';

interface SemanticSearchBarProps {
  semanticQuery: string;
  onChangeQuery: (q: string) => void;
  semanticKindFilter: SemanticKindFilter;
  onChangeKindFilter: (k: SemanticKindFilter) => void;
  semanticScope: 'all' | 'selected';
  onChangeScope: (scope: 'all' | 'selected') => void;
  totalAvailableCount: number;
  selectedCount: number;
  isSearching: boolean;
  semanticStatusText: string | null;
  semanticError: string | null;
  semanticResponse: SemanticSearchResponse | null;
  isSearchPanelOpen: boolean;
  onCloseSearchPanel: () => void;
  onSubmitSearch: (e?: React.FormEvent) => void;
  onClearSearch: () => void;
  onInsertHitIntoPrompt: (hit: SemanticSearchResultItem) => void;
  onInspectHitSource: (hit: SemanticSearchResultItem) => void;
}

export const SemanticSearchBar: React.FC<SemanticSearchBarProps> = ({
  semanticQuery,
  onChangeQuery,
  semanticKindFilter,
  onChangeKindFilter,
  semanticScope,
  onChangeScope,
  totalAvailableCount,
  selectedCount,
  isSearching,
  semanticStatusText,
  semanticError,
  semanticResponse,
  isSearchPanelOpen,
  onCloseSearchPanel,
  onSubmitSearch,
  onClearSearch,
  onInsertHitIntoPrompt,
  onInspectHitSource,
}) => {
  return (
    <section
      aria-label="البحث الدلالي في المصادر بالمتجهات"
      className="bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl p-3 space-y-2.5 shrink-0 transition-colors"
    >
      <form
        onSubmit={onSubmitSearch}
        className="flex flex-col lg:flex-row lg:items-center gap-2"
      >
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={semanticQuery}
            onChange={(e) => onChangeQuery(e.target.value)}
            placeholder="ابحث بالمعنى عن سؤال، قاعدة إعراب، آية، أو درس عبر كل الملفات المرفوعة والمحوّلة..."
            className="w-full text-xs sm:text-sm pr-9 pl-3 py-2 rounded-lg border border-slate-300 dark:border-[#2A3142] bg-white dark:bg-[#10131C] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Kind Filter Segmented Control */}
          <div
            role="group"
            aria-label="تصنيف نتائج البحث"
            className="flex items-center gap-0.5 bg-slate-100 dark:bg-[#1B202C] p-0.5 rounded-lg text-[11px]"
          >
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'question', label: 'الأسئلة فقط' },
                { id: 'topic_lesson', label: 'الدروس والمواضيع' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeKindFilter(opt.id)}
                className={`px-2.5 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                  semanticKindFilter === opt.id
                    ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Scope Segmented Control */}
          <div
            role="group"
            aria-label="نطاق ملفات البحث"
            className="flex items-center gap-0.5 bg-slate-100 dark:bg-[#1B202C] p-0.5 rounded-lg text-[11px] tabular-nums"
          >
            <button
              type="button"
              onClick={() => onChangeScope('all')}
              className={`px-2.5 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                semanticScope === 'all'
                  ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              كل الملفات ({totalAvailableCount})
            </button>
            <button
              type="button"
              onClick={() => onChangeScope('selected')}
              className={`px-2.5 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                semanticScope === 'selected'
                  ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              المحددة فقط ({selectedCount})
            </button>
          </div>

          <button
            type="submit"
            disabled={isSearching || !semanticQuery.trim()}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {isSearching ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            <span>بحث دلالي</span>
          </button>

          {(semanticQuery.trim() || isSearchPanelOpen) && (
            <button
              type="button"
              onClick={onClearSearch}
              className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-600 dark:text-slate-300 text-xs font-semibold cursor-pointer"
            >
              مسح
            </button>
          )}
        </div>
      </form>

      {/* Expandable Semantic Search Results Panel */}
      {isSearchPanelOpen && (
        <div className="border-t border-slate-200 dark:border-[#232938] pt-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
            <div className="flex flex-wrap items-center gap-1.5">
              {isSearching ? (
                <span className="text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>{semanticStatusText || 'جاري البحث الدلالي بالمتجهات...'}</span>
                </span>
              ) : semanticResponse ? (
                <>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    النتائج المطابقة: {semanticResponse.results.length}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>المقاطع المفحوصة: {semanticResponse.totalSearched}</span>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <span>
                    {semanticResponse.mode === 'vector-embedding'
                      ? 'محرك المتجهات الدلالية'
                      : 'وضع المطابقة المعجمية السريعة'}
                  </span>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onCloseSearchPanel}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>إخفاء النتائج</span>
            </button>
          </div>

          {isSearching && (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] p-3 space-y-2"
                >
                  <div className="h-3 bg-slate-200 dark:bg-[#232938] rounded w-1/3" />
                  <div className="h-3 bg-slate-200 dark:bg-[#232938] rounded w-5/6" />
                  <div className="h-3 bg-slate-200 dark:bg-[#232938] rounded w-2/3" />
                </div>
              ))}
            </div>
          )}

          {!isSearching && semanticError && (
            <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-xs text-red-800 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>{semanticError}</span>
            </div>
          )}

          {!isSearching && !semanticError && semanticResponse?.results.length === 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-[#232938] bg-slate-50 dark:bg-[#171B26] px-4 py-4 text-center text-xs text-slate-600 dark:text-slate-400">
              لم يتم العثور على مقاطع مطابقة دلالياً لعبارة «{semanticQuery}». جرّب توسيع النطاق إلى «كل الملفات» أو استخدام صياغة أكثر عمومية.
            </div>
          )}

          {!isSearching && !semanticError && semanticResponse && semanticResponse.results.length > 0 && (
            <div className="divide-y divide-slate-200 dark:divide-[#232938] border border-slate-200 dark:border-[#232938] rounded-lg max-h-[280px] overflow-y-auto bg-white dark:bg-[#10131C]">
              {semanticResponse.results.map((hit) => {
                const kindLabel =
                  hit.kind === 'question'
                    ? 'سؤال'
                    : hit.kind === 'lesson'
                    ? 'درس'
                    : 'موضوع';

                return (
                  <div
                    key={hit.passageId}
                    className="p-3 hover:bg-slate-50/70 dark:hover:bg-[#171B26] transition-colors flex flex-col md:flex-row md:items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                        <span className="font-extrabold text-blue-700 dark:text-blue-400">
                          تطابق {hit.matchPercent}%
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{kindLabel}</span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[220px]">
                          {hit.sourceTitle}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span>ص {hit.pageNumber}</span>
                        {hit.heading && hit.heading !== hit.sourceTitle && (
                          <>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span className="text-slate-700 dark:text-slate-300 font-semibold truncate max-w-[240px]">
                              {hit.heading}
                            </span>
                          </>
                        )}
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-slate-500 dark:text-slate-400">{hit.matchReason}</span>
                      </div>

                      <div className="prose-custom text-xs leading-relaxed text-slate-800 dark:text-slate-200 font-arabic">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath, remarkInlineHtmlPlugin]}
                          rehypePlugins={[rehypeKatex]}
                        >
                          {hit.snippet}
                        </ReactMarkdown>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onInsertHitIntoPrompt(hit)}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        <span>تحديد وإدراج في الأمر</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onInspectHitSource(hit)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <ListTree className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                        <span>فهرس المصدر</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
