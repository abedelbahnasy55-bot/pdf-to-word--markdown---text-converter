import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  BookOpen,
  RotateCcw,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import type { ConversionResult, SavedConversion } from '../types';
import type { BatchQueueLightItem } from '../model/compiler';
import { useSmartCompiler } from '../hooks/useSmartCompiler';
import { SemanticSearchBar } from './compiler/SemanticSearchBar';
import { SourcesSidebar } from './compiler/SourcesSidebar';
import { CompilerChatPane } from './compiler/CompilerChatPane';
import { CompilerArtifactCanvas } from './compiler/CompilerArtifactCanvas';

interface SmartCompilerWorkspaceProps {
  batchQueue: BatchQueueLightItem[] | null;
  savedItems: SavedConversion[];
  onSaveConvertedFile?: (res: ConversionResult, file: File) => Promise<void>;
  onSaveCompiledResult: (res: ConversionResult) => Promise<void>;
  onOpenInFullViewer: (res: ConversionResult) => void;
}

export const SmartCompilerWorkspace: React.FC<SmartCompilerWorkspaceProps> = ({
  batchQueue,
  savedItems,
  onSaveConvertedFile,
  onSaveCompiledResult,
  onOpenInFullViewer,
}) => {
  const compiler = useSmartCompiler({
    batchQueue,
    savedItems,
    onSaveConvertedFile,
    onSaveCompiledResult,
  });

  return (
    <div dir="rtl" className="max-w-[1680px] mx-auto px-3 sm:px-5 py-3.5 space-y-3 flex flex-col lg:min-h-[calc(100dvh-3.75rem)]">
      {/* Compact Editorial Studio Bar */}
      <header className="bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => compiler.setIsSourcesDrawerOpen((prev) => !prev)}
            className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-slate-50 dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 cursor-pointer transition-colors shrink-0"
            title={compiler.isSourcesDrawerOpen ? 'طي قائمة المصادر لتوسيع مساحة التحرير' : 'إظهار قائمة المصادر'}
            aria-label={compiler.isSourcesDrawerOpen ? 'طي قائمة المصادر' : 'إظهار قائمة المصادر'}
          >
            {compiler.isSourcesDrawerOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </button>

          <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
              استوديو التحرير والتجميع والمقارنة
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
              استخراج انتقائي من الكتب · حماية التكرارات المفيدة بين الامتحانات · تدقيق مجهري وقرآني · تصدير Word معياري
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
          <span>
            المصادر: <strong className="text-slate-900 dark:text-slate-100">{compiler.availableSources.length}</strong>
          </span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>
            المحدد: <strong className="text-blue-600 dark:text-blue-400">{compiler.selectedSources.length}</strong>
          </span>
          {compiler.compiledAnthology && (
            <>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <button
                type="button"
                onClick={compiler.handleStartFreshCompilation}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تجميعة جديدة</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Semantic Vector Search Bar */}
      <SemanticSearchBar
        semanticQuery={compiler.semanticQuery}
        onChangeQuery={compiler.setSemanticQuery}
        semanticKindFilter={compiler.semanticKindFilter}
        onChangeKindFilter={compiler.setSemanticKindFilter}
        semanticScope={compiler.semanticScope}
        onChangeScope={compiler.setSemanticScope}
        totalAvailableCount={compiler.availableSources.length}
        selectedCount={compiler.selectedSources.length}
        isSearching={compiler.isSearchingSemantic}
        semanticStatusText={compiler.semanticStatusText}
        semanticError={compiler.semanticError}
        semanticResponse={compiler.semanticResponse}
        isSearchPanelOpen={compiler.isSearchPanelOpen}
        onCloseSearchPanel={() => compiler.setIsSearchPanelOpen(false)}
        onSubmitSearch={(e) => void compiler.handleRunSemanticSearch(e)}
        onClearSearch={compiler.handleClearSemanticSearch}
        onInsertHitIntoPrompt={compiler.handleInsertSearchHitIntoPrompt}
        onInspectHitSource={compiler.handleInspectSearchHitSource}
      />

      {/* Banners */}
      {compiler.errorBanner && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-red-800 dark:text-red-300 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <span>{compiler.errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => compiler.setErrorBanner(null)}
            className="text-red-700 dark:text-red-300 font-bold hover:underline cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {compiler.toastMessage && (
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 font-medium shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{compiler.toastMessage}</span>
        </div>
      )}

      {/* Mobile & Tablet Workspace Pane Switcher (< lg) */}
      <div className="lg:hidden grid grid-cols-3 gap-1 bg-slate-200/70 dark:bg-[#171B26] p-1 rounded-xl shrink-0 text-xs">
        <button
          type="button"
          onClick={() => compiler.setMobilePane('sources')}
          className={`py-2 px-2 rounded-lg font-bold transition-colors cursor-pointer tabular-nums ${
            compiler.mobilePane === 'sources'
              ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          المصادر ({compiler.selectedSources.length})
        </button>
        <button
          type="button"
          onClick={() => compiler.setMobilePane('chat')}
          className={`py-2 px-2 rounded-lg font-bold transition-colors cursor-pointer ${
            compiler.mobilePane === 'chat'
              ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          المحادثة والأوامر
        </button>
        <button
          type="button"
          onClick={() => compiler.setMobilePane('canvas')}
          className={`py-2 px-2 rounded-lg font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
            compiler.mobilePane === 'canvas'
              ? 'bg-white dark:bg-[#141720] text-slate-900 dark:text-slate-100 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <span>معاينة المستند</span>
          {compiler.compiledAnthology && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
        </button>
      </div>

      {/* Main Editorial Workspace Split Canvas */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3.5 min-h-[560px] lg:h-[calc(100dvh-13.25rem)] lg:min-h-[580px]">
        <SourcesSidebar
          mobilePane={compiler.mobilePane}
          isSourcesDrawerOpen={compiler.isSourcesDrawerOpen}
          availableSources={compiler.availableSources}
          filteredSources={compiler.filteredSources}
          selectedSourceIds={compiler.selectedSourceIds}
          onSelectAll={() =>
            compiler.setSelectedSourceIds(compiler.availableSources.map((s) => s.id))
          }
          onClearSelection={() => compiler.setSelectedSourceIds([])}
          isDragOver={compiler.isDragOver}
          onChangeDragOver={compiler.setIsDragOver}
          fileInputRef={compiler.fileInputRef}
          onFilesAdded={compiler.handleFilesAdded}
          sourceSearch={compiler.sourceSearch}
          onChangeSourceSearch={compiler.setSourceSearch}
          expandedSourceOutlineId={compiler.expandedSourceOutlineId}
          onToggleExpandOutline={(id) =>
            compiler.setExpandedSourceOutlineId((prev) => (prev === id ? null : id))
          }
          manualUnitFilters={compiler.manualUnitFilters}
          onToggleSource={compiler.toggleSource}
          onRemoveUploadedSource={compiler.removeUploadedSource}
          onToggleLessonUnitState={compiler.toggleLessonUnitState}
          onResetSourceUnitFilter={compiler.resetSourceUnitFilter}
          organizationModeOverride={compiler.organizationModeOverride}
          onChangeOrganizationMode={compiler.setOrganizationModeOverride}
          repetitionPolicy={compiler.repetitionPolicy}
          onChangeRepetitionPolicy={compiler.setRepetitionPolicy}
        />

        <CompilerChatPane
          mobilePane={compiler.mobilePane}
          hasCompiledAnthology={Boolean(compiler.compiledAnthology)}
          draftHistoryCount={compiler.draftHistory.length}
          isRunning={compiler.isRunning}
          messages={compiler.messages}
          pipelineProgress={compiler.pipelineProgress}
          chatEndRef={compiler.chatEndRef}
          chatActionMode={compiler.chatActionMode}
          onChangeChatActionMode={compiler.setChatActionMode}
          chatInput={compiler.chatInput}
          onChangeChatInput={compiler.setChatInput}
          onSendChat={(text) => void compiler.handleSendChat(text)}
          onUndoDraft={compiler.handleUndoDraft}
        />

        <CompilerArtifactCanvas
          mobilePane={compiler.mobilePane}
          compiledAnthology={compiler.compiledAnthology}
          renderedPages={compiler.renderedPages}
          activeOutputTab={compiler.activeOutputTab}
          onChangeOutputTab={compiler.setActiveOutputTab}
          manualMarkdown={compiler.manualMarkdown}
          onChangeManualMarkdown={compiler.setManualMarkdown}
          fontProfile={compiler.fontProfile}
          onChangeFontProfile={compiler.setFontProfile}
          isExportingDocx={compiler.isExportingDocx}
          isSavingToHistory={compiler.isSavingToHistory}
          copiedOutput={compiler.copiedOutput}
          onApplyManualEdit={compiler.handleApplyManualEdit}
          onApplyAuditUpdate={compiler.handleApplyAuditUpdate}
          onSaveToHistory={() => void compiler.handleSaveAnthologyToHistory()}
          onOpenInFullViewer={onOpenInFullViewer}
          onCopyOutput={() => void compiler.handleCopyOutput()}
          onExportPlainText={compiler.handleExportPlainText}
          onExportMarkdown={compiler.handleExportMarkdown}
          onExportWord={() => void compiler.handleExportWord()}
        />
      </div>
    </div>
  );
};
