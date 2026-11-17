# حزمة أدوات التحويل البرمجية (CLI Batch Runner & MCP Server)

أدوات مستقلة عالية الكفاءة ومنخفضة استهلاك الذاكرة (< 80 ميغابايت RAM) لتحويل مكتبات الكتب الضخمة (150+ كتاباً، 10+ جيجابايت) إلى مستندات Word (`.docx`) و Markdown (`.md`) باحترافية وتطابق تام للرسم العثماني للآيات، والأبيات الشعرية، والجداول، وبادئات الأسئلة والأجوبة.

> 💡 **تشغيل فوري وسلس (Instant Setup):**
> تحتوي الحزمة على آلية تثبيت ذاتي مدمجة عند أول تشغيل. ومع ذلك، يُوصى بتثبيت الحزم لمرة واحدة فقط بعد فك الضغط لتجهيز بيئة التشغيل فوراً:
> - **أنظمة Linux / macOS:** تنفيذ الأمر `chmod +x install.sh && ./install.sh`
> - **أنظمة Windows:** تشغيل `install.bat`
> - **أو يدوياً في أي نظام:** تنفيذ `npm install`

---

## 1. التثبيت السريع (Quick Installation)

```bash
# على أنظمة Linux / macOS:
chmod +x install.sh && ./install.sh

# على أنظمة Windows:
install.bat

# أو يدوياً:
npm install
```

---

## 2. مُشغّل التيرمينال لتحويل الدفعات الضخمة (`batch-runner.js`)

يقوم بتحويل مجلد كتب PDF بالكامل صفحة بصفحة وبشكل مجزأ لمنع استهلاك الذاكرة أو انهيار المتصفح، مع تجميع حزم ZIP مجدولة تلقائياً وميزة الاستئناف الذكي عند الانقطاع.

### أوامر التشغيل:
```bash
# استخدام السيرفر السحابي الافتراضي المباشر (مجاناً وبدون API Key)
node batch-runner.js --input="/path/to/books" --output="./converted_output" --bundle-size=15

# أو تحديد سيرفر مخصص عبر المتغير البيئي:
export CONVERTER_SERVER_URL="https://ais-dev-wpsct27fdufcpry5x6ikjn-685461883733.europe-west2.run.app"
node batch-runner.js --input="./my_books" --output="./converted"
```

### معلمات التشغيل:
- `--input`, `-i`: مسار مجلد كتب PDF المراد تحويلها (إلزامي).
- `--output`, `-o`: مسار مجلد حفظ المخرجات والملفات المحولة وحزم الـ ZIP (افتراضي: `./converted_output`).
- `--bundle-size`, `-b`: عدد الكتب في كل حزمة ZIP مضغوطة مجدولة (افتراضي: `15`).
- `--server`, `-s`: عنوان خادم التحويل (افتراضي: `https://ais-dev-wpsct27fdufcpry5x6ikjn-685461883733.europe-west2.run.app`).
- `--api-key`, `-k`: مفتاح Gemini API اختياري في حال الرغبة بالتحويل المباشر دون المرور بالسيرفر.

---

## 3. خادم بروتوكول سياق النماذج (`mcp-server.js`)

خادم متوافق 100% مع معيار **Model Context Protocol (MCP)** الإصدار `2024-11-05` عبر `stdio` بدون Echo، ويتيح لعملاء الذكاء الاصطناعي (Claude Desktop, Cursor, OpenCode, Windsurf) إدارة تحويل الكتب.

### إعداد Claude Desktop / OpenCode:
أضف إلى ملف إعدادات MCP:
```json
{
  "mcpServers": {
    "books-word-converter": {
      "command": "node",
      "args": ["/absolute/path/to/scripts/mcp-server.js"],
      "env": {
        "CONVERTER_SERVER_URL": "https://ais-dev-wpsct27fdufcpry5x6ikjn-685461883733.europe-west2.run.app"
      }
    }
  }
}
```

### الأدوات المتاحة (Tools Schema & Contract):

#### 1) `scan_books_directory`
- **المدخلات:** `{ "directory_path": string, "recursive"?: boolean }`
- **المخرجات الناجحة:**
  ```json
  {
    "directory": "/path/to/books",
    "totalFiles": 150,
    "totalSizeBytes": 5368709120,
    "totalSizeGB": "5.00",
    "files": [{ "name": "book1.pdf", "path": "...", "sizeMB": 35.5, "ext": ".pdf" }]
  }
  ```

#### 2) `convert_book_to_word`
- **المدخلات:** `{ "file_path": string, "output_dir"?: string }`
- **المخرجات الناجحة:**
  ```json
  {
    "bookName": "book1.pdf",
    "totalPages": 120,
    "docxPath": "/output/book1.docx",
    "markdownPath": "/output/book1.md",
    "status": "completed"
  }
  ```

#### 3) `batch_convert_folder`
- **المدخلات:** `{ "input_dir": string, "output_dir"?: string, "bundle_size"?: number }`
- **المخرجات:** تقرير إجمالي بعدد الكتب المكتملة والحزم المضغوطة المنشأة.

#### 4) `get_batch_status`
- **المدخلات:** `{ "output_dir": string }`
- **المخرجات:** يقرأ ملف `batch_resume.json` ويعيد قائمة الكتب المنجزة وتلك التي واجهت تعثراً ورقم الحزمة الحالية.

---

## 4. ملف الاستئناف الذكي (`batch_resume.json`)
يتم حفظ حالة التحويل دورياً في المجلد المستهدف بالشكل التالي:
```json
{
  "completed": [
    "/absolute/path/to/book1.pdf",
    "/absolute/path/to/book2.pdf"
  ],
  "failed": [
    {
      "file": "/absolute/path/to/corrupted.pdf",
      "error": "Could not parse PDF",
      "timestamp": "2026-11-10T09:00:00.000Z"
    }
  ],
  "bundleIndex": 2
}
```
عند إعادة تشغيل المشغل، يتم تجاوز الكتب الموجودة في `completed` تلقائياً واستكمال العمل دون تكرار.
