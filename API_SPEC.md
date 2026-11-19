# وثيقة مواصفات وعقد واجهة برمجة التطبيقات (API Specification & Contracts)

تحدد هذه الوثيقة العقد البرمجي الكامل لخادم **PDF Converter**، وتشمل مسارات التحويل، المهام الخلفية المستمرة على الخادم، مصفوفة نماذج جيمناي المجانية النشطة، أقفال الفريق، وحزم CLI / MCP.

---

## 1. نظرة عامة على المسارات (Endpoints Overview)

| المسار | الطريقة | المصادقة | الوصف |
| :--- | :--- | :--- | :--- |
| `/api/ping` | `GET` | عام | نبضة سريعة لإبقاء الاتصال حياً ومزامنة الاستيقاظ من الخمول |
| `/api/health` | `GET` | عام | فحص صحة الخادم وحالة التجمع الديناميكي للموديلات |
| `/api/info` | `GET` | محمي بالقفل | التوثيق البرمجي الحي، الميزات، ونطاق الخادم العام |
| `/api/auth/status` | `GET` | عام | حالة قفل الفريق، مصدر القفل، ورابط المشاركة العام |
| `/api/auth/verify` | `POST` | عام | التحقق من رمز الفريق وإصدار كوكي الجلسة + توكن `X-Team-Session` |
| `/api/auth/logout` | `POST` | عام | مسح كوكي جلسة الفريق من المتصفح |
| `/api/auth/config` | `POST` | جلسة موثقة | تفعيل أو تحديث أو تعطيل رمز دخول الفريق من لوحة المشرف |
| `/api/auth/revoke-all` | `POST` | جلسة موثقة | إنهاء كافة جلسات الفريق الحالية وإعادة ضبط التوثيق (`sessionEpoch`) |
| `/api/models/status` | `GET` | محمي بالقفل | عرض مصفوفة النماذج المجانية وحالة الحصص والتبريد |
| `/api/models/refresh` | `POST` | محمي بالقفل | فحص حي فوري لقائمة نماذج `@google/genai` وتدويرها |
| `/api/extract-direct-pdf` | `POST` | محمي بالقفل | استخراج رقمي فوري للنصوص والخطوط السفلية `<u>...</u>` دون استهلاك حصة |
| `/api/convert-pdf` | `POST` | محمي بالقفل | تفريغ وتنسيق PDF أو صورة عبر جيمناي مع تدوير النماذج المجانية |
| `/api/contextual-check` | `POST` | محمي بالقفل | التدقيق السياقي الشرعي والمصدري للآيات والأحاديث والمصطلحات |
| `/api/grammar-syntax-check` | `POST` | محمي بالقفل | التحليل النحوي والتركيبي واكتشاف البتر المفتوح في الجمل العربية |
| `/api/export-docx` | `POST` | محمي بالقفل | توليد مستند Word (`.docx`) عبر محرك التخطيط ثنائي اللغة (RTL/LTR) |
| `/api/jobs` | `GET` / `POST` | محمي بالقفل | سرد المهام الخلفية أو رفع ملف PDF/صورة للمعالجة المستمرة في `.jobs/` |
| `/api/jobs/:id` | `GET` / `DELETE` | محمي بالقفل | استرجاع حالة/نتيجة مهمة خلفية أو حذفها (بمعرفات محققة المسار) |
| `/api/jobs/:id/download-docx` | `GET` | محمي بالقفل | تنزيل ناتج المهمة الخلفية مباشرة بصيغة Word (`.docx`) |
| `/api/jobs/:id/cancel` | `POST` | محمي بالقفل | إيقاف المهمة الخلفية مؤقتاً مع حفظ الصفحات المنجزة |
| `/api/jobs/:id/resume` | `POST` | محمي بالقفل | استئناف المهمة الخلفية من آخر صفحة منجزة |
| `/api/compiler/plan` | `POST` | محمي بالقفل | بناء خطة التجميع الذكي وتصنيف الدروس والمحاور |
| `/api/compiler/extract` | `POST` | محمي بالقفل | استخراج وتجميع الكتل المواضيعية والأبواب من المصادر المحددة |
| `/api/compiler/refine` | `POST` | محمي بالقفل | تنقيح وصياغة مسودة الكراسة أو التجميع حسب توجيهات المستخدم |
| `/api/compiler/ask` | `POST` | محمي بالقفل | الإجابة الاستعلامية المباشرة والموثقة من داخل المصادر المختارة |
| `/api/compiler/semantic-search` | `POST` | محمي بالقفل | البحث الدلالي واللفظي الهجين بالمتجهات عبر فقرات المصادر |
| `/api/cli/tools-info` | `GET` | محمي بالقفل | بيانات أدوات MCP v2.0 وأنماط الخطوط المعتمدة |
| `/api/cli/download/:name` | `GET` | محمي بالقفل | تنزيل حزمة التثبيت `bundle.zip` أو سكربتات CLI و MCP المستقلة |
| `/api/links-guide/download` | `GET` | محمي بالقفل | تنزيل دليل الروابط الشامل `LINKS_GUIDE.md` |

---

## 2. عقد تحويل المستندات (`POST /api/convert-pdf`)

### معايير الطلب (Request Parameters):
- **النطاق المرجعي:** `https://pdf-to-word-markdown-text-converter.ai.studio/api/convert-pdf`
- **الترويسة:** `Content-Type: application/json` (مع كوكي الجلسة أو `X-Team-Session` عند تفعيل قفل الفريق)
- **الحد الأقصى لحجم جسم الطلب (HTTP Body):** `250MB`
- **الحد الأقصى لحجم Base64 للقطعة الواحدة:** `24MB`
- **الحجم الموصى به لكل قطعة:** 2 إلى 4 صفحات للكتب المصورة الممسوحة ضوئياً (لضمان الدقة الحرفية ومنع انقطاع الحصص).
- **فحص الترويسات السحرية (Magic Bytes Validation):** `%PDF` لملفات PDF، و`\x89PNG` لصور PNG، و`\xFF\xD8` لصور JPEG، و`RIFF....WEBP` لصور WebP.

### جسم الطلب (Request Body JSON):
```json
{
  "pdfBase64": "JVBERi0xLjQK...",
  "filename": "balagha_exam.pdf",
  "options": {
    "direction": "rtl",
    "preserveHandwriting": true
  }
}
```

### الاستجابة الناجحة (`HTTP 200 OK`):
```json
{
  "success": true,
  "data": {
    "title": "بوكليت مادة البلاغة",
    "detectedLanguage": "Arabic",
    "textDirection": "rtl",
    "pageCountEstimate": 3,
    "markdown": "# بوكليت مادة البلاغة\n\nس١: أعرب ما تحته خط: <u>العلم</u> نور.\n...",
    "plainText": "بوكليت مادة البلاغة\n\nس١: أعرب ما تحته خط: العلم نور...",
    "hasArabicText": true,
    "hasTables": true,
    "hasMathOrScience": false
  }
}
```

### سياسة معالجة الأخطاء وحدود الطلبات (`HTTP 429 Too Many Requests`):
عند بلوغ حد الطلبات بالدقيقة أو نفاد حصة نموذج مؤقتاً، يدور الخادم تلقائياً عبر تجمع النماذج المجانية النشطة؛ وإذا استنفدت جميعها يعيد استجابة JSON تتضمن مدة الانتظار الموصى بها:
```json
{
  "success": false,
  "error": "تم بلوغ حد الطلبات اللحظي في الدقيقة (Rate limit). يرجى الانتظار ثوانٍ قليلة...",
  "isRateLimit": true,
  "isUnavailable": false,
  "isPeakDemand": false,
  "retryAfterSeconds": 15
}
```

---

## 3. التدوير الديناميكي للنماذج المجانية (`sharedModelPool`)

بدلاً من الاعتماد على نموذج ثابت أو نماذج مدفوعة/متخصصة، يستخدم الخادم `server/modelPool.ts` لفحص نماذج `@google/genai` الحية عبر `ai.models.list()` وتدوير النماذج المجانية المتاحة تلقائياً:

1. `gemini-4-hydrogen` (`ThinkingLevel.LOW`)
2. `gemini-3.8-flash` (`ThinkingLevel.LOW`)
3. `gemini-3.7-flash` (`ThinkingLevel.LOW`)
4. `gemini-3.6-flash` (`ThinkingLevel.MINIMAL`)
5. `gemini-3.5-flash` (`ThinkingLevel.MINIMAL`)
6. `gemini-3.1-flash-lite` (`ThinkingLevel.MINIMAL`)
7. `gemini-2.5-flash` (بدون `thinkingConfig` للنماذج السابقة للجيل الثالث)

تتم تصفية النماذج المدفوعة أو غير النصية تلقائياً (`carbon`, `argon`, `image`, `lyria`, `omni`, `embedding`, `decision`, `-tts`, `-live`, `pro` المستقلة)، وتُطبيق دالة `buildSafeThinkingConfig(modelId)` على كل استدعاء.

---

## 4. تحميل حزمة الـ CLI و الـ MCP الجاهزة (`/api/cli/download/:scriptName`)

| المعامل `:scriptName` | نوع المحتوى المُعاد | الوصف |
| :--- | :--- | :--- |
| `bundle` أو `bundle.zip` | `application/zip` | حزمة متكاملة تحوي سكربتات Node.js و Python و MCP و `package.json` و `README.md` |
| `mcp-server` | `application/javascript` | خادم بروتوكول سياق النماذج `mcp-server.js` مع دعم `TEAM_ACCESS_CODE` |
| `batch-runner-js` | `application/javascript` | مُشغل التيرمينال للدفعات `batch-runner.js` مع دعم `--team-code` |
| `batch-runner-py` | `text/x-python` | مشغل بايثون `batch_runner.py` مع التدوير عبر مسار الخادم أو SDK المباشر |
| `package.json` | `application/json` | ملف إعدادات الحزم مع `"type": "module"` |
| `install.sh` | `application/x-sh` | سكربت التثبيت التلقائي لنظام Linux / macOS |
| `install.bat` | `application/x-bat` | سكربت التثبيت التلقائي لنظام Windows |

يتم ضبط النطاق المرجعي في كافة السكربتات المحملة تلقائياً إلى النطاق العام المعتمد `https://pdf-to-word-markdown-text-converter.ai.studio`.
