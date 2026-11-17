import React, { useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import {
  X,
  Terminal,
  Download,
  Copy,
  Check,
  Zap,
  FolderArchive,
  RefreshCw,
  Layers,
  ShieldCheck,
  CheckCircle2,
  Server,
} from 'lucide-react';

interface AgentCliHubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AgentCliHubModal: React.FC<AgentCliHubModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'mcp' | 'cli' | 'api'>('mcp');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const originUrl =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const copyToClipboard = (text: string, sectionKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 3000);
  };

  const handleTestPing = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const res = await apiFetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setPingResult({
          ok: true,
          message: `المحرك يعمل بنجاح ومستعد لمعالجة دفعات الكتب (${data.models?.join('، ') || 'الخدمة المجانية'})`,
        });
      } else {
        setPingResult({ ok: false, message: `تعذر الاتصال بالمحرك (${res.status})` });
      }
    } catch (e: any) {
      setPingResult({
        ok: false,
        message: `خطأ في الاتصال: ${e.message || 'فشل الاتصال بالخادم'}`,
      });
    } finally {
      setIsPinging(false);
    }
  };

  const mcpConfigJson = JSON.stringify(
    {
      mcpServers: {
        'books-word-converter': {
          command: 'node',
          args: ['/path/to/mcp-server.js'],
          env: {
            CONVERTER_SERVER_URL: originUrl,
          },
        },
      },
    },
    null,
    2
  );

  const cliCommandNode = `node batch-runner.js --input="D:/books" --output="D:/word_output" --bundle-size=15`;
  const cliCommandPy = `python batch_runner.py --input="./my_books" --output="./converted" --bundle-size=15`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs font-sans"
      dir="rtl"
    >
      <div className="bg-white dark:bg-[#141720] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#232938] w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="p-5 bg-slate-900 dark:bg-[#0D1017] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                مركز الأتمتة وسطـر الأوامر (CLI & MCP)
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                تحويل المكتبات الكبيرة مباشرة من جهازك مع استئناف تلقائي
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-[#232938] bg-slate-50 dark:bg-[#11141C] px-4 sm:px-6 pt-2 shrink-0 overflow-x-auto gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('mcp')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'mcp'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#141720] rounded-t-lg'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>خادم البروتوكول البرمجي (MCP)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cli')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'cli'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#141720] rounded-t-lg'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>سطر الأوامر السريع (CLI)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'api'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#141720] rounded-t-lg'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>فحص الاتصال والخادم</span>
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-slate-800 dark:text-slate-200">
          {activeTab === 'mcp' && (
            <div className="space-y-5">
              <div className="p-4 bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200/80 dark:border-blue-500/30 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                <p className="font-bold mb-1">محرك الأتمتة والربط البرمجي</p>
                يربط هذا الخادم أدوات التحويل المحلية بسطح المكتب بنفس معايير الطباعة المعايرة وفصل اتجاه RTL/LTR وبوابات التدقيق.
              </div>

              <div className="flex flex-wrap gap-2.5">
                <a
                  href="/api/cli/download/bundle"
                  download="books-word-converter-cli.zip"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>تنزيل الحزمة الكاملة (.zip)</span>
                </a>

                <button
                  type="button"
                  onClick={() => copyToClipboard(mcpConfigJson, 'mcpConfig')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] text-slate-800 dark:text-slate-200 font-bold text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-[#2A3142] cursor-pointer"
                >
                  {copiedSection === 'mcpConfig' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>نسخ ملف التكوين</span>
                    </>
                  )}
                </button>
              </div>

              <pre
                className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto text-left border border-slate-800"
                dir="ltr"
              >
                {mcpConfigJson}
              </pre>
            </div>
          )}

          {activeTab === 'cli' && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2.5">
                <a
                  href="/api/cli/download/batch-runner-js"
                  download="batch-runner.js"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>batch-runner.js</span>
                </a>
                <a
                  href="/api/cli/download/batch-runner-py"
                  download="batch_runner.py"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs sm:text-sm rounded-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>batch_runner.py</span>
                </a>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">أمر التشغيل السريع (Node.js):</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(cliCommandNode, 'cmdNode')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedSection === 'cmdNode' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSection === 'cmdNode' ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>
                <pre
                  className="p-3.5 bg-slate-900 text-emerald-400 rounded-xl text-xs font-mono overflow-x-auto text-left"
                  dir="ltr"
                >
                  {cliCommandNode}
                </pre>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-bold">أو عبر Python 3:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(cliCommandPy, 'cmdPy')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedSection === 'cmdPy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSection === 'cmdPy' ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>
                <pre
                  className="p-3.5 bg-slate-900 text-emerald-400 rounded-xl text-xs font-mono overflow-x-auto text-left"
                  dir="ltr"
                >
                  {cliCommandPy}
                </pre>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#252B3B] rounded-xl text-center">
                  <FolderArchive className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                  <span className="text-xs font-bold block">حزم ZIP دورية</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#252B3B] rounded-xl text-center">
                  <RefreshCw className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                  <span className="text-xs font-bold block">استئناف تلقائي</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#252B3B] rounded-xl text-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                  <span className="text-xs font-bold block">استهلاك ذاكرة منخفض</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleTestPing}
                  disabled={isPinging}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isPinging ? 'animate-spin' : ''}`} />
                  <span>{isPinging ? 'جاري الفحص...' : 'فحص الاتصال الآن'}</span>
                </button>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400" dir="ltr">
                  {originUrl}/api/health
                </span>
              </div>

              {pingResult && (
                <div
                  className={`p-4 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 ${
                    pingResult.ok
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                      : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-900 dark:text-red-200'
                  }`}
                >
                  {pingResult.ok ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <X className="w-5 h-5 text-red-600 shrink-0" />
                  )}
                  <p className="font-medium">{pingResult.message}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 dark:bg-[#11141C] border-t border-slate-200 dark:border-[#232938] flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>معالجة مستمرة على الخادم دون الحاجة لإبقاء المتصفح مفتوحاً</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs sm:text-sm font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
