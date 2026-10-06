/**
 * inlineExtract.ts — characterization harness #2, for expressions the existing
 * `sourceExtract.ts` cannot reach.
 *
 * `sourceExtract.ts` compiles `.replace()` CHAINS that start with `const NAME = INPUT`
 * or `NAME: INPUT`, and whole function declarations. Several of the duplicated snippets
 * in this suite are none of those:
 *
 *   - plain self-assignment chains:  `cleaned = cleaned` + `.replace(..)` (server.ts)
 *   - runs of one-line self-assignments: `corrected = corrected.replace(..)` (quranAuditor)
 *   - single-line RHS expressions:    `const isArabic = (md.match(..) || []).length > 20`
 *   - `if (...)` CONDITIONS, multi-line, in an assignment position: the truncation guards
 *   - a run of `const isPdf = ..` / `const isImg = ..` predicate lines (Dropzone)
 *   - a JSX attribute string: `accept="..."`
 *
 * So this file locates each of those BY CONTENT (never by line number, same rule as
 * sourceExtract) and compiles the real source text. Nothing is re-typed here: if the
 * production file changes, these tests break.
 *
 * Everything is compiled with `new Function`, so nothing in `src/` is imported and no
 * React / DOM / IndexedDB / Express module is ever loaded.
 */
import { transformSync } from 'esbuild';
import { findLine, readSourceLines } from './sourceExtract';

/* ------------------------------------------------------------------ lexing helpers */

/** Removes `//` comments that are not inside a regex/char class, and `/* *\/` blocks. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let inStr: string | null = null;
  let inRe = false;
  let inClass = false;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (inStr) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (inRe) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) inRe = false;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '/') {
      inRe = true;
      out += ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Blanks out string + regex literal bodies so identifier scanning cannot see inside them. */
function maskLiterals(src: string): string {
  let out = '';
  let i = 0;
  let inStr: string | null = null;
  let inRe = false;
  let inClass = false;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (inStr) {
      out += ch === '\n' ? ch : ' ';
      if (ch === '\\') {
        out += next === '\n' ? '\n' : ' ';
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (inRe) {
      out += ch === '\n' ? ch : ' ';
      if (ch === '\\') {
        out += next === '\n' ? '\n' : ' ';
        i += 2;
        continue;
      }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) {
        inRe = false;
        // Swallow trailing flags so `/x/i` does not leak a bogus identifier `i`.
        while (i + 1 < src.length && /[a-z]/i.test(src[i + 1])) {
          out += ' ';
          i++;
        }
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/') {
      inRe = true;
      out += ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const GLOBALS = new Set([
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'this',
  'const', 'let', 'var', 'return', 'if', 'else', 'function', 'new', 'typeof',
  'in', 'of', 'instanceof', 'void', 'delete', 'switch', 'case', 'default',
  'break', 'continue', 'do', 'while', 'for', 'try', 'catch', 'finally', 'throw',
  'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date',
  'RegExp', 'Error', 'Promise', 'Set', 'Map', 'Symbol', 'BigInt',
  'parseFloat', 'parseInt', 'isNaN', 'isFinite', 'encodeURIComponent',
  'console', 'window', 'document', 'Intl', 'globalThis', 'undefined_',
]);

/**
 * Free identifiers referenced by an expression (literals and comments removed).
 * Property names (`file.name`, `res?.type`) and regex flags are excluded, so only real
 * inputs are reported.
 */
export function freeIdentifiers(expr: string): string[] {
  const masked = maskLiterals(stripComments(expr));
  const found: string[] = [];
  for (const m of masked.matchAll(/(?<![.\w$])[A-Za-z_$][\w$]*/g)) {
    const name = m[0];
    if (GLOBALS.has(name)) continue;
    if (found.includes(name)) continue;
    found.push(name);
  }
  return found;
}

/** Strips a trailing `;`/`,` and a trailing `// comment` from a single source line. */
function stripTerminator(line: string): string {
  let out = line.trim();
  out = out.replace(/[;,]$/, '');
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

/* --------------------------------------------------------------- generic compiler */

export interface CompiledExpr {
  /** Raw source text that was extracted. */
  source: string;
  /** The compiled expression itself (post-`=` / post-`if (`), for the report. */
  expr: string;
  /** Identifiers the expression reads; every one must be supplied in `bindings`. */
  vars: string[];
  /** 1-based first line of the extracted region. */
  startLine: number;
  /** 1-based last line of the extracted region. */
  endLine: number;
  /** Evaluates the expression. Unknown bindings are a hard error, never `undefined`. */
  fn: (bindings?: Record<string, unknown>) => unknown;
}

/**
 * Compiles `expr` so that each free identifier becomes a `const` fed from the bindings
 * object. Declaring them (instead of passing them as parameters) keeps dotted inputs
 * such as `chunkData.markdown` or `contextualResult.correctedMarkdown` working exactly
 * as written in the source.
 */
function compileExpr(
  relPath: string,
  source: string,
  expr: string,
  startLine: number,
  endLine: number,
): CompiledExpr {
  const vars = freeIdentifiers(expr);
  const decls = vars.map((v) => `${v} = __bindings[${JSON.stringify(v)}]`).join(', ');
  const body = `const ${decls};\nreturn (${expr});`;
  let raw: unknown;
  try {
    raw = new Function('__bindings', body);
  } catch (err) {
    throw new Error(
      `Failed to compile expression at ${relPath}:${startLine}-${endLine}\n--- source ---\n${source}\n--- error ---\n${String(err)}`,
    );
  }
  const fn = (bindings: Record<string, unknown> = {}): unknown => {
    const missing = vars.filter((v) => !(v in bindings));
    if (missing.length) {
      throw new Error(
        `Expression from ${relPath}:${startLine} needs bindings for ${missing.join(', ')}; got ${JSON.stringify(Object.keys(bindings))}`,
      );
    }
    return (raw as (b: Record<string, unknown>) => unknown)(bindings);
  };
  return { source, expr, vars, startLine, endLine, fn };
}

/* --------------------------------------------------- `const X = EXPR;` one-liners */

/**
 * Extracts the right-hand side of an assignment / property initializer found by content.
 *
 *   const isArabic = (finalMarkdown.match(/[\u0600-\u06FF]/g) || []).length > 20;   -> "const isArabic = ..."
 *   plainText: editedMarkdown                                                       -> "plainText: editedMarkdown"
 *   const baseName = (result.fileName || 'document').replace(/\.pdf$/i, '');       -> "const baseName = ..."
 *   title: parsed.title || currentFile.name.replace(/\.[^/.]+$/, ''),                -> "title: ..."
 *
 * `=` is tried first, then the `name: value` property form. Splitting on the FIRST `=`
 * is safe because the identifier to the left of a real assignment is a plain word, so no
 * `>` `<` `=` `?` `:` `!` precedes it on the line.
 */
export function extractRhs(
  relPath: string,
  anchorNeedle: string,
  opts: { from?: number } = {},
): CompiledExpr {
  const lines = readSourceLines(relPath);
  const startLine = findLine(relPath, anchorNeedle, opts.from ?? 1);
  const anchor = lines[startLine - 1];
  let rhs: string;
  const eq = anchor.indexOf('=');
  // `=` at the start of an operator (`===`) is not an assignment.
  if (eq !== -1 && !anchor.startsWith('=') && /^\s*(?:const\s+|let\s+|var\s+)?[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*=(?!=)/.test(anchor)) {
    rhs = anchor.slice(eq + 1);
  } else {
    const prop = anchor.match(/^\s*(?:[A-Za-z_$][\w$]*|"[^"]*"|'[^']*')\s*:\s*(.+)$/);
    const branch = anchor.match(/^\s*[?:]\s*(.+)$/);
    if (prop) rhs = prop[1];
    else if (branch) rhs = branch[1];
    else throw new Error(`No assignment on ${relPath}:${startLine}: ${anchor}`);
  }
  rhs = stripTerminator(rhs);
  if (!rhs) throw new Error(`Empty right-hand side at ${relPath}:${startLine}: ${anchor}`);
  return compileExpr(relPath, anchor.trim(), rhs, startLine, startLine);
}

/* ------------------------------------------------------------ `if (...)` conditions */

/**
 * Extracts an `if (...)` condition, multi-line included, and compiles it to a predicate.
 *
 * Handles all three shapes present in this repo:
 *   if (EXPR) {                          one line
 *   if (\n  EXPR ||\n  EXPR\n) {         multi-line, balanced-paren gather
 *   if (EXPR) { ... where EXPR itself opens a paren group
 */
export function extractIfCondition(
  relPath: string,
  anchorNeedle: string,
  opts: { from?: number } = {},
): CompiledExpr {
  const lines = readSourceLines(relPath);
  const hitLine = findLine(relPath, anchorNeedle, opts.from ?? 1);
  // A multi-line `if (` puts the `if` keyword on its own line; walk back to it so the
  // gathered text starts at the real statement.
  let startLine = hitLine;
  if (!/\bif\b/.test(lines[startLine - 1])) {
    let probe = startLine;
    while (probe > 1 && !/^\s*if\b/.test(lines[probe - 2])) probe--;
    if (probe === 1 || !/^\s*if\b/.test(lines[probe - 2])) {
      throw new Error(
        `No enclosing "if" above ${relPath}:${hitLine} for needle ${JSON.stringify(anchorNeedle)}`,
      );
    }
    startLine = probe - 1;
  }
  let text = lines[startLine - 1];
  const ifIdx = text.indexOf('if');
  if (ifIdx === -1) throw new Error(`No "if" on ${relPath}:${startLine}: ${text}`);
  let after = text.slice(ifIdx + 2);
  let depth = 0;
  let opened = false;
  for (const ch of after) {
    if (ch === '(') {
      depth++;
      opened = true;
    } else if (ch === ')') depth--;
  }
  let endLine = startLine;
  while (opened && depth > 0 && endLine < lines.length) {
    const next = lines[endLine];
    endLine++;
    after += `\n${next}`;
    for (const ch of next) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
  }
  const close = after.lastIndexOf(')');
  if (close === -1) throw new Error(`Unbalanced "if (" at ${relPath}:${startLine}`);
  const expr = stripComments(after.slice(after.indexOf('(') + 1, close)).trim();
  return compileExpr(
    relPath,
    lines.slice(startLine - 1, endLine).join('\n').trim(),
    expr,
    startLine,
    endLine,
  );
}

/* -------------------------------------------- self-assignment `.replace()` chains */

export interface CompiledChain extends CompiledExpr {
  /** Number of `.replace()` steps actually collected (i.e. chain length). */
  steps: number;
  /** Just the `.replace()` continuation lines, in order, stripped of comments. */
  chainSource: string;
}

/**
 * Compiles `NAME = INPUT` followed by `.replace()` continuation lines, for the
 * non-`const` self-assignment style used in `server.ts` (`cleaned = cleaned` + `.replace`).
 *
 * Standalone `// comment` lines interleaved in the chain are kept in `source` for the
 * report but dropped from the compiled text, so a re-indented comment cannot silently
 * change the compiled expression.
 */
export function extractAssignmentChain(
  relPath: string,
  anchorNeedle: string,
  opts: { from?: number } = {},
): CompiledChain {
  const lines = readSourceLines(relPath);
  const startLine = findLine(relPath, anchorNeedle, opts.from ?? 1);
  const anchor = lines[startLine - 1];
  const m = anchor.match(/^\s*(?:const\s+|let\s+|var\s+)?([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*;?\s*$/);
  if (!m) {
    throw new Error(
      `Anchor ${relPath}:${startLine} is not "NAME = INPUT": ${JSON.stringify(anchor)}`,
    );
  }
  const inputExpr = m[2];
  const rawLines: string[] = [];
  const callLines: string[] = [];
  let endLine = startLine;
  for (let i = startLine; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '') break;
    if (t.startsWith('//')) {
      rawLines.push(t);
      continue;
    }
    if (!t.startsWith('.')) break;
    rawLines.push(t);
    callLines.push(t);
    endLine = i + 1;
  }
  if (callLines.length === 0) {
    throw new Error(`No ".replace()" continuation lines after ${relPath}:${startLine}`);
  }
  callLines[callLines.length - 1] = stripTerminator(callLines[callLines.length - 1]);
  const chainSource = callLines.join('\n');
  const source = [anchor.trim(), ...rawLines].join('\n');
  const compiled = compileExpr(
    relPath,
    source,
    `${inputExpr}\n${chainSource}`,
    startLine,
    endLine,
  );
  return { ...compiled, steps: callLines.length, chainSource };
}

/* ------------------------------------- runs of one-line `X = X.replace(...)` lines */

export interface CompiledStatementRun extends CompiledExpr {
  /** The statement lines, terminators stripped, as compiled. */
  statements: string[];
}

/**
 * Compiles a run of consecutive one-line self-assignments such as
 *
 *   corrected = corrected.replace(/\.{6,}/g, '.....');
 *   corrected = corrected.replace(/^[ \t]*(\.[ \t]*){5,}$/gm, '.....');
 *   corrected = corrected.replace(/(\n[ \t]*\.\.\.\.\.[ \t]*){2,}/g, '\n.....\n');
 *
 * `opts.count` stops the run; blank / comment lines between statements are skipped, any
 * other line ends it.
 */
export function extractStatementRun(
  relPath: string,
  anchorNeedle: string,
  opts: { from?: number; count?: number } = {},
): CompiledStatementRun {
  const lines = readSourceLines(relPath);
  const startLine = findLine(relPath, anchorNeedle, opts.from ?? 1);
  const statements: string[] = [];
  const rawLines: string[] = [];
  let endLine = startLine;
  for (let i = startLine - 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '' || t.startsWith('//')) {
      if (statements.length) break;
      continue;
    }
    const m = t.match(/^([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.[\s\S]+$/);
    if (!m || m[1] !== m[2]) break;
    statements.push(stripTerminator(t));
    rawLines.push(t);
    endLine = i + 1;
    if (opts.count !== undefined && statements.length >= opts.count) break;
  }
  if (statements.length === 0) {
    throw new Error(`No self-assignment statements at ${relPath}:${startLine}`);
  }
  const source = rawLines.join('\n');
  // The statements REASSIGN their target (`corrected = corrected.replace(..)`), so the
  // target has to be a `let` seeded from the bindings, not a `const`.
  const targets = [...new Set(statements.map((s) => (s.match(/^([A-Za-z_$][\w$]*)\s*=/) as RegExpMatchArray)[1]))];
  const decls = targets.map((v) => `let ${v} = __bindings[${JSON.stringify(v)}]`).join('; ');
  const vars = targets;
  const expr = `(() => { ${decls}; ${statements.join('\n')}; return (${targets[targets.length - 1]}); })()`;
  let raw: unknown;
  try {
    raw = new Function('__bindings', `return ${expr};`);
  } catch (err) {
    throw new Error(
      `Failed to compile statement run at ${relPath}:${startLine}-${endLine}\n--- source ---\n${source}\n--- error ---\n${String(err)}`,
    );
  }
  const fn = (bindings: Record<string, unknown> = {}): unknown => {
    const missing = vars.filter((v) => !(v in bindings));
    if (missing.length) {
      throw new Error(
        `Statement run from ${relPath}:${startLine} needs bindings for ${missing.join(', ')}`,
      );
    }
    return (raw as (b: Record<string, unknown>) => unknown)(bindings);
  };
  return { source, expr, vars, startLine, endLine, fn, statements };
}

/* ------------------------------------------ runs of `const X = ..;` predicate lines */

/**
 * Compiles N consecutive `const NAME = ...;` lines and returns `returnExpr` evaluated
 * in their scope. Used for the Dropzone file-sniffing predicates, whose `file` input is
 * read off the real lines rather than re-declared here.
 */
export function extractConstBlock(
  relPath: string,
  anchorNeedle: string,
  opts: { from?: number; count: number; returnExpr: string },
): CompiledExpr {
  const lines = readSourceLines(relPath);
  const startLine = findLine(relPath, anchorNeedle, opts.from ?? 1);
  const collected: string[] = [];
  let endLine = startLine;
  for (let i = startLine - 1; i < lines.length && collected.length < opts.count; i++) {
    const t = lines[i].trim();
    if (!t.startsWith('const ')) break;
    collected.push(stripTerminator(t));
    endLine = i + 1;
  }
  if (collected.length !== opts.count) {
    throw new Error(
      `Wanted ${opts.count} "const" lines from ${relPath}:${startLine}, found ${collected.length}`,
    );
  }
  const block = collected.join('\n');
  const declared = collected
    .map((l) => l.match(/^const\s+([A-Za-z_$][\w$]*)/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1]);
  const vars = freeIdentifiers(block).filter((v) => !declared.includes(v));
  const decls = vars.map((v) => `${v} = __bindings[${JSON.stringify(v)}]`).join(', ');
  const body = `const ${decls};\n${block}\nreturn (${opts.returnExpr});`;
  let raw: unknown;
  try {
    raw = new Function('__bindings', body);
  } catch (err) {
    throw new Error(
      `Failed to compile const block at ${relPath}:${startLine}-${endLine}\n--- source ---\n${block}\n--- error ---\n${String(err)}`,
    );
  }
  const fn = (bindings: Record<string, unknown> = {}): unknown => {
    const missing = vars.filter((v) => !(v in bindings));
    if (missing.length) {
      throw new Error(
        `Const block from ${relPath}:${startLine} needs bindings for ${missing.join(', ')}`,
      );
    }
    return (raw as (b: Record<string, unknown>) => unknown)(bindings);
  };
  return {
    source: block,
    expr: block,
    vars,
    startLine,
    endLine,
    fn,
  };
}

/* ------------------------------------------------------- raw expression on a line */

/**
 * Compiles a line's trimmed text verbatim as an expression, binding its free identifiers.
 * Used for inline callbacks such as Dropzone's
 * `(f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(f.name)`,
 * which sits inside a `.some(...)` call rather than an `if`.
 *
 * `opts.trim` is a regex source applied to the trimmed line before compiling — needed when
 * the line ends with the enclosing call's own `)` or `,`.
 */
export function extractRawExpression(
  relPath: string,
  anchorNeedle: string,
  opts: { from?: number; trim?: string } = {},
): CompiledExpr {
  const lines = readSourceLines(relPath);
  const startLine = findLine(relPath, anchorNeedle, opts.from ?? 1);
  let line = lines[startLine - 1].trim();
  if (opts.trim) line = line.replace(new RegExp(opts.trim), '');
  return compileExpr(relPath, lines[startLine - 1].trim(), line, startLine, startLine);
}

/* ------------------------------------------------------- JSX / HTML attribute text */

export interface ExtractedAttr {
  /** The attribute value exactly as written. */
  value: string;
  /** Value split on commas; `image/*` and the two MIME types stay as single tokens. */
  tokens: string[];
  source: string;
  startLine: number;
  endLine: number;
}

/** Extracts a double-quoted attribute value (`accept="..."`) found by content anchor. */
export function extractAttr(
  relPath: string,
  anchorNeedle: string,
  attr: string,
  opts: { from?: number } = {},
): ExtractedAttr {
  const lines = readSourceLines(relPath);
  const startLine = findLine(relPath, anchorNeedle, opts.from ?? 1);
  const line = lines[startLine - 1];
  const re = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`);
  const m = line.match(re);
  if (!m) throw new Error(`No ${attr}="..." on ${relPath}:${startLine}: ${line}`);
  return {
    value: m[1],
    tokens: m[1].split(',').map((t) => t.trim()),
    source: line.trim(),
    startLine,
    endLine: startLine,
  };
}

/* ---------------------------------------------------- whole declarations (incl. export) */

/**
 * Compiles a function declaration or const-arrow, optionally `export`ed, and returns the
 * callable. Same intent as `extractFunction` in sourceExtract.ts, but tolerates the
 * `export` keyword (which `new Function` cannot parse) and reports line numbers.
 *
 * `opts.module` compiles the WHOLE file instead of just the declaration, which is required
 * when the function calls module-private siblings (e.g. `isRightToLeftText` calling
 * `countArabicCharacters`). Use it only for import-free, side-effect-free modules; an
 * `import` statement in the file will make compilation fail with the real reason.
 */
export function extractDecl<T>(
  relPath: string,
  declNeedle: string,
  fnName: string,
  opts: { module?: boolean } = {},
): T & { __startLine: number; __endLine: number; __source: string } {
  const lines = readSourceLines(relPath);
  let raw: string;
  let startLine: number;
  let endLine: number;
  if (opts.module) {
    raw = lines.join('\n');
    startLine = 1;
    endLine = lines.length;
  } else {
    startLine = findLine(relPath, declNeedle);
    let depth = 0;
    endLine = startLine;
    let opened = false;
    for (let i = startLine - 1; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          depth++;
          opened = true;
        } else if (ch === '}') depth--;
      }
      endLine = i + 1;
      if (opened && depth <= 0) break;
    }
    raw = lines.slice(startLine - 1, endLine).join('\n');
  }
  const js = transformSync(raw.replace(/^export\s+/gm, ''), { loader: 'ts' }).code;
  let fn: T;
  try {
    fn = new Function(`${js}\nreturn ${fnName};`)() as T;
  } catch (err) {
    throw new Error(
      `Failed to compile ${fnName} from ${relPath}\n--- source ---\n${raw}\n--- error ---\n${String(err)}`,
    );
  }
  return Object.assign(fn as object, {
    __startLine: startLine,
    __endLine: endLine,
    __source: raw,
  }) as T & { __startLine: number; __endLine: number; __source: string };
}