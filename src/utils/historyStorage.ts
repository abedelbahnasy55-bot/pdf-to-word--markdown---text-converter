import { ConversionResult, SavedConversion } from '../types';

const DB_NAME = 'pdf_converter_db';
const DB_VERSION = 2;
const STORE_NAME = 'conversions';
const BATCH_STORE_NAME = 'batch_sessions';
const LAST_ACTIVE_KEY = 'pdf_converter_last_active_id';
const LOCAL_STORAGE_KEY = 'pdf_converter_history_backup';

let cachedDbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (cachedDbPromise) return cachedDbPromise;
  cachedDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) {
      cachedDbPromise = null;
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(BATCH_STORE_NAME)) {
        db.createObjectStore(BATCH_STORE_NAME, { keyPath: 'sessionId' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        cachedDbPromise = null;
      };
      db.onclose = () => {
        cachedDbPromise = null;
      };
      db.onerror = () => {
        cachedDbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      cachedDbPromise = null;
      reject(request.error);
    };
  });
  return cachedDbPromise;
}

export async function saveToHistory(
  result: ConversionResult,
  fileName: string,
  fileSize?: number,
  totalPages?: number
): Promise<SavedConversion> {
  const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item: SavedConversion = {
    id,
    timestamp: Date.now(),
    fileName: fileName || result.fileName || 'document.pdf',
    fileSize: fileSize || result.fileSize,
    totalPages: totalPages || result.totalPages || result.pageCountEstimate || 1,
    title: result.title || fileName.replace(/\.[^/.]+$/, ''),
    result,
    isDownloaded: false,
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      store.put(item);
    });
  } catch (err) {
    console.warn('IndexedDB write failed, falling back to localStorage', err);
    try {
      const existing = getLocalStorageHistory();
      existing.unshift(item);
      // Keep at most 20 recent items in localStorage to avoid storage quota limits
      const trimmed = existing.slice(0, 20);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.error('LocalStorage backup write failed', e);
    }
  }

  setLastActiveId(id);
  return item;
}

export async function getHistory(): Promise<SavedConversion[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const req = index.openCursor(null, 'prev'); // Most recent first
      const items: SavedConversion[] = [];

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve(items);
        }
      };
      req.onerror = () => {
        resolve(getLocalStorageHistory());
      };
    });
  } catch {
    return getLocalStorageHistory();
  }
}

export async function getHistoryItem(id: string): Promise<SavedConversion | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    const list = getLocalStorageHistory();
    return list.find((item) => item.id === id) || null;
  }
}

export async function deleteFromHistory(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      store.delete(id);
    });
  } catch (err) {
    console.warn('IndexedDB delete failed', err);
  }

  try {
    const list = getLocalStorageHistory().filter((i) => i.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error(e);
  }

  if (getLastActiveId() === id) {
    setLastActiveId(null);
  }
}

export async function clearHistory(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      store.clear();
    });
  } catch (err) {
    console.warn('IndexedDB clear failed', err);
  }

  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch (e) {
    console.error(e);
  }
}

export async function markHistoryDownloaded(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if (getReq.result) {
          const updated = { ...getReq.result, isDownloaded: true };
          store.put(updated);
        }
      };
    });
  } catch {
    // fallback
    try {
      const list = getLocalStorageHistory().map((item) =>
        item.id === id ? { ...item, isDownloaded: true } : item
      );
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch {}
  }
}

export function getLastActiveId(): string | null {
  try {
    return localStorage.getItem(LAST_ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setLastActiveId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(LAST_ACTIVE_KEY, id);
    } else {
      localStorage.removeItem(LAST_ACTIVE_KEY);
    }
  } catch {}
}

/**
 * Formats a byte count for display.
 *
 * Clamps the unit index into the available range. The previous index was computed
 * with a bare Math.log, which for anything above a terabyte selects an index past
 * the end of the unit array, so a 1 TB file rendered as "1 undefined" in the
 * history list and in the batch progress bar. Sub-byte and negative inputs fell
 * through to the same out-of-range path and produced "409.6 undefined" and
 * "NaN undefined" respectively.
 *
 * The unit table is declared inside the function rather than at module scope so
 * this remains a self-contained declaration; the characterization harness compiles
 * individual declarations in isolation and would otherwise lose the binding.
 */
export function formatBytes(bytes?: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) return '0 B';
  const k = 1024;
  // Clamp BOTH ends. The upper bound stops a file above a terabyte from indexing
  // past the unit table, which is what rendered "1 undefined". The lower bound
  // stops a sub-byte value, where log() yields a negative index, from DIVIDING by
  // 1024 instead of scaling up, which rendered "409.6 undefined" for 0.4.
  const magnitude = Math.min(
    Math.max(Math.floor(Math.log(bytes) / Math.log(k)), 0),
    units.length - 1
  );
  const scaled = bytes / Math.pow(k, magnitude);
  return `${parseFloat(scaled.toFixed(1))} ${units[magnitude]}`;
}

function getLocalStorageHistory(): SavedConversion[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export interface PersistedBatchItem {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress?: number;
  result?: ConversionResult;
  error?: string;
  retryCount?: number;
  isDownloaded?: boolean;
  statusMessage?: string;
  lastUpdatedAt?: number;
  fileBlob?: Blob;
  fileType?: string;
}

export interface PersistedBatchSession {
  sessionId: string;
  timestamp: number;
  items: PersistedBatchItem[];
}

/**
 * Persists the entire active batch session to IndexedDB so that browser refreshes,
 * accidental navigation, or crashes never lose the queued or completed books.
 */
// Maximum file size to store in batch session storage: 5MB.
// Prevents tab crashing (Out of Memory) when handling large batches or 100+ page books.
const MAX_SESSION_BLOB_SIZE = 5 * 1024 * 1024;

export async function saveBatchSession(
  items: Array<{
    id: string;
    file?: File;
    name: string;
    size: number;
    status: 'pending' | 'processing' | 'done' | 'error';
    progress?: number;
    result?: ConversionResult;
    error?: string;
    retryCount?: number;
    isDownloaded?: boolean;
    statusMessage?: string;
  }>
): Promise<void> {
  if (!items || items.length === 0) {
    await clearBatchSession();
    return;
  }

  // Strip massive blobs and already-done blobs to shield browser memory
  const persistedItems: PersistedBatchItem[] = items.map((it) => {
    const shouldKeepBlob =
      it.status !== 'done' &&
      it.file &&
      it.file.size > 0 &&
      it.file.size <= MAX_SESSION_BLOB_SIZE;

    return {
      id: it.id,
      name: it.name,
      size: it.size,
      status: it.status,
      progress: it.progress,
      result: it.result,
      error: it.error,
      retryCount: it.retryCount,
      isDownloaded: Boolean(it.isDownloaded),
      statusMessage: it.statusMessage,
      lastUpdatedAt: (it as any).lastUpdatedAt || Date.now(),
      fileBlob: shouldKeepBlob ? it.file : undefined,
      fileType: it.file?.type || 'application/pdf',
    };
  });

  const session: PersistedBatchSession = {
    sessionId: 'current_active_batch',
    timestamp: Date.now(),
    items: persistedItems,
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BATCH_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BATCH_STORE_NAME);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      store.put(session);
    });
  } catch (err) {
    console.warn('Failed to save batch session to IndexedDB', err);
  }
}

/**
 * Loads the persisted batch session from IndexedDB if one exists.
 */
export async function getBatchSession(): Promise<PersistedBatchItem[] | null> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(BATCH_STORE_NAME)) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(BATCH_STORE_NAME, 'readonly');
      const store = tx.objectStore(BATCH_STORE_NAME);
      const req = store.get('current_active_batch');
      req.onsuccess = () => {
        if (req.result && Array.isArray(req.result.items)) {
          resolve(req.result.items);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Clears the persisted active batch session from IndexedDB.
 */
export async function clearBatchSession(): Promise<void> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(BATCH_STORE_NAME)) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BATCH_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BATCH_STORE_NAME);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      store.delete('current_active_batch');
    });
  } catch {}
}

/**
 * Marks a specific item in the persisted batch session as downloaded.
 */
export async function markBatchItemDownloadedInSession(itemId: string): Promise<void> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(BATCH_STORE_NAME)) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BATCH_STORE_NAME, 'readwrite');
      const store = tx.objectStore(BATCH_STORE_NAME);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      const req = store.get('current_active_batch');
      req.onsuccess = () => {
        if (req.result && Array.isArray(req.result.items)) {
          const session = req.result as PersistedBatchSession;
          session.items = session.items.map((it) =>
            it.id === itemId ? { ...it, isDownloaded: true } : it
          );
          store.put(session);
        }
      };
    });
  } catch {}
}



