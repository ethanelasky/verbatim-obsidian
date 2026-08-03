/**
 * Card automation (SPEC.md §3.5): Auto-Emphasize First, Standardize
 * Highlighting, Auto Number / De-Number Tags.
 */

import { citeLineStarts, isHeadingLine, parseHeadings, splitLines } from "./cardModel";
import { parseLine, rangeToCharIdx, serialize, trimIdx } from "./marks";

/** Apply Emphasis to the first letter of each word in [from, to). */
export function autoEmphasizeFirst(
  text: string,
  from: number,
  to: number,
  defaultColor: string,
): string | null {
  let out = "";
  let cursor = 0;
  let changed = false;
  for (const line of splitLines(text)) {
    out += text.slice(cursor, line.start);
    cursor = line.end;
    if (
      line.end <= from ||
      line.start >= to ||
      line.text.trim() === "" ||
      isHeadingLine(line.text)
    ) {
      out += line.text;
      continue;
    }
    const chars = parseLine(line.text, defaultColor);
    let [ci, cj] = rangeToCharIdx(
      chars,
      Math.max(from, line.start) - line.start,
      Math.min(to, line.end) - line.start,
    );
    [ci, cj] = trimIdx(chars, ci, cj);
    let lineChanged = false;
    for (let i = ci; i < cj; i++) {
      const c = chars[i];
      if (!/[\p{L}\p{N}]/u.test(c.ch)) continue;
      const atWordStart = i === 0 || /\s/.test(chars[i - 1].ch);
      if (atWordStart && !c.m.b) {
        c.m.b = true;
        lineChanged = true;
      }
    }
    if (lineChanged) {
      out += serialize(chars, defaultColor).text;
      changed = true;
    } else {
      out += line.text;
    }
  }
  out += text.slice(cursor);
  return changed ? out : null;
}

/** Convert all highlights (except `exception`, if given) to `color`. */
export function standardizeHighlighting(
  text: string,
  color: string,
  exception: string | null,
  defaultColor: string,
): { text: string; count: number } {
  let out = "";
  let cursor = 0;
  let count = 0;
  for (const line of splitLines(text)) {
    out += text.slice(cursor, line.start);
    cursor = line.end;
    if (line.text.trim() === "" || isHeadingLine(line.text) || !/==|<mark/.test(line.text)) {
      out += line.text;
      continue;
    }
    const chars = parseLine(line.text, defaultColor);
    let lineChanged = false;
    for (const c of chars) {
      if (c.m.hl !== null && c.m.hl !== color && c.m.hl !== exception) {
        c.m.hl = color;
        lineChanged = true;
      }
    }
    if (lineChanged) {
      out += serialize(chars, defaultColor).text;
      count++;
    } else {
      out += line.text;
    }
  }
  out += text.slice(cursor);
  return { text: out, count };
}

/**
 * Number the tags (H4s) in [from, to): "1. ", "2. ", … restarting for each
 * parent heading group. Re-running renumbers (idempotent).
 */
export function autoNumberTags(
  text: string,
  from: number,
  to: number,
): { text: string; count: number } {
  return renumberTags(text, from, to, true);
}

export function deNumberTags(
  text: string,
  from: number,
  to: number,
): { text: string; count: number } {
  return renumberTags(text, from, to, false);
}

function renumberTags(
  text: string,
  from: number,
  to: number,
  number: boolean,
): { text: string; count: number } {
  const hs = parseHeadings(text);
  const counters = new Map<number, number>();
  const edits: { start: number; end: number; line: string }[] = [];
  for (const h of hs) {
    if (h.level !== 6 || h.start < from || h.start >= to) continue;
    let parentKey = -1;
    for (let i = h.index - 1; i >= 0; i--) {
      if (hs[i].level < 6) { parentKey = hs[i].index; break; }
    }
    const bare = h.text.replace(/^\d+\.[ \t]+/, "");
    let newLine: string;
    if (number) {
      const n = (counters.get(parentKey) ?? 0) + 1;
      counters.set(parentKey, n);
      newLine = `###### ${n}. ${bare}`;
    } else {
      newLine = `###### ${bare}`;
    }
    if (newLine !== text.slice(h.start, h.lineEnd)) {
      edits.push({ start: h.start, end: h.lineEnd, line: newLine });
    }
  }
  let out = text;
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i];
    out = out.slice(0, e.start) + e.line + out.slice(e.end);
  }
  return { text: out, count: edits.length };
}

export { citeLineStarts };
