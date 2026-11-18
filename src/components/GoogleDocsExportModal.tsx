import React, { useEffect, useState } from 'react';
import {
  X,
  FileText,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  LogOut,
} from 'lucide-react';
import { useWorkspaceAuth } from '../utils/workspaceAuth';
import {
  exportMarkdownToGoogleDocs,
  listDriveWorkspaceFiles,
  type DriveFileItem,
  type ExportToGoogleDocResult,
} from '../utils/googleDocsClient';
import { TYPOGRAPHY_PROFILES, type FontProfileId } from '../utils/docxExporter';
import { CustomSelect } from './ui/CustomSelect';
import { GoogleSignInButton } from './GoogleSignInButton';

interface GoogleDocsExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  markdown: string;
  isRtl: boolean;
  initialFontProfile?: FontProfileId;
  onExportSuccess?: (res: ExportToGoogleDocResult) => void;
}

export const GoogleDocsExportModal: React.FC<GoogleDocsExportModalProps> = ({
  isOpen,
  onClose,
  title,
  markdown,
  isRtl,
  initialFontProfile = 'bilingual_publication',
  onExportSuccess,
}) => {
  const { user, needsAuth, signIn, signOut, isSigningIn, authError, clearAuthError } =
    useWorkspaceAuth();

  const [docTitle, setDocTitle] = useState(title || 'مستند الاستوديو');
  const [fontProfile, setFontProfile] = useState<FontProfileId>(initialFontProfile);
  const [mode, setMode] = useState<'create' | 'update'>('create');
  const [existingDocs, setExistingDocs] = useState<DriveFileItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);

  const [pendingUpdateConfirm, setPendingUpdateConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportToGoogleDocResult | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDocTitle((title || 'مستند الاستوديو').replace(/\.[^/.]+$/, ''));
      setFontProfile(initialFontProfile);
      setExportError(null);
      setExportResult(null);
      setPendingUpdateConfirm(false);
      clearAuthError();
    }
  }, [isOpen, title, initialFontProfile]);

  const loadExistingDocs = async () => {
    setIsLoadingDocs(true);
    try {
      const files = await listDriveWorkspaceFiles({ filterKind: 'docs' });
      setExistingDocs(files);
      if (files.length > 0 && !selectedDocId) {
        setSelectedDocId(files[0].id);
      }
    } catch (err: any) {
      setExportError(err?.message || 'تعذر تحميل قائمة مستندات Google Docs.');
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (isOpen && !needsAuth && mode === 'update') {
      void loadExistingDocs();
    }
  }, [isOpen, needsAuth, mode]);

  if (!isOpen) return null;

  const fontOptions = Object.values(TYPOGRAPHY_PROFILES).map((p) => ({
    value: p.id as FontProfileId,
    label: p.labelArabic,
    description: `${p.arabicFont} ${p.arabicBodyPt}pt / ${p.englishFont} ${p.englishBodyPt}pt`,
  }));

  const selectedDocObj = existingDocs.find((d) => d.id === selectedDocId);

  const executeExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setPendingUpdateConfirm(false);
    try {
      const result = await exportMarkdownToGoogleDocs({
        title: docTitle.trim() || 'مستند الاستوديو',
        markdown,
        isRtl,
        fontProfile,
        targetDocumentId: mode === 'update' ? selectedDocId : undefined,
      });
      setExportResult(result);
      onExportSuccess?.(result);
    } catch (err: any) {
      setExportError(err?.message || 'حدث خطأ أثناء التصدير إلى Google Docs.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrimarySubmit = () => {
    if (mode === 'update') {
      if (!selectedDocId) {
        setExportError('اختر المستند المراد تحديثه أولاً.');
        return;
      }
      setPendingUpdateConfirm(true);
      return;
    }
    void executeExport();
  };

  const handleCopyDocLink = async () => {
    if (!exportResult?.webViewLink) return;
    try {
      await navigator.clipboard.writeText(exportResult.webViewLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) onClose();
      }}
    >
      <div className="max-w-lg w-full bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl shadow-xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#232938] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                تصدير منسّق إلى Google Docs
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                يحافظ على اتجاه RTL، الخطوط المعايرة، الجداول، الآيات القرآنية، والخطوط السفلية
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            aria-label="إغلاق"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E2433] text-slate-500 dark:text-slate-400 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {needsAuth ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938] text-center space-y-3">
              <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
                سجّل الدخول بحساب Google لمنح التطبيق إذن إنشاء المستندات في Google Docs وحفظها في حسابك مباشرة.
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
          ) : exportResult ? (
            <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 space-y-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                    تم حفظ المستند في Google Docs بنجاح
                  </p>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5 truncate">
                    {exportResult.name}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={exportResult.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح المستند في Google Docs</span>
                </a>
                <button
                  type="button"
                  onClick={handleCopyDocLink}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] hover:bg-slate-50 dark:hover:bg-[#232938] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'تم النسخ' : 'نسخ الرابط'}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Connected User Banner */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938] text-xs">
                <div className="min-w-0">
                  <span className="text-slate-500 dark:text-slate-400">الحساب المتصل: </span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate" dir="ltr">
                    {user?.email || user?.displayName || 'حساب Google'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="text-[11px] font-semibold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <LogOut className="w-3 h-3" />
                  <span>تبديل الحساب</span>
                </button>
              </div>

              {/* Export Mode Switch */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#0E1118] p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode('create');
                    setPendingUpdateConfirm(false);
                  }}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-bold transition-colors cursor-pointer ${
                    mode === 'create'
                      ? 'bg-white dark:bg-[#1B202C] text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  إنشاء مستند جديد
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('update');
                    setPendingUpdateConfirm(false);
                  }}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-bold transition-colors cursor-pointer ${
                    mode === 'update'
                      ? 'bg-white dark:bg-[#1B202C] text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  تحديث مستند موجود
                </button>
              </div>

              {/* Document Title */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  عنوان المستند في Google Docs
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
              </div>

              {/* Existing Docs Selector (when updating) */}
              {mode === 'update' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      اختر المستند المراد استبدال محتواه
                    </label>
                    <button
                      type="button"
                      disabled={isLoadingDocs}
                      onClick={() => void loadExistingDocs()}
                      className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingDocs ? 'animate-spin' : ''}`} />
                      <span>تحديث القائمة</span>
                    </button>
                  </div>
                  <CustomSelect
                    value={selectedDocId}
                    onChange={(val) => {
                      setSelectedDocId(val);
                      setPendingUpdateConfirm(false);
                    }}
                    options={
                      existingDocs.length > 0
                        ? existingDocs.map((d) => ({ value: d.id, label: d.name }))
                        : [{ value: '', label: isLoadingDocs ? 'جاري تحميل مستنداتك...' : 'لا توجد مستندات Google Docs' }]
                    }
                    ariaLabel="اختر مستند Google Docs موجود"
                  />
                </div>
              )}

              {/* Typography Profile */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  نمط الخطوط والتنسيق المعتمد
                </label>
                <CustomSelect
                  value={fontProfile}
                  onChange={(val) => setFontProfile(val as FontProfileId)}
                  options={fontOptions}
                  ariaLabel="نمط الخطوط والتنسيق المعتمد"
                />
              </div>

              {/* Mandatory Confirmation Gate before Overwriting Existing Google Doc */}
              {pendingUpdateConfirm && selectedDocObj && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                      <strong>تأكيد الاستبدال:</strong> سيتم استبدال كامل محتوى المستند{' '}
                      <span className="font-bold underline">«{selectedDocObj.name}»</span> في Google Docs بالمحتوى المنسق الجديد.
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingUpdateConfirm(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#2A3142] bg-white dark:bg-[#1B202C] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => void executeExport()}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
                    >
                      نعم، تأكيد استبدال المستند
                    </button>
                  </div>
                </div>
              )}

              {exportError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-xs font-semibold text-red-700 dark:text-red-300">
                  {exportError}
                </div>
              )}

              {!pendingUpdateConfirm && (
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1B202C] cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={handlePrimarySubmit}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isExporting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>
                      {isExporting
                        ? 'جاري الرفع والتنسيق في Google Docs...'
                        : mode === 'update'
                        ? 'متابعة لتحديث المستند'
                        : 'إنشاء مستند Google Docs'}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
