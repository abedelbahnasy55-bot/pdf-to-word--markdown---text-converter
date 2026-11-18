import { DOCX_MIME } from '../../shared/typographyDocxCore';
import { generateDocxBlob, type FontProfileId } from './docxExporter';
import { clearExpiredAccessToken, getAccessToken } from './workspaceAuth';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

export interface ExportToGoogleDocResult {
  documentId: string;
  name: string;
  webViewLink: string;
}

export class WorkspaceAuthRequiredError extends Error {
  constructor(message = 'يرجى تسجيل الدخول بحساب Google لمنح صلاحية الوصول إلى Google Docs و Drive.') {
    super(message);
    this.name = 'WorkspaceAuthRequiredError';
  }
}

async function requireValidToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new WorkspaceAuthRequiredError();
  }
  return token;
}

async function googleApiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await requireValidToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const response = await globalThis.fetch(url, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    clearExpiredAccessToken();
    throw new WorkspaceAuthRequiredError('انتهت صلاحية جلسة Google. يرجى تسجيل الدخول مجدداً.');
  }

  return response;
}

function buildMultipartRelatedBody(
  metadata: Record<string, any>,
  fileBytes: Uint8Array,
  fileMimeType: string,
  boundary: string
): Uint8Array {
  const encoder = new TextEncoder();
  const part1 = encoder.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${fileMimeType}\r\n\r\n`
  );
  const closing = encoder.encode(`\r\n--${boundary}--`);
  const combined = new Uint8Array(part1.length + fileBytes.length + closing.length);
  combined.set(part1, 0);
  combined.set(fileBytes, part1.length);
  combined.set(closing, part1.length + fileBytes.length);
  return combined;
}

/**
 * Converts studio Markdown output via our high-fidelity bilingual RTL DOCX typography engine
 * and uploads it directly as a native formatted Google Doc (preserving headings, RTL bidi,
 * verified <u> underlines, Quranic Uthmani verses, tables, callouts, and calibrated fonts).
 */
export async function exportMarkdownToGoogleDocs(opts: {
  title: string;
  markdown: string;
  isRtl: boolean;
  fontProfile?: FontProfileId;
  targetDocumentId?: string;
}): Promise<ExportToGoogleDocResult> {
  const cleanTitle = (opts.title || 'مستند الاستوديو').replace(/\.docx$/i, '').trim() || 'مستند الاستوديو';
  const docxBlob = await generateDocxBlob({
    title: cleanTitle,
    markdown: opts.markdown,
    isRtl: opts.isRtl,
    fontProfile: opts.fontProfile || 'bilingual_publication',
  });

  const arrayBuffer = await docxBlob.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuffer);
  const boundary = `studio_gdoc_boundary_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const isUpdate = Boolean(opts.targetDocumentId && opts.targetDocumentId.trim().length > 0);
  const metadata = isUpdate
    ? { name: cleanTitle }
    : {
        name: cleanTitle,
        mimeType: 'application/vnd.google-apps.document',
      };

  const multipartBody = buildMultipartRelatedBody(metadata, fileBytes, DOCX_MIME, boundary);

  const uploadUrl = isUpdate
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        opts.targetDocumentId!
      )}?uploadType=multipart&fields=id,name,webViewLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

  const res = await googleApiFetch(uploadUrl, {
    method: isUpdate ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`فشل تصدير المستند إلى Google Docs (${res.status}): ${errText.slice(0, 220)}`);
  }

  const created = (await res.json()) as {
    id: string;
    name?: string;
    webViewLink?: string;
  };

  return {
    documentId: created.id,
    name: created.name || cleanTitle,
    webViewLink:
      created.webViewLink || `https://docs.google.com/document/d/${encodeURIComponent(created.id)}/edit`,
  };
}

/**
 * Lists Google Docs, PDFs, Word files, and supported images from the authenticated user's Google Drive.
 */
export async function listDriveWorkspaceFiles(opts?: {
  searchQuery?: string;
  filterKind?: 'all' | 'docs' | 'pdfs' | 'word' | 'images';
}): Promise<DriveFileItem[]> {
  const kind = opts?.filterKind || 'all';
  const mimeClauses: Record<typeof kind, string> = {
    all: "(mimeType='application/vnd.google-apps.document' or mimeType='application/pdf' or mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType='application/msword' or mimeType contains 'image/')",
    docs: "mimeType='application/vnd.google-apps.document'",
    pdfs: "mimeType='application/pdf'",
    word: "(mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType='application/msword')",
    images: "mimeType contains 'image/'",
  };

  const parts = ['trashed = false', mimeClauses[kind]];
  const qClean = (opts?.searchQuery || '').trim().replace(/'/g, "\\'");
  if (qClean) {
    parts.push(`name contains '${qClean}'`);
  }

  const params = new URLSearchParams({
    q: parts.join(' and '),
    pageSize: '40',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
  });

  const res = await googleApiFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    method: 'GET',
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`تعذر قراءة قائمة ملفات Google Drive (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { files?: DriveFileItem[] };
  return Array.isArray(data.files) ? data.files : [];
}

/**
 * Reads structured Google Docs metadata/title via Google Docs API v1 and exports
 * either native .docx (for Google Docs) or raw binary (PDF/Word/Image) into a browser File
 * ready for direct studio conversion, auditing, or smart compilation.
 */
export async function importDriveFileForStudio(item: DriveFileItem): Promise<File> {
  if (item.mimeType === 'application/vnd.google-apps.document') {
    // Verify readable access via Google Docs v1 API first
    let docTitle = item.name;
    try {
      const docMetaRes = await googleApiFetch(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(item.id)}?fields=documentId,title`,
        { method: 'GET' }
      );
      if (docMetaRes.ok) {
        const docMeta = (await docMetaRes.json()) as { title?: string };
        if (docMeta?.title) docTitle = docMeta.title;
      }
    } catch {
      // Proceed with Drive export even if partial fields query skipped
    }

    const exportRes = await googleApiFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}/export?mimeType=${encodeURIComponent(
        DOCX_MIME
      )}`,
      { method: 'GET' }
    );
    if (!exportRes.ok) {
      throw new Error(`تعذر تصدير مستند Google Docs "${docTitle}" (${exportRes.status}).`);
    }
    const blob = await exportRes.blob();
    const safeName = docTitle.toLowerCase().endsWith('.docx') ? docTitle : `${docTitle}.docx`;
    return new File([blob], safeName, { type: DOCX_MIME });
  }

  const downloadRes = await googleApiFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media`,
    { method: 'GET' }
  );
  if (!downloadRes.ok) {
    throw new Error(`تعذر تنزيل الملف "${item.name}" من Google Drive (${downloadRes.status}).`);
  }
  const blob = await downloadRes.blob();
  return new File([blob], item.name, { type: item.mimeType || blob.type || 'application/octet-stream' });
}

/**
 * Permanently deletes a file from Google Drive.
 * Callers MUST display an explicit user confirmation dialog before invoking this function.
 */
export async function deleteDriveWorkspaceFile(fileId: string): Promise<void> {
  const res = await googleApiFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`تعذر حذف الملف من Google Drive (${res.status}): ${errText.slice(0, 200)}`);
  }
}
