/**
 * Triggers safe, high-reliability browser downloads for Blobs and text files.
 * Provides resilient fallback handling for Arabic filenames and prevents memory leaks.
 */

export function safeDownloadBlob(blob: Blob, filename: string): void {
  try {
    // Sanitize illegal filesystem characters while strictly preserving Arabic letters
    const cleanFilename = filename
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'document';

    if (typeof window === 'undefined') return;

    // Standard HTML5 download mechanism
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', cleanFilename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      try {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
      } catch {
        // Ignore cleanup anomalies
      }
    }, 2500);
  } catch (err: any) {
    console.error('safeDownloadBlob failed:', err);
    throw new Error(`تعذر حفظ الملف: ${err?.message || 'خطأ في واجهة المتصفح'}`);
  }
}

export function safeDownloadText(content: string, filename: string, mimeType: string = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  safeDownloadBlob(blob, filename);
}
