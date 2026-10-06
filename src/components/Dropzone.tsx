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
  CheckCircle2,
  AlertCircle,
  Wand2
} from 'lucide-react';
import { formatBytes } from '../utils/historyStorage';

/**
 * The dropzone renders one path: pick files, convert.
 *
 * It previously exposed a three-way conversion-strategy selector (AI hybrid /
 * zero-quota direct extraction / maximum savings) and a catalogue of one-click
 * sample documents. Both were removed because the pipeline no longer needs a
 * human to choose, and forcing that choice on the user was the single biggest
 * source of confusion: the three modes produce visibly different output quality,
 * so picking wrong silently degraded a document.
 */
interface DropzoneProps {
  onStartConversion: (files: File[]) => void;
  isProcessing: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onStartConversion,
  isProcessing,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // Avoid duplicate files with same name and size
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
    onStartConversion(selectedFiles);
  };

  const getFileIcon = (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.docx') || name.endsWith('.doc')) {
      return <FileText className="w-5 h-5 text-blue-600" />;
    }
    if (name.endsWith('.pdf')) {
      return <FileCode className="w-5 h-5 text-red-600" />;
    }
    return <ImageIcon className="w-5 h-5 text-purple-600" />;
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-5">
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Hidden File Input (supports 1 or multiple files) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileInput}
        className="hidden"
        id="unified-file-input"
      />

      {/* State A: No files selected yet -> Show clean, inviting Dropzone */}
      {selectedFiles.length === 0 ? (
        <div
          id="pdf-dropzone-container"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
            isDragOver
              ? 'border-blue-500 bg-blue-50/70 scale-[1.01]'
              : 'border-slate-300 bg-white hover:border-blue-500 hover:bg-slate-50/60 shadow-xs'
          } ${isProcessing ? 'pointer-events-none opacity-50' : ''}`}
        >
          <div className="flex flex-col items-center justify-center space-y-3.5">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                isDragOver ? 'bg-blue-600 text-white scale-105' : 'bg-blue-50 text-blue-600'
              }`}
            >
              <UploadCloud className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                اسحب ملفات PDF أو Word أو الصور هنا
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                ارفع ملفاً واحداً أو ملفين أو أكثر (حتى لو كتب ضخمة)، ثم اضغط زر التحويل
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>اختيار ملفات من جهازك</span>
              </button>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                تطابق تام في الصفحات 1:1
              </span>
              <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                اتجاه Word يمين لليسار (RTL)
              </span>
              <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                باكدج ZIP للملفات المتعددة
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* State B: 1 or more files selected -> Show clean list + Big Convert Button right here! */
        <div className="bg-white border-2 border-blue-500/80 rounded-3xl p-5 sm:p-6 shadow-md space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                {selectedFiles.length}
              </span>
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                  {selectedFiles.length === 1 ? 'الملف المختار للتحويل' : `الملفات المختارة (${selectedFiles.length} ملفات)`}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {selectedFiles.length === 1
                    ? 'جاهز للتحويل الفوري إلى مستند Word منسق'
                    : 'سيتم تحويل الملفات وراء بعضها وتنزيل باكدج ZIP متكامل'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة ملف</span>
              </button>
              <button
                type="button"
                onClick={clearAllFiles}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                title="مسح الكل"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Files List */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {selectedFiles.map((file, idx) => (
              <div
                key={`${file.name}_${file.size}_${idx}`}
                className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
                    {getFileIcon(file)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="إزالة هذا الملف"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* De-noise Indicator for Image Files */}
          {selectedFiles.some(
            (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(f.name)
          ) && (
            <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200/90 text-amber-900 text-xs flex items-center gap-2.5">
              <Wand2 className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>تحسين الصور المشوشة (De-noise) مُفعّل في خط العمل:</strong> سيتم تنقية التشويش وتبييض خلفية الوثائق القديمة تلقائياً لتعزيز دقة التعرف في Word.
              </span>
            </div>
          )}

          {/* Big Primary Convert Button */}
          <div className="pt-2">
            <button
              id="btn-start-convert-main"
              type="button"
              onClick={handleStart}
              disabled={isProcessing}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 active:scale-[0.99] text-white text-sm sm:text-base font-extrabold rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>
                {selectedFiles.length === 1
                  ? 'بدء التحويل إلى Word (DOCX)'
                  : `بدء تحويل (${selectedFiles.length}) ملفات متتالية وتنزيل باكدج ZIP`}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
