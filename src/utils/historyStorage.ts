import { ConversionResult, SavedConversion } from '../types';

const DB_NAME = 'pdf_converter_db';
const DB_VERSION = 1;
const STORE_NAME = 'conversions';
const LAST_ACTIVE_KEY = 'pdf_converter_last_active_id';
const LOCAL_STORAGE_KEY = 'pdf_converter_history_backup';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
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
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
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
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
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
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if (getReq.result) {
          const updated = { ...getReq.result, isDownloaded: true };
          store.put(updated);
        }
        resolve();
      };
      getReq.onerror = () => resolve();
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


