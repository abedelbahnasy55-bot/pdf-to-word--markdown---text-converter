# تقرير RCA — Arabic PDF → Book (جذري)

## 1) أسباب جذرية

### RC-1: حذف البيانات/الجداول (استخراج)
- **العرض**: يتوقّف الجدول بعد الصف الأول؛ صفحات/أسئلة تُحذف.
- **السبب**: OCR chunk-based (10 صفحات) بدون تحقق اكتمال؛ `drop_running_heads` قد يحذف أسطر حقيقية؛ `merge_wrapped`/`strip_noise` قد تدمج/تسقط.
- **الإصلاح**: إضافة فحص اكتمال (content-retention) في `qa_gates.py`: ratio كلمات clean/raw ≥50% (تحذير <80%). إبقاء prompt OCR "نسخ كامل" + بوابة صفحات.

### RC-2: OCR سياقي/لغوي
- **العرض**: "أبدال" بدل "­ingال", "مهزة يف", "ملايأتي".
- **السبب**: OCR بصري بدون نموذج لغوي.
- **الإصلاح**: `scripts/arabic_nlp.py` (طبقة NLP) تطبّق تصحيحات سياقية (phrase-level, word boundaries, conjunction prefixes). مدمجة في `clean_md.clean()` عبر `correct_arabic()`.

### RC-3: RTL/ترقيم
- **العرض**: أقواس معكوسة، نقاط تقسم جملًا.
- **السبب**: عدم فرض bidi/escaping.
- **الإصلاح**: `docx_engine` يفرض `w:bidi` + `w:rtl` على runs/paragraphs/sectPr؛ تنظيف Bidi marks في `clean_md`/`arabic_nlp`. الترقيم يبقى نصًّا صلبًا (لا Word auto-list).

### RC-4: Auto-numbering
- **العرض**: أرقام/حروف تتحول إلى قوائم Word.
- **السبب**: مسارات pandoc قد تفسّر list markers.
- **الإصلاح**: محرّك `docx_engine` لا يستخدم `numPr` (ترقيم صلب). في وضع pandoc، الترقيم remains Markdown text; تجنب list auto by keeping markers as text (exploded options).

## 2) تعديلات مُنفَّذة (ملفات)
- `scripts/arabic_nlp.py` (جديد)
- `scripts/clean_md.py`: import + `correct_arabic(text)`
- `scripts/qa_gates.py`: content-retention check
- `tests/test_arabic_nlp.py` (جديد)

## 3) Code snippets
```python
# clean_md.py
text = unify_letters(text)
text = correct_arabic(text)
```
```python
# qa_gates.py
retention = clean_words / max(1, raw_words)
check("content-retention", retention >= 0.50, ..., warn=retention < 0.80)
```

## 4) NLP post-processing (خطوة بخطوة)
1. Unicode normalize + remove bidi marks.
2. unify letters (presentation forms).
3. phrase-level OCR fixes with word boundaries + conjunction prefixes.
4. contextual spell-check hook (قابل للربط بـ pyarabic/camel-tools).
5. retention check catches dropped content.

## 5) التحقق
- pytest: 43 passed.
- لا اختبارات كُسرت.

## 6) تحسينات مستقبلية
- ربط نموذج لغوي (n-gram) لتصحيح عام.
- استخراج جداول عبر pdfplumber (grid) بدل OCR.
- Camelot/Tabula optional.
- RTL punctuation escaping in docx (brackets as text runs).
