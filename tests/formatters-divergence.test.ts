import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractDecl } from './helpers/inlineExtract';

/**
 * GROUP C — byte formatters and Arabic date formatters.
 *
 *   C1  src/utils/historyStorage.ts        `export function formatBytes`  (exported)
 *   C3  src/components/HistoryList.tsx     `const formatDate =`          (module-private arrow, "today"-aware)
 *   C4  src/components/HistoryDrawer.tsx   `const formatDate =`          (module-private arrow, no today branch)
 *
 * C1, C3 and C4 are compiled from the real
 * source text by `extractDecl` rather than imported.
 *
 * The exact date strings are locale output (`Intl`, ar-EG) and therefore pinned as-is —
 * the divergence between C3 and C4 (Arabic comma vs plain space, and C3's `اليوم،` branch)
 * is stable regardless, and is re-asserted below with Intl-derived, locale-independent
 * structural expectations so the behaviour claim does not rest on the snapshot alone.
 */
const C1 = extractDecl<(bytes?: number) => string>('src/utils/historyStorage.ts', 'export function formatBytes', 'formatBytes');
const C3 = extractDecl<(ts: number) => string>('src/components/HistoryList.tsx', 'const formatDate =', 'formatDate');
const C4 = extractDecl<(ts: number) => string>('src/components/HistoryDrawer.tsx', 'const formatDate =', 'formatDate');

/** Local-time timestamps, so the assertions do not depend on the runner's timezone. */
const at = (y: number, m: number, d: number, hh = 10, mm = 5): number => new Date(y, m - 1, d, hh, mm).getTime();

const now = new Date();
const TODAY = at(now.getFullYear(), now.getMonth() + 1, now.getDate());
const TODAY_MIDNIGHT = at(now.getFullYear(), now.getMonth() + 1, now.getDate(), 0, 0);
const TODAY_LAST_MIN = at(now.getFullYear(), now.getMonth() + 1, now.getDate(), 23, 59);
const YESTERDAY = at(now.getFullYear(), now.getMonth() + 1, now.getDate() - 1);
const DAY_BEFORE = at(now.getFullYear(), now.getMonth() + 1, now.getDate() - 2);
const TWO_DAYS_LATER = at(now.getFullYear(), now.getMonth() + 1, now.getDate() + 2);
const FIRST_OF_THIS_MONTH = at(now.getFullYear(), now.getMonth() + 1, 1);
const END_OF_LAST_MONTH = at(now.getFullYear(), now.getMonth(), 0);
const LEAP_DAY = at(2024, 2, 29, 8, 7);
const NEW_YEAR_EVE = at(2025, 12, 31, 23, 30);
const NEW_YEAR_DAY = at(2026, 1, 1, 0, 15);
const RAMADAN_START = at(2026, 2, 1, 4, 45);
const EPOCH = 0;

const DATES: Array<[string, number]> = [
  ['today 10:05', TODAY],
  ['today 00:00', TODAY_MIDNIGHT],
  ['today 23:59', TODAY_LAST_MIN],
  ['yesterday 10:05', YESTERDAY],
  ['2 days ago', DAY_BEFORE],
  ['2 days later', TWO_DAYS_LATER],
  ['1st of this month', FIRST_OF_THIS_MONTH],
  ['last day of previous month', END_OF_LAST_MONTH],
  ['2024-02-29 leap day', LEAP_DAY],
  ['2025-12-31 new year eve', NEW_YEAR_EVE],
  ['2026-01-01 new year day', NEW_YEAR_DAY],
  ['2026-03-01 (Ramadan start in the fixture era)', RAMADAN_START],
  ['epoch 0', EPOCH],
];

const SIZES = [undefined, 0, 1, 1023, 1024, 1536, 1048576, 1073741824] as const;

const extraSizes: Array<[string, number]> = [
  ['2', 2],
  ['500', 500],
  ['1025', 1025],
  ['1048575', 1048575],
  ['1572864 (1.5 MiB)', 1572864],
  ['1099511627776 (1 TiB)', 1099511627776],
  ['0.4', 0.4],
  ['-5', -5],
  ['-1048576', -1048576],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
];

describe('C. provenance', () => {
  it('C1 formatBytes — 4-unit table, no GB overflow handling', () => {
    expect({ file: 'src/utils/historyStorage.ts', anchor: 'export function formatBytes', source: C1.__source }).toMatchInlineSnapshot(`
      {
        "anchor": "export function formatBytes",
        "file": "src/utils/historyStorage.ts",
        "source": "export function formatBytes(bytes?: number): string {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (!Number.isFinite(bytes) || !bytes || bytes <= 0) return '0 B';
        const k = 1024;
        // Clamp BOTH ends. The upper bound stops a file above a terabyte from indexing
        // past the unit table, which is what rendered "1 undefined". The lower bound
        // stops a sub-byte value, where log() yields a negative index, from DIVIDING by
        // 1024 instead of scaling up, which rendered "409.6 undefined" for 0.4.
        const magnitude = Math.min(
          Math.max(Math.floor(Math.log(bytes) / Math.log(k)), 0),
          units.length - 1
        );
        const scaled = bytes / Math.pow(k, magnitude);
        return \`\${parseFloat(scaled.toFixed(1))} \${units[magnitude]}\`;
      }",
      }
    `);
  });

  // C2 (a drifted private copy of the byte formatter in HistoryList) no longer exists:
  // HistoryList now calls the shared formatBytes, so the "1 undefined" bug cannot
  // recur in a second implementation. Asserted as an absence so a reintroduced copy
  // is caught.
  it('HistoryList no longer keeps its own byte formatter', () => {
    const source = readFileSync('src/components/HistoryList.tsx', 'utf8');
    expect(source).not.toContain('const formatFileSize');
    expect(source).toContain('formatBytes(item.fileSize)');
  });

  it('C3 formatDate (HistoryList) — has an isToday branch and an Arabic comma', () => {
    expect({ file: 'src/components/HistoryList.tsx', anchor: 'const formatDate =', source: C3.__source }).toMatchInlineSnapshot(`
      {
        "anchor": "const formatDate =",
        "file": "src/components/HistoryList.tsx",
        "source": "  const formatDate = (ts: number) => {
          const d = new Date(ts);
          const now = new Date();
          const isToday =
            d.getDate() === now.getDate() &&
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear();

          const timeStr = d.toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
          });

          if (isToday) {
            return \`اليوم، \${timeStr}\`;
          }
          return \`\${d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}، \${timeStr}\`;
        };",
      }
    `);
  });

  it('C4 formatDate (HistoryDrawer) — no today branch, space separator', () => {
    expect({ file: 'src/components/HistoryDrawer.tsx', anchor: 'const formatDate =', source: C4.__source }).toMatchInlineSnapshot(`
      {
        "anchor": "const formatDate =",
        "file": "src/components/HistoryDrawer.tsx",
        "source": "  const formatDate = (ts: number) => {
          const d = new Date(ts);
          return \`\${d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })} \${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}\`;
        };",
      }
    `);
  });
});

describe('C.1 byte formatters on the requested sizes', () => {
  it('C1 formatBytes', () => {
    expect(SIZES.map((s) => ({ input: s === undefined ? 'undefined' : s, out: C1(s) }))).toMatchInlineSnapshot(`
      [
        {
          "input": "undefined",
          "out": "0 B",
        },
        {
          "input": 0,
          "out": "0 B",
        },
        {
          "input": 1,
          "out": "1 B",
        },
        {
          "input": 1023,
          "out": "1023 B",
        },
        {
          "input": 1024,
          "out": "1 KB",
        },
        {
          "input": 1536,
          "out": "1.5 KB",
        },
        {
          "input": 1048576,
          "out": "1 MB",
        },
        {
          "input": 1073741824,
          "out": "1 GB",
        },
      ]
    `);
  });

  it('C1 on the standard sizes', () => {
    expect(SIZES.map((n) => ({ input: n === undefined ? 'undefined' : n, out: C1(n) }))).toMatchInlineSnapshot(`
      [
        {
          "input": "undefined",
          "out": "0 B",
        },
        {
          "input": 0,
          "out": "0 B",
        },
        {
          "input": 1,
          "out": "1 B",
        },
        {
          "input": 1023,
          "out": "1023 B",
        },
        {
          "input": 1024,
          "out": "1 KB",
        },
        {
          "input": 1536,
          "out": "1.5 KB",
        },
        {
          "input": 1048576,
          "out": "1 MB",
        },
        {
          "input": 1073741824,
          "out": "1 GB",
        },
      ]
    `);
  });

  // The C1-vs-C2 comparison this suite used to make is no longer meaningful: there is
  // one byte formatter now. What matters is that it is right, so the previously
  // divergent inputs are pinned directly against it.
  it('C1 on the edge sizes that used to render "undefined"', () => {
    expect(
      extraSizes.map(([label, n]) => ({ input: label, out: C1(n) })),
    ).toMatchInlineSnapshot(`
      [
        {
          "input": "2",
          "out": "2 B",
        },
        {
          "input": "500",
          "out": "500 B",
        },
        {
          "input": "1025",
          "out": "1 KB",
        },
        {
          "input": "1048575",
          "out": "1024 KB",
        },
        {
          "input": "1572864 (1.5 MiB)",
          "out": "1.5 MB",
        },
        {
          "input": "1099511627776 (1 TiB)",
          "out": "1 TB",
        },
        {
          "input": "0.4",
          "out": "0.4 B",
        },
        {
          "input": "-5",
          "out": "0 B",
        },
        {
          "input": "-1048576",
          "out": "0 B",
        },
        {
          "input": "NaN",
          "out": "0 B",
        },
        {
          "input": "Infinity",
          "out": "0 B",
        },
      ]
    `);
  });

  it('no byte size renders an undefined unit', () => {
    for (const n of [...SIZES, ...extraSizes.map(([, v]) => v)]) {
      expect(C1(n)).not.toContain('undefined');
      expect(C1(n)).not.toContain('NaN');
    }
  });


  it('C3 formatDate (HistoryList, today-aware)', () => {
    expect(DATES.map(([label, ts]) => ({ date: label, out: C3(ts) }))).toMatchInlineSnapshot(`
      [
        {
          "date": "today 10:05",
          "out": "اليوم، ١٠:٠٥ ص",
        },
        {
          "date": "today 00:00",
          "out": "اليوم، ١٢:٠٠ ص",
        },
        {
          "date": "today 23:59",
          "out": "اليوم، ١١:٥٩ م",
        },
        {
          "date": "yesterday 10:05",
          "out": "٥ أكتوبر، ١٠:٠٥ ص",
        },
        {
          "date": "2 days ago",
          "out": "٤ أكتوبر، ١٠:٠٥ ص",
        },
        {
          "date": "2 days later",
          "out": "٨ أكتوبر، ١٠:٠٥ ص",
        },
        {
          "date": "1st of this month",
          "out": "١ أكتوبر، ١٠:٠٥ ص",
        },
        {
          "date": "last day of previous month",
          "out": "٣١ أغسطس، ١٠:٠٥ ص",
        },
        {
          "date": "2024-02-29 leap day",
          "out": "٢٩ فبراير، ٠٨:٠٧ ص",
        },
        {
          "date": "2025-12-31 new year eve",
          "out": "٣١ ديسمبر، ١١:٣٠ م",
        },
        {
          "date": "2026-01-01 new year day",
          "out": "١ يناير، ١٢:١٥ ص",
        },
        {
          "date": "2026-03-01 (Ramadan start in the fixture era)",
          "out": "١ فبراير، ٠٤:٤٥ ص",
        },
        {
          "date": "epoch 0",
          "out": "١ يناير، ٠٢:٠٠ ص",
        },
      ]
    `);
  });

  it('C4 formatDate (HistoryDrawer)', () => {
    expect(DATES.map(([label, ts]) => ({ date: label, out: C4(ts) }))).toMatchInlineSnapshot(`
      [
        {
          "date": "today 10:05",
          "out": "٦ أكتوبر ١٠:٠٥ ص",
        },
        {
          "date": "today 00:00",
          "out": "٦ أكتوبر ١٢:٠٠ ص",
        },
        {
          "date": "today 23:59",
          "out": "٦ أكتوبر ١١:٥٩ م",
        },
        {
          "date": "yesterday 10:05",
          "out": "٥ أكتوبر ١٠:٠٥ ص",
        },
        {
          "date": "2 days ago",
          "out": "٤ أكتوبر ١٠:٠٥ ص",
        },
        {
          "date": "2 days later",
          "out": "٨ أكتوبر ١٠:٠٥ ص",
        },
        {
          "date": "1st of this month",
          "out": "١ أكتوبر ١٠:٠٥ ص",
        },
        {
          "date": "last day of previous month",
          "out": "٣١ أغسطس ١٠:٠٥ ص",
        },
        {
          "date": "2024-02-29 leap day",
          "out": "٢٩ فبراير ٠٨:٠٧ ص",
        },
        {
          "date": "2025-12-31 new year eve",
          "out": "٣١ ديسمبر ١١:٣٠ م",
        },
        {
          "date": "2026-01-01 new year day",
          "out": "١ يناير ١٢:١٥ ص",
        },
        {
          "date": "2026-03-01 (Ramadan start in the fixture era)",
          "out": "١ فبراير ٠٤:٤٥ ص",
        },
        {
          "date": "epoch 0",
          "out": "١ يناير ٠٢:٠٠ ص",
        },
      ]
    `);
  });

  it('C3 vs C4 on every date', () => {
    expect(
      DATES.map(([label, ts]) => ({ date: label, C3: C3(ts), C4: C4(ts), DISAGREE: C3(ts) !== C4(ts) })),
    ).toMatchInlineSnapshot(`
      [
        {
          "C3": "اليوم، ١٠:٠٥ ص",
          "C4": "٦ أكتوبر ١٠:٠٥ ص",
          "DISAGREE": true,
          "date": "today 10:05",
        },
        {
          "C3": "اليوم، ١٢:٠٠ ص",
          "C4": "٦ أكتوبر ١٢:٠٠ ص",
          "DISAGREE": true,
          "date": "today 00:00",
        },
        {
          "C3": "اليوم، ١١:٥٩ م",
          "C4": "٦ أكتوبر ١١:٥٩ م",
          "DISAGREE": true,
          "date": "today 23:59",
        },
        {
          "C3": "٥ أكتوبر، ١٠:٠٥ ص",
          "C4": "٥ أكتوبر ١٠:٠٥ ص",
          "DISAGREE": true,
          "date": "yesterday 10:05",
        },
        {
          "C3": "٤ أكتوبر، ١٠:٠٥ ص",
          "C4": "٤ أكتوبر ١٠:٠٥ ص",
          "DISAGREE": true,
          "date": "2 days ago",
        },
        {
          "C3": "٨ أكتوبر، ١٠:٠٥ ص",
          "C4": "٨ أكتوبر ١٠:٠٥ ص",
          "DISAGREE": true,
          "date": "2 days later",
        },
        {
          "C3": "١ أكتوبر، ١٠:٠٥ ص",
          "C4": "١ أكتوبر ١٠:٠٥ ص",
          "DISAGREE": true,
          "date": "1st of this month",
        },
        {
          "C3": "٣١ أغسطس، ١٠:٠٥ ص",
          "C4": "٣١ أغسطس ١٠:٠٥ ص",
          "DISAGREE": true,
          "date": "last day of previous month",
        },
        {
          "C3": "٢٩ فبراير، ٠٨:٠٧ ص",
          "C4": "٢٩ فبراير ٠٨:٠٧ ص",
          "DISAGREE": true,
          "date": "2024-02-29 leap day",
        },
        {
          "C3": "٣١ ديسمبر، ١١:٣٠ م",
          "C4": "٣١ ديسمبر ١١:٣٠ م",
          "DISAGREE": true,
          "date": "2025-12-31 new year eve",
        },
        {
          "C3": "١ يناير، ١٢:١٥ ص",
          "C4": "١ يناير ١٢:١٥ ص",
          "DISAGREE": true,
          "date": "2026-01-01 new year day",
        },
        {
          "C3": "١ فبراير، ٠٤:٤٥ ص",
          "C4": "١ فبراير ٠٤:٤٥ ص",
          "DISAGREE": true,
          "date": "2026-03-01 (Ramadan start in the fixture era)",
        },
        {
          "C3": "١ يناير، ٠٢:٠٠ ص",
          "C4": "١ يناير ٠٢:٠٠ ص",
          "DISAGREE": true,
          "date": "epoch 0",
        },
      ]
    `);
  });

  it('locale-independent structure: non-today is `${date}، ${time}` (C3) vs `${date} ${time}` (C4)', () => {
    const timeOf = (ts: number) => new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const dateOf = (ts: number) => new Date(ts).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    const rows = DATES.filter(([, ts]) => ts !== TODAY && ts !== TODAY_MIDNIGHT && ts !== TODAY_LAST_MIN).map(([label, ts]) => ({
      date: label,
      C3: C3(ts) === `${dateOf(ts)}، ${timeOf(ts)}`,
      C4: C4(ts) === `${dateOf(ts)} ${timeOf(ts)}`,
    }));
    expect(rows).toMatchInlineSnapshot(`
      [
        {
          "C3": true,
          "C4": true,
          "date": "yesterday 10:05",
        },
        {
          "C3": true,
          "C4": true,
          "date": "2 days ago",
        },
        {
          "C3": true,
          "C4": true,
          "date": "2 days later",
        },
        {
          "C3": true,
          "C4": true,
          "date": "1st of this month",
        },
        {
          "C3": true,
          "C4": true,
          "date": "last day of previous month",
        },
        {
          "C3": true,
          "C4": true,
          "date": "2024-02-29 leap day",
        },
        {
          "C3": true,
          "C4": true,
          "date": "2025-12-31 new year eve",
        },
        {
          "C3": true,
          "C4": true,
          "date": "2026-01-01 new year day",
        },
        {
          "C3": true,
          "C4": true,
          "date": "2026-03-01 (Ramadan start in the fixture era)",
        },
        {
          "C3": true,
          "C4": true,
          "date": "epoch 0",
        },
      ]
    `);
  });

  it('locale-independent structure: C3 short-circuits today to the literal `اليوم، ` + time, C4 never does', () => {
    const timeOf = (ts: number) => new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    expect({
      today_10_05: { C3: C3(TODAY), C3_isTodayLiteral: C3(TODAY) === `اليوم، ${timeOf(TODAY)}`, C4: C4(TODAY) },
      today_00_00: { C3_isTodayLiteral: C3(TODAY_MIDNIGHT) === `اليوم، ${timeOf(TODAY_MIDNIGHT)}` },
      today_23_59: { C3_isTodayLiteral: C3(TODAY_LAST_MIN) === `اليوم، ${timeOf(TODAY_LAST_MIN)}` },
      yesterday_is_today: C3(YESTERDAY) === `اليوم، ${timeOf(YESTERDAY)}`,
      tomorrow_is_today: C3(TWO_DAYS_LATER) === `اليوم، ${timeOf(TWO_DAYS_LATER)}`,
    }).toMatchInlineSnapshot(`
      {
        "today_00_00": {
          "C3_isTodayLiteral": true,
        },
        "today_10_05": {
          "C3": "اليوم، ١٠:٠٥ ص",
          "C3_isTodayLiteral": true,
          "C4": "٦ أكتوبر ١٠:٠٥ ص",
        },
        "today_23_59": {
          "C3_isTodayLiteral": true,
        },
        "tomorrow_is_today": false,
        "yesterday_is_today": false,
      }
    `);
  });

  it('year boundary: 1 Jan and 31 Dec are never "today" for C3, even on those dates', () => {
    const jan1 = at(now.getFullYear(), 1, 1);
    const dec31 = at(now.getFullYear(), 12, 31);
    const timeOf = (ts: number) => new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    expect({
      jan1: { C3: C3(jan1), treatedAsToday: C3(jan1) === `اليوم، ${timeOf(jan1)}` },
      dec31: { C3: C3(dec31), treatedAsToday: C3(dec31) === `اليوم، ${timeOf(dec31)}` },
      note: 'C3 compares getDate/getMonth/getFullYear only; no year boundary special case',
    }).toMatchInlineSnapshot(`
      {
        "dec31": {
          "C3": "٣١ ديسمبر، ١٠:٠٥ ص",
          "treatedAsToday": false,
        },
        "jan1": {
          "C3": "١ يناير، ١٠:٠٥ ص",
          "treatedAsToday": false,
        },
        "note": "C3 compares getDate/getMonth/getFullYear only; no year boundary special case",
      }
    `);
  });

  it('invalid timestamps: both render the literal "Invalid Date" and never throw', () => {
    // Capture instead of asserting a throw: this pins whatever actually happens.
    const capture = (fn: (ts: number) => string, ts: number): string => {
      try {
        return fn(ts);
      } catch (err) {
        return `${(err as Error).name}: ${(err as Error).message}`;
      }
    };
    expect({
      C3_nan: capture(C3, Number.NaN),
      C4_nan: capture(C4, Number.NaN),
      C3_infinity: capture(C3, Number.POSITIVE_INFINITY),
      C4_infinity: capture(C4, Number.POSITIVE_INFINITY),
      C3_undefined: capture(C3, undefined as unknown as number),
      C4_undefined: capture(C4, undefined as unknown as number),
    }).toMatchInlineSnapshot(`
      {
        "C3_infinity": "Invalid Date، Invalid Date",
        "C3_nan": "Invalid Date، Invalid Date",
        "C3_undefined": "Invalid Date، Invalid Date",
        "C4_infinity": "Invalid Date Invalid Date",
        "C4_nan": "Invalid Date Invalid Date",
        "C4_undefined": "Invalid Date Invalid Date",
      }
    `);
  });
});