import React, { useEffect, useState } from 'react';
import {
  Ban,
  Megaphone,
  PauseCircle,
  PlayCircle,
  Save,
  Sliders,
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import type { AnnouncementTone, SiteControlsConfig } from '../../model/governance';

interface AdminControlsTabProps {
  siteControls: SiteControlsConfig;
  onSaveControls: (patch: {
    siteEnabled?: boolean;
    siteDisabledMessage?: string;
    conversionsEnabled?: boolean;
    conversionsPausedMessage?: string;
    announcementBanner?: { enabled: boolean; text: string; tone: AnnouncementTone };
    featureFlags?: {
      allowSmartCompiler: boolean;
      allowBackgroundJobs: boolean;
      allowDocxExport: boolean;
      allowOcrFallback: boolean;
    };
    globalLimits?: {
      maxPagesPerConversion: number;
      maxFileSizeMb: number;
      dailyConversionQuotaPerUser: number;
      dailyPageQuotaPerUser: number;
    };
  }) => Promise<{ ok: boolean; error?: string }>;
}

const PAUSE_PRESET_MESSAGES = [
  'تم إيقاف عمليات التحويل مؤقتاً من قِبل المشرف لأعمال الصيانة والتحديث. يرجى المحاولة بعد قليل.',
  'تم استنفاد حصة التحويل المتاحة لهذا اليوم، سيتم إعادة فتح التحويل تلقائياً فور توفر الحصة.',
  'تشهد المنصة ضغطاً مرتفعاً حالياً؛ تم تعليق التحويلات الجديدة مؤقتاً حفاظاً على استقرار الخدمة.',
];

export const AdminControlsTab: React.FC<AdminControlsTabProps> = ({
  siteControls,
  onSaveControls,
}) => {
  const [siteEnabled, setSiteEnabled] = useState(siteControls.siteEnabled);
  const [siteDisabledMessage, setSiteDisabledMessage] = useState(
    siteControls.siteDisabledMessage
  );
  const [conversionsEnabled, setConversionsEnabled] = useState(
    siteControls.conversionsEnabled
  );
  const [conversionsPausedMessage, setConversionsPausedMessage] = useState(
    siteControls.conversionsPausedMessage
  );

  const [bannerEnabled, setBannerEnabled] = useState(
    siteControls.announcementBanner.enabled
  );
  const [bannerText, setBannerText] = useState(siteControls.announcementBanner.text);
  const [bannerTone, setBannerTone] = useState<AnnouncementTone>(
    siteControls.announcementBanner.tone
  );

  const [allowSmartCompiler, setAllowSmartCompiler] = useState(
    siteControls.featureFlags.allowSmartCompiler
  );
  const [allowBackgroundJobs, setAllowBackgroundJobs] = useState(
    siteControls.featureFlags.allowBackgroundJobs
  );
  const [allowDocxExport, setAllowDocxExport] = useState(
    siteControls.featureFlags.allowDocxExport
  );
  const [allowOcrFallback, setAllowOcrFallback] = useState(
    siteControls.featureFlags.allowOcrFallback
  );

  const [maxPages, setMaxPages] = useState(siteControls.globalLimits.maxPagesPerConversion);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(
    siteControls.globalLimits.maxFileSizeMb
  );
  const [dailyConvQuota, setDailyConvQuota] = useState(
    siteControls.globalLimits.dailyConversionQuotaPerUser
  );
  const [dailyPageQuota, setDailyPageQuota] = useState(
    siteControls.globalLimits.dailyPageQuotaPerUser
  );

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  useEffect(() => {
    setSiteEnabled(siteControls.siteEnabled);
    setSiteDisabledMessage(siteControls.siteDisabledMessage);
    setConversionsEnabled(siteControls.conversionsEnabled);
    setConversionsPausedMessage(siteControls.conversionsPausedMessage);
    setBannerEnabled(siteControls.announcementBanner.enabled);
    setBannerText(siteControls.announcementBanner.text);
    setBannerTone(siteControls.announcementBanner.tone);
    setAllowSmartCompiler(siteControls.featureFlags.allowSmartCompiler);
    setAllowBackgroundJobs(siteControls.featureFlags.allowBackgroundJobs);
    setAllowDocxExport(siteControls.featureFlags.allowDocxExport);
    setAllowOcrFallback(siteControls.featureFlags.allowOcrFallback);
    setMaxPages(siteControls.globalLimits.maxPagesPerConversion);
    setMaxFileSizeMb(siteControls.globalLimits.maxFileSizeMb);
    setDailyConvQuota(siteControls.globalLimits.dailyConversionQuotaPerUser);
    setDailyPageQuota(siteControls.globalLimits.dailyPageQuotaPerUser);
  }, [siteControls]);

  const handleSaveAll = async () => {
    setIsSaving(true);
    setFeedback(null);
    const res = await onSaveControls({
      siteEnabled,
      siteDisabledMessage,
      conversionsEnabled,
      conversionsPausedMessage,
      announcementBanner: {
        enabled: bannerEnabled,
        text: bannerText,
        tone: bannerTone,
      },
      featureFlags: {
        allowSmartCompiler,
        allowBackgroundJobs,
        allowDocxExport,
        allowOcrFallback,
      },
      globalLimits: {
        maxPagesPerConversion: Math.max(0, Number(maxPages) || 0),
        maxFileSizeMb: Math.max(0, Number(maxFileSizeMb) || 0),
        dailyConversionQuotaPerUser: Math.max(0, Number(dailyConvQuota) || 0),
        dailyPageQuotaPerUser: Math.max(0, Number(dailyPageQuota) || 0),
      },
    });
    setIsSaving(false);
    setFeedback(
      res.ok
        ? { type: 'ok', text: 'تم حفظ كافة قواعد التحكم وتطبيقها على المنصة فوراً.' }
        : { type: 'err', text: res.error || 'تعذر حفظ الإعدادات.' }
    );
  };

  return (
    <div className="space-y-6">
      {/* Card 1: Master Kill Switches & Custom Messages */}
      <section className="p-5 sm:p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            1. مفاتيح الإيقاف الفوري ورسائل الإدارة
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تُطبق فور الحفظ على جميع الزوار والمستخدمين مع بقاء رابط المشرف (?admin=1) مفتوحاً لك دائماً.
          </p>
        </div>

        {/* Conversions Toggle */}
        <div
          className={`p-4 rounded-xl border space-y-3 transition-colors ${
            !conversionsEnabled
              ? 'bg-amber-50/70 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/40'
              : 'bg-[#FBFBF9] dark:bg-[#0E1118] border-slate-200 dark:border-[#232938]'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {conversionsEnabled ? (
                <PlayCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <PauseCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              )}
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                حالة التحويلات العامة لجميع المستخدمين
              </span>
            </div>
            <button
              type="button"
              onClick={() => setConversionsEnabled((v) => !v)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                conversionsEnabled
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {conversionsEnabled
                ? 'إيقاف جميع التحويلات الآن'
                : 'تشغيل التحويلات من جديد'}
            </button>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              الرسالة التي تظهر للمستخدم عند إيقاف التحويل:
            </label>
            <textarea
              rows={2}
              value={conversionsPausedMessage}
              onChange={(e) => setConversionsPausedMessage(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#141720] text-xs text-slate-900 dark:text-slate-100"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500">قوالب جاهزة:</span>
              {PAUSE_PRESET_MESSAGES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setConversionsPausedMessage(preset)}
                  className="px-2 py-1 rounded-lg bg-white dark:bg-[#1B202C] border border-slate-200 dark:border-[#2A3142] text-[11px] text-slate-700 dark:text-slate-300 hover:border-blue-500 cursor-pointer"
                >
                  قالب {idx + 1}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Full Site Lock Toggle */}
        <div
          className={`p-4 rounded-xl border space-y-3 transition-colors ${
            !siteEnabled
              ? 'bg-red-50/70 dark:bg-red-500/10 border-red-300 dark:border-red-500/40'
              : 'bg-[#FBFBF9] dark:bg-[#0E1118] border-slate-200 dark:border-[#232938]'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Ban
                className={`w-4 h-4 ${
                  siteEnabled
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              />
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                حالة الموقع بالكامل للزوار (وضع الصيانة الشامل)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSiteEnabled((v) => !v)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                siteEnabled
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {siteEnabled ? 'إغلاق الموقع عن الزوار' : 'إعادة فتح الموقع للزوار'}
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              رسالة شاشة الإغلاق الكامل عند دخول أي زائر للموقع:
            </label>
            <textarea
              rows={2}
              value={siteDisabledMessage}
              onChange={(e) => setSiteDisabledMessage(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#141720] text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </section>

      {/* Card 2: Global Announcement Banner */}
      <section className="p-5 sm:p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              2. إعلان شريطي عام في أعلى الصفحة الرئيسية
            </h2>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={bannerEnabled}
              onChange={(e) => setBannerEnabled(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span>إظهار الإعلان للجميع</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-3">
            <input
              type="text"
              value={bannerText}
              onChange={(e) => setBannerText(e.target.value)}
              placeholder="اكتب نص الإعلان الذي سيظهر في أعلى المنصة لكل المستخدمين..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
          <CustomSelect<AnnouncementTone>
            ariaLabel="لون ومستوى الإعلان"
            value={bannerTone}
            onChange={setBannerTone}
            size="md"
            options={[
              { value: 'info', label: 'تنويه إخباري (أزرق)' },
              { value: 'warning', label: 'تنبيه تحذيري (أصفر)' },
              { value: 'danger', label: 'تنبيه عاجل (أحمر)' },
            ]}
          />
        </div>
      </section>

      {/* Card 3: Feature Toggles & Global Quotas */}
      <section className="p-5 sm:p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            3. التحكم في الميزات والحدود القصوى للحصص والأحجام
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="p-3.5 rounded-xl bg-[#FBFBF9] dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938] flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allowOcrFallback}
              onChange={(e) => setAllowOcrFallback(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-blue-600"
            />
            <div className="text-xs">
              <div className="font-bold text-slate-900 dark:text-slate-100">
                السماح بالمعالجة البصرية OCR للصور والمصوّرات
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                تعطيله يقتصر على الاستخراج الرقمي المباشر فقط (صفر استهلاك للحصة).
              </div>
            </div>
          </label>

          <label className="p-3.5 rounded-xl bg-[#FBFBF9] dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938] flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allowBackgroundJobs}
              onChange={(e) => setAllowBackgroundJobs(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-blue-600"
            />
            <div className="text-xs">
              <div className="font-bold text-slate-900 dark:text-slate-100">
                السماح بمهام الخلفية المستمرة على الخادم
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                استمرار معالجة الملفات على الخادم عند إغلاق المتصفح.
              </div>
            </div>
          </label>

          <label className="p-3.5 rounded-xl bg-[#FBFBF9] dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938] flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allowSmartCompiler}
              onChange={(e) => setAllowSmartCompiler(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-blue-600"
            />
            <div className="text-xs">
              <div className="font-bold text-slate-900 dark:text-slate-100">
                إتاحة استوديو التجميع والتحرير للمستخدمين
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                إظهار أو إخفاء تبويب استوديو تجميع الكتب والامتحانات.
              </div>
            </div>
          </label>

          <label className="p-3.5 rounded-xl bg-[#FBFBF9] dark:bg-[#0E1118] border border-slate-200 dark:border-[#232938] flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allowDocxExport}
              onChange={(e) => setAllowDocxExport(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-blue-600"
            />
            <div className="text-xs">
              <div className="font-bold text-slate-900 dark:text-slate-100">
                السماح بتنزيل وتصدير ملفات Word (.docx)
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                التحكم في صلاحية تصدير مستندات Word المنسقة.
              </div>
            </div>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200 dark:border-[#232938]">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              حد الصفحات لكل ملف (0 = مفتوح)
            </label>
            <input
              type="number"
              min={0}
              value={maxPages}
              onChange={(e) => setMaxPages(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              أقصى حجم للملف MB (0 = مفتوح)
            </label>
            <input
              type="number"
              min={0}
              value={maxFileSizeMb}
              onChange={(e) => setMaxFileSizeMb(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              تحويلات/يوم لكل مستخدم (0 = مفتوح)
            </label>
            <input
              type="number"
              min={0}
              value={dailyConvQuota}
              onChange={(e) => setDailyConvQuota(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              صفحات/يوم لكل مستخدم (0 = مفتوح)
            </label>
            <input
              type="number"
              min={0}
              value={dailyPageQuota}
              onChange={(e) => setDailyPageQuota(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold border ${
              feedback.type === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSaveAll()}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'جاري الحفظ...' : 'حفظ وتطبيق كافة قواعد التحكم الآن'}</span>
          </button>
        </div>
      </section>
    </div>
  );
};
