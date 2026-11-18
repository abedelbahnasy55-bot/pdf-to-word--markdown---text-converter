@echo off
chcp 65001 > nul
echo ===============================================================
echo    مشغل تحويل دفعات الكتب الضخمة (150+ كتاب / 10+ جيجابايت)
echo    مجاني بالكامل عبر سيرفر التطبيق - بدون أي مفتاح API أو تكاليف
echo ===============================================================
echo.

set /p INPUT_DIR="أدخل مسار مجلد الكتب (مثال D:\books): "
set /p OUTPUT_DIR="أدخل مسار مجلد المخرجات (مثال D:\converted): "

echo.
echo [1/2] التحقق من بيئة التشغيل وتثبيت الحزم الخفيفة...
call npm install docx pdf-lib jszip

echo.
echo [2/2] بدء عملية التحويل المجانية عبر محرك التطبيق مباشرة...
node batch-runner.js --input="%INPUT_DIR%" --output="%OUTPUT_DIR%" --bundle-size=15 --server="https://pdf-to-word-markdown-text-converter.ai.studio"

echo.
pause
