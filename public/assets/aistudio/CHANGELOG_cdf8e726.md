## 2.9.6 — 2026-11-07
- إصلاح الاتجاه: إزالة محارف العزل `U+2067/U+2069` من `SKILL.md` سطر 113 (جدول الحصص) — مخالفة `arabic-script.md` §1 كانت تُبتلع بصمت. فحص: `grep -rnP '[\x{2066}-\x{2069}\x{202a}-\x{202e}]'` على `SKILL.md`/`CHANGELOG.md`/`AGENTS.md`/`README.md` الآن فارغ.
- اختبارات: 98 (`bash tests/run_tests.sh`) — لا تغيير وظيفي.

## 2.9.5 — 2026-11-07
- `docx_engine`: تدرج بصري مميز لكل الملفات — `ArH1` أخضر `0B4F2C` بحجم 22pt متمركز مع إطار سفلي ذهبي `A67C00` وخلفية `F7F2E3`، و`ArQuestion` كستنائي `7B1E1E` بحجم 14pt، و`ArH3` ذهبي 15pt و`ArSubHead` حبر `2E4B73` — العنوان والأسئلة والأحاديث والآيات مميزة باللون والحجم عن الجسم والبعض (كانوا كلهم `NAVY` و13.5pt مساوية للجسم). أُعيد بناء الـ66 ملفًا كاملة. كذلك `keep_next=False` للأسئلة ونافذة تجميع البنود ≤6 (بلا صفحات شبه-فارغة).
- QA: أُغلقت 16 فشلًا تراكميًا (`punct-spacing` سطور مكسورة `\n،`/`\n؛`، `hamza-forms`، `no-bad-markup`، `no-camscanner`) على جميع المصادر حتى 66/66 بدون فشل — جذور: انقسام PDF عبر سطرين، و`...` ملتصقة لا تدخل القائمة البيضاء (تتحول إلى `…`)، و``` مفيد داخل الوثائق التقنية.
- أُضيف `AGENTS.md` (مدمج، أوامر حاكمة + حدود QA) و`docs/LESSONS.md` درس جذري ترقيم.
- اختبارات: 98 (`bash tests/run_tests.sh`) — بلا تغيير واجهة.

## 2.9.4 — 2026-11-05
- QA: مسافات الترقيم وهمزة الوصل/القطع بوابات صلبة (`fail` لا `warn`) — `punct-spacing` و`hamza-forms` تفشل الاعتماد على مدخلات معيبة، مع قائمة بيضاء ضيقة موثقة (فواصل الشعر، نقاط الحذف `...` المستقلة، فراغات الإجابة المنقّطة، `[؟]`) لا تكسر البوكليتات السليمة؛ و`lesson-names` بوابة صلبة تمنع عناوين «الدرس N»/«أسئلة صفحة N» بلا اسم درس حقيقي.
- `docx_engine`: فولباك أسماء الدروس لم يعد صامتًا — يُقبل الترقيم الترتيبي فقط عند غياب حقيقي مع توثيق بصري «(اسم الدرس غير موثَّق في المصدر)» على العنوان.
- إصلاح تلف في `qa_gates.py`: دمج خاطئ كاد يُدخل `f-string` مكسورًا عند كتلة المعادلات — حُذف التكرار واستُعيدت كتلة واحدة صحيحة.
- اختبارات: 98 (16 جديدة في `tests/test_qa_hard_gates.py` — ترقيم صارم، وصل/قطع، أسماء دروس، `placeholder_headings=0`، `table_problems`، عزل القائمة البيضاء، فشل صلب end-to-end، فولباك مرئي).

## 2.9.3 — 2026-11-05
- QA: وضع `--reflow` للبوكليتات المعاد تدفقها — الحكم بالحروف/التغطية لا بعدّ الصفحات.
- بوابات جديدة: مسافات الترقيم (قبل ،؛؟.! أو ملتصقة بعدها)، همزة الوصل/القطع
  (أي/إلى/إن/إذا/أبو/أحمد/أزهر)، وقفزات مستويات العناوين.
- `normalize_punct`: ضبط جذري — لا مسافة قبل ،؛:؟.! ، مسافة بعدها عند اللزوم،
  لا مسافة قبل قوس ختامي، تقصير «....» إلى «...» مع حماية فراغات الإجابة
  المنقّطة الطويلة وفاصل الشعر « .. ».
- `normalize_hamza`: إصلاح معجمي ضيق لسقوط همزة القطع (أي/إلى/إذا/أبو/أحمد/الأزهر…)
  بحدود كلمات آمنة لا تمسّ داخل الكلمات، وسياقات واضحة لـ«ان» فقط.
- QA: كشف الهمزة بعد تجريد التشكيل وبحدود حروف عربية حتى لا تُحسب «الشيطان»
  و«اليمن» مخالفات؛ واستثناء فواصل الشعر وفراغات النقاط من عدّ الترقيم.
- QA: بوابة `lesson-names` تمنع عناوين تدريبات بلا اسم درس («الدرس N» أو
  «أسئلة صفحة N»)؛ وإصلاح إنذار كاذب في كشف الأقواس المعكوسة عند «)«(».

# Changelog — arabic-pdf-to-book

## 2.9.2 — 2026-11-04

### Fixed
- **الأدب**: أُضيف القسمان الناقصان «طيف سميرة للبارودي — صفحة 61» و«رحلة عابسة لأحمد محرم — صفحة 71» من OCR Gemini (كانا غائبين من البوكليت). البوكليت الآن 12 قسمًا.


## 2.9.1 — 2026-11-04

### Changed
- **أسماء الدروس على التدريبات**: كل أقسام البوكليتات الخمسة (صرف 10، بلاغة 10، نحو 12، أدب 10، مطالعة 11) صارت بعناوين حقيقية من الكتاب + صفحة التدريبات، بدل «الدرس N». أُعيد البناء والتسليم لكل الملفات في `2027/عربي/تالته الثانوي/بوكليتات` و`00_التسليم`.
- **خيارات «1 - … 2 - …»**: `OPT_MARK` تقبل مسافات حول الشرطة (OCR النحو) — اختبار انحدار جديد.

### Verified
- اختبارات المهارة: 66 PASS.
- بوكليت النحو: OCR Gemini (109 صفحة، QA ‏PASS، 97 صفحة ناتج) — محلي ممنوع بأمر المستخدم.
- ملاحظة: بوكليت الأدب ينقصه تدريبات «طيف سميرة» (ص61) و«رحلة عابسة» (ص71) في المصدر — تُضاف عند توفر حصة Gemini.


## 2.9.0 — 2026-11-04

### Fixed
- **بنود «س٢:»** (`docx_engine.py`): البند المرقّم تحت سؤال موسوم بـ«س٢:» صار فرعًا له (`s_main`) بدل سؤال رئيسي جديد؛ أصلح البلاغة (68 سؤالًا رئيسيًا بدل 166) والأدب. اختبار انحدار جديد (`tests/test_hierarchy.py::SMainRenderTests`) — إجمالي الاختبارات 46.

### Added
- **سير عمل كتل التدريبات** (موثّق في SKILL.md): قصّ صفحات «التدريبات» حتى «أهداف الدرس» التالية ثم OCR الكتل فقط — البلاغة 25 صفحة/10 كتل، النحو 109 صفحات/12 كتلة.

### Verified
- بوكليت البلاغة: QA ‏PASS (0 فشل) · `verify_quotes.py`: 0 ‏Q001/Q003 (11 تحذير تشكيل Q002 فقط) · 21 صفحة PDF.
- بوكليت الصرف: QA ‏PASS · 48 صفحة · 0 ‏Q001/Q003.


## 2.4.0 — 2026-11-02

### Added
- **`scripts/verify_quotes.py`** — مدقّق اقتباسات: 250 آية/دقيقة، يفحص القرآن (حروف + تشكيل + مرجع)،
  الحديث (البخاري/مسلم)، وسلامة النصّ (أقواس، أشكال عرضية، حروف فارسية، جداول، عناوين مكررة).
- **`scripts/fetch_corpora.sh`** — تنزيل المصادر مرة واحدة (~20MB) إلى `~/.cache/ar-verify`.
- **وكيل `مدقق_الاقتباسات`** (subagent، موديل `openrouter/deepseek/deepseek-v4.1-flash-1017`).
- **`tests/test_verify_quotes.py`** — 12 اختبارًا بلا إنترنت (إجمالي 40).

### Verified
- مسح 59 ملفًا من مواد 2027: 19,340 ملاحظة (5,341 بلا مرجع · 1,252 تشكيل · 125 نصّ · 974 مسافة قبل ترقيم).

## 2.3.3 — 2026-11-02

### Fixed
- **الاختيارات اللازقة**: `explode()` كان يتعرف على `١- …` فقط، ولا يتعرف على `-١ …`
  (شرطة قبل الرقم — نمط الكتب المصرية) ولا على خلط النمطين؛ فكان يدمج الخيارات في فقرة
  واحدة تظهر ملتصقة بالسؤال. صار يفصل أي نمط وأي ترتيب إلى سطر مستقل لكل خيار.
- فجوة بين `﴾` والمرجع `[السورة: الآية]`، وبين `]` والآية التالية (كانت ملتصقة).
- رقم البند/الحرف يُتبع بـ`NBSP` فلا يلتصق بالنصّ في Word.
- `ArOption`: مسافة 2pt قبل كل خيار لفصل بصري أوضح، وإزالة `jc=left` الزائد.

### Added
- `tests/test_explode.py`: 4 اختبارات انحدار لنمطي الخيارات (20 اختبارًا إجمالًا).

### Verified
- بوكليت الصرف 3ث: 242 آية دُقّقت مقابل نصّ مصحفي؛ 117 سطرًا مدمجًا فُصل؛ 43 صفحة PDF.

## 1.1.0 — 2026-10-31

### Added
- `pdf_inspect.py`: pre-flight analysis (text layer, chars/page, Arabic ratio, recommended mode/chunk/profile, estimated requests).
- `structure.py`: optional Gemini heading insertion with strict validation (rejects if text similarity < 99.5%).
- LTR support: `--lang en` builds Word/PDF in left-to-right mode.
- `--raw`: bypass OCR with an existing raw Markdown file.
- `--inspect`: analyze PDFs without converting.
- QA: duplicate-page detection, `[؟]` placeholder count, Latin-ratio warning, small-file-aware short-line rule.
- Integration test: build a sample PDF then run the full pipeline offline via `--raw`.

### Changed
- OCR work/state directory defaults to `~/.cache/pdf2book/<stem>` instead of the source folder.
- Cleaner: BiDi marks, RTL punctuation spacing, table-row repair, LaTeX noise (`\quad`, `¿?`, ✓/✗), ordinal headings.
- Build: chooses `book`/`booklet` automatically; `--ltr` passes to the engine.

### Fixed
- Empty model responses are retried before marking a model dead.
- `promote_headings` indentation bug.
- `inspect.py` name clash with Python stdlib (renamed to `pdf_inspect.py`).
- Partial-page runs (`--pages`) no longer fail QA on page ratio.

## 1.0.0 — 2026-10-31

- First public version: Gemini OCR pipeline, cleanup, RTL DOCX engine, QA gates, resume, docs.

## 1.2.0 — 2026-10-31

### Added
- One-command install: `install.sh` + `pdf2book` CLI (`inspect`/`convert`/`test`/`version`).
- Math mode: pandoc OMML equations, Arabic-Indic digit normalization, combination notation → `\binom`, QA equation count.
- Reference RTL DOCX with Amiri styles for pandoc.

### Fixed
- QA page ratio now uses output PDF pages; added OCR coverage check.
- `dead_models` expire after 24h; 429 quota vs rate classified.
- API key sent via `x-goog-api-key` header, not URL.
- Batch continues after a failing file; `--inspect` no longer requires `--out`.
- Stale DOCX/PDF protection; `**` accepted in QA.
- Engine cover is neutral (no hardcoded Azhar/grade).
- 12/12 tests (adds math/OMML test).

## 1.3.0 — 2026-10-31

### Added
- Determinant/matrix normalization: `vmatrix` → `\left|\begin{matrix}…\end{matrix}\right|`; `bmatrix`/`pmatrix` → proper delimiters.
- Display-math protection: `$$…$$` is no longer touched by cleanup.
- Diverse-book validation: Nahw (13p text), Tawheed (9p text), Physics (7p scan, partial), Math (203p excerpts).

### Changed
- QA separates text coverage (≥85%) from output PDF size (≥50%) to avoid false failures on denser layouts.
- Short-line rule is a warning for tiny/partial runs (<3 pages or <50 lines).

### Fixed
- `\alpha` and other legitimate math no longer deleted by cleanup.
- Noise math (`¿?`) removed without touching real equations.

## 1.4.0 — 2026-10-31

### Added
- `--figures page`: embeds the source page image when OCR detects a diagram/photo/chart marker. Tested on chemistry (2 images embedded).
- Leading-subscript normalization for chemistry notation (`_{22}Ti` → `Ti_{22}`).

### Fixed
- Markdown images (`![...]`) no longer broken by RTL punctuation spacing.
- Figure markdown survives cleanup.

### Tested
- Chemistry scan (2 pages, 9 OMML equations, figures) PASS.
- Biology scan (2 pages, figure marker) PASS.
- Biology exam (2 pages) PASS.

## 1.5.0 — 2026-10-31

### Added
- Full 203-page math book run: PASS (3,484 OMML equations, 141 PDF pages, 65 headings).
- Optional TOC (`--toc`) for pandoc builds.
- Font embedding for pandoc DOCX (Amiri bundled).
- `structure.py` splits large books into ≤120k-char chunks with per-chunk validation.

### Fixed
- Table blocks normalized to equal column counts (8 broken tables fixed).
- Math normalization restored in cleanup (digits, binom, matrices, leading superscripts).
- Markdown images survive punctuation cleanup.

### Known
- Full math book still needs visual review: OCR of 150ppi visual-order notation can misplace terms.
- `--figures page` embeds full page images (text duplicated) — cropping is future work.

## 1.6.0 — 2026-11-01

### Added
- `--dpi N`: re-render PDF pages as images at a higher DPI before chunking/OCR (e.g. 300 for 150ppi scans).
- Math quality guidance: `--dpi 300 --models gemini-3.5-flash` for dense equations.

### Tested
- Page 10 of the 203-page math book: 300dpi + flash produced cleaner text/order than 150dpi + lite.
- Full book remains PASS structurally (3,484 OMML, 141 pages).

## 1.7.0 — 2026-11-01

### Added
- `--figures math`: page-image fallback for equation-heavy pages (guarantees exact visual math).
- `--dpi` 300 + `gemini-3.5-flash` validated on 20 pages: PASS (332 OMML).

### Fixed
- Code fences (```) and `<br>` from OCR no longer fail QA.
- `--figures` option actually accepts/passes `math`.
- 300dpi run previously failed on `no-bad-markup` — resolved.

## 1.8.0 — 2026-11-01

### Added
- `batch_convert.py`: recursive batch conversion with resume and `_batch_report.json`.
- Auto language detection (`--lang auto`): English books use LTR and English thresholds.
- English QA thresholds (short lines 45%, duplicates 20%).

### Tested
- First 5 English/text books converted; 2 initial failures fixed (language + thresholds).
- Batch run for all text-layer PDFs started.

## 1.9.0 — 2026-11-01

### Fixed
- Batch resume skipped successful books incorrectly (nested output path).
- Language detection threshold for English books with Arabic terminology.
- English short-line/duplicate thresholds.

## 2.0.0 — 2026-11-01

### Added
- `local_ocr.py`: Tesseract Arabic OCR with PyMuPDF rendering, parallel workers, no quota.
- `pipeline --ocr-engine local|gemini`, `--ocr-workers`.
- `batch_convert --scans-only`, `--text-only`, `--exclude`, `--rebuild`, `--ocr-engine`.
- `review_report.py`: per-book review table (JSON/Markdown).
- Clean TXT output beside MD/DOCX/PDF.

### Fixed
- Multi-column rows (vocabulary lists/tables) were merged into one blob; now preserved line-by-line.
- Presentation forms and Persian letters normalized to standard Arabic.
- OCR icon brackets `[صورة: أيقونة مثال] مثال` duplicated labels removed.
- Running headers/footers with page-number prefixes dropped.
- `\،` inside math broke pandoc spans (raw `\vec` leaked); repaired.
- List-item continuation lines merged into their item instead of orphan paragraphs.
- Profile auto-selection: booklet only for numbered-question booklets.
- Duplicate-lines metric no longer counts fill dots/table rows/short lines.
- Weak text layer (<500 letters/page) now triggers OCR instead of empty output.

### Tested
- 16/16 unit tests.
- Math ministry book 203p: PASS (137 PDF pages, 3,484 OMML).
- English ministry book 286p: PASS (254 PDF pages, LTR).
- Physics/chemistry/biology ministry books: OCR running.

## 2.1.0 — 2026-11-01

### Added
- `assemble_raw.py`: merge completed Gemini chunks from `state.json` and OCR only missing pages locally (quota-exhaustion recovery).
- `batch_convert --no-retry`, `--fallback-gemini-pages N`, `--order pages`.
- `tests/test_assemble.py`.

### Fixed
- Batch text-layer threshold aligned with pipeline (500 letters/page).

## 2.2.0 — 2026-11-01

### Added
- `--figures all`: embed every page image (image-only pages, low-text scans).
- Currency `$` escaped as `&#36;` so it never counts as math.

### Changed
- `equations` gate warns (not fails) when math spans < 3.

## 2.2.2 — 2026-11-01

### Fixed
- Repeated page-image lines were dropped as running headers.
- Currency dollars split across two lines escaped after paragraph merge.
- Short-line gate tolerant for books <= 12 pages.

## 2.2.3 — 2026-11-01

### Fixed
- Unbalanced `$` on a line (cross-line currency pairs) escaped so no fake math spans remain.

## 2.3.0 — 2026-11-01

### Added
- Local OCR resume: per-page cache (`<out>.pages.json`) written every 10 pages; pipeline enables it.

## 2.3.1 — 2026-11-01

### Fixed
- A single tesseract page timeout no longer aborts the whole batch.

## 2.3.2 — 2026-11-02

### Changed
- `duplicate-pages` is a warning for books <= 16 pages (exam booklets with a repeated scan).

## 2.3.3 — 2026-11-02

### Fixed
- `--figures all` skipped pages with no OCR text, so image-only books lost pages.
- `--visual` turns text-density into a warning when the book is built from page images.
