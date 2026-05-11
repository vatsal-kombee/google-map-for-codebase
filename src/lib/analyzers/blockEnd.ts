/**
 * Shared utilities for finding the true end-line of a logical code block.
 *
 * Two strategies:
 *   - findBraceBlockEnd  – for C-style languages (JS/TS, PHP, Go, Java, Rust, C++, C#)
 *   - findIndentBlockEnd – for indentation-based languages (Python, Ruby)
 *
 * Both functions return a 1-based line number (inclusive).
 */

// ---------------------------------------------------------------------------
// Brace-matching (C-style languages)
// ---------------------------------------------------------------------------

/**
 * Starting from `startLine` (1-based), scan forward through `lines` until the
 * opening `{` that begins the block is matched by its closing `}`.
 *
 * Returns the 1-based line index of the closing `}`, or `lines.length` as a
 * safe fallback when no matching brace is found.
 *
 * Characters inside single-line strings (`"..."`, `'...'`, `` `...` ``) and
 * line comments (`//`) are ignored to avoid false positives.
 */
export function findBraceBlockEnd(lines: string[], startLine: number): number {
  let depth = 0;
  let found = false;

  for (let i = startLine - 1; i < lines.length; i++) {
    const raw = lines[i];
    // Strip strings and line-comments before counting braces
    const safe = stripStringsAndLineComments(raw);

    for (const ch of safe) {
      if (ch === "{") {
        depth++;
        found = true;
      } else if (ch === "}") {
        depth--;
        if (found && depth === 0) {
          return i + 1; // 1-based
        }
      }
    }
  }

  // Fallback: return the last line of the file
  return lines.length;
}

// ---------------------------------------------------------------------------
// Bracket-matching (for array export blocks)
// ---------------------------------------------------------------------------

export function findBracketBlockEnd(lines: string[], startLine: number): number {
  let depth = 0;
  let found = false;

  for (let i = startLine - 1; i < lines.length; i++) {
    const safe = stripStringsAndLineComments(lines[i]);
    for (const ch of safe) {
      if (ch === "[") { depth++; found = true; }
      else if (ch === "]") {
        depth--;
        if (found && depth === 0) return i + 1;
      }
    }
  }
  return lines.length;
}

// ---------------------------------------------------------------------------
// Indentation-based (Python / Ruby)
// ---------------------------------------------------------------------------

/**
 * Starting from `startLine` (1-based), find the end of the indented block.
 *
 * The block is considered ended when:
 *  - A non-empty line appears at an indentation level ≤ that of `startLine`,
 *    OR
 *  - We reach the end of the file.
 *
 * Returns the 1-based index of the **last line that still belongs to the
 * block** (i.e. one line before the dedent).
 */
export function findIndentBlockEnd(lines: string[], startLine: number): number {
  const headerLine = lines[startLine - 1] ?? "";
  const baseIndent = headerLine.match(/^(\s*)/)?.[1].length ?? 0;

  let lastBodyLine = startLine;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    // Skip blank / comment-only lines – they don't terminate a block
    if (line.trim() === "" || line.trim().startsWith("#") || line.trim().startsWith("//")) {
      lastBodyLine = i + 1;
      continue;
    }
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent <= baseIndent) {
      // Dedented — block ended at the previous line
      break;
    }
    lastBodyLine = i + 1; // 1-based
  }

  return lastBodyLine;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Remove string literals and line-comment tails from a single source line so
 * that brace characters inside them are not counted.
 *
 * Handles double-quote, single-quote, and backtick delimited strings
 * (single-line only) plus "//" line comments and inline "/ * ... * /" block
 * comments on a single line.
 */
function stripStringsAndLineComments(line: string): string {
  let result = "";
  let i = 0;
  let inString: string | null = null;

  while (i < line.length) {
    const ch = line[i];

    if (inString) {
      if (ch === "\\" ) {
        i += 2; // skip escaped character
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }

    // Start of a string
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      i++;
      continue;
    }

    // Line comment
    if (ch === "/" && line[i + 1] === "/") break;

    // Inline block comment: /* ... */
    if (ch === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      i = end === -1 ? line.length : end + 2;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}
