/**
 * Document model (SPEC.md §2): heading sections, the card contract, cite
 * detection, and the selection-scope cascade. Pure string functions — the
 * single owner of the card grammar.
 */

import { stripInline } from "./marks";

export interface Heading {
  index: number;
  level: number;
  /** offset of the first '#' */
  start: number;
  /** offset just past the heading line (excludes the newline) */
  lineEnd: number;
  /** offset where the heading text begins */
  contentStart: number;
  text: string;
  /** end of this heading's section (start of next heading with level <= this) */
  sectionEnd: number;
}

export interface Card {
  tagStart: number;
  tagEnd: number;
  citeStart: number | null;
  citeEnd: number | null;
  bodyStart: number;
  end: number;
}

export interface Line {
  start: number;
  end: number; // excludes newline
  text: string;
}

export const PILCROW = "¶";

export const OMISSION_NOTES = [
  "[ Table Omitted ]",
  "[ Figure Omitted ]",
  "< Image Omitted >",
  "< Nothing Omitted >",
];

export function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start <= text.length) {
    let end = text.indexOf("\n", start);
    if (end < 0) end = text.length;
    lines.push({ start, end, text: text.slice(start, end) });
    if (end === text.length) break;
    start = end + 1;
  }
  return lines;
}

export function lineBoundsAt(text: string, offset: number): [number, number] {
  const start = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  let end = text.indexOf("\n", offset);
  if (end < 0) end = text.length;
  return [start, end];
}

export function isHeadingLine(line: string): boolean {
  return /^#{1,6}[ \t]/.test(line);
}

export function parseHeadings(text: string): Heading[] {
  const hs: Heading[] = [];
  const re = /^(#{1,6})[ \t]+(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hs.push({
      index: hs.length,
      level: m[1].length,
      start: m.index,
      lineEnd: m.index + m[0].length,
      contentStart: m.index + m[1].length + 1,
      text: m[2],
      sectionEnd: text.length,
    });
  }
  for (let i = 0; i < hs.length; i++) {
    for (let j = i + 1; j < hs.length; j++) {
      if (hs[j].level <= hs[i].level) {
        hs[i].sectionEnd = hs[j].start;
        break;
      }
    }
  }
  return hs;
}

/** Innermost heading section containing `offset`, or null. */
export function sectionAt(
  text: string,
  offset: number,
  headings?: Heading[],
): Heading | null {
  const hs = headings ?? parseHeadings(text);
  let best: Heading | null = null;
  for (const h of hs) {
    if (h.start <= offset && offset < Math.max(h.sectionEnd, h.lineEnd + 1)) {
      best = h;
    }
    if (h.start > offset) break;
  }
  return best;
}

/**
 * Innermost section of level <= maxLevel containing offset (used to expand
 * card scope to the enclosing Block for tag numbering etc.).
 */
export function enclosingSection(
  text: string,
  offset: number,
  maxLevel: number,
  headings?: Heading[],
): Heading | null {
  const hs = headings ?? parseHeadings(text);
  let best: Heading | null = null;
  for (const h of hs) {
    if (h.level <= maxLevel && h.start <= offset && offset < Math.max(h.sectionEnd, h.lineEnd + 1)) {
      best = h;
    }
    if (h.start > offset) break;
  }
  return best;
}

/**
 * Cite grammar check (SPEC.md §2.4): a comma-separated prefix ending in a
 * date token immediately before a quoted title.
 */
export function isCitePattern(line: string): boolean {
  if (isHeadingLine(line)) return false;
  const plain = stripInline(line).trim();
  const m = /(^|[,\s])(\d{1,2}-\d{1,2}-\d{2,4}|\d{4})\s*,\s*["“]/.exec(plain);
  if (!m) return false;
  // must have at least one comma before the date (name/quals separator)
  return plain.slice(0, m.index + 1).includes(",");
}

/** The card whose section contains `offset`, or null. */
export function cardAt(
  text: string,
  offset: number,
  headings?: Heading[],
): Card | null {
  const hs = headings ?? parseHeadings(text);
  let tag: Heading | null = null;
  for (const h of hs) {
    if (h.level === 4 && h.start <= offset && offset < Math.max(h.sectionEnd, h.lineEnd + 1)) {
      tag = h;
    }
    if (h.start > offset) break;
  }
  if (!tag) return null;
  return cardFromTag(text, tag);
}

export function cardFromTag(text: string, tag: Heading): Card {
  const card: Card = {
    tagStart: tag.start,
    tagEnd: tag.lineEnd,
    citeStart: null,
    citeEnd: null,
    bodyStart: Math.min(tag.lineEnd + 1, tag.sectionEnd),
    end: tag.sectionEnd,
  };
  let pos = tag.lineEnd + 1;
  while (pos < tag.sectionEnd) {
    const [ls, le] = lineBoundsAt(text, pos);
    const lineText = text.slice(ls, le);
    if (lineText.trim() !== "") {
      if (isCitePattern(lineText)) {
        card.citeStart = ls;
        card.citeEnd = le;
        card.bodyStart = Math.min(le + 1, tag.sectionEnd);
      } else {
        card.bodyStart = ls;
      }
      break;
    }
    pos = le + 1;
  }
  return card;
}

/** All cards intersecting [from, to). */
export function cardsInRange(
  text: string,
  from = 0,
  to = text.length,
): Card[] {
  const hs = parseHeadings(text);
  const out: Card[] = [];
  for (const h of hs) {
    if (h.level !== 4) continue;
    if (h.sectionEnd <= from || h.start >= to) continue;
    out.push(cardFromTag(text, h));
  }
  return out;
}

/** Line-start offsets of every positionally-detected cite line. */
export function citeLineStarts(text: string): Set<number> {
  const set = new Set<number>();
  for (const c of cardsInRange(text)) {
    if (c.citeStart !== null) set.add(c.citeStart);
  }
  return set;
}

export interface Scope {
  from: number;
  to: number;
  kind: "selection" | "document" | "card" | "section" | "line";
}

/**
 * Selection-scope cascade (SPEC.md §3.0):
 * selection → current card → enclosing heading section → whole document
 * (cursor at very start) → current line.
 */
export function resolveScope(text: string, selFrom: number, selTo: number): Scope {
  if (selTo > selFrom) return { from: selFrom, to: selTo, kind: "selection" };
  const off = selFrom;
  if (off === 0 && text.trim() !== "") {
    return { from: 0, to: text.length, kind: "document" };
  }
  const hs = parseHeadings(text);
  const [ls, le] = lineBoundsAt(text, off);
  const lineText = text.slice(ls, le);
  if (isHeadingLine(lineText)) {
    const h = hs.find((x) => x.start === ls);
    if (h && h.level < 4) {
      return { from: h.start, to: h.sectionEnd, kind: "section" };
    }
  }
  const card = cardAt(text, off, hs);
  if (card) return { from: card.tagStart, to: card.end, kind: "card" };
  const sec = sectionAt(text, off, hs);
  if (sec) return { from: sec.start, to: sec.sectionEnd, kind: "section" };
  return { from: ls, to: le, kind: "line" };
}

export interface Chunk {
  from: number;
  to: number;
}

/**
 * Maximal runs of body lines (not headings, not cite lines) within [from, to),
 * trimmed of surrounding whitespace. Condense/shrink operate on these.
 */
export function bodyChunks(text: string, from: number, to: number): Chunk[] {
  const cites = citeLineStarts(text);
  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;
  for (const line of splitLines(text)) {
    if (line.end <= from) continue;
    if (line.start >= to) break;
    const boundary = isHeadingLine(line.text) || cites.has(line.start);
    if (boundary) {
      if (cur) { chunks.push(cur); cur = null; }
      continue;
    }
    const f = Math.max(from, line.start);
    const t = Math.min(to, line.end);
    if (cur) cur.to = t;
    else cur = { from: f, to: t };
  }
  if (cur) chunks.push(cur);
  // trim whitespace (including blank lines) off chunk edges
  const trimmed: Chunk[] = [];
  for (const c of chunks) {
    let { from: f, to: t } = c;
    while (f < t && /\s/.test(text[f])) f++;
    while (t > f && /\s/.test(text[t - 1])) t--;
    if (t > f) trimmed.push({ from: f, to: t });
  }
  return trimmed;
}
