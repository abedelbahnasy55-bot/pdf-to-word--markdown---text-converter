import JSZip from 'jszip';

export interface ExtractedDocx {
  title: string;
  markdown: string;
  plainText: string;
  paragraphs: string[];
  tables: string[][][]; // array of tables, each table is array of rows, each row is array of cells
  pageCount: number;
}

/**
 * Parses a .docx File or ArrayBuffer into structured markdown and plain text
 * using browser-native DOMParser and JSZip.
 */
export async function parseDocxFile(fileOrBuffer: File | ArrayBuffer): Promise<ExtractedDocx> {
  const arrayBuffer = fileOrBuffer instanceof ArrayBuffer
    ? fileOrBuffer
    : await fileOrBuffer.arrayBuffer();

  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const documentXmlEntry = zip.file('word/document.xml');
  if (!documentXmlEntry) {
    throw new Error('الملف المرفوع ليس ملف Word (.docx) صالح أو تالف.');
  }

  const xmlText = await documentXmlEntry.async('text');
  
  let footnotesMap: Record<string, string> = {};
  const footnotesEntry = zip.file('word/footnotes.xml');
  if (footnotesEntry) {
    try {
      const fnXml = await footnotesEntry.async('text');
      footnotesMap = parseFootnotesXml(fnXml);
    } catch {
      // Ignore footnotes parsing errors
    }
  }

  return parseDocumentXml(xmlText, footnotesMap);
}

function parseFootnotesXml(xmlText: string): Record<string, string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const footnotes = doc.getElementsByTagName('w:footnote');
  const map: Record<string, string> = {};

  for (let i = 0; i < footnotes.length; i++) {
    const fn = footnotes[i];
    const id = fn.getAttribute('w:id');
    const type = fn.getAttribute('w:type');
    if (type === 'separator' || type === 'continuationSeparator') continue;
    if (id) {
      map[id] = fn.textContent?.trim() || '';
    }
  }
  return map;
}

function parseDocumentXml(xmlText: string, footnotesMap: Record<string, string>): ExtractedDocx {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const body = doc.getElementsByTagName('w:body')[0];

  if (!body) {
    throw new Error('محتوى ملف الوورد فارغ.');
  }

  const markdownLines: string[] = [];
  const plainTextLines: string[] = [];
  const paragraphList: string[] = [];
  const extractedTables: string[][][] = [];
  let detectedTitle = '';

  const children = Array.from(body.childNodes);

  for (const node of children) {
    const nodeName = node.nodeName;

    // Paragraph
    if (nodeName === 'w:p') {
      const p = node as Element;
      const { text, mdText, headingLevel, isListItem, listNum, hasPageBreak } = parseParagraphElement(p, footnotesMap);

      if (hasPageBreak) {
        markdownLines.push('---PAGE_BREAK---');
        plainTextLines.push('------------------------');
      }

      if (!text.trim()) {
        // empty line
        markdownLines.push('');
        plainTextLines.push('');
        continue;
      }

      paragraphList.push(text.trim());

      if (headingLevel > 0) {
        const prefix = '#'.repeat(headingLevel);
        markdownLines.push(`${prefix} ${mdText}`);
        plainTextLines.push(text);
        if (!detectedTitle && headingLevel <= 2) {
          detectedTitle = text.trim();
        }
      } else if (isListItem) {
        const bullet = listNum ? `${listNum}.` : '*';
        markdownLines.push(`${bullet} ${mdText}`);
        plainTextLines.push(`${bullet} ${text}`);
      } else {
        markdownLines.push(mdText);
        plainTextLines.push(text);
      }
    }

    // Table
    if (nodeName === 'w:tbl') {
      const tbl = node as Element;
      const tableData = parseTableElement(tbl, footnotesMap);
      if (tableData.length > 0) {
        extractedTables.push(tableData);
        const mdTable = formatMarkdownTable(tableData);
        markdownLines.push('');
        markdownLines.push(mdTable);
        markdownLines.push('');

        const plainTable = tableData.map(row => row.join(' | ')).join('\n');
        plainTextLines.push('');
        plainTextLines.push(plainTable);
        plainTextLines.push('');
      }
    }
  }

  const finalMarkdown = markdownLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const finalPlainText = plainTextLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // Calculate accurate page count based on page breaks or content volume (~1500 chars per academic page)
  const pageBreakMatches = (finalMarkdown.match(/---PAGE_BREAK---/g) || []).length;
  const calculatedPageCount = pageBreakMatches > 0
    ? pageBreakMatches + 1
    : Math.max(1, Math.round(finalMarkdown.length / 1500));

  return {
    title: detectedTitle || 'مستند Word',
    markdown: finalMarkdown,
    plainText: finalPlainText,
    paragraphs: paragraphList,
    tables: extractedTables,
    pageCount: calculatedPageCount,
  };
}

function parseParagraphElement(p: Element, footnotesMap: Record<string, string>) {
  // Check style for heading
  const pStyle = p.getElementsByTagName('w:pStyle')[0];
  let headingLevel = 0;
  if (pStyle) {
    const val = pStyle.getAttribute('w:val')?.toLowerCase() || '';
    if (val.includes('heading1') || val === 'title' || val === 'h1') headingLevel = 1;
    else if (val.includes('heading2') || val === 'subtitle' || val === 'h2') headingLevel = 2;
    else if (val.includes('heading3') || val === 'h3') headingLevel = 3;
    else if (val.includes('heading4') || val === 'h4') headingLevel = 4;
  }

  // Check numPr for list
  const numPr = p.getElementsByTagName('w:numPr')[0];
  const isListItem = Boolean(numPr);
  let listNum: string | null = null;
  if (numPr) {
    const ilvl = numPr.getElementsByTagName('w:ilvl')[0]?.getAttribute('w:val');
    if (ilvl === '0') listNum = '1';
  }

  let text = '';
  let mdText = '';
  let hasPageBreak = false;

  const runs = p.childNodes;
  for (let i = 0; i < runs.length; i++) {
    const child = runs[i] as Element;
    if (child.nodeName === 'w:r') {
      const rPr = child.getElementsByTagName('w:rPr')[0];
      const isBold = Boolean(rPr?.getElementsByTagName('w:b')[0]);
      const isItalic = Boolean(rPr?.getElementsByTagName('w:i')[0]);
      
      // Check for page break in run: both standard <w:br w:type="page"/> and Word's <w:lastRenderedPageBreak/>
      const brElements = child.getElementsByTagName('w:br');
      for (let b = 0; b < brElements.length; b++) {
        if (brElements[b].getAttribute('w:type') === 'page') {
          hasPageBreak = true;
        }
      }
      const lastRenderedBreaks = child.getElementsByTagName('w:lastRenderedPageBreak');
      if (lastRenderedBreaks.length > 0) {
        hasPageBreak = true;
      }

      // Check for text
      const tElements = child.getElementsByTagName('w:t');
      let runText = '';
      for (let j = 0; j < tElements.length; j++) {
        runText += tElements[j].textContent || '';
      }

      // Check footnote reference
      const fnRef = child.getElementsByTagName('w:footnoteReference')[0];
      if (fnRef) {
        const fnId = fnRef.getAttribute('w:id');
        if (fnId && footnotesMap[fnId]) {
          runText += ` [^${fnId}]`;
        }
      }

      text += runText;

      let formattedRun = runText;
      if (isBold && isItalic && runText.trim()) {
        formattedRun = `***${runText}***`;
      } else if (isBold && runText.trim()) {
        formattedRun = `**${runText}**`;
      } else if (isItalic && runText.trim()) {
        formattedRun = `*${runText}*`;
      }

      mdText += formattedRun;
    }
  }

  return { text, mdText, headingLevel, isListItem, listNum, hasPageBreak };
}

function parseTableElement(tbl: Element, footnotesMap: Record<string, string>): string[][] {
  const rows: string[][] = [];
  const trElements = tbl.getElementsByTagName('w:tr');

  for (let i = 0; i < trElements.length; i++) {
    const tr = trElements[i];
    const cells: string[] = [];
    const tcElements = tr.getElementsByTagName('w:tc');

    for (let j = 0; j < tcElements.length; j++) {
      const tc = tcElements[j];
      const pElements = tc.getElementsByTagName('w:p');
      const cellParagraphs: string[] = [];

      for (let k = 0; k < pElements.length; k++) {
        const { mdText } = parseParagraphElement(pElements[k], footnotesMap);
        if (mdText.trim()) {
          cellParagraphs.push(mdText.trim());
        }
      }

      cells.push(cellParagraphs.join(' '));
    }

    if (cells.some(c => c.trim().length > 0)) {
      rows.push(cells);
    }
  }

  return rows;
}

function formatMarkdownTable(tableData: string[][]): string {
  if (tableData.length === 0) return '';
  const numCols = Math.max(...tableData.map(r => r.length));
  
  const lines: string[] = [];
  const header = tableData[0] || [];
  const paddedHeader = Array.from({ length: numCols }, (_, i) => header[i] || '');
  lines.push(`| ${paddedHeader.map(c => c.replace(/\|/g, '\\|').trim()).join(' | ')} |`);
  lines.push(`| ${Array(numCols).fill('---').join(' | ')} |`);

  for (let r = 1; r < tableData.length; r++) {
    const row = tableData[r];
    const paddedRow = Array.from({ length: numCols }, (_, i) => row[i] || '');
    lines.push(`| ${paddedRow.map(c => c.replace(/\|/g, '\\|').trim()).join(' | ')} |`);
  }

  return lines.join('\n');
}
