import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it, expect, afterEach } from 'vitest';
import * as docx from 'docx';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  buildDocxBinary,
  segmentByScript,
  resolveParagraphDirection,
  TYPOGRAPHY_PROFILES,
} from '../shared/typographyDocxCore.js';
import {
  runFullRefinementPipeline,
  polishBilingualBoundariesCore,
} from '../shared/arabicPipelineCore.js';
import { generateDocxBlob } from '../src/utils/docxExporter';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-docx-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

describe('Bilingual Script Segmentation & Mixed Arabic-English Isolation', () => {
  it('separates interleaved English phrases, acronyms, and parentheticals into LTR runs inside Arabic prose', () => {
    const input = 'يدعم النظام Model Context Protocol و PDF (v2.0) بدقة عالية';
    const segments = segmentByScript(input);

    const englishSegments = segments.filter((s) => !s.isArabic && /[A-Za-z]/.test(s.text));
    const arabicSegments = segments.filter((s) => s.isArabic);

    expect(englishSegments.map((s) => s.text.trim())).toEqual([
      'Model Context Protocol',
      'PDF (v2.0)',
    ]);
    expect(arabicSegments.map((s) => s.text.trim()).join(' ')).toContain('يدعم النظام');
    expect(arabicSegments.map((s) => s.text.trim()).join(' ')).toContain('بدقة عالية');
  });

  it('keeps URLs and hyphenated identifiers together as LTR segments', () => {
    const input = 'زر الرابط https://example.com/docs/v2-final لتحميل الحزمة.';
    const segments = segmentByScript(input);
    const urlSeg = segments.find((s) => s.text.includes('https://example.com/docs/v2-final'));
    expect(urlSeg).toBeDefined();
    expect(urlSeg?.isArabic).toBe(false);
  });

  it('detects pure English paragraphs inside RTL books as LTR dynamically', () => {
    expect(resolveParagraphDirection('This is a standalone English section.', true)).toBe(false);
    expect(resolveParagraphDirection('يدعم النظام بروتوكول MCP بدقة.', true)).toBe(true);
    expect(resolveParagraphDirection('Regular English paragraph.', false)).toBe(false);
  });
});

describe('Calibrated Dual-Script OOXML Typography & Fidelity Generation', () => {
  it('generates calibrated Traditional Arabic (15pt CS) + Calibri (11.5pt ASCII) DOCX with isolated LTR runs and bidi sectPr', async () => {
    const markdown = [
      '# الفصل الأول: مقدمة في الذكاء الاصطناعي (Introduction to AI)',
      '',
      'يدعم المحرك الحديث بروتوكول Model Context Protocol ويعالج ملفات PDF و Word بدقة مطبعية عالية.',
      '',
      'قال تعالى: ﴿عَمَّ يَتَسَاءَلُونَ﴾[^1].',
      '',
      '| العنصر | النوع | الحالة |',
      '| :--- | :--- | :--- |',
      '| الأداة | MCP Server v2.0 | نشط |',
      '',
      '[^1]: سورة النبأ، الآية 1.',
    ].join('\n');

    const binary = await buildDocxBinary(
      {
        title: 'دليل التحويل الشامل (v2.0)',
        markdown,
        isRtl: true,
        fontProfile: 'heritage_azhari',
      },
      { docx, JSZip }
    );

    const zip = await JSZip.loadAsync(binary);
    const docXml = await zip.file('word/document.xml')!.async('string');

    // Verify Traditional Arabic & Calibri font pairing
    expect(docXml).toContain('Traditional Arabic');
    expect(docXml).toContain('Calibri');

    // Verify dual half-point sizes for body (15pt CS = 30, 11.5pt ASCII = 23)
    expect(docXml).toContain('w:val="30"');
    expect(docXml).toContain('w:val="23"');

    // Verify bidi section property & A4 page geometry
    expect(docXml).toMatch(/<w:sectPr>[\s\S]*?<w:bidi\b[^>]*\/>[\s\S]*?<\/w:sectPr>/);
    expect(docXml).toContain('w:w="11906"');
    expect(docXml).toContain('w:h="16838"');

    // Verify isolated LTR English run carries en-US and contains Model Context Protocol
    expect(docXml).toContain('Model Context Protocol');
    expect(docXml).toContain('en-US');
    expect(docXml).toContain('ar-SA');

    // Verify Footnotes XML was created
    const footnotesXml = await zip.file('word/footnotes.xml')?.async('string');
    expect(footnotesXml).toBeDefined();
    expect(footnotesXml).toContain('سورة النبأ');
  });

  it('supports academic_editorial profile (Amiri + Times New Roman) cleanly via generateDocxBlob', async () => {
    const blob = await generateDocxBlob({
      title: 'بحث أكاديمي',
      markdown: 'فقرة عربية تحتوي على مصطلح Natural Language Processing داخل السطر.',
      isRtl: true,
      fontProfile: 'academic_editorial',
    });

    const buf = Buffer.from(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file('word/document.xml')!.async('string');

    expect(TYPOGRAPHY_PROFILES.academic_editorial.arabicFont).toBe('Amiri');
    expect(docXml).toContain('Amiri');
    expect(docXml).toContain('Times New Roman');
    expect(docXml).toContain('w:val="27"'); // 13.5pt Amiri
    expect(docXml).toContain('w:val="23"'); // 11.5pt Times New Roman
  });

  it('defaults to Amiri (AR 14pt) + Plus Jakarta Sans (EN 14pt) with exact 1.5 line spacing (360 twips) when no fontProfile is specified', async () => {
    const markdown = [
      '# المقدمة في الذكاء الاصطناعي (AI Overview)',
      '',
      'يدعم المحرك الجديد خط Amiri و Plus Jakarta Sans بحجم 14 نقطة وتباعد أسطر 1.5 بدقة فائقة.',
    ].join('\n');

    const binary = await buildDocxBinary(
      {
        title: 'دليل الجودة الطباعية',
        markdown,
        isRtl: true,
      },
      { docx, JSZip }
    );

    const zip = await JSZip.loadAsync(binary);
    const docXml = await zip.file('word/document.xml')!.async('string');

    expect(docXml).toContain('Amiri');
    expect(docXml).toContain('Plus Jakarta Sans');
    // 14pt = 28 half-points on both w:sz and w:szCs for body text
    expect(docXml).toContain('w:sz w:val="28"');
    expect(docXml).toContain('w:szCs w:val="28"');
    // Exact 1.5 line spacing = 360 twips (1.5 * 240)
    expect(docXml).toContain('w:line="360"');
    expect(docXml).toMatch(/<w:sectPr>[\s\S]*?<w:bidi\b[^>]*\/>[\s\S]*?<\/w:sectPr>/);
  });
});

describe('Unified Bilingual & Arabic QA Refinement Pipeline', () => {
  it('polishes glued Arabic-English boundaries, splits glued table headers, wraps Quranic verses, and normalizes ligatures', () => {
    const raw = [
      'خطة القسم الأدبياالفترة الزمنيةاالموضوعات',
      'يدعم النظامModel Context Protocolبدقة فيﬁle.',
      'قال تعالى: {قل هو الله أحد}',
      'ان العلم الي النور.',
    ].join('\n');

    const refined = runFullRefinementPipeline(raw);

    expect(refined.markdown).toContain('| خطة القسم الأدبي | الفترة الزمنية | الموضوعات |');
    expect(refined.markdown).toContain('النظام Model Context Protocol بدقة');
    expect(refined.markdown).toContain('file');
    expect(refined.markdown).toContain('﴿قل هو الله أحد﴾');
    expect(refined.markdown).toContain('إلى');
    expect(refined.qaReport.qualityScore).toBeGreaterThanOrEqual(85);
  });

  it('preserves Markdown URLs and <mark> tags when polishing bilingual boundaries', () => {
    const raw = 'راجع [التوثيق](https://example.com/ar-test) و <mark>ملاحظةArabicEnglish</mark>';
    const polished = polishBilingualBoundariesCore(raw);
    expect(polished).toContain('https://example.com/ar-test');
    expect(polished).toContain('<mark>ملاحظة ArabicEnglish</mark>');
  });
});

describe('MCP Server v2.0 JSON-RPC Protocol & Offline/Server-Down Resilience', () => {
  it('responds to initialize, tools/list (7 tools), check_pipeline_health, and export_markdown_to_docx cleanly over stdio when server is down', async () => {
    const outDir = makeTempDir();
    const docxOutPath = path.join(outDir, 'bilingual_test.docx');

    const requests = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'vitest', version: '1.0' } },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'check_pipeline_health', arguments: { probe_server: true } },
      },
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'export_markdown_to_docx',
          arguments: {
            title: 'مستند اختبار MCP الشامل',
            markdown: '# عنوان رئيسي\n\nيدعم التصدير Offline Mode بالكامل مع كلمات Arabic و English متداخلة.',
            output_path: docxOutPath,
            font_profile: 'heritage_azhari',
          },
        },
      },
    ];

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'mcp-server.js');
    const child = execFile(
      process.execPath,
      [scriptPath],
      {
        env: {
          ...process.env,
          CONVERTER_SERVER_URL: 'http://127.0.0.1:59999', // Force unreachable server
          GEMINI_API_KEY: '', // No API key
        },
        timeout: 25000,
      }
    );

    const payload = requests.map((r) => JSON.stringify(r)).join('\n') + '\n';
    child.stdin!.write(payload);
    child.stdin!.end();

    let stdout = '';
    child.stdout!.on('data', (chunk) => {
      stdout += String(chunk);
    });

    await new Promise<void>((resolve, reject) => {
      child.on('exit', (code) => {
        if (code === 0 || code === null) resolve();
        else reject(new Error(`MCP exited with code ${code}`));
      });
      child.on('error', reject);
    });

    const responses = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const initResp = responses.find((r) => r.id === 1);
    expect(initResp?.result?.serverInfo?.version).toBe('2.0.0');

    const toolsResp = responses.find((r) => r.id === 2);
    const toolNames = toolsResp?.result?.tools?.map((t: any) => t.name) || [];
    expect(toolNames).toEqual([
      'scan_books_directory',
      'convert_book_to_word',
      'batch_convert_folder',
      'get_batch_status',
      'audit_and_repair_document',
      'export_markdown_to_docx',
      'check_pipeline_health',
    ]);

    const healthResp = responses.find((r) => r.id === 3);
    const healthData = JSON.parse(healthResp.result.content[0].text);
    expect(healthData.remoteServerReachable).toBe(false);
    expect(healthData.offlineCapabilities.localDigitalPdfExtractorReady).toBe(true);
    expect(healthData.offlineCapabilities.localDocxUpgradeAndAuditReady).toBe(true);
    expect(healthData.offlineCapabilities.sharedQaPipelineLoaded).toBe(true);
    expect(healthData.availableTypographyProfiles.length).toBe(5);
    expect(healthData.availableTypographyProfiles[0].arabicFont).toBe('Amiri');
    expect(healthData.availableTypographyProfiles[0].englishFont).toBe('Plus Jakarta Sans');
    expect(healthData.availableTypographyProfiles[0].arabicBodyPt).toBe(14);
    expect(healthData.availableTypographyProfiles[0].englishBodyPt).toBe(14);

    const exportResp = responses.find((r) => r.id === 4);
    const exportData = JSON.parse(exportResp.result.content[0].text);
    expect(exportData.status).toBe('completed');
    expect(fs.existsSync(docxOutPath)).toBe(true);

    const zip = await JSZip.loadAsync(fs.readFileSync(docxOutPath));
    const docXml = await zip.file('word/document.xml')!.async('string');
    expect(docXml).toContain('Traditional Arabic');
    expect(docXml).toContain('Calibri');
    expect(docXml).toContain('Offline Mode');
  });

  it('converts a digital PDF offline via Tier-3 pdf-parse fallback when remote server is completely down', async () => {
    const workDir = makeTempDir();
    const outDir = path.join(workDir, 'out');
    const pdfPath = path.join(workDir, 'sample_digital.pdf');

    // Create a clean digital PDF with selectable text >= 60 chars
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([595, 842]);
    page.drawText('Chapter 1: Model Context Protocol Offline Pipeline Verification', {
      x: 50,
      y: 760,
      size: 14,
      font,
    });
    page.drawText('This digital PDF is converted offline without requiring the converter server.', {
      x: 50,
      y: 730,
      size: 12,
      font,
    });
    fs.writeFileSync(pdfPath, await pdfDoc.save());

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'mcp-server.js');
    const child = execFile(
      process.execPath,
      [scriptPath],
      {
        env: {
          ...process.env,
          CONVERTER_SERVER_URL: 'http://127.0.0.1:59999', // Unreachable server
          GEMINI_API_KEY: '', // No Gemini key
        },
        timeout: 25000,
      }
    );

    const requests = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'convert_book_to_word',
          arguments: {
            file_path: pdfPath,
            output_dir: outDir,
            font_profile: 'academic_editorial',
          },
        },
      },
    ];

    child.stdin!.write(requests.map((r) => JSON.stringify(r)).join('\n') + '\n');
    child.stdin!.end();

    let stdout = '';
    child.stdout!.on('data', (c) => {
      stdout += String(c);
    });

    await new Promise<void>((resolve, reject) => {
      child.on('exit', () => resolve());
      child.on('error', reject);
    });

    const resp = JSON.parse(stdout.trim().split('\n')[0]);
    expect(resp.result.isError).not.toBe(true);
    const result = JSON.parse(resp.result.content[0].text);
    expect(result.extractionMethod).toBe('local_digital_pdf');
    expect(fs.existsSync(result.docxPath)).toBe(true);
    expect(fs.existsSync(result.markdownPath)).toBe(true);

    const mdContent = fs.readFileSync(result.markdownPath, 'utf-8');
    expect(mdContent).toContain('Model Context Protocol');

    const zip = await JSZip.loadAsync(fs.readFileSync(result.docxPath));
    const docXml = await zip.file('word/document.xml')!.async('string');
    expect(docXml).toContain('Times New Roman');
  });

  it('audits and repairs an existing corrupted .docx locally via audit_and_repair_document', async () => {
    const workDir = makeTempDir();
    const outDir = path.join(workDir, 'repaired');
    const rawDocxPath = path.join(workDir, 'legacy_book.docx');

    // Create a minimal raw DOCX with glued Arabic-English text and OCR artifacts
    const rawDoc = new docx.Document({
      sections: [
        {
          children: [
            new docx.Paragraph({
              children: [
                new docx.TextRun('النظامModel Context Protocolيعمل بدقة. ان العلم الي النور شمخ.'),
              ],
            }),
          ],
        },
      ],
    });
    const rawBuf = await docx.Packer.toBuffer(rawDoc);
    fs.writeFileSync(rawDocxPath, rawBuf);

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'mcp-server.js');
    const child = execFile(
      process.execPath,
      [scriptPath],
      {
        env: { ...process.env, CONVERTER_SERVER_URL: 'http://127.0.0.1:59999' },
        timeout: 25000,
      }
    );

    child.stdin!.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'audit_and_repair_document',
          arguments: { file_path: rawDocxPath, output_dir: outDir },
        },
      }) + '\n'
    );
    child.stdin!.end();

    let stdout = '';
    child.stdout!.on('data', (c) => {
      stdout += String(c);
    });

    await new Promise<void>((resolve, reject) => {
      child.on('exit', () => resolve());
      child.on('error', reject);
    });

    const resp = JSON.parse(stdout.trim().split('\n')[0]);
    const result = JSON.parse(resp.result.content[0].text);
    expect(result.overallPassed).toBe(true);
    expect(result.qualityScore).toBeGreaterThanOrEqual(85);
    expect(fs.existsSync(result.repairedDocxPath)).toBe(true);

    const repairedMd = fs.readFileSync(result.repairedMarkdownPath, 'utf-8');
    expect(repairedMd).toContain('النظام Model Context Protocol يعمل');
    expect(repairedMd).toContain('إلى');
    expect(repairedMd).not.toContain('شمخ');
  });
});

describe('MCP / CLI Syntax Check', () => {
  it('validates syntax of scripts/mcp-server.js and scripts/batch-runner.js', async () => {
    await execFileAsync(process.execPath, ['--check', path.resolve(process.cwd(), 'scripts/mcp-server.js')]);
    await execFileAsync(process.execPath, ['--check', path.resolve(process.cwd(), 'scripts/batch-runner.js')]);
  });
});
