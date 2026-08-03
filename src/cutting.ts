/**
 * Cutting commands (SPEC.md §3.2): Paste Text transform, Condense modes,
 * Uncondense, Shrink. Pure text functions.
 */

import { bodyChunks, OMISSION_NOTES, splitLines } from "./cardModel";
import { parseLine, plainText, rangeToCharIdx, serialize, trimIdx } from "./marks";

export type CondenseMode = "pilcrows" | "nopilcrows" | "nointegrity";

export const PILCROW_SEP = " ¶ ";

/** Collapse one body chunk's paragraphs per the given mode. */
export function condenseChunkText(s: string, mode: CondenseMode): string {
  const sep = mode === "pilcrows" ? PILCROW_SEP : " ";
  let out = s.trim().replace(/[ \t]*(?:\n[ \t]*)+/g, sep);
  out = out.replace(/[ \t]{2,}/g, " ");
  return out;
}

export function condenseRange(
  text: string,
  from: number,
  to: number,
  mode: CondenseMode,
): { text: string; count: number } {
  const chunks = bodyChunks(text, from, to);
  let out = text;
  let count = 0;
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    const before = out.slice(c.from, c.to);
    const after = condenseChunkText(before, mode);
    if (after !== before) {
      out = out.slice(0, c.from) + after + out.slice(c.to);
      count++;
    }
  }
  return { text: out, count };
}

export function uncondenseRange(
  text: string,
  from: number,
  to: number,
): { text: string; count: number } {
  const slice = text.slice(from, to);
  let count = 0;
  const replaced = slice.replace(/[ \t]?¶[ \t]?/g, () => {
    count++;
    return "\n\n";
  });
  return { text: text.slice(0, from) + replaced + text.slice(to), count };
}

export interface ShrinkOpts {
  defaultColor: string;
  shrinkOmissions: boolean;
  /** force a direction instead of toggling */
  force?: "shrink" | "unshrink";
}

/**
 * Wrap non-underlined body text in <small>. Toggles: if every candidate char
 * in the target is already shrunk, unshrinks instead. Omission notes are
 * exempt unless opts.shrinkOmissions.
 */
export function shrinkRange(
  text: string,
  from: number,
  to: number,
  opts: ShrinkOpts,
): { text: string; action: "shrink" | "unshrink" } | null {
  const chunks = bodyChunks(text, from, to);
  interface Job {
    ls: number;
    le: number;
    chars: ReturnType<typeof parseLine>;
    ci: number;
    cj: number;
    exempt: boolean[];
  }
  const jobs: Job[] = [];
  for (const chunk of chunks) {
    for (const line of splitLines(text)) {
      if (line.end <= chunk.from) continue;
      if (line.start >= chunk.to) break;
      if (line.text.trim() === "") continue;
      const chars = parseLine(line.text, opts.defaultColor);
      let [ci, cj] = rangeToCharIdx(
        chars,
        Math.max(chunk.from, line.start) - line.start,
        Math.min(chunk.to, line.end) - line.start,
      );
      [ci, cj] = trimIdx(chars, ci, cj);
      if (ci >= cj) continue;
      const exempt = new Array<boolean>(chars.length).fill(false);
      if (!opts.shrinkOmissions) {
        const plain = plainText(chars);
        for (const note of OMISSION_NOTES) {
          let idx = plain.indexOf(note);
          while (idx >= 0) {
            for (let k = idx; k < idx + note.length; k++) exempt[k] = true;
            idx = plain.indexOf(note, idx + note.length);
          }
        }
      }
      jobs.push({ ls: line.start, le: line.end, chars, ci, cj, exempt });
    }
  }

  let anyCandidate = false;
  let allShrunk = true;
  for (const j of jobs) {
    for (let i = j.ci; i < j.cj; i++) {
      const c = j.chars[i];
      if (/\s/.test(c.ch) || c.m.u || j.exempt[i]) continue;
      anyCandidate = true;
      if (!c.m.sm) allShrunk = false;
    }
  }
  if (!anyCandidate) return null;
  const action: "shrink" | "unshrink" =
    opts.force ?? (allShrunk ? "unshrink" : "shrink");

  let out = text;
  for (let jIdx = jobs.length - 1; jIdx >= 0; jIdx--) {
    const j = jobs[jIdx];
    let changed = false;
    for (let i = j.ci; i < j.cj; i++) {
      const c = j.chars[i];
      if (c.m.u || j.exempt[i]) continue;
      const want = action === "shrink";
      if (c.m.sm !== want) {
        c.m.sm = want;
        changed = true;
      }
    }
    if (!changed) continue;
    const ser = serialize(j.chars, opts.defaultColor);
    out = out.slice(0, j.ls) + ser.text + out.slice(j.le);
  }
  return { text: out, action };
}

/** Paste Text (SPEC.md §3.2): flatten clipboard content to plain prose. */
export function plainizePaste(s: string): string {
  let out = s.replace(/\r\n?/g, "\n");
  out = out.replace(/ /g, " ").replace(/\t/g, " ");
  out = out.replace(/<[^>\n]+>/g, "");
  out = out.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  out = out.replace(/^([ \t]*)[-*+][ \t]+/gm, "$1");
  out = out.replace(/^([ \t]*)>[ \t]?/gm, "$1");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}
