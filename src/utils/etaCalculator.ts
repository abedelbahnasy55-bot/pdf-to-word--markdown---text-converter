/**
 * ETA & Remaining Time Calculator for Document Processing & Batch Queues
 * Accurately estimates time remaining based on remaining files count, file sizes in bytes,
 * elapsed processing duration, and adaptive throughput.
 */

export interface BatchEtaInfo {
  totalFiles: number;
  completedFiles: number;
  remainingFiles: number;
  totalBytes: number;
  processedBytes: number;
  remainingBytes: number;
  overallPercentage: number;
  estimatedSecondsRemaining: number;
  formattedEta: string;
  speedFormatted: string;
  estimatedTotalSeconds: number;
}

/**
 * Formats a duration in seconds into natural, friendly Arabic phrasing
 */
export function formatEtaArabic(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'لحظات قليلة...';
  if (totalSeconds < 6) return 'أقل من 5 ثوانٍ';
  if (totalSeconds < 60) return `حوالي ${Math.round(totalSeconds)} ثانية`;

  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = Math.round(totalSeconds % 60);

  if (minutes === 1) {
    return remainingSeconds > 0
      ? `حوالي دقيقة و ${remainingSeconds} ثانية`
      : 'حوالي دقيقة واحدة';
  }

  if (minutes === 2) {
    return remainingSeconds > 0
      ? `حوالي دقيقتين و ${remainingSeconds} ثانية`
      : 'حوالي دقيقتين';
  }

  if (minutes >= 3 && minutes <= 10) {
    return remainingSeconds > 0
      ? `حوالي ${minutes} دقائق و ${remainingSeconds} ثانية`
      : `حوالي ${minutes} دقائق`;
  }

  if (minutes > 10 && minutes < 60) {
    return remainingSeconds > 0
      ? `حوالي ${minutes} دقيقة و ${remainingSeconds} ثانية`
      : `حوالي ${minutes} دقيقة`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `حوالي ${hours} ساعة و ${remainingMinutes} دقيقة`;
}

/**
 * Calculates estimated remaining time for a batch queue based on:
 * - Number of remaining files
 * - Remaining byte volume (files sizes)
 * - Actual elapsed processing time and throughput
 */
export function calculateBatchQueueEta(
  items: Array<{ size: number; status: string; progress?: number }>,
  elapsedSeconds: number
): BatchEtaInfo {
  const totalFiles = items.length;
  if (totalFiles === 0) {
    return {
      totalFiles: 0,
      completedFiles: 0,
      remainingFiles: 0,
      totalBytes: 0,
      processedBytes: 0,
      remainingBytes: 0,
      overallPercentage: 0,
      estimatedSecondsRemaining: 0,
      formattedEta: '0 ثانية',
      speedFormatted: '0 ك.ب/ث',
      estimatedTotalSeconds: 0,
    };
  }

  let totalBytes = 0;
  let processedBytes = 0;
  let completedFiles = 0;
  let remainingFiles = 0;

  for (const item of items) {
    const itemSize = Math.max(1024, item.size || 1024);
    totalBytes += itemSize;

    if (item.status === 'done') {
      completedFiles++;
      processedBytes += itemSize;
    } else if (item.status === 'processing') {
      remainingFiles++;
      const currentProgressRatio = Math.max(0, Math.min(100, item.progress || 10)) / 100;
      processedBytes += itemSize * currentProgressRatio;
    } else {
      // pending or error
      if (item.status === 'pending') {
        remainingFiles++;
      }
    }
  }

  const remainingBytes = Math.max(0, totalBytes - processedBytes);
  const overallPercentage = Math.min(
    100,
    Math.max(0, Math.round((processedBytes / Math.max(1, totalBytes)) * 100))
  );

  // If all done
  if (remainingFiles === 0 || overallPercentage >= 100) {
    return {
      totalFiles,
      completedFiles,
      remainingFiles: 0,
      totalBytes,
      processedBytes: totalBytes,
      remainingBytes: 0,
      overallPercentage: 100,
      estimatedSecondsRemaining: 0,
      formattedEta: 'اكتملت المعالجة بالكامل',
      speedFormatted: 'مكتمل',
      estimatedTotalSeconds: elapsedSeconds,
    };
  }

  // Calculate Throughput & ETA
  // Base OCR heuristic: ~7 seconds per file + ~4 seconds per 500KB of document data
  const baseFileHeuristicSec = remainingFiles * 7;
  const baseSizeHeuristicSec = (remainingBytes / (500 * 1024)) * 4;
  const heuristicEtaSeconds = Math.max(5, baseFileHeuristicSec + baseSizeHeuristicSec);

  let effectiveSecondsRemaining: number;
  let currentBytesPerSec = 0;

  if (elapsedSeconds >= 3 && processedBytes > 1024) {
    currentBytesPerSec = processedBytes / elapsedSeconds;
    // Calculate based on observed speed
    const empiricalEtaSeconds = remainingBytes / Math.max(5000, currentBytesPerSec);
    // Blend empirical with heuristic to avoid wild spikes early on
    const weight = Math.min(0.85, (elapsedSeconds / 15) * 0.7);
    effectiveSecondsRemaining = Math.max(
      4,
      Math.round(heuristicEtaSeconds * (1 - weight) + empiricalEtaSeconds * weight)
    );
  } else {
    effectiveSecondsRemaining = Math.round(heuristicEtaSeconds);
    currentBytesPerSec = totalBytes / Math.max(10, heuristicEtaSeconds);
  }

  // Format speed (e.g. 150 KB/s or 1.2 MB/s)
  let speedFormatted = '';
  if (currentBytesPerSec >= 1024 * 1024) {
    speedFormatted = `${(currentBytesPerSec / (1024 * 1024)).toFixed(1)} م.ب/ث`;
  } else {
    speedFormatted = `${Math.round(currentBytesPerSec / 1024)} ك.ب/ث`;
  }

  return {
    totalFiles,
    completedFiles,
    remainingFiles,
    totalBytes,
    processedBytes,
    remainingBytes,
    overallPercentage,
    estimatedSecondsRemaining: effectiveSecondsRemaining,
    formattedEta: formatEtaArabic(effectiveSecondsRemaining),
    speedFormatted,
    estimatedTotalSeconds: elapsedSeconds + effectiveSecondsRemaining,
  };
}

/**
 * Calculates estimated remaining time for a single active document conversion
 */
export function calculateSingleFileEta(
  percentage: number,
  elapsedSeconds: number,
  fileSize?: number
): { remainingSeconds: number; formattedEta: string } {
  const safePercentage = Math.max(1, Math.min(99, percentage || 5));
  if (safePercentage >= 98) {
    return { remainingSeconds: 2, formattedEta: 'ثوانٍ معدودة...' };
  }

  let remainingSec: number;
  if (elapsedSeconds >= 2) {
    const totalEstSec = (elapsedSeconds / (safePercentage / 100));
    remainingSec = Math.max(3, Math.round(totalEstSec - elapsedSeconds));
  } else {
    // Default baseline estimation based on document size
    const sizeInMb = (fileSize || 500000) / (1024 * 1024);
    const baseline = Math.max(8, Math.min(60, 10 + sizeInMb * 8));
    remainingSec = Math.max(3, Math.round(baseline * (1 - safePercentage / 100)));
  }

  return {
    remainingSeconds: remainingSec,
    formattedEta: formatEtaArabic(remainingSec),
  };
}

export interface StableBatchEtaState {
  lastEtaSeconds: number | null;
  lastPercentage: number;
  lastTotalFiles: number;
  lastTotalBytes: number;
  lastElapsedSeconds: number;
}

export function createInitialStableEtaState(): StableBatchEtaState {
  return {
    lastEtaSeconds: null,
    lastPercentage: 0,
    lastTotalFiles: 0,
    lastTotalBytes: 0,
    lastElapsedSeconds: 0,
  };
}

/**
 * Computes a stable, smoothed, and monotonic ETA for active batch queues.
 * Prevents the raw throughput formula from spiking upward when an active file's
 * progress pauses while waiting on an in-flight AI OCR chunk.
 */
export function calculateStableBatchEta(
  items: Array<{ size: number; status: string; progress?: number }>,
  elapsedSeconds: number,
  prevState?: StableBatchEtaState | null
): { eta: BatchEtaInfo; nextState: StableBatchEtaState } {
  const totalFiles = items.length;
  if (totalFiles === 0) {
    return {
      eta: calculateBatchQueueEta(items, elapsedSeconds),
      nextState: createInitialStableEtaState(),
    };
  }

  let totalBytes = 0;
  let processedBytes = 0;
  let completedFiles = 0;
  let remainingFiles = 0;
  let maxActiveProgress = 0;
  let baselineTotalSeconds = 0;
  let baselineRemainingSeconds = 0;

  for (const item of items) {
    const itemSize = Math.max(1024, item.size || 1024);
    totalBytes += itemSize;
    // Realistic OCR baseline: ~12s base overhead + ~10s per 500KB of document
    const itemEstSec = Math.max(15, 12 + (itemSize / (500 * 1024)) * 10);
    baselineTotalSeconds += itemEstSec;

    if (item.status === 'done') {
      completedFiles++;
      processedBytes += itemSize;
    } else if (item.status === 'processing') {
      remainingFiles++;
      const pct = Math.max(0, Math.min(100, item.progress ?? 5));
      maxActiveProgress = Math.max(maxActiveProgress, pct);
      const ratio = pct / 100;
      processedBytes += itemSize * ratio;
      baselineRemainingSeconds += itemEstSec * Math.max(0.05, 1 - ratio);
    } else if (item.status === 'pending') {
      remainingFiles++;
      baselineRemainingSeconds += itemEstSec;
    }
  }

  const remainingBytes = Math.max(0, totalBytes - processedBytes);
  const rawPercentage = Math.min(
    100,
    Math.max(0, Math.round((processedBytes / Math.max(1, totalBytes)) * 100))
  );

  if (remainingFiles === 0 || rawPercentage >= 100) {
    const doneEta: BatchEtaInfo = {
      totalFiles,
      completedFiles,
      remainingFiles: 0,
      totalBytes,
      processedBytes: totalBytes,
      remainingBytes: 0,
      overallPercentage: 100,
      estimatedSecondsRemaining: 0,
      formattedEta: 'اكتملت المعالجة بالكامل',
      speedFormatted: 'مكتمل',
      estimatedTotalSeconds: elapsedSeconds,
    };
    return {
      eta: doneEta,
      nextState: {
        lastEtaSeconds: 0,
        lastPercentage: 100,
        lastTotalFiles: totalFiles,
        lastTotalBytes: totalBytes,
        lastElapsedSeconds: elapsedSeconds,
      },
    };
  }

  const queueExpanded =
    !prevState ||
    totalFiles > prevState.lastTotalFiles ||
    totalBytes > prevState.lastTotalBytes;

  const overallPercentage = queueExpanded
    ? rawPercentage
    : Math.max(prevState.lastPercentage, rawPercentage);

  // Only blend empirical throughput once meaningful work is actually completed
  // (at least 1 finished file OR active progress has advanced beyond initial overhead).
  const hasMeaningfulProgress =
    elapsedSeconds >= 5 &&
    (completedFiles >= 1 || maxActiveProgress >= 25) &&
    processedBytes > 1024;

  let targetRemaining = Math.max(4, Math.round(baselineRemainingSeconds));
  let displayBytesPerSec = totalBytes / Math.max(15, baselineTotalSeconds);

  if (hasMeaningfulProgress) {
    const observedBytesPerSec = processedBytes / Math.max(1, elapsedSeconds);
    // Floor observed speed to avoid absurd spikes on slow single chunks
    const safeObservedSpeed = Math.max(displayBytesPerSec * 0.4, observedBytesPerSec);
    const empiricalEta = remainingBytes / Math.max(5000, safeObservedSpeed);
    const blendWeight = completedFiles >= 1
      ? Math.min(0.65, 0.25 + completedFiles * 0.1)
      : Math.min(0.35, (maxActiveProgress - 20) / 100);
    targetRemaining = Math.max(
      4,
      Math.round(baselineRemainingSeconds * (1 - blendWeight) + empiricalEta * blendWeight)
    );
    displayBytesPerSec = safeObservedSpeed;
  }

  let effectiveSecondsRemaining: number;
  if (!prevState || prevState.lastEtaSeconds === null) {
    effectiveSecondsRemaining = targetRemaining;
  } else if (queueExpanded) {
    const addedBytes = Math.max(0, totalBytes - prevState.lastTotalBytes);
    const addedFiles = Math.max(0, totalFiles - prevState.lastTotalFiles);
    const addedEst = Math.round(addedFiles * 12 + (addedBytes / (500 * 1024)) * 10);
    effectiveSecondsRemaining = Math.max(4, prevState.lastEtaSeconds + addedEst);
  } else {
    const deltaElapsed = Math.max(0, elapsedSeconds - prevState.lastElapsedSeconds);
    // Smooth natural countdown by elapsed seconds
    const decremented = Math.max(4, prevState.lastEtaSeconds - deltaElapsed);

    if (targetRemaining < decremented) {
      // Gently pull down toward faster observed progress (max 25% of gap per tick)
      const stepDown = Math.max(deltaElapsed, Math.round((decremented - targetRemaining) * 0.25));
      effectiveSecondsRemaining = Math.max(4, prevState.lastEtaSeconds - stepDown);
    } else {
      // Strict anti-spike: never jump upward while waiting on an in-flight chunk
      effectiveSecondsRemaining = decremented;
    }
  }

  let speedFormatted = '';
  if (displayBytesPerSec >= 1024 * 1024) {
    speedFormatted = `${(displayBytesPerSec / (1024 * 1024)).toFixed(1)} م.ب/ث`;
  } else {
    speedFormatted = `${Math.max(1, Math.round(displayBytesPerSec / 1024))} ك.ب/ث`;
  }

  const formattedEta =
    effectiveSecondsRemaining <= 5
      ? 'ثوانٍ معدودة...'
      : formatEtaArabic(effectiveSecondsRemaining);

  return {
    eta: {
      totalFiles,
      completedFiles,
      remainingFiles,
      totalBytes,
      processedBytes,
      remainingBytes,
      overallPercentage,
      estimatedSecondsRemaining: effectiveSecondsRemaining,
      formattedEta,
      speedFormatted,
      estimatedTotalSeconds: elapsedSeconds + effectiveSecondsRemaining,
    },
    nextState: {
      lastEtaSeconds: effectiveSecondsRemaining,
      lastPercentage: overallPercentage,
      lastTotalFiles: totalFiles,
      lastTotalBytes: totalBytes,
      lastElapsedSeconds: elapsedSeconds,
    },
  };
}

