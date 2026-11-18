export const PROJECT_CUSTOM_INSTRUCTIONS_EN = `# Custom Instructions — Arabic & Bilingual Document Studio (PDF / Image / DOCX / Google Docs / Compiler)

## 1. Core Purpose & Domain Invariants
You are working on a production **Arabic-first & Bilingual Document Extraction, Auditing, Smart Anthology Compilation, and Publishing Studio** built with React 19, Vite, Tailwind CSS v4, TypeScript, Express + tsx/Node 22, and the official \`@google/genai\` SDK.
- **100% Verbatim Fidelity**: Never summarize, paraphrase, skip, or truncate source content during PDF/image OCR or smart compilation. Preserve numbered sequences, footnotes, tables, math (KaTeX \`$\` / \`$$\`), and punctuation.
- **Uthmani Quranic Integrity**: All Quranic verses MUST preserve Uthmani orthography wrapped cleanly inside ornate brackets \`﴿...﴾\` and validated against \`src/utils/quranAuditor.ts\` & \`src/utils/quranicVerificationAgent.ts\`. Never flatten diacritics or rewrite verses.
- **Verified Underline Preservation (\`<u>...</u>\`)**: Preserve underlined exam/grammar phrases ("أعرب ما تحته خط") using verified vector stroke/thin-rectangle detection in \`server/pdfUnderlineExtractor.ts\`, rendered cleanly via \`src/utils/remarkInlineHtmlPlugin.ts\` and exported inside \`shared/typographyDocxCore.ts\` (and Google Docs). Do NOT replace \`<u>...</u>\` with \`~\` strikethrough or strip them in plain-text sanitizers without care.
- **Word (.docx) & Google Docs Parity**: Never export plain Markdown wrapped with a \`.docx\` extension. Every Word export and Google Docs upload MUST run through \`shared/typographyDocxCore.ts\` (\`buildDocxBinary\`) or \`/api/export-docx\` so calibrated Arabic/Latin fonts (\`TYPOGRAPHY_PROFILES\`), native RTL \`bidi\` paragraphs, tables, callouts, and \`<u>\` runs stay intact.

## 2. Gemini Free-Tier Pool & Model Routing Rules
- Use ONLY \`@google/genai\` (\`GoogleGenAI\`, \`ThinkingLevel\`) — never deprecated SDKs or hardcoded legacy models (\`gemini-1.5-*\`, \`gemini-2.0-*\`, \`gemini-pro\`).
- All OCR, compilation, grammar, and background workers MUST pull candidate models from \`sharedModelPool\` in \`server/modelPool.ts\`:
  - Dynamically discovers active models via \`ai.models.list()\`, strictly excludes paid/specialty models (\`carbon\`, \`argon\`, \`image\`, \`nano-banana\`, \`omni\`, \`lyria\`, \`embedding\`, \`decision\`, standalone \`pro\`, \`-tts\`, \`-live\`), probes readiness, and rotates round-robin with shared cooldown tracking.
  - **ThinkingConfig Guard**: Use \`buildSafeThinkingConfig(modelId)\` ONLY:
    - Gemini 4 / Hydrogen / Gemini 3.7 Flash / Gemini 3.8 Flash -> \`ThinkingLevel.LOW\` (\`MINIMAL\` throws 400 on 3.7/3.8).
    - Other Gemini 3 Flash / Flash-Lite -> \`ThinkingLevel.MINIMAL\`.
    - Pre-3 models -> omit \`thinkingConfig\`.
- **Digital-First Hybrid Extraction**: Native digital PDFs extract text + vector underlines locally without spending Gemini OCR quota; only scanned/image pages route through the rotating free-tier pool.

## 3. Server Persistence, Auth & Idle Stability Invariants
- **Background Jobs**: \`server/backgroundJobManager.ts\` persists batch/PDF conversion jobs to \`.jobs/\` so conversions survive closed tabs, browser restarts, and laptop sleep. Always poll/reconnect cleanly from the UI.
- **Team Access Gate**: \`server/teamAuth.ts\` protects \`/api/*\` when enabled via HMAC-SHA256 signed cookies (\`studio_team_session\`) + \`X-Team-Session\` header fallback, timing-safe passcode verification, and IP rate limiting. Never re-add \`TEAM_ACCESS_CODE\` or \`HOST\` to \`.env.example\` (triggers unwanted AI Studio deploy prompts).
- **Frozen \`window.fetch\` & Keep-Alive**: \`index.html\` freezes \`window.fetch\`. NEVER attempt to monkey-patch \`window.fetch\`. Always route app API calls through \`apiFetch()\` in \`src/utils/apiClient.ts\` (preserves plain-object headers for tests, injects \`X-Team-Session\` only when present, retries transient \`502/503/504\` wake drops).
- **Idle Freeze Prevention**: Server keeps \`keepAliveTimeout = 620_000\` (> Cloud Run/Nginx 600s) and \`Cache-Control: no-store\` on HTML. Client uses silent \`/api/ping\` via \`useConnectionKeepAlive\` and soft \`ErrorBoundary\` reset (never \`window.location.reload()\`).

## 4. Google Workspace (Docs & Drive) Security Rules
- Client-side Firebase Auth ONLY (\`src/utils/workspaceAuth.ts\`) with scopes: \`documents\`, \`documents.readonly\`, \`drive\`, \`drive.file\`, \`drive.readonly\`.
- **In-Memory Token ONLY**: NEVER store Google OAuth \`accessToken\` in \`localStorage\` or \`sessionStorage\`. Call \`https://docs.googleapis.com\` and \`https://www.googleapis.com/drive/v3\` via \`globalThis.fetch\` with \`Authorization: Bearer <token>\`.
- **Explicit Confirmation Gate**: Any mutating/destructive Workspace action (overwriting/updating an existing Google Doc or deleting a Drive file) MUST present a clear confirmation modal showing the target document name before executing.

## 5. UI, Design & Testing Discipline
- **Zero AI Aesthetics / Zero Native Selects**: Zero AI icons (\`Sparkles\`, \`Bot\`, \`Wand2\`, \`Brain\`, \`Cpu\`), zero emojis, zero AI buzzwords. Use Light (\`#FBFBF9\`) & Dark (\`#0B0D12\`) editorial themes and \`<CustomSelect />\` instead of native \`<select>\`.
- **Mandatory Pre-Finish Verification**: Run \`npx tsc --noEmit\`, \`npm run build\`, and targeted Vitest characterization suites (\`tests/team-auth-and-model-pool.test.ts\`, \`tests/background-job-and-docx.test.ts\`, \`tests/dropzone-file-sniffing.test.ts\`, \`tests/grammar-syntax-analyzer.test.ts\`, \`tests/smartCompilerCore.test.ts\`, \`tests/quran-auditor.test.ts\`, \`tests/bilingual-docx-and-mcp.test.ts\`) before finishing any change.`;

export const PROJECT_CUSTOM_INSTRUCTIONS_AR = `# التعليمات الهندسية المخصصة للوكلاء (Custom Instructions) — استوديو الوثائق والنشر

## 1. هوية المشروع والقواعد الثابتة للمحتوى
أنت تعمل على منصة إنتاج احترافية لتحويل وتفريغ وتدقيق وتجميع الوثائق العربية وثنائية اللغة (PDF / صور / Word / Google Docs) باستخدام React 19 و Vite و Tailwind CSS v4 و TypeScript و Express + Node 22 وحزمة \`@google/genai\` الرسمية.
- **الأمانة الحرفية الكاملة (100% Verbatim):** ممنوع التلخيص أو الاختصار أو حذف أي فقرة أو سؤال أو حاشية أثناء تفريغ PDF أو التجميع الذكي. حافظ على الترقيم والجداول والمعادلات الرياضية (KaTeX) وعلامات الترقيم بدقة تامة.
- **حماية الرسم العثماني للقرآن الكريم:** يجب الحفاظ على التشكيل والرسم العثماني للآيات داخل أقواس \`﴿...﴾\` والتحقق منها عبر \`quranAuditor.ts\` و\`quranicVerificationAgent.ts\` دون أي تطبيع يُفقد الرسم الأصلي.
- **الحفاظ على الخطوط السفلية (\`<u>...</u>\`):** النصوص التي تحتها خط (مثل أسئلة «أعرب ما تحته خط») تُستخرج هندسياً من متجهات PDF عبر \`server/pdfUnderlineExtractor.ts\` وتُعرض وتُصدّر إلى Word و Google Docs كـ \`<u>...</u>\` فعلية — لا تحولها أبداً إلى شطب أو نص مجرد.
- **تصدير Word (.docx) و Google Docs حقيقي:** لا تُصدّر نص Markdown بامتداد \`.docx\`. كل تصدير إلى Word أو رفع إلى Google Docs يجب أن يمر عبر \`shared/typographyDocxCore.ts\` أو \`/api/export-docx\` لضمان اتجاه RTL الحقيقي والخطوط المعايرة.

## 2. قواعد تجمع نماذج جيمناي المجانية والتدوير الذكي
- التزم بحزمة \`@google/genai\` فقط، وممنوع استخدام النماذج المتوقفة (\`1.5\` و\`2.0\` و\`gemini-pro\`) أو النماذج المدفوعة/التخصصية (\`carbon\` و\`argon\` و\`image\` و\`lyria\` و\`omni\` و\`embedding\` و\`decision\` و\`pro\` المستقلة).
- جميع المسارات (\`convert-pdf\`، \`backgroundJobManager\`، \`smartCompilerRoutes\`, \`contextual-check\`) تسحب النماذج من \`sharedModelPool\` في \`server/modelPool.ts\` الذي يفحص النماذج الحية تلقائياً ويدوّر بينها بـ Round-Robin مع مشاركة التهدئة.
- استخدم \`buildSafeThinkingConfig(modelId)\` فقط: \`LOW\` لنماذج Hydrogen و 3.7 و 3.8 و 4، و\`MINIMAL\` لبقية 3.x، وإلغاء \`thinkingConfig\` لما دون 3.

## 3. الخادم والمهام الخلفية والأمان ومنع التوقف
- المهام المستمرة (\`BackgroundJobManager\`) تُحفظ على القرص في \`.jobs/\` لتكمل العمل حتى بعد إغلاق المتصفح أو إطفاء الجهاز.
- بوابة الفريق (\`TeamAuthManager\`) تحمي مسارات \`/api/*\` بكوكي موقعة بـ HMAC-SHA256 وترويسة \`X-Team-Session\`. لا تُضف \`TEAM_ACCESS_CODE\` أو \`HOST\` إلى \`.env.example\` حتى لا تظهر نوافذ إدخال المتغيرات عند النشر.
- ملف \`index.html\` يجمد \`window.fetch\`: لا تحاول استبدال \`window.fetch\`. استخدم \`apiFetch()\` من \`src/utils/apiClient.ts\` دائماً لطلبات التطبيق الداخلية، واحتفظ بمؤقت \`keepAliveTimeout = 620_000\` ونبضة \`/api/ping\` لمنع الخمول أو إعادة التحميل التلقائية.

## 4. تكامل Google Docs و Google Drive
- المصادقة تتم من المتصفح عبر Firebase Auth فقط (\`src/utils/workspaceAuth.ts\`) مع حفظ \`accessToken\` في الذاكرة المؤقتة فقط (ممنوع حفظه في \`localStorage\` أو \`sessionStorage\`).
- قبل أي تعديل/استبدال لمستند Google Doc موجود أو حذف ملف من Drive، يجب عرض نافذة تأكيد واضحة للمستخدم تذكر اسم المستند والإجراء بدقة.

## 5. التصميم والاختبار قبل التسليم
- التصميم تحريري نظيف بثيمين (نهاري \`#FBFBF9\` وداكن \`#0B0D12\`)، وخالٍ تماماً من أي أيقونات أو عبارات ذكاء اصطناعي أو إيموجيز، مع استخدام \`<CustomSelect />\` بدلاً من \`<select>\`.
- قبل إنهاء أي تعديل: نفّذ \`npx tsc --noEmit\` و \`npm run build\` وشغّل اختبارات Vitest المرتبطة للتأكد من سلامة العقود الحالية.`;
