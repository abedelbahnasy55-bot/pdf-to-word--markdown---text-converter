import React, { useRef, useState, DragEvent, ChangeEvent } from 'react';
import {
  UploadCloud,
  FileText,
  FileCode,
  Image as ImageIcon,
  Plus,
  Trash2,
  X,
  Play,
  AlertCircle,
  Server,
} from 'lucide-react';
import { formatBytes } from '../utils/historyStorage';
import { ConversionOptions } from '../types';

interface DropzoneProps {
  onStartConversion: (files: File[], customOptions?: ConversionOptions) => void;
  isProcessing: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onStartConversion,
  isProcessing,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usePageRange, setUsePageRange] = useState(false);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(35);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getActiveOptions = (): ConversionOptions | undefined => {
    if (!usePageRange) return undefined;
    return {
      quotaOptimization: 'maximum_savings',
      pageRange: {
        enabled: true,
        startPage: Math.max(1, rangeStart || 1),
        endPage: Math.max(rangeStart || 1, rangeEnd || 35),
      },
    };
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const addValidFiles = (files: File[]) => {
    setErrorMessage(null);
    const valid: File[] = [];

    for (const file of files) {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      const isImg = file.type.startsWith('image/') || Boolean(file.name.match(/\.(png|jpe?g|bmp|webp|gif|svg)$/i));
      const isWord = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc') || file.type.includes('word') || file.type.includes('officedocument');

      if (isPdf || isImg || isWord) {
        valid.push(file);
      }
    }

    if (valid.length === 0) {
      setErrorMessage('يرجى اختيار ملفات PDF، أو مستندات Word (.docx)، أو صور صالحة');
      return;
    }

    setSelectedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const newUnique = valid.filter((f) => !existingNames.has(`${f.name}_${f.size}`));
      return [...prev, ...newUnique];
    });
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isProcessing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addValidFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addValidFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setErrorMessage(null);
  };

  const handleStart = () => {
    if (selectedFiles.length === 0) return;
    const filesToConvert = [...selectedFiles];
    setSelectedFiles([]);
    onStartConversion(filesToConvert, getActiveOptions());
  };

  const getFileIcon = (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.docx') || name.endsWith('.doc')) {
      return <FileText className="w-5 h-5 text-blue-600" />;
    }
    if (name.endsWith('.pdf')) {
      return <FileCode className="w-5 h-5 text-red-600" />;
    }
    return <ImageIcon className="w-5 h-5 text-emerald-600" />;
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileInput}
        className="hidden"
        id="unified-file-input"
      />

      {selectedFiles.length === 0 ? (
        <>
          <div
            id="pdf-dropzone-container"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
              isDragOver
                ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-500/10 scale-[1.01]'
                : 'border-slate-300 dark:border-[#2A3142] bg-white dark:bg-[#141720] hover:border-blue-500 dark:hover:border-blue-500/70 hover:bg-slate-50/60 dark:hover:bg-[#171C28]'
            } ${isProcessing ? 'pointer-events-none opacity-50' : ''}`}
          >
            <div className="flex flex-col items-center justify-center space-y-3.5">
              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${
                  isDragOver
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
                }`}
              >
                <UploadCloud className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  اسحب ملفات PDF أو Word أو الصور هنا
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  ارفع ملفاً واحداً أو عدة ملفات لتحويلها وتنسيقها إلى مستند Word (.docx) بجودة مطبعية مع الحفاظ على الخطوط السفلية والجداول
                </p>
              </div>

              <div className="pt-1 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>اختيار ملفات من جهازك</span>
                </button>
              </div>

              <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <Server className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>المعالجة المستمرة على الخادم: تستمر حتى عند إغلاق المتصفح أو إطفاء الجهاز</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] text-right space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-200">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={usePageRange}
                  onChange={(e) => setUsePageRange(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-[#333B4F] accent-blue-600"
                />
                <span>تحديد نطاق صفحات معين (اختياري)</span>
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">
                لتفريغ صفحات محددة من الكتاب
              </span>
            </label>

            {usePageRange && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-[#232938]">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">من صفحة:</span>
                    <input
                      type="number"
                      min={1}
                      value={rangeStart}
                      onChange={(e) => setRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 px-3 py-1.5 text-xs font-mono font-bold bg-slate-50 dark:bg-[#1B202C] border border-slate-200 dark:border-[#2A3142] rounded-lg text-center text-slate-900 dark:text-slate-100 tabular-nums"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">إلى صفحة:</span>
                    <input
                      type="number"
                      min={rangeStart}
                      value={rangeEnd}
                      onChange={(e) =>
                        setRangeEnd(Math.max(rangeStart, parseInt(e.target.value) || rangeStart))
                      }
                      className="w-20 px-3 py-1.5 text-xs font-mono font-bold bg-slate-50 dark:bg-[#1B202C] border border-slate-200 dark:border-[#2A3142] rounded-lg text-center text-slate-900 dark:text-slate-100 tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                  <span className="text-slate-400 font-medium">اختصارات:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRangeStart(1);
                      setRangeEnd(35);
                    }}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-[#1B202C] hover:bg-blue-50 dark:hover:bg-blue-500/15 text-slate-700 dark:text-slate-200 rounded-md transition-colors cursor-pointer"
                  >
                    الوحدة الأولى (1-35)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRangeStart(36);
                      setRangeEnd(70);
                    }}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-[#1B202C] hover:bg-blue-50 dark:hover:bg-blue-500/15 text-slate-700 dark:text-slate-200 rounded-md transition-colors cursor-pointer"
                  >
                    الوحدة الثانية (36-70)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRangeStart(1);
                      setRangeEnd(50);
                    }}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-[#1B202C] hover:bg-blue-50 dark:hover:bg-blue-500/15 text-slate-700 dark:text-slate-200 rounded-md transition-colors cursor-pointer"
                  >
                    أول 50 صفحة
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`bg-white dark:bg-[#141720] border-2 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 transition-colors ${
            isDragOver
              ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-500/10'
              : 'border-blue-500/80 dark:border-blue-500/50'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#232938] pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold tabular-nums">
                {selectedFiles.length}
              </span>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                  {selectedFiles.length === 1
                    ? 'الملف المختار للتحويل'
                    : `الملفات المختارة (${selectedFiles.length} ملفات)`}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  تتم المعالجة المستمرة على الخادم مع حفظ تقدم كل صفحة تلقائياً
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة</span>
              </button>
              <button
                type="button"
                onClick={clearAllFiles}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                title="مسح الكل"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {selectedFiles.map((file, idx) => (
              <div
                key={`${file.name}_${file.size}_${idx}`}
                className="p-3 rounded-xl bg-slate-50 dark:bg-[#191E2A] hover:bg-slate-100/80 dark:hover:bg-[#1E2433] border border-slate-200 dark:border-[#252B3B] flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#2A3142] flex items-center justify-center shrink-0">
                    {getFileIcon(file)}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate"
                      title={file.name}
                    >
                      {file.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="إزالة هذا الملف"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#252B3B] text-right space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-200">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={usePageRange}
                  onChange={(e) => setUsePageRange(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 dark:border-[#333B4F] accent-blue-600"
                />
                <span>تحديد نطاق صفحات معين (اختياري)</span>
              </span>
              <span className="text-[11px] text-slate-400 font-normal">لتفريغ صفحات محددة</span>
            </label>

            {usePageRange && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#252B3B]">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">من صفحة:</span>
                    <input
                      type="number"
                      min={1}
                      value={rangeStart}
                      onChange={(e) => setRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 px-3 py-1.5 text-xs font-mono font-bold bg-white dark:bg-[#141720] border border-slate-300 dark:border-[#2A3142] rounded-lg text-center text-slate-900 dark:text-slate-100 tabular-nums"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">إلى صفحة:</span>
                    <input
                      type="number"
                      min={rangeStart}
                      value={rangeEnd}
                      onChange={(e) =>
                        setRangeEnd(Math.max(rangeStart, parseInt(e.target.value) || rangeStart))
                      }
                      className="w-20 px-3 py-1.5 text-xs font-mono font-bold bg-white dark:bg-[#141720] border border-slate-300 dark:border-[#2A3142] rounded-lg text-center text-slate-900 dark:text-slate-100 tabular-nums"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {selectedFiles.some(
            (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(f.name)
          ) && (
            <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-xs text-blue-800 dark:text-blue-300 font-medium">
              يتم تحسين الصور الممسوحة ضوئياً وتنقية التباين تلقائياً قبل استخراج النصوص والتنسيق.
            </div>
          )}

          <div className="pt-1">
            <button
              id="btn-start-convert-main"
              type="button"
              onClick={handleStart}
              disabled={isProcessing}
              className="w-full py-3 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>
                {selectedFiles.length === 1
                  ? 'بدء التحويل إلى Word (.docx)'
                  : `بدء تحويل (${selectedFiles.length}) ملفات إلى Word (.docx)`}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
