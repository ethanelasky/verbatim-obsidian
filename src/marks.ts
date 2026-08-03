/**
 * Inline mark vocabulary (SPEC.md §2.5).
 *
 * Body text carries exactly four orthogonal marks per character:
 *   u  — underline            <u>…</u>
 *   hl — highlight color      ==…== (default color) or <mark class="vb-hl-COLOR">…</mark>
 *   b  — emphasis / bold      **…**
 *   sm — shrunk               <small>…</small>
 *
 * Lines are parsed into per-character flag arrays, mutated, and re-serialized
 * with canonical nesting order: u > hl > b > sm.
 */

export const HL_COLORS = [
  "yellow",
  "green",
  "cyan",
  "magenta",
  "blue",
  "gray",
  "orange",
] as const;
export type HlColor = (typeof HL_COLORS)[number];

export interface CharMarks {
  u: boolean;
  hl: string | null;
  b: boolean;
  sm: boolean;
}

export interface PChar {
  ch: string;
  /** offset of this character in the source line */
  src: number;
  m: CharMarks;
}

const MARK_OPEN = /^<mark class="vb-hl-([a-z]+)">/;

export function parseLine(line: string, defaultColor: string): PChar[] {
  const chars: PChar[] = [];
  let u = false;
  let b = false;
  let sm = false;
  let hl: string | null = null;
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    if (rest.startsWith("<u>")) { u = true; i += 3; continue; }
    if (rest.startsWith("</u>")) { u = false; i += 4; continue; }
    if (rest.startsWith("<small>")) { sm = true; i += 7; continue; }
    if (rest.startsWith("</small>")) { sm = false; i += 8; continue; }
    const mo = MARK_OPEN.exec(rest);
    if (mo) { hl = mo[1]; i += mo[0].length; continue; }
    if (rest.startsWith("<mark>")) { hl = defaultColor; i += 6; continue; }
    if (rest.startsWith("</mark>")) { hl = null; i += 7; continue; }
    if (rest.startsWith("**")) { b = !b; i += 2; continue; }
    if (rest.startsWith("==")) { hl = hl === null ? defaultColor : null; i += 2; continue; }
    chars.push({ ch: line[i], src: i, m: { u, hl, b, sm } });
    i++;
  }
  return chars;
}

export function plainText(chars: PChar[]): string {
  let s = "";
  for (const c of chars) s += c.ch;
  return s;
}

/** Strip all inline markup, returning plain text. */
export function stripInline(line: string): string {
  return plainText(parseLine(line, "yellow"));
}

export function eqMarks(a: CharMarks, b: CharMarks): boolean {
  return a.u === b.u && a.b === b.b && a.sm === b.sm && a.hl === b.hl;
}

/**
 * Map a source-offset range (line-relative) to [start, end) indices into the
 * parsed char array.
 */
export function rangeToCharIdx(chars: PChar[], from: number, to: number): [number, number] {
  let ci = chars.findIndex((c) => c.src >= from);
  if (ci < 0) ci = chars.length;
  let cj = 0;
  for (const c of chars) if (c.src < to) cj++;
  if (cj < ci) cj = ci;
  return [ci, cj];
}

/** Shrink a char-index range to exclude leading/trailing whitespace. */
export function trimIdx(chars: PChar[], ci: number, cj: number): [number, number] {
  while (ci < cj && /\s/.test(chars[ci].ch)) ci++;
  while (cj > ci && /\s/.test(chars[cj - 1].ch)) cj--;
  return [ci, cj];
}

/**
 * Markdown's ** and == delimiters break when a run starts/ends with
 * whitespace; push boundary whitespace out of bold and highlight runs.
 */
function normalizeBoundaries(chars: PChar[]): void {
  for (const key of ["b", "hl"] as const) {
    let i = 0;
    while (i < chars.length) {
      const activeAt = (k: number): boolean =>
        key === "b"
          ? chars[k].m.b
          : chars[k].m.hl !== null && chars[k].m.hl === chars[i].m.hl;
      if (!(key === "b" ? chars[i].m.b : chars[i].m.hl !== null)) { i++; continue; }
      let j = i;
      while (j < chars.length && activeAt(j)) j++;
      let s = i;
      let e = j;
      while (s < e && /\s/.test(chars[s].ch)) { clearMark(chars[s], key); s++; }
      while (e > s && /\s/.test(chars[e - 1].ch)) { clearMark(chars[e - 1], key); e--; }
      i = j;
    }
  }
}

function clearMark(c: PChar, key: "b" | "hl"): void {
  if (key === "b") c.m.b = false;
  else c.m.hl = null;
}

interface StackTok {
  k: "u" | "hl" | "b" | "sm";
  hl?: string;
}

export interface Serialized {
  text: string;
  /** for each char index, its offset in the serialized text */
  outOf: number[];
}

export function serialize(chars: PChar[], defaultColor: string): Serialized {
  normalizeBoundaries(chars);
  let out = "";
  const outOf: number[] = [];
  const stack: StackTok[] = [];

  const openTok = (t: StackTok): string =>
    t.k === "u" ? "<u>"
    : t.k === "b" ? "**"
    : t.k === "sm" ? "<small>"
    : t.hl === defaultColor ? "==" : `<mark class="vb-hl-${t.hl}">`;
  const closeTok = (t: StackTok): string =>
    t.k === "u" ? "</u>"
    : t.k === "b" ? "**"
    : t.k === "sm" ? "</small>"
    : t.hl === defaultColor ? "==" : "</mark>";

  const desired = (m: CharMarks): StackTok[] => {
    const d: StackTok[] = [];
    if (m.u) d.push({ k: "u" });
    if (m.hl !== null) d.push({ k: "hl", hl: m.hl });
    if (m.b) d.push({ k: "b" });
    if (m.sm) d.push({ k: "sm" });
    return d;
  };

  const closeDownTo = (n: number): void => {
    for (let j = stack.length - 1; j >= n; j--) out += closeTok(stack[j]);
    stack.length = n;
  };

  for (const c of chars) {
    const d = desired(c.m);
    let common = 0;
    while (
      common < stack.length &&
      common < d.length &&
      stack[common].k === d[common].k &&
      stack[common].hl === d[common].hl
    ) {
      common++;
    }
    closeDownTo(common);
    for (let j = common; j < d.length; j++) {
      out += openTok(d[j]);
      stack.push(d[j]);
    }
    outOf.push(out.length);
    out += c.ch;
  }
  closeDownTo(0);
  return { text: out, outOf };
}
