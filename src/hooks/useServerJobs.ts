import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConversionOptions } from '../types';
import type { ServerJobMeta } from '../model/jobs';
import {
  deleteServerJob,
  fetchServerJobDetail,
  listServerJobs,
  pauseServerJob,
  resumeServerJob,
  submitServerJobFile,
} from '../api/serverJobsApi';
import { saveToHistory } from '../utils/historyStorage';

interface UseServerJobsParams {
  isTeamAccessAllowed: boolean;
  refreshHistoryList: () => Promise<void>;
  notify: (msg: string, durationMs?: number) => void;
  onError: (msg: string) => void;
  onPolicySync?: () => void;
}

export function useServerJobs({
  isTeamAccessAllowed,
  refreshHistoryList,
  notify,
  onError,
  onPolicySync,
}: UseServerJobsParams) {
  const [serverJobs, setServerJobs] = useState<ServerJobMeta[]>([]);
  const [loadingServerJobId, setLoadingServerJobId] = useState<string | null>(null);
  const syncedServerJobIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const raw = localStorage.getItem('synced_server_job_ids');
        return new Set<string>(raw ? JSON.parse(raw) : []);
      } catch {
        return new Set<string>();
      }
    })()
  );

  const syncCompletedServerJobToHistory = useCallback(
    async (jobMeta: ServerJobMeta) => {
      if (syncedServerJobIdsRef.current.has(jobMeta.id)) return;
      try {
        const { ok, data } = await fetchServerJobDetail(jobMeta.id);
        if (!ok) return;
        if (data?.success && data?.result) {
          syncedServerJobIdsRef.current.add(jobMeta.id);
          try {
            localStorage.setItem(
              'synced_server_job_ids',
              JSON.stringify(Array.from(syncedServerJobIdsRef.current))
            );
          } catch {}
          await saveToHistory(
            data.result,
            jobMeta.fileName,
            jobMeta.fileSize,
            data.result.totalPages || jobMeta.totalPages || 1
          );
          await refreshHistoryList();
          onPolicySync?.();
        }
      } catch {}
    },
    [onPolicySync, refreshHistoryList]
  );

  const fetchServerJobs = useCallback(async () => {
    if (!isTeamAccessAllowed) return;
    try {
      const jobs = await listServerJobs();
      if (jobs) {
        setServerJobs(jobs);
        for (const job of jobs) {
          if (job.status === 'completed' && !syncedServerJobIdsRef.current.has(job.id)) {
            void syncCompletedServerJobToHistory(job);
          }
        }
      }
    } catch {}
  }, [isTeamAccessAllowed, syncCompletedServerJobToHistory]);

  useEffect(() => {
    if (isTeamAccessAllowed) {
      void fetchServerJobs();
    }
  }, [isTeamAccessAllowed, fetchServerJobs]);

  const hasActiveServerJobs = serverJobs.some(
    (j) => j.status === 'queued' || j.status === 'running'
  );

  useEffect(() => {
    if (!hasActiveServerJobs || !isTeamAccessAllowed) return;
    const timer = setInterval(() => {
      void fetchServerJobs();
    }, 2500);
    return () => clearInterval(timer);
  }, [hasActiveServerJobs, isTeamAccessAllowed, fetchServerJobs]);

  const activeServerJobsCount = serverJobs.filter(
    (j) => j.status === 'queued' || j.status === 'running'
  ).length;

  const submitFilesToServerBackgroundJobs = useCallback(
    async (files: File[], customOptions?: ConversionOptions) => {
      let submitted = 0;
      const failedFiles: string[] = [];
      void customOptions;

      for (const file of files) {
        try {
          const res = await submitServerJobFile(file, 'auto');
          if (res.ok && res.success) {
            submitted++;
          } else {
            failedFiles.push(`${file.name}: ${res.error || 'خطأ في الرفع'}`);
          }
        } catch (err: any) {
          failedFiles.push(`${file.name}: ${err?.message || 'تعذر الاتصال بالخادم'}`);
        }
      }

      await fetchServerJobs();

      if (submitted > 0) {
        notify(
          submitted === 1
            ? 'تم إرسال الملف للمعالجة المستمرة على الخادم — يتابع العمل حتى إذا أغلقت المتصفح أو التبويب.'
            : `تم إرسال ${submitted} ملفات للمعالجة المستمرة على الخادم — تستمر دون انقطاع حتى عند إغلاق المتصفح.`,
          6500
        );
      }
      if (failedFiles.length > 0) {
        onError(failedFiles.join(' · '));
      }
      onPolicySync?.();
    },
    [fetchServerJobs, notify, onError, onPolicySync]
  );

  const handlePauseServerJob = useCallback(
    async (jobId: string) => {
      try {
        await pauseServerJob(jobId);
        await fetchServerJobs();
      } catch {}
    },
    [fetchServerJobs]
  );

  const handleResumeServerJob = useCallback(
    async (jobId: string) => {
      try {
        await resumeServerJob(jobId);
        await fetchServerJobs();
      } catch {}
    },
    [fetchServerJobs]
  );

  const handleDeleteServerJob = useCallback(
    async (jobId: string) => {
      try {
        await deleteServerJob(jobId);
        await fetchServerJobs();
      } catch {}
    },
    [fetchServerJobs]
  );

  const handleClearFinishedServerJobs = useCallback(async () => {
    const finished = serverJobs.filter((j) => j.status === 'completed' || j.status === 'failed');
    for (const j of finished) {
      await deleteServerJob(j.id).catch(() => {});
    }
    await fetchServerJobs();
  }, [serverJobs, fetchServerJobs]);

  return {
    serverJobs,
    hasActiveServerJobs,
    activeServerJobsCount,
    loadingServerJobId,
    setLoadingServerJobId,
    fetchServerJobs,
    submitFilesToServerBackgroundJobs,
    handlePauseServerJob,
    handleResumeServerJob,
    handleDeleteServerJob,
    handleClearFinishedServerJobs,
  };
}
