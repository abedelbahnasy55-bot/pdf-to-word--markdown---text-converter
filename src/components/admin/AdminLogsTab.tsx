import React, { useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  History,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import type {
  ConversionLogView,
  ConversionStatus,
  TrackedUserView,
} from '../../model/governance';
import {
  formatAdminDateTime,
  formatDurationMs,
  formatFileSizeCompact,
  getConversionStatusView,
  getOperationLabelAr,
} from './adminFormatters';

type LogStatusFilter = 'all' | ConversionStatus;

interface AdminLogsTabProps {
  logs: ConversionLogView[];
  users: TrackedUserView[];
  filterClientId: string | null;
  onClearFilterClient: () => void;
  onSelectUserFromLog: (clientId: string) => void;
  onClearLogs: (clientId?: string) => Promise<boolean>;
}

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const AdminLogsTab: React.FC<AdminLogsTabProps> = ({
  logs,
  users,
  filterClientId,
  onClearFilterClient,
  onSelectUserFromLog,
  onClearLogs,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      if (u.displayName) map.set(u.clientId, u.displayName);
    }
    return map;
  }, [users]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (filterClientId && log.clientId !== filterClientId) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'started') {
          if (log.status !== 'started' && log.status !== 'processing') return false;
        } else if (log.status !== statusFilter) {
          return false;
        }
      }
      if (!q) return true;
      const alias = userNameMap.get(log.clientId) || '';
      return (
        log.fileName.toLowerCase().includes(q) ||
        log.clientId.toLowerCase().includes(q) ||
        alias.toLowerCase().includes(q) ||
        log.ip.toLowerCase().includes(q) ||
        log.deviceLabel.toLowerCase().includes(q) ||
        (log.errorMessage || '').toLowerCase().includes(q) ||
        (log.blockReason || '').toLowerCase().includes(q)
      );
    });
  }, [logs, filterClientId, statusFilter, searchQuery, userNameMap]);

  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleExportCsv = () => {
    const header = [
      'Timestamp',
      'ClientId',
      'DisplayName',
      'IP',
      'Device',
      'FileName',
      'FileSizeBytes',
      'Operation',
      'ExtractionMethod',
      'Status',
      'PagesCount',
      'WordsCount',
      'DurationMs',
      'ReasonOrError',
    ].join(',');
    const rows = filteredLogs.map((l) =>
      [
        escapeCsvCell(new Date(l.startedAt).toISOString()),
        escapeCsvCell(l.clientId),
        escapeCsvCell(userNameMap.get(l.clientId) || ''),
        escapeCsvCell(l.ip),
        escapeCsvCell(l.deviceLabel),
        escapeCsvCell(l.fileName),
        l.fileSize,
        escapeCsvCell(l.operation),
        escapeCsvCell(l.extractionMethod),
        escapeCsvCell(l.status),
        l.pagesCount,
        l.wordsCount,
        l.durationMs,
        escapeCsvCell(l.blockReason || l.errorMessage || ''),
      ].join(',')
    );
    triggerDownload(
      `\uFEFF${header}\n${rows.join('\n')}`,
      `conversion-logs-${Date.now()}.csv`,
      'text/csv;charset=utf-8'
    );
  };

  const handleExportJson = () => {
    triggerDownload(
      JSON.stringify(filteredLogs, null, 2),
      `conversion-logs-${Date.now()}.json`,
      'application/json;charset=utf-8'
    );
  };

  const handleConfirmClear = async () => {
    setIsClearing(true);
    await onClearLogs(filterClientId || undefined);
    setIsClearing(false);
    setConfirmClear(false);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم الملف، المستخدم، IP، الجهاز، أو نص الخطأ..."
              className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-[#FBFBF9] dark:bg-[#0E1118] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <CustomSelect<LogStatusFilter>
            ariaLabel="تصفية السجل حسب الحالة"
            value={statusFilter}
            onChange={setStatusFilter}
            className="w-full md:w-48"
            size="md"
            options={[
              { value: 'all', label: `كل الحالات (${logs.length})` },
              { value: 'completed', label: 'المكتملة فقط' },
              { value: 'started', label: 'الجارية الآن' },
              { value: 'paused', label: 'المتوقفة مؤقتاً' },
              { value: 'blocked', label: 'الممنوعة بالصلاحيات' },
              { value: 'failed', label: 'التي فشلت' },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={filteredLogs.length === 0}
              onClick={handleExportCsv}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-slate-50 dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              disabled={filteredLogs.length === 0}
              onClick={handleExportJson}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2A3142] bg-slate-50 dark:bg-[#1B202C] hover:bg-slate-100 dark:hover:bg-[#232938] text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>

            {!confirmClear ? (
              <button
                type="button"
                disabled={filteredLogs.length === 0}
                onClick={() => setConfirmClear(true)}
                className="px-3 py-2 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50/70 dark:bg-red-500/10 text-xs font-bold text-red-700 dark:text-red-300 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مسح السجل</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isClearing}
                  onClick={() => void handleConfirmClear()}
                  className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold cursor-pointer"
                >
                  تأكيد المسح
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-[#2A3142] text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            )}
          </div>
        </div>

        {filterClientId && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">مرشح لمستخدم محدد:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-500/30">
              <span>{userNameMap.get(filterClientId) || filterClientId}</span>
              <button
                type="button"
                onClick={onClearFilterClient}
                aria-label="إزالة تصفية المستخدم"
                className="hover:text-red-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Detailed Table */}
      <section className="bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-[#232938] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              سجل عمليات التحويل التفصيلي ({filteredLogs.length})
            </h2>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            لا توجد سجلات تحويل مطابقة حالياً.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-[#0E1118] border-b border-slate-200 dark:border-[#232938] text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">التوقيت</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">المستخدم والجهاز</th>
                  <th className="py-2.5 px-3 font-semibold">الملف المحوّل</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">الصفحات / الكلمات</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">الطريقة والمدة</th>
                  <th className="py-2.5 px-3 font-semibold whitespace-nowrap">الحالة والملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1F2533]">
                {filteredLogs.map((log) => {
                  const st = getConversionStatusView(log.status);
                  const alias = userNameMap.get(log.clientId);
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-[#191E2B] align-top"
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatAdminDateTime(log.startedAt)}
                      </td>
                      <td className="py-2.5 px-3 min-w-[170px]">
                        <button
                          type="button"
                          onClick={() => onSelectUserFromLog(log.clientId)}
                          className="font-bold text-blue-700 dark:text-blue-400 hover:underline text-right cursor-pointer"
                        >
                          {alias || log.clientId}
                        </button>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 space-x-1 space-x-reverse">
                          <span dir="ltr" className="font-mono">
                            {log.ip}
                          </span>
                          <span>· {log.deviceLabel}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 max-w-[230px]">
                        <div
                          className="font-semibold text-slate-900 dark:text-slate-100 truncate"
                          title={log.fileName}
                        >
                          {log.fileName}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {formatFileSizeCompact(log.fileSize)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {log.pagesCount} صفحة
                        </div>
                        {log.wordsCount > 0 && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {log.wordsCount.toLocaleString('en-US')} كلمة
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="text-slate-700 dark:text-slate-300 font-medium">
                          {getOperationLabelAr(log.operation, log.extractionMethod)}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatDurationMs(log.durationMs)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 max-w-[260px]">
                        <span
                          className={`inline-block text-[10px] px-2 py-0.5 rounded-md border font-bold ${st.badgeClass}`}
                        >
                          {st.label}
                        </span>
                        {(log.blockReason || log.errorMessage) && (
                          <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 leading-snug">
                            {log.blockReason || log.errorMessage}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
