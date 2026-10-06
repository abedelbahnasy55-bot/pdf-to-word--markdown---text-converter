/**
 * Behavior-preservation harness.
 *
 * Captures the current observable behavior of the surfaces that CAN be
 * exercised without a GEMINI_API_KEY, so that later structural moves can be
 * proven output-identical instead of merely type-checked.
 *
 * Covers:
 *   - POST /api/extract-direct-pdf   (zero-quota pdf-parse path)
 *   - GET  /api/health
 *
 * The four Gemini-backed endpoints are deliberately NOT covered: they require
 * a key that is not present. That gap is reported rather than papered over.
 *
 * Usage: node scripts/capture-goldens.mjs [--write]
 *        (without --write it compares against the committed goldens and fails
 *         on any difference)
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN_PATH = join(ROOT, 'tests', 'golden', 'server-extraction.json');

// A real, small, text-layer PDF. Chosen for a deterministic page/line layout.
const FIXTURE_PDF = process.env.GOLDEN_PDF ?? '';
const BASE_URL = process.env.GOLDEN_BASE_URL ?? 'http://127.0.0.1:4599';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/**
 * Stores long strings as a hash plus a short head/tail window, so a diff shows
 * what actually changed without storing a 2 MB markdown blob in the repo.
 */
const fingerprint = (value) => ({
  sha256: sha256(value),
  length: value.length,
  head: value.slice(0, 400),
  tail: value.slice(-200),
});

async function capture() {
  const results = {};

  const health = await fetch(`${BASE_URL}/api/health`);
  const healthBody = await health.json();
  results.health = {
    status: health.status,
    // timestamp is wall-clock; only the shape is asserted, never the value.
    bodyKeys: Object.keys(healthBody).sort(),
    statusField: healthBody.status,
    isIsoTimestamp: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(healthBody.timestamp ?? ''),
  };

  if (!FIXTURE_PDF || !existsSync(FIXTURE_PDF)) {
    throw new Error(
      `GOLDEN_PDF fixture not found: ${FIXTURE_PDF || '(unset)'}\n` +
        'Point GOLDEN_PDF at a text-layer PDF to capture the extraction golden.'
    );
  }

  const pdfBase64 = readFileSync(FIXTURE_PDF).toString('base64');
  const extraction = await fetch(`${BASE_URL}/api/extract-direct-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfBase64, filename: 'Untitled Lecture.pdf' }),
  });
  const extractionBody = await extraction.json();

  results.extraction = {
    httpStatus: extraction.status,
    topLevelKeys: Object.keys(extractionBody).sort(),
    success: extractionBody.success,
    hasDigitalText: extractionBody.hasDigitalText,
    data: extractionBody.data
      ? {
          dataKeys: Object.keys(extractionBody.data).sort(),
          title: extractionBody.data.title,
          detectedLanguage: extractionBody.data.detectedLanguage,
          textDirection: extractionBody.data.textDirection,
          hasArabicText: extractionBody.data.hasArabicText,
          hasTables: extractionBody.data.hasTables,
          totalPages: extractionBody.data.totalPages,
          method: extractionBody.data.method,
          markdown: fingerprint(extractionBody.data.markdown ?? ''),
          plainText: fingerprint(extractionBody.data.plainText ?? ''),
        }
      : null,
    error: extractionBody.error ?? null,
  };

  // Malformed input: behavior must stay byte-identical too.
  const missingData = await fetch(`${BASE_URL}/api/extract-direct-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  results.missingPayload = {
    httpStatus: missingData.status,
    body: await missingData.json(),
  };

  return results;
}

const write = process.argv.includes('--write');
const captured = await capture();
mkdirSync(dirname(GOLDEN_PATH), { recursive: true });

if (write) {
  writeFileSync(GOLDEN_PATH, JSON.stringify(captured, null, 2) + '\n');
  console.log(`goldens written -> ${GOLDEN_PATH}`);
  console.log(`  extraction markdown sha256: ${captured.extraction.data?.markdown.sha256 ?? 'n/a'}`);
  console.log(`  extraction markdown length : ${captured.extraction.data?.markdown.length ?? 'n/a'}`);
} else {
  if (!existsSync(GOLDEN_PATH)) {
    console.error(`no goldens at ${GOLDEN_PATH}; run with --write first`);
    process.exit(2);
  }
  const expected = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  const before = JSON.stringify(expected);
  const after = JSON.stringify(captured);

  if (before === after) {
    console.log('PASS — behavior identical to committed goldens');
  } else {
    console.error('FAIL — behavior drifted from committed goldens');
    const a = expected.extraction?.data?.markdown?.sha256;
    const b = captured.extraction?.data?.markdown?.sha256;
    console.error(`  markdown sha256 expected: ${a}`);
    console.error(`  markdown sha256 actual  : ${b}`);
    if (a && b) console.error(`  length expected/actual  : ${expected.extraction.data.markdown.length} / ${captured.extraction.data.markdown.length}`);
    writeFileSync('/tmp/opencode/golden-actual.json', JSON.stringify(captured, null, 2));
    console.error('  actual captured -> /tmp/opencode/golden-actual.json');
    process.exit(1);
  }
}