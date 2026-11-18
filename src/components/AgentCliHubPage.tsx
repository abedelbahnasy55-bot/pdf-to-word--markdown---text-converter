import React, { useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import {
  ArrowRight,
  Terminal,
  Download,
  Copy,
  Check,
  Zap,
  FolderArchive,
  RefreshCw,
  Server,
  Layers,
  ShieldCheck,
  FileCode,
  CheckCircle2,
  X,
  Play,
} from 'lucide-react';

interface AgentCliHubPageProps {
  onBack: () => void;
  embedded?: boolean;
}

export const AgentCliHubPage: React.FC<AgentCliHubPageProps> = ({ onBack, embedded = false }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; message: string } | null>(null);

  const rawOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const serverUrl =
    rawOrigin.includes('.ai.studio') || rawOrigin.includes('wpsct27fdufcpry5x6ikjn')
      ? 'https://pdf-to-word-markdown-text-converter.ai.studio'
      : rawOrigin;

  const handleDownloadScript = async (endpoint: string, filename: string) => {
    try {
      const res = await apiFetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setPingResult({ ok: false, message: `تعذر تنزيل الملف (${filename}).` });
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 3000);
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
          message: `المحرك يعمل بنجاح ومستعد لاستقبال الكتب مجاناً (${data.models?.join('، ') || 'الخدمة المجانية'})`,
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
            CONVERTER_SERVER_URL: serverUrl,
          },
        },
      },
    },
    null,
    2
  );

  const cliCommandNode = `node batch-runner.js --input="D:/books" --output="D:/word_output" --bundle-size=15 --server="${serverUrl}"`;
  const cliCommandPy = `python batch_runner.py --input="./my_books" --output="./converted" --bundle-size=15 --server="${serverUrl}"`;

  const automationScriptSpec = `# مواصفات التشغيل التلقائي لدفعات الكتب
# رابط خادم التحويل المجاني: ${serverUrl}
# فحص الجاهزية: GET ${serverUrl}/api/health
# تنزيل حزمة CLI و MCP: ${serverUrl}/api/cli/download/bundle

أمر التشغيل المباشر:
${cliCommandNode}

تكوين خادم الأدوات المحلية (MCP):
${mcpConfigJson}`;

  return (
    <div
      className={
        embedded
          ? 'w-full space-y-6 font-sans'
          : 'max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 space-y-6 font-sans'
      }
      dir="rtl"
    >
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-[#232938]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2.5 rounded-xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#2A3142] hover:bg-slate-50 dark:hover:bg-[#1B202C] text-slate-700 dark:text-slate-200 cursor-pointer flex items-center justify-center shrink-0"
              title="العودة لصفحة التحويل الرئيسية"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  مركز الأتمتة وسطـر الأوامر (CLI & MCP Hub)
                </h1>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                  مجاني 100%
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                تشغيل وتحويل المكتبات الكبيرة محلياً أو عبر سطر الأوامر مع استهلاك ذاكرة منخفض واستئناف تلقائي
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="self-start sm:self-auto px-4 py-2 text-xs sm:text-sm font-bold bg-slate-100 dark:bg-[#1B202C] hover:bg-slate-200 dark:hover:bg-[#232938] text-slate-700 dark:text-slate-200 rounded-lg cursor-pointer"
          >
            العودة للرئيسية
          </button>
        </div>
      )}

      {/* Spec Copy Card */}
      <section className="p-6 bg-slate-900 dark:bg-[#121622] text-white rounded-2xl border border-slate-800 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base sm:text-xl font-bold text-white">
            الربط البرمجي السريع لدفعات الملفات الكبيرة
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
            استخدم حزمة CLI أو بروتوكول MCP لتحويل عشرات ومئات الملفات تلقائياً من مجلدات جهازك مع دعم النماذج المجانية النشطة (Gemini 4 Hydrogen و Gemini 3.1 Flash Lite) والضبط المطبعي الكامل.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => copyToClipboard(automationScriptSpec, 'masterPrompt')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer"
          >
            {copiedKey === 'masterPrompt' ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>تم نسخ المواصفات وأوامر التشغيل</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>نسخ مواصفات الربط وأوامر التشغيل</span>
              </>
            )}
          </button>

          <span className="text-xs text-slate-300 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>دون اشتراكات · يدعم المعالجة الخلفية</span>
          </span>
        </div>
      </section>

      {/* Section 1: CLI Runner */}
      <section className="p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                1. مشغل سطر الأوامر المستقل (CLI Batch Runner)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                استهلاك ذاكرة منخفض واستئناف تلقائي عند الانقطاع
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => void handleDownloadScript('/api/cli/download/batch-runner-js', 'batch-runner.js')}
            className="p-3.5 text-right bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100/80 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 rounded-xl flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono font-bold text-xs text-emerald-800 dark:text-emerald-300">
                batch-runner.js
              </span>
              <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[11px] text-slate-600 dark:text-slate-400">مشغل Node.js</span>
          </button>

          <button
            type="button"
            onClick={() => void handleDownloadScript('/api/cli/download/run-batch-bat', 'run_batch.bat')}
            className="p-3.5 text-right bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100/80 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30 rounded-xl flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono font-bold text-xs text-blue-800 dark:text-blue-300">
                run_batch.bat
              </span>
              <Play className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-[11px] text-slate-600 dark:text-slate-400">تشغيل لويندوز</span>
          </button>

          <button
            type="button"
            onClick={() => void handleDownloadScript('/api/cli/download/batch-runner-py', 'batch_runner.py')}
            className="p-3.5 text-right bg-slate-50 dark:bg-[#191E2A] hover:bg-slate-100 dark:hover:bg-[#1E2433] border border-slate-200 dark:border-[#252B3B] rounded-xl flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
                batch_runner.py
              </span>
              <Download className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </div>
            <span className="text-[11px] text-slate-600 dark:text-slate-400">مشغل Python 3</span>
          </button>

          <button
            type="button"
            onClick={() => void handleDownloadScript('/api/cli/download/run-batch-sh', 'run_batch.sh')}
            className="p-3.5 text-right bg-slate-50 dark:bg-[#191E2A] hover:bg-slate-100 dark:hover:bg-[#1E2433] border border-slate-200 dark:border-[#252B3B] rounded-xl flex flex-col justify-between cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
                run_batch.sh
              </span>
              <Download className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </div>
            <span className="text-[11px] text-slate-600 dark:text-slate-400">مشغل ماك ولينكس</span>
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>أمر التشغيل (Node.js):</span>
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(cliCommandNode, 'cmdNode')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer"
            >
              {copiedKey === 'cmdNode' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'cmdNode' ? 'تم النسخ' : 'نسخ'}</span>
            </button>
          </div>
          <pre
            className="p-4 bg-slate-950 text-emerald-400 rounded-xl text-xs font-mono overflow-x-auto text-left border border-slate-800"
            dir="ltr"
          >
            {cliCommandNode}
          </pre>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>أمر بايثون (Python 3):</span>
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(cliCommandPy, 'cmdPy')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer"
            >
              {copiedKey === 'cmdPy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'cmdPy' ? 'تم النسخ' : 'نسخ'}</span>
            </button>
          </div>
          <pre
            className="p-4 bg-slate-950 text-amber-300 rounded-xl text-xs font-mono overflow-x-auto text-left border border-slate-800"
            dir="ltr"
          >
            {cliCommandPy}
          </pre>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="p-3.5 bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#252B3B] rounded-xl">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mb-1.5" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-0.5">
              استهلاك ذاكرة منخفض
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              تفريغ الذاكرة بعد كل صفحة وكتاب.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#252B3B] rounded-xl">
            <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 mb-1.5" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-0.5">
              استئناف تلقائي
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              يكمل من آخر نقطة محفوظة دون تكرار.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#252B3B] rounded-xl">
            <FolderArchive className="w-5 h-5 text-amber-600 dark:text-amber-400 mb-1.5" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-0.5">
              حزم ZIP مجدولة
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              تجميع دوري للملفات المكتملة في أرشيف.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-[#191E2A] border border-slate-200 dark:border-[#252B3B] rounded-xl">
            <Zap className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mb-1.5" />
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-0.5">
              عزل الأعطال
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              تخطي أي ملف معطوب ومتابعة باقي القائمة.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: MCP Bundle */}
      <section className="p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-700 dark:text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                2. خادم الربط البرمجي (MCP Server)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                متصل بالخادم الرئيسي مع وضع عمل محلي احتياطي
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadScript('/api/cli/download/bundle', 'books-word-converter-cli.zip')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تنزيل الحزمة (.zip)</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadScript('/api/cli/download/mcp-server', 'mcp-server.js')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>mcp-server.js</span>
            </button>
          </div>
        </div>

        <pre
          className="p-4 bg-slate-950 text-slate-200 rounded-xl text-xs font-mono overflow-x-auto text-left border border-slate-800"
          dir="ltr"
        >
          {mcpConfigJson}
        </pre>
      </section>

      {/* Section 3: Health */}
      <section className="p-6 bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-base sm:text-lg">
            <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2>3. فحص الاتصال بالخادم (Live Health Check)</h2>
          </div>

          <button
            type="button"
            onClick={handleTestPing}
            disabled={isPinging}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
            <span>{isPinging ? 'جاري الفحص...' : 'فحص الاتصال الآن'}</span>
          </button>
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
      </section>
    </div>
  );
};
