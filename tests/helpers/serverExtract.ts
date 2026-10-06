/**
 * serverExtract.ts — companions to sourceExtract.ts for constructs that helper cannot reach.
 *
 * `sourceExtract.ts` handles three shapes:
 *   1. `const OUT = IN` followed by `.replace(...)` continuation lines  (extractChain, 'const')
 *   2. `prop: IN`  followed by `.replace(...)` continuation lines       (extractChain, 'prop')
 *   3. a chain used as a call argument                                 (extractChainAt)
 *
 * Two shapes in this repo do not fit any of them:
 *
 *   a) `server.ts` `cleanMarkdown` is a MULTI-LINE CLOSURE —
 *      `const cleanMarkdown = (md: string) => { let cleaned = md; ... return cleaned.trim(); }`
 *      Its body is a statement block, not a `.replace()` continuation list, so every
 *      existing locator would collect zero lines and throw.
 *
 *   b) Several rule tables are module-private (`KNOWN_OCR_CANONICAL_TARGETS` in
 *      quranicVerificationAgent.ts, `KNOWN_SYNTACTIC_COMPLETIONS` in
 *      grammarSyntaxAnalyzer.ts). They are not exported, so they cannot be imported.
 *      `extractFunction` in sourceExtract.ts brace-matches forward from the FIRST line of
 *      the declaration, which terminates too early for a table written as
 *      `const X: Array<{ ... }> = [ ... ]` — the `<{` on the declaration line and the
 *      `}>` on the assignment line balance each other, so the naive matcher stops at the
 *      assignment line and yields `const X: Array<` (uncompilable).
 *
 * Both helpers below therefore locate by CONTENT ANCHOR (same rationale as sourceExtract:
 * a line number is not a stable identity) and slice forward until the *statement*
 * terminates, measured from the assignment `=` rather than from the anchor line.
 *
 * Nothing here is allowed to silently succeed with the wrong text: if the slice cannot be
 * located, or the compiled snippet throws, both helpers throw with the region and error in
 * the message, so a bad harness surfaces as a failing test rather than a green lie.
 */
import { transformSync } from 'esbuild';
import { readSourceLines, findLine } from './sourceExtract';

/**
 * Walks forward from the anchor line to the end of the enclosing statement.
 *
 * Depth tracking only begins to matter AFTER the assignment `=` is seen at bracket depth 0,
 * which is what keeps `const X: Array<{...}> = [` from terminating on the `}>` line.
 * String and regex literals are NOT interpreted; the scanners below tolerate the bracket
 * characters they contain because those literals happen to stay balanced. If someone later
 * writes an unbalanced literal, the slice just grows and the compile step throws loudly.
 */
function statementEndLine(lines: string[], startLine: number): number {
  let depth = 0;
  let sawAssign = false;
  for (let i = startLine - 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      else if (ch === '}' || ch === ']' || ch === ')') depth--;
      else if (ch === '=' && depth === 0 && !sawAssign) sawAssign = true;
    }
    if (sawAssign && depth <= 0 && /;\s*$/.test(lines[i])) return i + 1;
  }
  throw new Error(
    `Could not find the end of the statement starting at line ${startLine}. ` +
      `Slice so far:\n${lines.slice(startLine - 1).join('\n')}`,
  );
}

/**
 * Walks forward from the arrow body's `{` to the matching `}` that closes it.
 *
 * Braces are counted only at the top level of the body, and a `{` or `}` preceded by a
 * backslash is skipped so regex escapes such as `\text\{...\}` and quantifiers like `{2,}`
 * do not unbalance the count. Character classes are not tracked, which is fine here because
 * `server.ts`'s `cleanMarkdown` contains no `[}]`-style literals.
 *
 * This is deliberately NOT `statementEndLine`: that returns at the first `;` at depth 0, which
 * inside a closure body is the first inner statement, not the end of the closure.
 */
function closureEndLine(lines: string[], startLine: number): number {
  const firstLine = lines[startLine - 1];
  const arrowAt = firstLine.indexOf('=>');
  if (arrowAt === -1) {
    throw new Error(`Anchor ${relPathName}:${startLine} is not an arrow function: ${firstLine}`);
  }
  const openAt = firstLine.indexOf('{', arrowAt);
  if (openAt === -1) {
    throw new Error(`Anchor ${relPathName}:${startLine} has no arrow body brace: ${firstLine}`);
  }
  let depth = 0;
  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i];
    for (let c = i === startLine - 1 ? openAt : 0; c < line.length; c++) {
      if (line[c] === '\\') { c++; continue; }
      if (line[c] === '{') depth++;
      else if (line[c] === '}') depth--;
    }
    if (depth <= 0) return i + 1;
  }
  throw new Error(`Unterminated closure starting at ${relPathName}:${startLine}`);
}

/** Placeholder used only to build error messages from inside the scanners above. */
let relPathName = '(source)';

export interface ExtractedClosure {
  /** Raw source text of the closure, anchor line through the terminating `};`. */
  source: string;
  /** Name the closure is bound to, e.g. `cleanMarkdown`. */
  resultName: string;
  /** Name of the closure's single parameter, e.g. `md`. */
  inputName: string;
  /** Callable form: `fn(input)`. */
  fn: (input: string) => string;
  /** 1-based inclusive line numbers of the extracted region, for the report. */
  startLine: number;
  endLine: number;
}

/**
 * Compiles a multi-line closure such as `server.ts` `cleanMarkdown` out of the real source.
 *
 * `anchorNeedle` is a distinctive substring on the closure's first line. TS types are
 * stripped by esbuild so we execute the file's real text, never a copy of it.
 */
export function extractClosure(
  relPath: string,
  anchorNeedle: string,
): ExtractedClosure {
  const lines = readSourceLines(relPath);
  const startLine = findLine(relPath, anchorNeedle);
  relPathName = relPath;
  const endLine = closureEndLine(lines, startLine);
  const source = lines.slice(startLine - 1, endLine).join('\n');

  const nameMatch = source.match(/const\s+([A-Za-z_$][\w$]*)\s*=/);
  if (!nameMatch) {
    throw new Error(`Anchor ${relPath}:${startLine} has no "const NAME =": ${JSON.stringify(source)}`);
  }
  const resultName = nameMatch[1];
  const paramMatch = source.match(/=>\s*\{/) && source.match(/\(([^)]*)\)\s*=>/);
  if (!paramMatch) {
    throw new Error(`Anchor ${relPath}:${startLine} has no single parameter list: ${JSON.stringify(source)}`);
  }
  const inputName = paramMatch[1].split(':')[0].trim();

  const js = transformSync(source, { loader: 'ts' }).code;
  let fn: (input: string) => string;
  try {
    fn = new Function(`${js}\nreturn ${resultName};`)() as (input: string) => string;
  } catch (err) {
    throw new Error(
      `Failed to compile closure at ${relPath}:${startLine}-${endLine}\n--- source ---\n${source}\n--- error ---\n${String(err)}`,
    );
  }
  return { source, resultName, inputName, fn, startLine, endLine };
}

export interface ExtractedConstArray {
  /** Raw source text of the declaration (anchor line through the terminating `];`). */
  source: string;
  /** 1-based inclusive line numbers of the extracted region, for the report. */
  startLine: number;
  endLine: number;
}

/**
 * Slices a module-private `const NAME: Array<{...}> = [ ... ];` declaration out of the real
 * source and compiles it, so the value under test is the file's own table.
 */
export function extractConstArrayDeclaration(
  relPath: string,
  declNeedle: string,
): ExtractedConstArray & { value: unknown[]; resultName: string } {
  const lines = readSourceLines(relPath);
  const startLine = findLine(relPath, declNeedle);
  const endLine = statementEndLine(lines, startLine);
  const source = lines.slice(startLine - 1, endLine).join('\n');

  const nameMatch = source.match(/const\s+([A-Za-z_$][\w$]*)/);
  if (!nameMatch) {
    throw new Error(`Anchor ${relPath}:${startLine} has no "const NAME": ${JSON.stringify(source.slice(0, 80))}`);
  }
  const resultName = nameMatch[1];

  const js = transformSync(source, { loader: 'ts' }).code;
  const value = new Function(`${js}\nreturn ${resultName};`)();
  if (!Array.isArray(value)) {
    throw new Error(`${relPath}:${startLine}-${endLine} did not compile to an array: ${String(value)}`);
  }
  return { source, value, startLine, endLine, resultName };
}

export interface ReplacePair {
  /** Verbatim regex-literal text including slashes and flags, e.g. `/أ\u0644.../g`. */
  literal: string;
  /** The regex literal body (without slashes/flags) — this is `RegExp.prototype.source`. */
  patternSource: string;
  flags: string;
  /** Verbatim replacement argument, unescaped (a JS string value). */
  replacement: string;
  /** The compiled pattern, for behavioral comparison. */
  regex: RegExp;
}

/**
 * Parses every `.replace(PATTERN, REPLACEMENT)` call out of a source snippet.
 *
 * Used to read the inline rule table out of the `server.ts` `cleanMarkdown` closure so the
 * divergence suite can compare its pattern/replacement pairs against the two exported
 * tables without copying any of them by hand.
 *
 * Handles `/regex/flags` and `'`/`"`/`` ` `` string literals; the snippets in this repo
 * contain no `'` inside a single-quoted replacement and no backtick-interpolated
 * `)`, which is asserted by the surrounding compile step in the caller.
 */
export function parseReplacePairs(snippet: string): ReplacePair[] {
  const pairs: ReplacePair[] = [];
  const KEY = '.replace(';
  let i = 0;

  const skipWs = () => {
    while (i < snippet.length && /\s/.test(snippet[i])) i++;
  };

  /**
   * Reads a `/.../flags` regex literal starting at `i`.
   *
   * A character-class scan is NOT enough to find the end, and neither is "a slash always
   * ends it". Both appear in `server.ts`:
   *
   *   - `/<\/?(span|div|p|b|strong|em|i)(?=[\s\/>])[^>]*\>/gi` has a class CONTAINING a slash,
   *     so stopping at the first slash cuts the literal in half.
   *   - `/\\text\{([^\}]+)\}\/g` has a class whose `]` is escaped, so the class never closes
   *     and stopping at the class-closing bracket never happens.
   *
   * So the terminator is found structurally instead: the closing slash of a `.replace()`
   * first argument is the first `/` after which optional flags are followed by a comma. That
   * is unambiguous here because the caller only ever points this at `.replace(PATTERN, ...)`.
   */
  const readRegexLiteral = () => {
    const start = i;
    i++; // opening slash
    for (;;) {
      const close = snippet.indexOf('/', i);
      if (close === -1) throw new Error(`Unterminated regex literal at ${start}: ${snippet.slice(start, start + 60)}`);
      const after = snippet.slice(close + 1);
      const m = /^[a-z]*[ \t]*,/.exec(after);
      if (m) {
        i = close + 1;
        while (i < snippet.length && /[a-z]/.test(snippet[i])) i++;
        return snippet.slice(start, i);
      }
      i = close + 1;
    }
  };

  const readStringLiteral = (): string => {
    const quote = snippet[i];
    i++;
    let out = '';
    while (i < snippet.length && snippet[i] !== quote) {
      if (snippet[i] === '\\') {
        const next = snippet[i + 1];
        out +=
          next === 'n' ? '\n'
          : next === 't' ? '\t'
          : next === 'r' ? '\r'
          : next;
        i += 2;
        continue;
      }
      out += snippet[i];
      i++;
    }
    i++; // closing quote
    return out;
  };

  while (true) {
    const at = snippet.indexOf(KEY, i);
    if (at === -1) break;
    i = at + KEY.length;
    skipWs();
    if (snippet[i] !== '/') {
      throw new Error(`Unsupported .replace() first argument at offset ${i}: ${snippet.slice(i, i + 40)}`);
    }
    const literal = readRegexLiteral();
    skipWs();
    if (snippet[i] !== ',') {
      throw new Error(`Expected ',' after pattern at offset ${i}: ${snippet.slice(i - 20, i + 40)}`);
    }
    i++;
    skipWs();
    const QUOTES = new Set(["'", '"', '`']);

    let replacement: string;
    if (QUOTES.has(snippet[i])) {
      replacement = readStringLiteral();
      skipWs();
      if (snippet[i] !== ')') {
        throw new Error(`Expected ')' after replacement at offset ${i}: ${snippet.slice(i - 20, i + 40)}`);
      }
    } else {
      // The replacement is an arbitrary EXPRESSION, e.g. `() => `[^${fnCounter++}]`` in
      // server.ts's footnote-marker renumbering. Skip it by paren balance and record it as
      // un-pinnable, since it is not a constant replacement string.
      const exprStart = i;
      let depth = 0;
      let quote: string | null = null;
      for (; i < snippet.length; i++) {
        const ch = snippet[i];
        if (quote) {
          if (ch === '\\') { i++; continue; }
          if (ch === quote) quote = null;
          continue;
        }
        if (QUOTES.has(ch)) { quote = ch; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) { i++; break; }
        }
      }
      replacement = `<expression: ${snippet.slice(exprStart, i).replace(/\s+/g, ' ')}>`;
      skipWs();
    }
    const lastSlash = literal.lastIndexOf('/');
    const patternSource = literal.slice(1, lastSlash);
    const flags = literal.slice(lastSlash + 1);
    pairs.push({ literal, patternSource, flags, replacement, regex: new RegExp(patternSource, flags) });
  }
  return pairs;
}