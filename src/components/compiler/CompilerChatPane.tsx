import React from 'react';
import {
  MessageSquareText,
  Undo2,
  RefreshCw,
  Send,
} from 'lucide-react';
import {
  PROMPT_PRESETS,
  QUICK_REFINEMENTS,
  PIPELINE_STEPS_ORDER,
} from '../../config/compilerOptions';
import type { ChatMessage } from '../../model/compiler';
import type { CompilerPipelineProgress } from '../../utils/smartCompilerEngine';

interface CompilerChatPaneProps {
  mobilePane: 'sources' | 'chat' | 'canvas';
  hasCompiledAnthology: boolean;
  draftHistoryCount: number;
  isRunning: boolean;
  messages: ChatMessage[];
  pipelineProgress: CompilerPipelineProgress | null;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatActionMode: 'auto' | 'ask';
  onChangeChatActionMode: (mode: 'auto' | 'ask') => void;
  chatInput: string;
  onChangeChatInput: (value: string) => void;
  onSendChat: (overrideText?: string) => void;
  onUndoDraft: () => void;
}

export const CompilerChatPane: React.FC<CompilerChatPaneProps> = ({
  mobilePane,
  hasCompiledAnthology,
  draftHistoryCount,
  isRunning,
  messages,
  pipelineProgress,
  chatEndRef,
  chatActionMode,
  onChangeChatActionMode,
  chatInput,
  onChangeChatInput,
  onSendChat,
  onUndoDraft,
}) => {
  return (
    <section
      className={`${
        mobilePane === 'chat' ? 'flex' : 'hidden lg:flex'
      } flex-1 lg:flex-[0.9] min-w-0 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-xl flex-col h-[660px] lg:h-full transition-colors overflow-hidden`}
    >
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquareText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
            {hasCompiledAnthology ? 'محادثة التحرير والتعديل على المستند' : 'محادثة أوامر الاستخلاص والتجميع'}
          </h2>
        </div>
        {draftHistoryCount > 0 && (
          <button
            type="button"
            onClick={onUndoDraft}
            disabled={isRunning}
            className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>تراجع ({draftHistoryCount})</span>
          </button>
        )}
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${
              m.role === 'user' ? 'items-start' : m.role === 'system' ? 'items-center' : 'items-end'
            }`}
          >
            <div
              className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-slate-900 dark:bg-blue-600 text-white'
                  : m.role === 'system'
                  ? 'bg-slate-100 dark:bg-[#1B202C] text-slate-600 dark:text-slate-400 text-[11px] text-center'
                  : 'bg-slate-50 dark:bg-[#171B26] border border-slate-200 dark:border-[#232938] text-slate-800 dark:text-slate-200'
              }`}
            >
              {m.text}
              {m.metaSummary && (
                <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-[#2A3142] text-[11px] text-slate-600 dark:text-slate-400 font-semibold tabular-nums">
                  {m.metaSummary}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Live Pipeline Stepper while running */}
        {isRunning && pipelineProgress && (
          <div className="border border-blue-200 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/10 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-200 tabular-nums">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                <span>{pipelineProgress.stageLabel}</span>
              </span>
              <span>{pipelineProgress.percentage}%</span>
            </div>
            <div className="w-full bg-blue-100 dark:bg-blue-950/60 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 dark:bg-blue-400 h-full transition-all duration-300"
                style={{ width: `${Math.max(5, pipelineProgress.percentage)}%` }}
              />
            </div>
            <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
              {pipelineProgress.detailMessage}
            </p>

            <div className="grid grid-cols-5 gap-1 pt-1">
              {PIPELINE_STEPS_ORDER.map((step, i) => {
                const currentIdx = PIPELINE_STEPS_ORDER.findIndex(
                  (s) => s.id === pipelineProgress.stage
                );
                const done = i < currentIdx;
                const active = i === currentIdx;
                return (
                  <div
                    key={step.id}
                    className={`text-center py-1 px-1 rounded text-[9px] font-bold truncate ${
                      done
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                        : active
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-[#141720] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-[#232938]'
                    }`}
                    title={step.label}
                  >
                    {step.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Preset Chips + Chat Mode Toggle + Composer */}
      <div className="p-3 border-t border-slate-200 dark:border-[#232938] bg-slate-50/70 dark:bg-[#171B26] space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-[#10131C] p-0.5 rounded-lg text-[10px]">
            <button
              type="button"
              onClick={() => onChangeChatActionMode('auto')}
              className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                chatActionMode === 'auto'
                  ? 'bg-white dark:bg-[#1E2433] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {hasCompiledAnthology ? 'تعديل المخرج' : 'أمر استخراج / تجميع'}
            </button>
            <button
              type="button"
              onClick={() => onChangeChatActionMode('ask')}
              className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                chatActionMode === 'ask'
                  ? 'bg-white dark:bg-[#1E2433] text-blue-700 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <MessageSquareText className="w-3 h-3" />
              <span>سؤال عن الفهرس / الملفات</span>
            </button>
          </div>
        </div>

        {!hasCompiledAnthology ? (
          <div className="flex flex-wrap gap-1.5">
            {PROMPT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={isRunning}
                onClick={() => onChangeChatInput(preset.text)}
                className="text-[10px] font-semibold px-2 py-1 rounded-md bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#2A3142] hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-700 dark:hover:text-blue-400 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REFINEMENTS.map((cmd) => (
              <button
                key={cmd}
                type="button"
                disabled={isRunning}
                onClick={() => onSendChat(cmd)}
                className="text-[10px] font-semibold px-2 py-1 rounded-md bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#2A3142] hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-700 dark:hover:text-blue-400 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              >
                {cmd}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            rows={2}
            value={chatInput}
            onChange={(e) => onChangeChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSendChat();
              }
            }}
            disabled={isRunning}
            placeholder={
              chatActionMode === 'ask'
                ? 'اسأل عن فهرس الدروس، عدد الأسئلة، أو محتوى أي ملف محدد...'
                : hasCompiledAnthology
                ? 'اطلب أي تعديل (مثلاً: انقل الإجابات في ملحق، رتب حسب السنة...)'
                : 'اكتب طلبك (مثلاً: هات أسئلة الكتاب حسب ترتيب الدروس، أو اجمع أسئلة دروس محددة وسيب أخرى)...'
            }
            className="flex-1 text-xs sm:text-[13px] p-2.5 rounded-lg border border-slate-300 dark:border-[#2A3142] bg-white dark:bg-[#10131C] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
          />
          <button
            type="button"
            disabled={isRunning || !chatInput.trim()}
            onClick={() => onSendChat()}
            className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 h-[56px]"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {chatActionMode === 'ask' ? 'اسأل' : hasCompiledAnthology ? 'تعديل' : 'تنفيذ'}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
};
