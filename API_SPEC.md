# وثيقة مواصفات وعقد واجهة برمجة التطبيقات (API Specification & Contracts)

تحدد هذه الوثيقة العقد البرمجي الكامل لخادم التحويل السحابي والمحلي، وسياسات الحصص وحدود الأحجام ومعالجة الأخطاء لعملاء التيرمينال (CLI) وخوادم بروتوكول سياق النماذج (MCP).

---

## 1. نظرة عامة على المسارات (Endpoints Overview)

| المسار | الطريقة | الوصف |
| :--- | :--- | :--- |
| `/api/health` | `GET` | فحص صحة الخادم وجاهزية الموديلات ودعم MCP و CLI |
| `/api/info` | `GET` | التوثيق البرمجي الكامل والعقد ومصفوفة الموديلات وحدود الأحجام |
| `/api/convert-pdf` | `POST` | تحويل ملف PDF أو صورة إلى Markdown عالي الدقة وتنسيق Word |
| `/api/cli/download/:name` | `GET` | تنزيل حزمة التثبيت الكاملة `bundle.zip` أو السكربتات المستقلة |

---

## 2. عقد تحويل المستندات (`POST /api/convert-pdf`)

### معايير الطلب (Request Parameters):
- **الرابط:** `https://ais-dev-wpsct27fdufcpry5x6ikjn-685461883733.europe-west2.run.app/api/convert-pdf`
- **الترويسة:** `Content-Type: application/json`
- **الحد الأقصى لحجم جسم الطلب (HTTP Body):** `250MB`
- **الحد الأقصى لحجم Base64 للقطعة الواحدة:** `24MB`
- **الحجم الموصى به لكل قطعة:** 2 إلى 4 صفحات للكتب المصورة الممسوحة ضوئياً (لضمان أعلى دقة حرفية وتجنب تجاوز الحصص اللحظية).
- **المهلة الزمنية للعميل (Client Timeout):** `180 ثانية` (مع آلية AbortController).
- **فحص الترويسات السحرية (Magic Bytes Validation):** `%PDF` لملفات PDF، و`\x89PNG` لصور PNG، و`\xFF\xD8` لصور JPEG. يتم رفض أي بيانات عشوائية فورياً بحالة `400 Bad Request`.

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
    "markdown": "# بوكليت مادة البلاغة\n\nس١: ما تعريف البلاغة؟\n...",
    "plainText": "بوكليت مادة البلاغة\n\nس١: ما تعريف البلاغة؟...",
    "hasArabicText": true,
    "hasTables": true,
    "hasMathOrScience": false
  }
}
```

### سياسة معالجة الأخطاء وحدود الطلبات (`HTTP 429 Too Many Requests`):
عند بلوغ حد الطلبات بالدقيقة، يعيد الخادم رداً بصيغة `application/json` متضمناً عدد الثواني المطلوب انتظارها:
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

## 3. مصفوفة النماذج الاحتياطية وترتيب السقوط (Model Fallback Cascade)

يعتمد الخادم على تسلسل هرمي ذكي يمنح الأولوية للنماذج فائقة السرعة وذات السعة العالية، وينتقل تلقائياً للنموذج التالي عند حدوث أي ضغط:

1. `gemini-3.5-flash-lite` (المحرك الافتراضي الأساسي - سرعة فائقة وحصص عالية)
2. `gemini-3.1-flash-lite` (الاحتياطي الأول)
3. `gemini-3.5-flash` (الاحتياطي الثاني)
4. `gemini-3.8-flash` (الاحتياطي للوثائق المركبة والنصوص النادرة)
5. `gemini-3.7-flash`
6. `gemini-3.6-flash`
7. `gemini-flash-latest`
8. `gemini-pro-latest`

---

## 4. تحميل حزمة الـ CLI و الـ MCP الجاهزة (`/api/cli/download/:scriptName`)

| المعامل `:scriptName` | نوع المحتوى المُعاد | الوصف |
| :--- | :--- | :--- |
| `bundle` أو `bundle.zip` | `application/zip` | حزمة ZIP مضغوطة متكاملة تحوي السكربتات و `package.json` و `install.sh` و `README.md` |
| `mcp-server` | `application/javascript` | خادم بروتوكول سياق النماذج `mcp-server.js` |
| `batch-runner-js` | `application/javascript` | مُشغل التيرمينال للدفعات الضخمة `batch-runner.js` |
| `package.json` | `application/json` | ملف إعدادات الحزم مع `"type": "module"` |
| `install.sh` | `application/x-sh` | سكربت التثبيت التلقائي لنظام Linux / macOS |
| `install.bat` | `application/x-bat` | سكربت التثبيت التلقائي لنظام Windows |

يتم استبدال النطاق في كافة السكربتات المحملة تلقائياً بنطاق السيرفر الحالي المعتمد `ais-dev-`.
