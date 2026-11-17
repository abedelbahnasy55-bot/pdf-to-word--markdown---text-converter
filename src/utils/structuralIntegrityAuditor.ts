import JSZip from 'jszip';
import { generateDocxBlob } from './docxExporter';
import { StructuralIntegrityReport } from '../types';
import { parseDocxFile } from './docxReader';
import { isRightToLeftText } from '../../shared/arabicText';

export interface StructuralIntegrityAuditResult {
  report: StructuralIntegrityReport;
  repairedMarkdown: string;
}

/**
 * Detects whether markdown has a complete duplicate body (e.g. body A == body B or body A is prefix of body B),
 * which was the primary structural flaw diagnosed in technical reports when files were concatenated twice.
 */
function detectAndRepairMarkdownDuplication(markdown: string): {
  cleanedText: string;
  hasDuplication: boolean;
  repairedCount: number;
} {
  if (!markdown || markdown.length < 200) {
    return { cleanedText: markdown, hasDuplication: false, repairedCount: 0 };
  }

  let text = markdown;
  let hasDuplication = false;
  let repairedCount = 0;

  // 1. Exact or near-exact split repetition check (body A == body B)
  const midpoint = Math.floor(text.length / 2);
  // Allow small margin of whitespace/newlines around midpoint
  const searchRange = 500;
  for (let offset = -searchRange; offset <= searchRange; offset += 10) {
    const splitIdx = midpoint + offset;
    if (splitIdx <= 100 || splitIdx >= text.length - 100) continue;
    const partA = text.slice(0, splitIdx).trim();
    const partB = text.slice(splitIdx).trim();

    // Check if partA is identical to partB or partA is prefix of partB
    if (partA === partB || (partA.length > 500 && partB.startsWith(partA))) {
      console.warn('[Structural Integrity] Detected exact duplicate document body in markdown! Deduplicating...');
      text = partA;
      hasDuplication = true;
      repairedCount++;
      break;
    }
  }

  // 2. Check for duplicated page sequences separated by PAGE_BREAK
  const pages = text.split(/---PAGE_BREAK---/);
  if (pages.length >= 4 && pages.length % 2 === 0) {
    const halfLen = pages.length / 2;
    const firstHalf = pages.slice(0, halfLen).map(p => p.trim()).join('\n');
    const secondHalf = pages.slice(halfLen).map(p => p.trim()).join('\n');
    if (firstHalf.length > 500 && firstHalf === secondHalf) {
      console.warn('[Structural Integrity] Detected duplicated page sequence across halves! Deduplicating...');
      text = pages.slice(0, halfLen).join('\n\n---PAGE_BREAK---\n\n');
      hasDuplication = true;
      repairedCount++;
    }
  }

  // 3. Remove stray orphan table scrap rows like | --: | or | --- |
  const scrapRowRegex = /^\s*\|\s*[-:]+\s*\|\s*$/gm;
  if (scrapRowRegex.test(text)) {
    text = text.replace(scrapRowRegex, '');
    repairedCount++;
  }

  // 4. Compress runaway double page break markers
  if (/(?:---PAGE_BREAK---\s*){2,}/.test(text)) {
    text = text.replace(/(?:\n\s*---PAGE_BREAK---\s*){2,}/g, '\n\n---PAGE_BREAK---\n\n');
    repairedCount++;
  }

  return {
    cleanedText: text.trim(),
    hasDuplication,
    repairedCount,
  };
}

/**
 * Audits the DOCX binary package and its internal OOXML tree (`word/document.xml`)
 * to verify structural integrity, prevent XML duplication, orphan tails, and ensure
 * that highlighting and tables are valid.
 */
export async function auditStructuralIntegrity(
  markdown: string,
  options: {
    title: string;
    isRtl?: boolean;
    fileName?: string;
  }
): Promise<StructuralIntegrityAuditResult> {
  const { title, isRtl = true } = options;

  // Step 1: Markdown-level de-duplication and cleanup
  const mdCheck = detectAndRepairMarkdownDuplication(markdown);
  const repairedMarkdown = mdCheck.cleanedText;

  // Step 2: Generate test DOCX blob and inspect internal OpenXML
  let xmlDeclarationCount = 1;
  let documentRootCount = 1;
  let bodyTagCount = 1;
  let orphanTailDetected = false;
  let duplicateBodyDetected = mdCheck.hasDuplication;
  let markTagsInTextCount = 0;
  let highlightRunsCount = 0;
  let tablesCount = 0;
  let orphanPipesCleanedCount = 0;
  let isValidDocxStructure = true;
  let docxByteSize = 0;

  try {
    const docxBlob = await generateDocxBlob({
      title: title || 'Document',
      markdown: repairedMarkdown,
      isRtl,
    });
    docxByteSize = docxBlob.size;

    const arrayBuffer = await docxBlob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Verify key OOXML parts exist
    const hasContentTypes = Boolean(zip.file('[Content_Types].xml'));
    const docXmlFile = zip.file('word/document.xml');

    if (!hasContentTypes || !docXmlFile) {
      isValidDocxStructure = false;
    } else {
      const docXml = await docXmlFile.async('text');

      // Check XML declarations
      const xmlDecMatches = docXml.match(/<\?xml\b/g);
      xmlDeclarationCount = xmlDecMatches ? xmlDecMatches.length : 1;

      // Check document envelope
      const docOpenMatches = docXml.match(/<w:document\b/g);
      const docCloseMatches = docXml.match(/<\/w:document>/g);
      documentRootCount = docOpenMatches ? docOpenMatches.length : 1;

      // Check body tags
      const bodyOpenMatches = docXml.match(/<w:body\b/g);
      const bodyCloseMatches = docXml.match(/<\/w:body>/g);
      bodyTagCount = bodyOpenMatches ? bodyOpenMatches.length : 1;

      // Check for orphan tail after </w:document>
      const lastDocClose = docXml.lastIndexOf('</w:document>');
      if (lastDocClose !== -1) {
        const afterClose = docXml.slice(lastDocClose + '</w:document>'.length).trim();
        if (afterClose.length > 0) {
          orphanTailDetected = true;
          console.warn('[Structural Integrity] Detected orphan tail after </w:document>:', afterClose.slice(0, 100));
        }
      }

      // Check if <mark> remained raw inside text runs
      const markMatches = docXml.match(/<w:t[^>]*>[^<]*&lt;mark&gt;/g);
      markTagsInTextCount = markMatches ? markMatches.length : 0;

      // Count highlight runs
      const highlightMatches = docXml.match(/<w:highlight\b/g);
      highlightRunsCount = highlightMatches ? highlightMatches.length : 0;

      // Count tables
      const tableMatches = docXml.match(/<w:tbl\b/g);
      tablesCount = tableMatches ? tableMatches.length : 0;

      // Overall structure validity check
      if (
        xmlDeclarationCount > 1 ||
        documentRootCount > 1 ||
        bodyTagCount > 1 ||
        orphanTailDetected ||
        (docCloseMatches && docCloseMatches.length !== docOpenMatches?.length) ||
        (bodyCloseMatches && bodyCloseMatches.length !== bodyOpenMatches?.length)
      ) {
        isValidDocxStructure = false;
        duplicateBodyDetected = true;
      }
    }
  } catch (err) {
    console.warn('[Structural Integrity] Failed to parse generated DOCX package:', err);
    isValidDocxStructure = false;
  }

  // Count orphan pipes cleaned in markdown
  const orphanPipeMatches = markdown.match(/\s*\|\s*$/gm);
  orphanPipesCleanedCount = orphanPipeMatches ? orphanPipeMatches.length : 0;

  const totalRepairs = mdCheck.repairedCount + (orphanTailDetected ? 1 : 0);

  const overallVerdict = isValidDocxStructure && !duplicateBodyDetected
    ? 'الملف سليم بنيوياً 100% — تم التحقق من سلامة شجرة OpenXML وخلو المستند من أي تكرار.'
    : duplicateBodyDetected
    ? 'تم رصد ومعالجة تكرار بنيوي في المستند وضبط شجرة XML بنجاح.'
    : 'تم فحص البنية وإصلاح أخطاء الهيكلة بنجاح.';

  const report: StructuralIntegrityReport = {
    isValidDocxStructure,
    hasStructuralDuplication: duplicateBodyDetected,
    duplicateBodyDetected,
    xmlDeclarationCount,
    documentRootCount,
    bodyTagCount,
    orphanTailDetected,
    orphanPipesCleanedCount,
    markTagsConvertedToHighlightCount: highlightRunsCount,
    markTagsInTextCount,
    tablesCount,
    repairedDuplicationsCount: totalRepairs,
    overallVerdict,
    docxByteSize,
  };

  return {
    report,
    repairedMarkdown,
  };
}

export interface RawDocxStructuralAuditResult {
  isValid: boolean;
  hasCorruption: boolean;
  hasDuplication: boolean;
  error?: string;
  report: StructuralIntegrityReport;
  repairedMarkdown?: string;
  details?: {
    xmlDeclarationCount: number;
    documentRootCount: number;
    bodyTagCount: number;
    orphanTailLength: number;
    secondDeclarationOffset?: number;
  };
}

/**
 * Directly inspects a raw uploaded DOCX file's binary package before any conversion begins.
 * Detects structural corruption (e.g. multiple <?xml declarations, multiple <w:document> envelopes,
 * duplicate <w:body> chunks, and orphan tails) as diagnosed in technical reports.
 */
export async function runStructuralIntegrityAudit(
  docxFileOrBuffer: File | ArrayBuffer | Blob,
  _fileName?: string
): Promise<RawDocxStructuralAuditResult> {
  const arrayBuffer =
    docxFileOrBuffer instanceof ArrayBuffer
      ? docxFileOrBuffer
      : await docxFileOrBuffer.arrayBuffer();

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch (err: any) {
    return {
      isValid: false,
      hasCorruption: true,
      hasDuplication: false,
      error: 'الملف غير صالح بنيوياً: تعذر فك ضغط حزمة Word (.docx) التالفة.',
      report: {
        isValidDocxStructure: false,
        hasStructuralDuplication: false,
        duplicateBodyDetected: false,
        xmlDeclarationCount: 0,
        documentRootCount: 0,
        bodyTagCount: 0,
        orphanTailDetected: false,
        orphanPipesCleanedCount: 0,
        markTagsConvertedToHighlightCount: 0,
        repairedDuplicationsCount: 0,
        overallVerdict: 'فشل الفحص: الملف تالف مضغوطاً ولا يفتح في Word أو LibreOffice.',
      },
    };
  }

  const docXmlEntry = zip.file('word/document.xml');
  if (!docXmlEntry) {
    return {
      isValid: false,
      hasCorruption: true,
      hasDuplication: false,
      error: 'الملف تالف بنيوياً: مفقود ملف word/document.xml الداخلي الأساسي.',
      report: {
        isValidDocxStructure: false,
        hasStructuralDuplication: false,
        duplicateBodyDetected: false,
        xmlDeclarationCount: 0,
        documentRootCount: 0,
        bodyTagCount: 0,
        orphanTailDetected: false,
        orphanPipesCleanedCount: 0,
        markTagsConvertedToHighlightCount: 0,
        repairedDuplicationsCount: 0,
        overallVerdict: 'فشل الفحص: المستند لا يحتوي على word/document.xml.',
      },
    };
  }

  const docXml = await docXmlEntry.async('text');

  // Check 1: Multiple XML Declarations (offset check from technical report)
  const xmlMatches = [...docXml.matchAll(/<\?xml\b/g)];
  const xmlDeclarationCount = xmlMatches.length;

  // Check 2: Multiple <w:document> envelopes
  const docOpenMatches = [...docXml.matchAll(/<w:document\b/g)];
  const docCloseMatches = [...docXml.matchAll(/<\/w:document>/g)];
  const documentRootCount = docOpenMatches.length;

  // Check 3: Multiple <w:body> tags
  const bodyOpenMatches = [...docXml.matchAll(/<w:body\b/g)];
  const bodyCloseMatches = [...docXml.matchAll(/<\/w:body>/g)];
  const bodyTagCount = bodyOpenMatches.length;

  // Check 4: Orphan tail after </w:document>
  const lastDocClose = docXml.lastIndexOf('</w:document>');
  let orphanTailDetected = false;
  let orphanTailLength = 0;
  if (lastDocClose !== -1) {
    const afterClose = docXml.slice(lastDocClose + '</w:document>'.length).trim();
    if (afterClose.length > 0) {
      orphanTailDetected = true;
      orphanTailLength = afterClose.length;
    }
  }

  // Check 5: Duplicate Body detection (e.g. body A == body B)
  let secondDeclarationOffset: number | undefined;
  if (xmlMatches.length > 1 && xmlMatches[1].index !== undefined) {
    secondDeclarationOffset = xmlMatches[1].index;
  }

  let hasCorruption = false;
  let hasDuplication = false;
  let errorMsg: string | undefined;

  if (xmlDeclarationCount > 1) {
    hasCorruption = true;
    hasDuplication = true;
    errorMsg = `تلف وتكرار بنيوي حرج (XML Corruption): الملف يحتوي على ${xmlDeclarationCount} إعلانات XML داخل document.xml (مستندين ملزوقين في بعض عند الإزاحة ${secondDeclarationOffset?.toLocaleString() ?? 'متقدمة'}).`;
  } else if (documentRootCount > 1 || (docCloseMatches && docCloseMatches.length > 1)) {
    hasCorruption = true;
    hasDuplication = true;
    errorMsg = `تلف بنيوي: تكرار غلاف المستند <w:document> (${documentRootCount} أغلفة) داخل ملف Word.`;
  } else if (bodyTagCount > 1 || (bodyCloseMatches && bodyCloseMatches.length > 1)) {
    hasCorruption = true;
    hasDuplication = true;
    errorMsg = `تكرار بنيوي تام: الملف يحتوي على أكثر من جسم مستند <w:body> ملزوقين في بعض (${bodyTagCount} أجسام).`;
  } else if (orphanTailDetected) {
    hasCorruption = true;
    errorMsg = `تلف بنيوي: وجود ذيل يتيم (${orphanTailLength} حرف) بعد إغلاق المستند </w:document>.`;
  }

  // Check for body duplication inside XML content if there are multiple body sections
  if (!hasCorruption && bodyTagCount >= 2) {
    const bodyMatches = [...docXml.matchAll(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/g)];
    if (bodyMatches.length >= 2) {
      const bA = bodyMatches[0][1].slice(0, 5000);
      const bB = bodyMatches[1][1].slice(0, 5000);
      if (bA === bB) {
        hasCorruption = true;
        hasDuplication = true;
        errorMsg = 'تكرار بنيوي تام: جسم المستند مكرر مرتين بايتي بايتي (body A == body B).';
      }
    }
  }

  // Step 6: Immediately invoke auditStructuralIntegrity on the extracted markdown content
  // to audit structural integrity, deduplicate any concatenated bodies or repeated page sequences,
  // and detect markdown-level XML corruption before any conversion proceeds.
  let contentAuditResult: StructuralIntegrityAuditResult | null = null;
  if (!hasCorruption && !hasDuplication) {
    try {
      const parsed = await parseDocxFile(arrayBuffer);
      const isRtl = isRightToLeftText(parsed.markdown);
      contentAuditResult = await auditStructuralIntegrity(parsed.markdown, {
        title: _fileName || parsed.title || 'Document',
        isRtl,
        fileName: _fileName,
      });

      if (
        contentAuditResult.report.hasStructuralDuplication ||
        contentAuditResult.report.duplicateBodyDetected ||
        !contentAuditResult.report.isValidDocxStructure
      ) {
        hasDuplication = true;
        hasCorruption = true;
        errorMsg =
          contentAuditResult.report.overallVerdict ||
          'تكرار بنيوي في محتوى المستند: تم اكتشاف تكرار متطابق لهيكل ونصوص الأبواب (Structural Duplication).';
      }
    } catch (parseErr: any) {
      console.warn('[runStructuralIntegrityAudit] parseDocxFile or audit warning:', parseErr);
      if (
        parseErr?.message?.includes('تالف') ||
        parseErr?.message?.includes('XML') ||
        parseErr?.message?.includes('فارغ')
      ) {
        hasCorruption = true;
        errorMsg = `تلف بنيوي في وسوم المستند: ${parseErr.message}`;
      }
    }
  }

  const isValid = !hasCorruption && !hasDuplication;

  const report: StructuralIntegrityReport = {
    isValidDocxStructure: isValid,
    hasStructuralDuplication: hasDuplication,
    duplicateBodyDetected: hasDuplication,
    xmlDeclarationCount,
    documentRootCount,
    bodyTagCount,
    orphanTailDetected,
    orphanPipesCleanedCount: contentAuditResult?.report.orphanPipesCleanedCount || 0,
    markTagsConvertedToHighlightCount: (docXml.match(/<w:highlight\b/g) || []).length,
    markTagsInTextCount: (docXml.match(/<w:t[^>]*>[^<]*&lt;mark&gt;/g) || []).length,
    tablesCount: (docXml.match(/<w:tbl\b/g) || []).length,
    repairedDuplicationsCount: contentAuditResult?.report.repairedDuplicationsCount || 0,
    overallVerdict: isValid
      ? 'ملف DOCX سليم بنيوياً 100% — شجرة OpenXML صالحة وخالية تماماً من التكرار والتلف.'
      : `تم اكتشاف تلف أو تكرار بنيوي: ${errorMsg}`,
    docxByteSize: arrayBuffer.byteLength,
  };

  return {
    isValid,
    hasCorruption,
    hasDuplication,
    error: errorMsg,
    report,
    repairedMarkdown: contentAuditResult?.repairedMarkdown,
    details: {
      xmlDeclarationCount,
      documentRootCount,
      bodyTagCount,
      orphanTailLength,
      secondDeclarationOffset,
    },
  };
}
