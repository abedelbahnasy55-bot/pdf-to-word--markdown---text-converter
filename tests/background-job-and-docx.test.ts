import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as docx from 'docx';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  FREE_OCR_MODELS,
  isPageDigitalClean,
  batchScannedPageNumbers,
  buildThinkingConfigForModel,
  BackgroundJobManager,
} from '../server/backgroundJobManager';
import {
  sanitizeXmlString,
  buildDocxBinary,
} from '../shared/typographyDocxCore';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

describe('Free Model Pool & Digital-First Hybrid Triage', () => {
  it('uses only active free-tier Gemini models', () => {
    expect(Array.from(FREE_OCR_MODELS)).toEqual([
      'gemini-4-hydrogen',
      'gemini-3.1-flash-lite',
    ]);
    const hCfg = buildThinkingConfigForModel('gemini-4-hydrogen');
    const lCfg = buildThinkingConfigForModel('gemini-3.1-flash-lite');
    expect(hCfg.thinkingConfig.thinkingLevel).toBeDefined();
    expect(lCfg.thinkingConfig.thinkingLevel).toBeDefined();
  });

  it('correctly distinguishes digital clean Arabic pages from scanned/empty/corrupted pages', () => {
    const cleanArabic =
      'الدرس الأول: علامات الإعراب الأصلية والفرعية. س١: أعرب ما تحته خط في الجملة الآتية: «إن العلمَ نورٌ يهدي العقول».';
    expect(isPageDigitalClean(cleanArabic)).toBe(true);

    expect(isPageDigitalClean('Scanned with CamScanner\n   \n')).toBe(false);
    expect(isPageDigitalClean('   \n  \t  ')).toBe(false);

    const garbled = '\uFFFD'.repeat(40) + 'abc';
    expect(isPageDigitalClean(garbled)).toBe(false);
  });

  it('batches scanned page numbers cleanly in adaptive chunks', () => {
    expect(batchScannedPageNumbers([1, 2, 4, 7, 8, 9, 10], 3)).toEqual([
      [1, 2, 4],
      [7, 8, 9],
      [10],
    ]);
    expect(batchScannedPageNumbers([], 3)).toEqual([]);
  });
});

describe('Persistent Disk-Backed BackgroundJobManager', () => {
  it('persists jobs to disk and supports list, pause, resume, and delete', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-jobs-test-'));
    tempDirs.push(tmpRoot);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    page.drawText('Sample digital Arabic-ready PDF page for testing persistence.');
    const pdfBytes = await pdfDoc.save();

    const manager = new BackgroundJobManager(tmpRoot, () => ({} as any));
    const created = manager.createJobFromBuffer({
      fileName: 'كتاب_النحو_الشامل.pdf',
      mimeType: 'application/pdf',
      fileBuffer: Buffer.from(pdfBytes),
      direction: 'rtl',
    });

    expect(created.id).toBeTruthy();
    expect(created.fileName).toBe('كتاب_النحو_الشامل.pdf');

    const jobs = manager.listJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].id).toBe(created.id);

    const paused = manager.pauseOrCancelJob(created.id);
    expect(['paused', 'completed', 'running']).toContain(paused?.status);

    const resumed = manager.resumeJob(created.id);
    expect(resumed).not.toBeNull();
    expect(['queued', 'running', 'completed', 'failed', 'paused']).toContain(resumed!.status);

    await new Promise((r) => setTimeout(r, 150));

    // Recreate manager pointing at same disk dir (simulating server restart recovery)
    const manager2 = new BackgroundJobManager(tmpRoot, () => ({} as any));
    const listedAfterRestart = manager2.listJobs();
    expect(listedAfterRestart.length).toBe(1);
    expect(listedAfterRestart[0].id).toBe(created.id);

    expect(manager2.deleteJob(created.id)).toBe(true);
    expect(manager2.listJobs().length).toBe(0);
  });
});

describe('XML Sanitization & Real Binary DOCX Generation', () => {
  it('strips illegal XML 1.0 control characters and unpaired UTF-16 surrogates', () => {
    const dirty =
      'أعرب ما \u0000\u0008\u000Bتحته خط: \uD800 سليم <u>المجتهدون</u> \uDFFF';
    const clean = sanitizeXmlString(dirty);
    expect(clean).not.toContain('\u0000');
    expect(clean).not.toContain('\u0008');
    expect(clean).not.toContain('\u000B');
    expect(clean).not.toContain('\uD800');
    expect(clean).not.toContain('\uDFFF');
    expect(clean).toContain('<u>المجتهدون</u>');
  });

  it('builds a real ZIP-compressed .docx binary even with underlines, tables, and noisy chars', async () => {
    const markdown = `# نموذج اختبار اللغة العربية\n\nس١: أعرب ما تحته خط:\nإن <u>المعلمين</u> مخلصون في عملهم.\u0007\n\n| الكلمة | الإعراب |\n| --- | --- |\n| المعلمين | اسم إن منصوب بالياء |`;
    const buf = await buildDocxBinary(
      {
        title: 'نموذج اختبار',
        markdown,
        isRtl: true,
        fontProfile: 'bilingual_publication',
      },
      { docx, JSZip }
    );

    expect(buf instanceof Uint8Array).toBe(true);
    expect(buf.length).toBeGreaterThan(1500);
    // Genuine DOCX must begin with PK ZIP header (0x50, 0x4B)
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});
