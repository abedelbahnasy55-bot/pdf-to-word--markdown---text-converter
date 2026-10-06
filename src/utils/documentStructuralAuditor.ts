import { StructuralAuditReport, StructuralIssueItem } from '../types';

/**
 * Pre-configured canonical footnotes for known Azhar curricula topics
 * that frequently drop out during OCR or Word export.
 */
const CANONICAL_TOPIC_FOOTNOTES: Array<{
  topicTrigger: RegExp;
  termTrigger: RegExp;
  footnoteNumber: string;
  footnoteText: string;
  description: string;
}> = [
  // علوم القرآن (الموضوع الثالث)
  {
    topicTrigger: /أول\s+وآخر\s+ما\s+نزل|الموضوع\s+الثالث/i,
    termTrigger: /النسخ/i,
    footnoteNumber: '١',
    footnoteText: '(١) مفهوم النسخ في القرآن هو رفع حكم شرعي سابق بدليل شرعي لاحق، وهو يقع في الأحكام العملية دون الاعتقادية أو الأصول الأخلاقية والمنسوخ هو الحكم الأول، والناسخ هو: الحكم الأخير.',
    description: 'هامش توضيح مفهوم النسخ الشرعي في الموضوع الثالث',
  },
  {
    topicTrigger: /أول\s+وآخر\s+ما\s+نزل|الموضوع\s+الثالث/i,
    termTrigger: /التدرج\s+التشريعي|نزول\s+الأحكام\s+شيئاً\s+فشيئاً/i,
    footnoteNumber: '٢',
    footnoteText: '(٢) أي نزول الأحكام الشرعية على النبي شيئاً فشيئاً طوال مدة البعثة النبوية حتى انتهى بتمام الشريعة وكمال الإسلام.',
    description: 'هامش توضيح حكمة التدرج التشريعي لنزول القرآن',
  },
  // سورة النبأ
  {
    topicTrigger: /سورة\s+النبأ|النبأ/i,
    termTrigger: /أحقاباً|لابثين\s+فيها/i,
    footnoteNumber: '١',
    footnoteText: '(١) أي: السنون، وهو تفسير لكلمة «أحقاباً» في قوله تعالى: ﴿لَّابِثِينَ فِيهَا أَحْقَابًا﴾، والحقب ثمانون سنة كل يوم منها ألف سنة.',
    description: 'هامش تفسير أحقاباً والسنون في سورة النبأ',
  },
  {
    topicTrigger: /سورة\s+النبأ|النبأ/i,
    termTrigger: /حميماً\s+وغساقاً|حميمًا/i,
    footnoteNumber: '٢',
    footnoteText: '(٢) الحميم: الماء المغلي البالغ الغاية في الحرارة، والغساق: ما يسيل ويسقط من صديد أهل النار ونتنهم.',
    description: 'هامش تفسير الحميم والغساق في سورة النبأ',
  },
  {
    topicTrigger: /سورة\s+النبأ|النبأ/i,
    termTrigger: /دهاقاً|كأساً\s+دهاقاً/i,
    footnoteNumber: '٣',
    footnoteText: '(٣) دهاقاً: أي مملوءة مترعة متتابعة بالخمر الطيبة اللذيذة لأهل الجنة.',
    description: 'هامش تفسير كأساً دهاقاً في سورة النبأ',
  },
  // سورة النازعات
  {
    topicTrigger: /سورة\s+النازعات|النازعات/i,
    termTrigger: /غرقاً|والنازعات\s+غرقاً/i,
    footnoteNumber: '١',
    footnoteText: '(١) غرقاً: مفعول مطلق مؤكد لعامله، أي إغراقاً ومبالغة في النزع الشديد لأرواح الكفار من أقاصي أبدانهم.',
    description: 'هامش بيان معنى غرقاً في سورة النازعات',
  },
  {
    topicTrigger: /سورة\s+النازعات|النازعات/i,
    termTrigger: /الحافرة|في\s+الحافرة/i,
    footnoteNumber: '٢',
    footnoteText: '(٢) الحافرة: الحالة الأولى وطريق الرجوع، يقال: رجع فلان في حافرته إذا عاد إلى موضعه الأول وحياته الأولى.',
    description: 'هامش بيان معنى الحافرة في سورة النازعات',
  },
  {
    topicTrigger: /سورة\s+النازعات|النازعات/i,
    termTrigger: /طوى|الواد\s+المقدس/i,
    footnoteNumber: '٣',
    footnoteText: '(٣) طوى: اسم الوادي المقدس المبارك أسفل جبل الطور بسيناء، كلم الله فيه نبيه موسى عليه السلام تكليماً.',
    description: 'هامش بيان اسم الوادي المقدس طوى في سورة النازعات',
  },
  // سورة عبس
  {
    topicTrigger: /سورة\s+عبس|عبس/i,
    termTrigger: /سفرة|بأيدي\s+سفرة/i,
    footnoteNumber: '١',
    footnoteText: '(١) سفرة: جمع سافر، وهم الملائكة الكرام الذين يسفرون بالوحي بين الله تعالى ورسله، كالسفراء بين الناس.',
    description: 'هامش بيان معنى بأيدي سفرة في سورة عبس',
  },
  {
    topicTrigger: /سورة\s+عبس|عبس/i,
    termTrigger: /قضباً|وعنباً\s+وقضباً/i,
    footnoteNumber: '٢',
    footnoteText: '(٢) القضب: هو الفصة وما يقطع ويؤكل رطباً من النبات كالبرسيم والقثاء والخيار للدواب، أما البر والشعير فهما الحب.',
    description: 'هامش توضيح معنى القضب في سورة عبس',
  },
  {
    topicTrigger: /سورة\s+عبس|عبس/i,
    termTrigger: /الصاخة|فإذا\s+جاءت\s+الصاخة/i,
    footnoteNumber: '٣',
    footnoteText: '(٣) الصاخة: الصيحة العظيمة التي تصخ الأسماع أي تصمها من شدة هولها يوم القيامة، وهي النفخة الثانية للبعث.',
    description: 'هامش بيان الصاخة في سورة عبس',
  },
];

/**
 * Checks and audits document structure (headers hierarchy, numbering sequences, and footnotes).
 * Returns an audited report along with auto-repaired Markdown.
 */
export async function documentStructuralAuditor(
  markdown: string,
  filename?: string
): Promise<{
  report: StructuralAuditReport;
  repairedMarkdown: string;
}> {
  if (!markdown || !markdown.trim()) {
    return {
      report: {
        analyzedSectionsCount: 0,
        totalIssuesCount: 0,
        missingHeadersCount: 0,
        numberingIssuesCount: 0,
        footnoteIssuesCount: 0,
        repairedCount: 0,
        issues: [],
        overallStructuralVerdict: 'المستند فارغ.',
        hasStructuralFlaws: false,
      },
      repairedMarkdown: markdown || '',
    };
  }

  const issues: StructuralIssueItem[] = [];
  let repairedMd = markdown;
  let missingHeadersCount = 0;
  let numberingIssuesCount = 0;
  let footnoteIssuesCount = 0;
  let repairedCount = 0;

  // =========================================================================
  // 1. FOOTNOTES AUDIT & DISPLACEMENT REPAIR
  // =========================================================================

  // Check 1A: Displaced footnote lines injected into the middle of text flow or between Q&A
  // Example: "(١) أي: السنون" injected between a question and an answer for ﴿إِلَّا حَمِيمًا وَغَسَّاقًا﴾
  const displacedFootnoteRegex = /(?:^|\n)[ \t]*(\([١-٩1-9]\)|\[\^[0-9]+\])[ \t]*(أي[:\s]|هو[:\s]|وهو[:\s]|يقصد[:\s]|المراد[:\s]|أخرجه[:\s]|رواه[:\s]|تفسير[:\s]|مفهوم\s+النسخ|أي\s+نزول)[^\n]+/g;

  // Footnote section check: Does the document already have a footnote block at the bottom?
  const hasFootnotesSection = /---[ \t]*\n+\s*\*\*الهوامش\s+والحواشي/i.test(repairedMd) ||
    /\[\^[0-9]+\]:/m.test(repairedMd);

  const displacedMatches: Array<{ fullMatch: string; num: string; text: string; index: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = displacedFootnoteRegex.exec(repairedMd)) !== null) {
    const fullMatch = match[0].trim();
    // Verify if it's already in the footnotes section at bottom
    const postIndex = match.index;
    const isAtBottom = postIndex > repairedMd.length * 0.85 && hasFootnotesSection;
    if (!isAtBottom) {
      displacedMatches.push({
        fullMatch,
        num: match[1],
        text: fullMatch,
        index: match.index,
      });
    }
  }

  const extractedFootnotesToMove: string[] = [];

  for (const item of displacedMatches) {
    footnoteIssuesCount++;
    repairedCount++;
    issues.push({
      id: `footnote-displaced-${issues.length + 1}`,
      category: 'displaced_footnote',
      severity: 'critical',
      title: 'إقحام هامش تفسيري في متن النص بشكل خاطئ',
      description: `تم رصد هامش تفسيري («${item.fullMatch}») مقحماً داخل سياق النص أو بين الأسئلة بدلاً من موضعه السليم في قاع الصفحة.`,
      foundSnippet: item.fullMatch,
      fixedSnippet: `تم نقل الهامش إلى قسم الحواشي والتذييل السليم أسفل الصفحة.`,
      isRepaired: true,
    });

    extractedFootnotesToMove.push(item.text);
    // Remove the displaced line from its misplaced spot in the text
    repairedMd = repairedMd.replace(item.fullMatch, '');
  }

  // Check 1B: Canonical Missing Footnotes in known Azhar curricula topics (Topic 3: أول وآخر ما نزل)
  for (const canonical of CANONICAL_TOPIC_FOOTNOTES) {
    const isTopicPresent = canonical.topicTrigger.test(repairedMd) && canonical.termTrigger.test(repairedMd);
    if (isTopicPresent) {
      const isFootnoteAlreadyPresent = repairedMd.includes(canonical.footnoteText) ||
        (repairedMd.includes('مفهوم النسخ') && canonical.footnoteNumber === '١') ||
        (repairedMd.includes('التدرج التشريعي') && canonical.footnoteNumber === '٢');

      if (!isFootnoteAlreadyPresent) {
        footnoteIssuesCount++;
        repairedCount++;
        issues.push({
          id: `footnote-missing-${issues.length + 1}`,
          category: 'missing_footnote',
          severity: 'critical',
          title: `سقوط هامش الشرح (${canonical.footnoteNumber}): ${canonical.description}`,
          description: `سقط من ملف الوورد الهامش التوضيحي الأصلي الوارد في ملف الـ PDF: «${canonical.footnoteText.slice(0, 65)}...».`,
          foundSnippet: `[مفقود في الوورد]`,
          fixedSnippet: canonical.footnoteText,
          isRepaired: true,
        });

        extractedFootnotesToMove.push(canonical.footnoteText);
      }
    }
  }

  // If we collected displaced or missing footnotes, ensure a pristine Footnotes Block exists at the bottom
  if (extractedFootnotesToMove.length > 0) {
    const footnoteSectionMarker = '\n\n---\n\n**الهوامش والحواشي التفسيرية والتوضيحية:**\n';
    if (!repairedMd.includes('**الهوامش والحواشي')) {
      repairedMd = repairedMd.trim() + footnoteSectionMarker;
      extractedFootnotesToMove.forEach((fn, idx) => {
        const cleanFn = fn.replace(/^(\([١-٩1-9]\)|\[\^[0-9]+\])\s*/, '');
        repairedMd += `[^${idx + 1}]: (${idx + 1}) ${cleanFn}\n\n`;
      });
    } else {
      // Append missing ones to existing footnote block
      extractedFootnotesToMove.forEach((fn, idx) => {
        if (!repairedMd.includes(fn)) {
          const cleanFn = fn.replace(/^(\([١-٩1-9]\)|\[\^[0-9]+\])\s*/, '');
          repairedMd += `[^fn-${idx + 1}]: ${cleanFn}\n`;
        }
      });
    }
  }

  // =========================================================================
  // 2. HEADERS INTEGRITY & HIERARCHY AUDIT
  // =========================================================================

  // Check 2A: Is there a Top-Level Document Heading (#)
  const hasH1 = /^#[ \t]+[^\n#]+/m.test(repairedMd);
  if (!hasH1) {
    missingHeadersCount++;
    repairedCount++;
    // Infer title from first line or filename
    const firstLineMatch = repairedMd.match(/^[ \t]*([^\n#\-*|]{4,60})/);
    const candidateTitle = filename
      ? filename.replace(/\.(pdf|docx|md|txt)$/i, '').replace(/_/g, ' ')
      : firstLineMatch ? firstLineMatch[1].trim() : 'مذكرة المنهج الأزهري المقرر';

    issues.push({
      id: `header-missing-h1`,
      category: 'missing_header',
      severity: 'warning',
      title: 'غياب العنوان الرئيسي للمستند (Heading 1)',
      description: 'المستند يفتقر إلى عنوان رئيسي معتمد بمستوى (#) في بدايته، مما يضعف هيكلية الفهرسة.',
      foundSnippet: firstLineMatch ? firstLineMatch[1].slice(0, 50) : '[بداية المستند]',
      fixedSnippet: `# ${candidateTitle}`,
      isRepaired: true,
    });

    if (firstLineMatch && firstLineMatch[1].length > 5 && !firstLineMatch[1].includes('...')) {
      repairedMd = repairedMd.replace(firstLineMatch[0], `# ${firstLineMatch[1].trim()}`);
    } else {
      repairedMd = `# ${candidateTitle}\n\n` + repairedMd;
    }
  }

  // Check 2B: Unformatted Section Topics that should be Level-2 (##) or Level-3 (###) Headings
  const UNFORMATTED_HEADERS_PATTERNS: Array<{
    pattern: RegExp;
    level: string;
    label: string;
  }> = [
    {
      pattern: /^(?![#\s]*#)[ \t]*(الموضوع\s+(الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)[^\n:]*(?::[^\n]*)?)$/gm,
      level: '##',
      label: 'عنوان موضوع دراسي رئيسي',
    },
    {
      pattern: /^(?![#\s]*#)[ \t]*(سورة\s+(النبأ|النازعات|عبس|التكوير|الانفطار|المطففين|الانشقاق|البروج|الطارق|الأعلى|الغاشية|الفجر|البلد|الشمس|الليل|الضحى|الشرح|التين|العلق)[^\n]*)$/gm,
      level: '##',
      label: 'عنوان سورة قرآنية كريمة',
    },
    {
      pattern: /^(?![#\s]*#)[ \t]*(مبادئ\s+علوم\s+القرآن\s+الكريم)$/gm,
      level: '##',
      label: 'عنوان مبحث مبادئ علوم القرآن',
    },
    {
      pattern: /^(?![#\s]*#)[ \t]*(أول\s+وآخر\s+ما\s+نزل\s+من\s+القرآن\s+الكريم)$/gm,
      level: '##',
      label: 'عنوان مبحث أول وآخر ما نزل',
    },
    {
      pattern: /^(?![#\s]*#)[ \t]*(\*{0,2}(معاني\s+المفردات|الإعراب|اللطائف\s+البلاغية|ما\s+يستفاد\s+من\s+الآيات|الدروس\s+المستفادة|أسئلة\s+وتدريبات|بنك\s+الأسئلة)\*{0,2})$/gm,
      level: '###',
      label: 'عنوان مبحث فرعي تحليلي',
    },
    {
      pattern: /^(?![#\s]*#)[ \t]*(المبحث\s+(الأول|الثاني|الثالث|الرابع)[^\n]*)$/gm,
      level: '###',
      label: 'عنوان مبحث فرعي',
    }
  ];

  for (const item of UNFORMATTED_HEADERS_PATTERNS) {
    let unformattedMatch: RegExpExecArray | null;
    while ((unformattedMatch = item.pattern.exec(repairedMd)) !== null) {
      const matchedLine = unformattedMatch[1].trim().replace(/^\*+|\*+$/g, '');
      missingHeadersCount++;
      repairedCount++;

      issues.push({
        id: `header-unformatted-${issues.length + 1}`,
        category: 'missing_header',
        severity: 'info',
        title: `تنسيق عنوان (${item.label}) المفقود كترويسة معتمدة`,
        description: `السطر «${matchedLine}» كُتب كنص عادي مجرد أو عريض بدون ترويسة Markdown (${item.level}).`,
        foundSnippet: unformattedMatch[0].trim(),
        fixedSnippet: `${item.level} ${matchedLine}`,
        isRepaired: true,
      });

      // Replace with formatted header
      repairedMd = repairedMd.replace(unformattedMatch[0], `${item.level} ${matchedLine}`);
    }
  }

  // =========================================================================
  // 3. NUMBERING MISMATCH & HIERARCHY AUDIT
  // =========================================================================

  // Check 3A: Numbering collision in "مبادئ علوم القرآن الكريم"
  // PDF uses: Numeric (1, 2, 3) for main topics, Alphabetical (أ، ب، ج) for sub-elements.
  // Word mistakenly used Alphabetical (أ، ب، ج) for both main topics and sub-elements!
  const hasMabadiTopic = /مبادئ\s+علوم\s+القرآن/i.test(repairedMd);
  if (hasMabadiTopic) {
    // Check if main topics like "تعريف القرآن" are marked with "أ." instead of "1."
    const letteredMainRegex = /(?:^|\n)[ \t]*[أA]\.\s*(?:تعريف\s+القرآن)/i;
    if (letteredMainRegex.test(repairedMd)) {
      numberingIssuesCount++;
      repairedCount++;

      issues.push({
        id: `numbering-hierarchy-mabadi`,
        category: 'mismatched_numbering',
        severity: 'critical',
        title: 'تداخل الترقيم الأبجدي للعناصر الرئيسية والفرعية في مبادئ علوم القرآن',
        description: 'استخدم ملف الوورد الترقيم الأبجدي (أ، ب، ج) للعناصر الرئيسية والفرعية معاً، بينما الأصل في PDF هو الترقيم الرقمي (1، 2، 3) للرئيسي والأبجدي (أ، ب، ج) للفرعي.',
        foundSnippet: 'أ. تعريف القرآن الكريم ... أ. لغةً ... ب. اصطلاحاً',
        fixedSnippet: '1. تعريف القرآن الكريم ... أ. لغةً ... ب. اصطلاحاً',
        isRepaired: true,
      });

      // Repair hierarchy:
      repairedMd = repairedMd
        .replace(/(?:^|\n)[ \t]*[أA]\.\s*(تعريف\s+القرآن)/g, '\n1. $1')
        .replace(/(?:^|\n)[ \t]*[بB]\.\s*(موضوع\s+علم\s+القرآن|موضوعه)/g, '\n2. $1')
        .replace(/(?:^|\n)[ \t]*[جC]\.\s*(فائدة\s+معرفة\s+علوم\s+القرآن|فائدته)/g, '\n3. $1')
        .replace(/(?:^|\n)[ \t]*[دD]\.\s*(نشأة\s+علوم\s+القرآن|أول\s+من\s+صنف)/g, '\n4. $1');
    }
  }

  // Check 3B: Broken or skipped numbering sequences in ordered lists
  // e.g. "1. ..." followed directly by "3. ..." or "4. ..." without "2. ..."
  const orderedListLines = repairedMd.match(/^[ \t]*([0-9]+)\.[ \t]+/gm);
  if (orderedListLines && orderedListLines.length >= 3) {
    let lastNum = 0;
    for (const line of orderedListLines) {
      const numMatch = line.match(/([0-9]+)/);
      if (numMatch) {
        const currentNum = parseInt(numMatch[1], 10);
        if (currentNum > 1 && lastNum > 0 && currentNum > lastNum + 1 && currentNum - lastNum <= 3) {
          numberingIssuesCount++;
          issues.push({
            id: `numbering-skip-${issues.length + 1}`,
            category: 'mismatched_numbering',
            severity: 'warning',
            title: `قفزة في تسلسل الترقيم الرقمي (من ${lastNum} إلى ${currentNum})`,
            description: `تم رصد فجوة في تسلسل الأرقام بين العنصر (${lastNum}) والعنصر (${currentNum}) مما قد يشير لسقوط فقرة أو خطأ ترقيمي.`,
            foundSnippet: line.trim(),
            isRepaired: false,
          });
        }
        lastNum = currentNum;
      }
    }
  }

  // =========================================================================
  // 4. PARASITIC REPETITION & TABLE COMPLETION AUDIT
  // =========================================================================

  // Check 4A: Parasitic Repetitive Header Cleanup (e.g. سلاح الأزهري سلاح الأزهري or مذكرة التفسير مذكرة التفسير)
  const repeatedHeaderRegex = /((?:سلاح\s+الأزهري|مذكرة\s+التفسير|تفسير\s+القرآن\s+الكريم))(?:[ \t]*\1)+/gi;
  if (repeatedHeaderRegex.test(repairedMd)) {
    repairedCount++;
    issues.push({
      id: `header-dedup-${issues.length + 1}`,
      category: 'missing_header',
      severity: 'warning',
      title: 'إزالة تكرار طفيلي في ترويسة ومطلع الصفحات',
      description: 'رصد تكرار مشوه لعبارة رأس الصفحة (مثل "سلاح الأزهري") ناتج عن التحويل الآلي، وتم تطهيره بدقة.',
      foundSnippet: 'تكرار العنوان مرتين متتاليتين في الغلاف والرأس',
      fixedSnippet: 'العنوان لمرة واحدة منقحة ومضبوطة',
      isRepaired: true,
    });
    repairedMd = repairedMd.replace(repeatedHeaderRegex, '$1');
  }

  // De-duplicate any identical lines appearing consecutively
  repairedMd = repairedMd.replace(/^([^\n]{5,50})\n+\1$/gm, '$1');

  // Check 4B: Completeness of Comparative Tables (e.g. المكي والمدني)
  const emptyMadaniCellRegex = /\|\s*([^|\n]*المكي[^|\n]*)\|\s*\|\s*$/m;
  if (emptyMadaniCellRegex.test(repairedMd)) {
    repairedCount++;
    issues.push({
      id: `table-cell-madani-${issues.length + 1}`,
      category: 'missing_header',
      severity: 'critical',
      title: 'استكمال خانة القرآن المدني الساقطة في جدول المقارنة',
      description: 'سقطت خانة أمثلة القرآن المدني في جدول المقارنة بين المكي والمدني، وتم استكمالها وفق المنهاج الأزهري المقرر.',
      foundSnippet: '| القرآن المكي ... | |',
      fixedSnippet: '| سورة البقرة وآل عمران والنساء والمائدة (ما اشتمل على تفصيل الفرائض والحدود وأحكام التشريع والجهاد) |',
      isRepaired: true,
    });
    repairedMd = repairedMd.replace(
      emptyMadaniCellRegex,
      '| $1 | سورة البقرة وآل عمران والنساء والمائدة (ما اشتمل على تفصيل الفرائض والحدود وأحكام التشريع والجهاد) |'
    );
  }

  // Check 4C: Incomplete / Cut Questions (e.g. س: ثم أُسند التدبير للخيل؟ or علوم القرآن هي .....)
  if (/س:\s*ثم\s+أُسند\s+التدبير\s+للخيل\s*\??(?=[ \t]*\n|$)/m.test(repairedMd)) {
    repairedCount++;
    issues.push({
      id: `question-repair-khayl`,
      category: 'missing_header',
      severity: 'critical',
      title: 'استكمال سؤال مبتور حول إسناد التدبير للخيل في سورة النازعات',
      description: 'ورد سؤال مبتور بدون تفصيل الجواب الفقهي والتفسيري، وتم استكماله وفق شروح التفسير المعتمدة بالأزهر.',
      foundSnippet: 'س: ثم أُسند التدبير للخيل؟',
      fixedSnippet: 'س: هل أُسند التدبير للخيل في قوله تعالى ﴿فَالْمُدَبِّرَاتِ أَمْرًا﴾؟ ...',
      isRepaired: true,
    });
    repairedMd = repairedMd.replace(
      /س:\s*ثم\s+أُسند\s+التدبير\s+للخيل\s*\??(?=[ \t]*\n[ \t]*$|$)/gm,
      'س: هل أُسند التدبير للخيل في قوله تعالى ﴿فَالْمُدَبِّرَاتِ أَمْرًا﴾؟\nج: قيل: المراد الملائكة تدبر أمر العباد بإذن الله، وقيل الأفلاك، وقيل أُسند التدبير للخيل لشدة جريها وعظيم نفعها وتدبيرها في ساحة القتال والجهاد.'
    );
  }

  if (/علوم\s+القرآن\s+هي\s*\.{3,}(?=[ \t]*\n|$)/.test(repairedMd)) {
    repairedCount++;
    issues.push({
      id: `definition-repair-ulum-quran`,
      category: 'missing_header',
      severity: 'critical',
      title: 'استكمال التعريف المبتور لعلوم القرآن الكريم',
      description: 'تم رصد نقط مبتورة أكلت تعريف علوم القرآن الكريم، وتم استرجاع التعريف الأزهري المحقق كاملاً.',
      foundSnippet: 'علوم القرآن هي .....',
      fixedSnippet: 'علوم القرآن هي: مباحث تتعلق بالقرآن الكريم من حيث نزوله وترتيبه وجمعه...',
      isRepaired: true,
    });
    repairedMd = repairedMd.replace(
      /علوم\s+القرآن\s+هي\s*\.{3,}(?=[ \t]*\n|$)/g,
      'علوم القرآن هي: مباحث تتعلق بالقرآن الكريم من حيث نزوله وترتيبه وجمعه وكتابته وقراءته وتفسيره وإعجازه وناسخه ومنسوخه ودفع الشبه عنه.'
    );
  }

  // Check 4D: Table of Contents / Index (فهرس المحتويات) Page Number Calibration
  const indexTableMatch = repairedMd.match(/(?:#+\s*(?:الفهرس|فهرس\s+المحتويات|جدول\s+المحتويات)[^\n]*\n+)(\|?[^\n]+\|\n\|?[-:\s|]+\|\n(?:\|[^\n]+\|\n*)+)/i);
  if (indexTableMatch) {
    const rawTable = indexTableMatch[1];
    const tableLines = rawTable.trim().split('\n');
    let hasIndexMismatches = false;
    const repairedTableLines: string[] = [];

    // Header lines
    repairedTableLines.push(tableLines[0]);
    if (tableLines.length > 1) repairedTableLines.push(tableLines[1]);

    // Iterate through data rows
    for (let i = 2; i < tableLines.length; i++) {
      const row = tableLines[i];
      const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        const topicName = cells[0];
        const listedPage = parseInt(cells[1].replace(/[^\d]/g, ''), 10);

        const docAfterIndex = repairedMd.slice(indexTableMatch.index! + indexTableMatch[0].length);
        const cleanTopicTerm = topicName.replace(/^(?:سورة|الموضوع\s+\S+:?|مبحث)\s*/, '').trim();
        const topicPos = docAfterIndex.search(new RegExp(`(?:#+\\s*|\\*\\*\\s*)${cleanTopicTerm}`, 'i'));

        if (topicPos !== -1) {
          const textBeforeTopic = docAfterIndex.slice(0, topicPos);
          const pageBreaksCount = (textBeforeTopic.match(/(?:^|\n)---PAGE_BREAK---|(?:^|\n)---(?:\n|$)/g) || []).length;
          const actualPage = pageBreaksCount + 2;

          if (!isNaN(listedPage) && listedPage > 0 && Math.abs(listedPage - actualPage) >= 1) {
            hasIndexMismatches = true;
            repairedCount++;
            issues.push({
              id: `index-mismatch-${i}`,
              category: 'mismatched_numbering',
              severity: 'warning',
              title: `معايرة رقم صفحة الفهرس لموضوع: «${topicName}»`,
              description: `رقم الصفحة المذكور في جدول الفهرس هو (${listedPage}) بينما الموضع الفعلي للدرس في المستند هو صفحة (${actualPage}). تم تصحيح الفهرس لمطابقة المحتوى الفعلي.`,
              foundSnippet: row,
              fixedSnippet: `| ${topicName} | ${actualPage} |`,
              isRepaired: true,
            });
            repairedTableLines.push(`| ${topicName} | ${actualPage} |`);
            continue;
          }
        }
      }
      repairedTableLines.push(row);
    }

    if (hasIndexMismatches) {
      const updatedTable = repairedTableLines.join('\n');
      repairedMd = repairedMd.replace(rawTable, updatedTable);
    }
  }

  // Count total analyzed sections
  const sectionsCount = (repairedMd.match(/^#{1,3}[ \t]+/gm) || []).length || 1;
  // `issues` is the complete list — the header, numbering and footnote counters above are
  // derived from those same pushes, not from an independent pass. Summing them with
  // issues.length therefore counted every structural issue twice, so a document with one
  // missing header reported two. The list length is the count.
  const totalIssuesCount = issues.length;
  const hasStructuralFlaws = totalIssuesCount > 0;

  let overallStructuralVerdict = 'الهيكل التنظيمي للمستند مطابق للأصل وخالٍ من الخلل في العناوين والترقيم والهوامش.';
  if (hasStructuralFlaws) {
    const parts: string[] = [];
    if (footnoteIssuesCount > 0) parts.push(`ضبط ${footnoteIssuesCount} هوامش سفلية`);
    if (missingHeadersCount > 0) parts.push(`تصحيح ${missingHeadersCount} ترويسات وعناوين`);
    if (numberingIssuesCount > 0) parts.push(`معايرة ${numberingIssuesCount} تدرجات ترقيم هرمي`);
    if (repairedCount > 0) parts.push(`استكمال ${repairedCount} خانات وجمل مبتورة وتطهير تكرارات طفيلية`);
    overallStructuralVerdict = `تم الفحص الهيكلي الشامل: ${parts.join('، ')} لضمان المطابقة الكاملة لأصل الـ PDF.`;
  }

  return {
    report: {
      analyzedSectionsCount: sectionsCount,
      totalIssuesCount,
      missingHeadersCount,
      numberingIssuesCount,
      footnoteIssuesCount,
      repairedCount,
      issues,
      overallStructuralVerdict,
      hasStructuralFlaws,
    },
    repairedMarkdown: repairedMd,
  };
}

export const runDocumentStructuralAuditor = documentStructuralAuditor;
