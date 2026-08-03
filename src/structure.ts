/**
 * Structure commands (SPEC.md §3.1): heading application and outline-unit
 * manipulation (move/select/delete).
 */

import { Heading, parseHeadings, sectionAt, splitLines } from "./cardModel";
import { stripInline } from "./marks";

/** Make every non-blank line in [from, to) a heading of `level`. */
export function setHeadingLevel(
  text: string,
  from: number,
  to: number,
  level: number,
): { text: string; from: number; to: number } | null {
  let out = "";
  let cursor = 0;
  let changed = false;
  let newFrom = -1;
  let newTo = -1;
  const nonEmptySel = to > from;
  for (const line of splitLines(text)) {
    out += text.slice(cursor, line.start);
    cursor = line.end;
    const intersects = nonEmptySel
      ? line.start < to && line.end > from
      : line.start <= from && from <= line.end;
    if (!intersects || line.text.trim() === "") {
      out += line.text;
      continue;
    }
    const bare = stripInline(line.text.replace(/^#{1,6}[ \t]+/, "")).trim();
    const newLine = "#".repeat(level) + " " + bare;
    if (newFrom < 0) newFrom = out.length;
    out += newLine;
    newTo = out.length;
    if (newLine !== line.text) changed = true;
  }
  out += text.slice(cursor);
  if (!changed || newFrom < 0) return null;
  return { text: out, from: newFrom, to: newTo };
}

function ensureNl(text: string): string {
  return text.endsWith("\n") || text === "" ? text : text + "\n";
}

function innermost(text: string, offset: number): { t: string; h: Heading | null; hs: Heading[] } {
  const t = ensureNl(text);
  const hs = parseHeadings(t);
  const h = sectionAt(t, Math.min(offset, Math.max(0, t.length - 1)), hs);
  return { t, h, hs };
}

export function moveSection(
  text: string,
  offset: number,
  dir: "up" | "down" | "bottom",
): { text: string; cursor: number } | null {
  const { t, h, hs } = innermost(text, offset);
  if (!h) return null;
  const block = t.slice(h.start, h.sectionEnd);
  const rel = Math.max(0, Math.min(offset - h.start, block.length - 1));

  if (dir === "up") {
    let p: Heading | null = null;
    for (let i = h.index - 1; i >= 0; i--) {
      if (hs[i].level < h.level) break;
      if (hs[i].level === h.level) { p = hs[i]; break; }
    }
    if (!p || p.sectionEnd !== h.start) return null;
    const newText =
      t.slice(0, p.start) + block + t.slice(p.start, p.sectionEnd) + t.slice(h.sectionEnd);
    return { text: newText, cursor: p.start + rel };
  }

  if (dir === "down") {
    const n = hs.find((x) => x.start === h.sectionEnd);
    if (!n || n.level !== h.level) return null;
    const nBlock = t.slice(n.start, n.sectionEnd);
    const newText = t.slice(0, h.start) + nBlock + block + t.slice(n.sectionEnd);
    return { text: newText, cursor: h.start + nBlock.length + rel };
  }

  // bottom: end of parent section (or document)
  let parentEnd = t.length;
  for (let i = h.index - 1; i >= 0; i--) {
    if (hs[i].level < h.level) { parentEnd = hs[i].sectionEnd; break; }
  }
  if (parentEnd <= h.sectionEnd) return null; // already last
  const newText =
    t.slice(0, h.start) + t.slice(h.sectionEnd, parentEnd) + block + t.slice(parentEnd);
  return { text: newText, cursor: h.start + (parentEnd - h.sectionEnd) + rel };
}

export function deleteSection(
  text: string,
  offset: number,
): { text: string; cursor: number } | null {
  const { t, h } = innermost(text, offset);
  if (!h) return null;
  return { text: t.slice(0, h.start) + t.slice(h.sectionEnd), cursor: h.start };
}

export function sectionRange(text: string, offset: number): [number, number] | null {
  const { h } = innermost(text, offset);
  if (!h) return null;
  let end = h.sectionEnd;
  while (end > h.lineEnd && /\s/.test(text[end - 1] ?? "\n")) end--;
  return [h.start, end];
}
