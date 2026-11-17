#!/usr/bin/env bash
# تثبيت بيئة تشغيل أدوات التحويل CLI و MCP محلياً
set -e

echo "==============================================================="
echo "   تثبيت حزم مُشغّل التحويل و خادم MCP محلياً"
echo "==============================================================="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "❌ خطأ: Node.js غير مثبت على جهازك. يرجى تثبيت Node.js (الإصدار 18 فما فوق)."
  exit 1
fi

NODE_VERSION=$(node -v)
echo "✓ تم التحقق من Node.js: $NODE_VERSION"

echo "⏳ جاري تثبيت الحزم المطلوبة (docx, jszip, pdf-lib, pdf-parse, @google/genai)..."
npm install --no-audit --no-fund

echo ""
echo "🎉 تم التثبيت بنجاح!"
echo ""
echo "طرق الاستخدام:"
echo "1. تشغيل تحويل دفعة كتب عبر التيرمينال:"
echo "   node batch-runner.js --input=\"/path/to/books\" --output=\"./converted\" --bundle-size=15"
echo ""
echo "2. ربط خادم MCP مع OpenCode / Claude Desktop / Cursor:"
echo "   Command: node"
echo "   Args: [\"$(pwd)/mcp-server.js\"]"
echo ""
