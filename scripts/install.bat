@echo off
chcp 65001 >nul
echo ===============================================================
echo    تثبيت حزم مُشغّل التحويل و خادم MCP على ويندوز
echo ===============================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo ❌ خطأ: Node.js غير مثبت على جهازك. يرجى تثبيت Node.js من https://nodejs.org
  pause
  exit /b 1
)

echo ✓ تم التحقق من وجود Node.js
echo ⏳ جاري تثبيت الحزم المطلوبة (docx, jszip, pdf-lib, pdf-parse, @google/genai)...
call npm install --no-audit --no-fund

echo.
echo 🎉 تم التثبيت بنجاح!
echo.
echo لتشغيل تحويل الدفعات:
echo   node batch-runner.js --input="D:\books" --output="D:\converted" --bundle-size=15
echo.
pause
