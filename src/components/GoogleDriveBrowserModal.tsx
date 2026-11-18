import React, { useEffect, useState } from 'react';
import {
  X,
  Search,
  RefreshCw,
  FileText,
  FileCode,
  Image as ImageIcon,
  FolderOpen,
  Trash2,
  AlertTriangle,
  Check,
  ExternalLink,
} from 'lucide-react';
import { useWorkspaceAuth } from '../utils/workspaceAuth';
import {
  deleteDriveWorkspaceFile,
  importDriveFileForStudio,
  listDriveWorkspaceFiles,
  type DriveFileItem,
} from '../utils/googleDocsClient';
import { GoogleSignInButton } from './GoogleSignInButton';
import { CustomSelect } from './ui/CustomSelect';
import { formatBytes } from '../utils/historyStorage';

interface GoogleDriveBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFiles: (files: File[]) => void;
}

export const GoogleDriveBrowserModal: React.FC<GoogleDriveBrowserModalProps> = ({
  isOpen,
  onClose,
  onImportFiles,
}) => {
  const { needsAuth, signIn, isSigningIn, authError, clearAuthError } = useWorkspaceAuth();

  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | 'docs' | 'pdfs' | 'word' | 'images'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<DriveFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadFiles = async (queryText = searchQuery, kind = filterKind) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const list = await listDriveWorkspaceFiles({ searchQuery: queryText, filterKind: kind });
      setFiles(list);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر جلب الملفات من Google Drive.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !needsAuth) {
      setSelectedIds([]);
      setConfirmDeleteItem(null);
      clearAuthError();
      void loadFiles('', filterKind);
    }
  }, [isOpen, needsAuth]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleImportSelected = async () => {
    if (selectedIds.length === 0) return;
    setIsImporting(true);
    setErrorMsg(null);
    try {
      const picked = files.filter((f) => selectedIds.includes(f.id));
      const downloaded: File[] = [];
      for (const item of picked) {
        const f = await importDriveFileForStudio(item);
        downloaded.push(f);
      }
      if (downloaded.length > 0) {
        onImportFiles(downloaded);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء استيراد الملفات المحددة.');
    } finally {
      setIsImporting(false);
    }
  };

  const executeConfirmedDelete = async () => {
    if (!confirmDeleteItem) return;
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await deleteDriveWorkspaceFile(confirmDeleteItem.id);
      setFiles((prev) => prev.filter((f) => f.id !== confirmDeleteItem.id));
      setSelectedIds((prev) => prev.filter((id) => id !== confirmDeleteItem.id));
      setConfirmDeleteItem(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر حذف الملف من Google Drive.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getFileVisual = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.document') {
      return {
        icon: <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
        badge: 'Google Docs',
      };
    }
    if (mimeType === 'application/pdf') {
      return {
        icon: <FileCode className="w-4 h-4 text-red-600 dark:text-red-400" />,
        badge: 'PDF',
      };
    }
    if (mimeType.startsWith('image/')) {
      return {
        icon: <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
        badge: 'صورة',
      };
    }
    return {
      icon: <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
      badge: 'Word',
    };
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isImporting && !isDeleting) onClose();
      }}
    >
      <div className="max-w-2xl w-full bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl shadow-xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232938] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                استيراد ملفات من Google Drive و Google Docs
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                استعرض ملفات PDF أو Word أو مستندات Google Docs لاستيرادها وتنسيقها أو تجميعها
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E2433] text-slate-500 dark:text-slate-400 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {needsAuth ? (
            <div className="p-6 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938] text-center space-y-3">
              <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
                سجّل الدخول بحساب Google لاستعراض مستندات Google Docs وملفات PDF من حسابك في Google Drive.
              </p>
              <div className="flex justify-center">
                <GoogleSignInButton
                  onClick={() => void signIn().catch(() => {})}
                  disabled={isSigningIn}
                />
              </div>
              {authError && (
                <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{authError}</p>
              )}
            </div>
          ) : (
            <>
              {/* Search & Type Filter Bar */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void loadFiles(searchQuery, filterKind);
                    }}
                    placeholder="ابحث باسم الملف أو المستند..."
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </div>

                <CustomSelect
                  value={filterKind}
                  onChange={(val) => {
                    const nextKind = val as 'all' | 'docs' | 'pdfs' | 'word' | 'images';
                    setFilterKind(nextKind);
                    void loadFiles(searchQuery, nextKind);
                  }}
                  options={[
                    { value: 'all', label: 'كل الأنواع المدعومة' },
                    { value: 'docs', label: 'مستندات Google Docs' },
                    { value: 'pdfs', label: 'ملفات PDF' },
                    { value: 'word', label: 'ملفات Word (.docx)' },
                    { value: 'images', label: 'الصور' },
                  ]}
                  ariaLabel="تصفية نوع ملفات Drive"
                  className="sm:w-48"
                />

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void loadFiles(searchQuery, filterKind)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-slate-50 dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>بحث</span>
                </button>
              </div>

              {/* Mandatory Delete Confirmation Banner */}
              {confirmDeleteItem && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-900 dark:text-red-200 leading-relaxed">
                      <strong>تأكيد الحذف النهائي:</strong> هل تريد حذف الملف{' '}
                      <span className="font-bold underline">«{confirmDeleteItem.name}»</span> من Google Drive؟ لا يمكن التراجع عن هذا الإجراء.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteItem(null)}
                      className="px-3 py-1 rounded-lg border border-slate-300 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => void executeConfirmedDelete()}
                      className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                    >
                      {isDeleting ? 'جاري الحذف...' : 'نعم، حذف الملف'}
                    </button>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-xs font-semibold text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              {/* Files List */}
              <div className="border border-slate-200 dark:border-[#232938] rounded-xl divide-y divide-slate-100 dark:divide-[#1F2533] max-h-80 overflow-y-auto">
                {isLoading ? (
                  <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                    جاري تحميل ملفات Google Drive...
                  </div>
                ) : files.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                    لم يُعثر على ملفات مطابقة في حسابك.
                  </div>
                ) : (
                  files.map((item) => {
                    const selected = selectedIds.includes(item.id);
                    const vis = getFileVisual(item.mimeType);
                    const sizeNum = item.size ? parseInt(item.size, 10) : 0;
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleSelect(item.id)}
                        className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                          selected
                            ? 'bg-blue-50/70 dark:bg-blue-500/10'
                            : 'hover:bg-slate-50 dark:hover:bg-[#191E2B]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              selected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 dark:border-[#2E364A] bg-white dark:bg-[#0E1118]'
                            }`}
                          >
                            {selected && <Check className="w-3.5 h-3.5" />}
                          </div>
                          {vis.icon}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {item.name}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              <span>{vis.badge}</span>
                              {sizeNum > 0 && (
                                <>
                                  <span>·</span>
                                  <span>{formatBytes(sizeNum)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.webViewLink && (
                            <a
                              href={item.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="فتح في نافذة جديدة"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-[#232938]"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteItem(item)}
                            title="حذف الملف من Google Drive"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {selectedIds.length > 0 ? `تم تحديد ${selectedIds.length} ملف` : 'اضغط على أي ملف لتحديده'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1B202C] cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    disabled={selectedIds.length === 0 || isImporting}
                    onClick={() => void handleImportSelected()}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isImporting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isImporting ? 'جاري الاستيراد...' : 'استيراد المحدد إلى الاستوديو'}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
