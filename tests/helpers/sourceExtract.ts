/**
 * sourceExtract.ts — characterization harness for INLINE transforms.
 *
 * Many of the duplicated chains we must pin are not exported functions. They are
 * bare `.replace()` chains sitting inside an async component handler or an Express
 * route handler, e.g. `documentConverter.ts:725-736` and `server.ts`.
 *
 * They cannot be imported:
 *   - `server.ts` boots an Express listener on import, with no export at all.
 *   - `App.tsx` / `OutputViewer.tsx` drag in the whole DOM/JSZip/canvas graph.
 *
 * So we locate the chain IN THE REAL SOURCE TEXT and compile that text. Copying the
 * regexes into the test would pin a copy that keeps passing after the real file
 * changed, which is the one thing a characterization test must never do.
 *
 * LOCATING BY CONTENT, NOT BY LINE NUMBER
 * A line number is not a stable identity: deleting one import shifts every later
 * line, so a line-keyed harness breaks for reasons unrelated to the transform, and
 * it breaks precisely when the refactor we are guarding actually happens. Each
 * locator below is therefore a distinctive substring plus a direction, so it
 * survives unrelated edits elsewhere in the file.
 */
import fs from 'fs';
import path from 'path';
import { transformSync } from 'esbuild';

const ROOT = path.resolve(__dirname, '..', '..');

export function repoFile(relPath: string): string {
  return path.join(ROOT, relPath);
}

export function readSourceLines(relPath: string): string[] {
  return fs.readFileSync(repoFile(relPath), 'utf8').split('\n');
}

export function sourceText(relPath: string): string {
  return fs.readFileSync(repoFile(relPath), 'utf8');
}

/** 1-based inclusive line slice. Provided for reporting only, never for locating. */
export function sourceSlice(relPath: string, startLine: number, endLine: number): string {
  return readSourceLines(relPath).slice(startLine - 1, endLine).join('\n');
}

/** Finds the first 1-based line number containing `needle`, or throws. */
export function findLine(relPath: string, needle: string, from = 1): number {
  const lines = readSourceLines(relPath);
  for (let i = from - 1; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  throw new Error(`No line containing ${JSON.stringify(needle)} in ${relPath} (from line ${from})`);
}

export interface ExtractedChain {
  /** Raw source text of the chain (anchor line + continuation lines). */
  source: string;
  /** Identifier the chain is assigned to, e.g. `mergedPlainText`. */
  resultName: string;
  /** Identifier the chain reads from, e.g. `mergedMarkdown`. */
  inputName: string;
  /** Callable form of the chain: `fn(input)`. */
  fn: (input: string) => string;
  /** 1-based line numbers of the extracted region, for the report. */
  startLine: number;
  endLine: number;
}

/**
 * Strips a trailing `;` or `,` terminator, plus any trailing `// line comment`.
 *
 * Several chains annotate their last call (e.g. `.replace(/\$\$?/g, '$1'), // strip math dollars`).
 * That comment must go before the snippet is spliced into `new Function`, because the
 * closing paren we append lands on the same line and would be commented out.
 *
 * A `//` is only treated as a comment when everything before it has balanced
 * parentheses, so a `//` inside a regex literal or string is left alone.
 */
function stripTerminatorAndTrailingComment(line: string): string {
  // Trim first: a line ending in ", " would otherwise defeat the `[;,]$` strip
  // below and leave a dangling comma operator in the compiled snippet.
  let out = line.trim().replace(/[;,]$/, '');
  let searchFrom = 0;
  for (;;) {
    const idx = out.indexOf('//', searchFrom);
    if (idx === -1) break;
    const before = out.slice(0, idx);
    let depth = 0;
    for (const ch of before) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
    if (depth === 0) {
      out = before.trim().replace(/[;,]$/, '');
      break;
    }
    searchFrom = idx + 2;
  }
  return out;
}

/**
 * Compiles a `.replace()` chain out of the real source.
 *
 * `locator.anchor` is a distinctive substring on the first line of the chain, e.g.
 * `const mergedPlainText = mergedMarkdown`. Two shapes are supported, matching the
 * formatting convention at every duplicated site:
 *
 *   const mergedPlainText = mergedMarkdown   <- shape 'const'
 *         .replace(..)
 *   plainText: editedMarkdown                <- shape 'prop'
 *         .replace(..)
 *
 * Continuation lines are every following line whose trimmed form starts with `.`.
 */
export function extractChain(
  relPath: string,
  anchorNeedle: string,
  shape: 'const' | 'prop' = 'const',
): ExtractedChain {
  const lines = readSourceLines(relPath);
  const startLine = findLine(relPath, anchorNeedle);
  const anchor = lines[startLine - 1];

  let resultName: string;
  let inputName: string;
  let rhs: string;

  if (shape === 'const') {
    const m = anchor.match(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*$/);
    if (!m) {
      throw new Error(
        `Anchor ${relPath}:${startLine} is not "const NAME = INPUT": ${JSON.stringify(anchor)}`,
      );
    }
    [, resultName, inputName] = m;
    rhs = inputName;
  } else {
    const m = anchor.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*,?\s*$/);
    if (!m) {
      throw new Error(
        `Anchor ${relPath}:${startLine} is not "NAME: INPUT": ${JSON.stringify(anchor)}`,
      );
    }
    [, resultName, inputName] = m;
    rhs = inputName;
  }

  const collected: string[] = [];
  let endLine = startLine;
  for (let i = startLine; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t.startsWith('.')) break;
    collected.push(t);
    endLine = i + 1;
  }
  if (collected.length === 0) {
    throw new Error(`No continuation lines after ${relPath}:${startLine}`);
  }

  collected[collected.length - 1] = stripTerminatorAndTrailingComment(
    collected[collected.length - 1],
  );

  const source = `${anchor.trim()}\n${collected.join('\n')}`;
  let fn: (input: string) => string;
  try {
    fn = new Function(inputName, `return (${rhs}\n${collected.join('\n')});`) as (
      input: string,
    ) => string;
  } catch (err) {
    throw new Error(
      `Failed to compile chain at ${relPath}:${startLine}-${endLine}\n--- source ---\n${source}\n--- error ---\n${String(err)}`,
    );
  }

  return { source, resultName, inputName, fn, startLine, endLine };
}

/**
 * Compiles an arbitrary self-contained TS declaration (module-private helpers such as
 * `isArabicText`) read straight out of a source file. TS types are stripped by esbuild
 * so we execute the file's real text.
 *
 * `declNeedle` locates the declaration by content, for the same reason as above.
 */
export function extractFunction<T>(relPath: string, declNeedle: string, fnName: string): T {
  const lines = readSourceLines(relPath);
  const startLine = findLine(relPath, declNeedle);
  // Brace-match forward to find the end of the declaration.
  let depth = 0;
  let endLine = startLine;
  for (let i = startLine - 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    endLine = i + 1;
    if (depth <= 0 && i >= startLine - 1) break;
  }
  const raw = sourceSlice(relPath, startLine, endLine);
  const js = transformSync(raw, { loader: 'ts' }).code;
  return new Function(`${js}\nreturn ${fnName};`)() as T;
}

/**
 * Extracts a `.replace()` chain used as a call ARGUMENT, e.g. the `markdown:` property
 * in an object literal returned from a function, where the chain starts mid-expression.
 * Returns the chain source and a compiler producing `fn(input)`.
 */
export function extractChainAt(
  relPath: string,
  anchorNeedle: string,
): { source: string; fn: (input: string) => string; startLine: number; endLine: number } {
  const lines = readSourceLines(relPath);
  const startLine = findLine(relPath, anchorNeedle);
  const anchor = lines[startLine - 1];

  const m = anchor.match(/([A-Za-z_$][\w$]*)\s*$/);
  if (!m) throw new Error(`Cannot read input identifier from ${relPath}:${startLine}: ${anchor}`);
  const inputName = m[1];

  const collected: string[] = [];
  let endLine = startLine;
  for (let i = startLine; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t.startsWith('.')) break;
    collected.push(t);
    endLine = i + 1;
  }
  if (collected.length === 0) throw new Error(`No continuation lines after ${relPath}:${startLine}`);
  collected[collected.length - 1] = stripTerminatorAndTrailingComment(
    collected[collected.length - 1],
  );

  const source = `${anchor.trim()}\n${collected.join('\n')}`;
  const fn = new Function(inputName, `return (${inputName}\n${collected.join('\n')});`) as (
    input: string,
  ) => string;
  return { source, fn, startLine, endLine };
}