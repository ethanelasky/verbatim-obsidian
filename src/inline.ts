/**
 * Inline style toggles (SPEC.md §3.3): Underline, Emphasis, Highlight,
 * Clear Formatting. Operates per line, skipping heading lines; toggle
 * decision is aggregated across the whole target range.
 */

import { isHeadingLine, splitLines } from "./cardModel";
import { parseLine, rangeToCharIdx, serialize, trimIdx, PChar } from "./marks";

export type InlineOp = "underline" | "emphasis" | "highlight" | "clear";

export interface InlineOpts {
  defaultColor: string;
  currentColor: string;
  /** underline also applies bold (Bold underline / Auto emphasis settings) */
  coupleBold: boolean;
  /** apply only, never un-toggle (Underline Mode) */
  force?: boolean;
}

interface LineJob {
  ls: number;
  le: number;
  chars: PChar[];
  ci: number;
  cj: number;
}

export interface InlineResult {
  text: string;
  selFrom: number;
  selTo: number;
}

export function applyInline(
  text: string,
  from: number,
  to: number,
  op: InlineOp,
  opts: InlineOpts,
): InlineResult | null {
  const jobs: LineJob[] = [];
  for (const line of splitLines(text)) {
    if (line.end <= from) continue;
    if (line.start >= to) break;
    if (line.text.trim() === "" || isHeadingLine(line.text)) continue;
    const chars = parseLine(line.text, opts.defaultColor);
    let [ci, cj] = rangeToCharIdx(
      chars,
      Math.max(from, line.start) - line.start,
      Math.min(to, line.end) - line.start,
    );
    [ci, cj] = trimIdx(chars, ci, cj);
    if (ci >= cj) continue;
    jobs.push({ ls: line.start, le: line.end, chars, ci, cj });
  }
  if (jobs.length === 0) return null;

  // pass 1: does every non-whitespace char already carry the mark?
  let hasAll = true;
  if (op !== "clear" && !opts.force) {
    outer: for (const j of jobs) {
      for (let i = j.ci; i < j.cj; i++) {
        const c = j.chars[i];
        if (/\s/.test(c.ch)) continue;
        const has =
          op === "underline" ? c.m.u
          : op === "emphasis" ? c.m.b
          : c.m.hl === opts.currentColor;
        if (!has) { hasAll = false; break outer; }
      }
    }
  } else {
    hasAll = false;
  }

  // pass 2: mutate and re-serialize
  let out = "";
  let cursorSrc = 0;
  let selFrom = from;
  let selTo = to;
  let jobIdx = 0;
  for (const line of splitLines(text)) {
    out += text.slice(cursorSrc, line.start);
    cursorSrc = line.end;
    const j = jobIdx < jobs.length && jobs[jobIdx].ls === line.start ? jobs[jobIdx] : null;
    if (!j) {
      out += line.text;
      continue;
    }
    jobIdx++;
    for (let i = j.ci; i < j.cj; i++) {
      const m = j.chars[i].m;
      if (op === "underline") {
        m.u = !hasAll;
        if (opts.coupleBold) m.b = !hasAll;
      } else if (op === "emphasis") {
        m.b = !hasAll;
      } else if (op === "highlight") {
        m.hl = hasAll ? null : opts.currentColor;
      } else {
        m.u = false;
        m.b = false;
        m.sm = false;
        m.cb = false;
      }
    }
    const ser = serialize(j.chars, opts.defaultColor);
    const newLineStart = out.length;
    if (j === jobs[0]) {
      selFrom =
        newLineStart +
        (j.ci < j.chars.length ? ser.outOf[j.ci] : ser.text.length);
    }
    if (j === jobs[jobs.length - 1]) {
      selTo = newLineStart + (j.cj > 0 ? ser.outOf[j.cj - 1] + 1 : 0);
    }
    out += ser.text;
  }
  out += text.slice(cursorSrc);
  if (out === text) return null;
  return { text: out, selFrom, selTo };
}
