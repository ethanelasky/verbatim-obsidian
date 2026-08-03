/**
 * Document fixers and removal tools (SPEC.md §3.6). All operate on the whole
 * document text and return the new text plus a change count for reporting.
 */

import {
  citeLineStarts,
  isCitePattern,
  isHeadingLine,
  splitLines,
} from "./cardModel";
import { eqMarks, parseLine, plainText, serialize, stripInline, PChar } from "./marks";

export interface FixResult {
  text: string;
  count: number;
}

function mapLines(
  text: string,
  fn: (lineText: string, start: number) => string | null,
): FixResult {
  let out = "";
  let cursor = 0;
  let count = 0;
  for (const line of splitLines(text)) {
    out += text.slice(cursor, line.start);
    cursor = line.end;
    const repl = fn(line.text, line.start);
    if (repl !== null && repl !== line.text) {
      out += repl;
      count++;
    } else {
      out += line.text;
    }
  }
  out += text.slice(cursor);
  return { text: out, count };
}

/** Convert bold pseudo-tags (and bold-leading lines above cites) to H4 tags. */
export function fixFakeTags(text: string, defaultColor: string): FixResult {
  const lines = splitLines(text);
  const nextNonBlank = (i: number): string | null => {
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].text.trim() !== "") return lines[j].text;
    }
    return null;
  };
  let idx = -1;
  return mapLines(text, (t) => {
    idx++;
    if (t.trim() === "" || isHeadingLine(t) || isCitePattern(t)) return null;
    const chars = parseLine(t, defaultColor);
    const nonWs = chars.filter((c) => !/\s/.test(c.ch));
    if (nonWs.length === 0) return null;
    const plain = plainText(chars).trim();
    if (plain.length > 200) return null;
    const fullyBold = nonWs.every((c) => c.m.b || c.m.cb);
    const startsBold = nonWs[0].m.b || nonWs[0].m.cb;
    const next = nextNonBlank(idx);
    const aboveCite = next !== null && isCitePattern(next);
    if (fullyBold || (startsBold && aboveCite)) return `###### ${plain}`;
    return null;
  });
}

/** Close single-whitespace gaps between identically-marked runs. */
export function fixFormattingGaps(text: string, defaultColor: string): FixResult {
  const cites = citeLineStarts(text);
  return mapLines(text, (t, start) => {
    if (t.trim() === "" || isHeadingLine(t) || cites.has(start)) return null;
    if (!/[<*=]/.test(t)) return null;
    const chars = parseLine(t, defaultColor);
    let changed = false;
    for (let i = 1; i < chars.length - 1; i++) {
      if (!/\s/.test(chars[i].ch)) continue;
      if (
        !eqMarks(chars[i].m, chars[i - 1].m) &&
        eqMarks(chars[i - 1].m, chars[i + 1].m)
      ) {
        chars[i].m = { ...chars[i - 1].m };
        changed = true;
      }
    }
    return changed ? serialize(chars, defaultColor).text : null;
  });
}

/** Normalize foreign markup into the plugin's mark vocabulary. */
export function convertToDefaultStyles(text: string): FixResult {
  let count = 0;
  const sub = (s: string, re: RegExp, rep: string): string =>
    s.replace(re, () => {
      count++;
      return rep;
    });
  let out = text;
  out = sub(out, /<\/?strong\s*>/gi, "**");
  out = sub(out, /<\/?(?:em|i)\s*>/gi, "");
  out = sub(out, /__/g, "**");
  out = sub(out, /&nbsp;/g, " ");
  out = sub(out, / /g, " ");
  out = out.replace(/<br\s*\/?>/gi, () => {
    count++;
    return "\n";
  });
  // strip any HTML tag that is not part of the vocabulary (u/small/mark/b)
  out = sub(out, /<\/?(?!(?:u|small|mark|b)[\s>/])[a-zA-Z][^>\n]*>/g, "");
  // straighten curly quotes on cite lines
  const fixed = mapLines(out, (t) => {
    if (!/[“”‘’]/.test(t)) return null;
    if (!isCitePattern(t)) return null;
    return t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  });
  return { text: fixed.text, count: count + fixed.count };
}

/** Delete blank lines and empty heading lines (Verbatim: empty paragraphs). */
export function removeBlanks(text: string): FixResult {
  let count = 0;
  let out = text.replace(/^#{1,6}[ \t]*$\n?/gm, () => {
    count++;
    return "";
  });
  // each blank (whitespace-only) line: a newline + spaces followed by another
  // newline; the lookahead keeps consecutive blanks collapsing fully
  out = out.replace(/\n[ \t]*(?=\n)/g, () => {
    count++;
    return "";
  });
  out = out.replace(/^[ \t]*\n/, () => {
    count++;
    return "";
  });
  return { text: out, count };
}

export function removePilcrows(text: string): FixResult {
  let count = 0;
  const res = mapLines(text, (t) => {
    if (!t.includes("¶")) return null;
    const repl = t
      .replace(/[ \t]?¶[ \t]?/g, () => {
        count++;
        return " ";
      })
      .replace(/[ \t]{2,}/g, " ");
    return repl;
  });
  return { text: res.text, count };
}

/** [text](url) → text (body) or url (cite lines); unwrap <autolinks>. */
export function removeHyperlinks(text: string): FixResult {
  const cites = citeLineStarts(text);
  let count = 0;
  const res = mapLines(text, (t, start) => {
    if (!/\[|<https?:/.test(t)) return null;
    const isCite = cites.has(start) || isCitePattern(t);
    let repl = t.replace(
      /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      (_all, label: string, url: string) => {
        count++;
        return isCite ? url : label;
      },
    );
    repl = repl.replace(/<(https?:[^>\s]+)>/g, (_all, url: string) => {
      count++;
      return url;
    });
    return repl;
  });
  return { text: res.text, count };
}

/** Convert body-text Emphasis to plain underlining. */
export function removeEmphasis(text: string, defaultColor: string): FixResult {
  const cites = citeLineStarts(text);
  return mapLines(text, (t, start) => {
    if (t.trim() === "" || isHeadingLine(t)) return null;
    if (cites.has(start) || isCitePattern(t)) return null;
    if (!t.includes("**")) return null;
    const chars = parseLine(t, defaultColor);
    let changed = false;
    for (const c of chars) {
      if (c.m.b) {
        c.m.b = false;
        c.m.u = true;
        changed = true;
      }
    }
    return changed ? serialize(chars, defaultColor).text : null;
  });
}

/** Strip underlining from runs that contain no highlighted character. */
export function removeNonHighlightedUnderlining(
  text: string,
  defaultColor: string,
): FixResult {
  return mapLines(text, (t) => {
    if (t.trim() === "" || isHeadingLine(t) || !t.includes("<u>")) return null;
    const chars = parseLine(t, defaultColor);
    let changed = false;
    let i = 0;
    while (i < chars.length) {
      if (!chars[i].m.u) { i++; continue; }
      let j = i;
      let hasHl = false;
      while (j < chars.length && chars[j].m.u) {
        if (chars[j].m.hl !== null) hasHl = true;
        j++;
      }
      if (!hasHl) {
        for (let k = i; k < j; k++) chars[k].m.u = false;
        changed = true;
      }
      i = j;
    }
    return changed ? serialize(chars, defaultColor).text : null;
  });
}

/**
 * Select Similar: every range in the document carrying the same mark
 * combination as the char at `offset` — or, on a heading line, every heading
 * of the same level. Returns absolute [from, to) ranges or null.
 */
export function similarRanges(
  text: string,
  offset: number,
  defaultColor: string,
): [number, number][] | null {
  const lines = splitLines(text);
  const line = lines.find((l) => l.start <= offset && offset <= l.end);
  if (!line) return null;

  const hm = /^(#{1,6})[ \t]+/.exec(line.text);
  if (hm) {
    const level = hm[1].length;
    const out: [number, number][] = [];
    for (const l of lines) {
      const m = /^(#{1,6})[ \t]+/.exec(l.text);
      if (m && m[1].length === level) {
        out.push([l.start + m[0].length, l.end]);
      }
    }
    return out.length > 0 ? out : null;
  }

  const chars = parseLine(line.text, defaultColor);
  const rel = offset - line.start;
  let target: PChar | null = null;
  for (const c of chars) {
    if (c.src >= rel) { target = c; break; }
    target = c;
  }
  if (!target) return null;
  const M = target.m;
  if (!M.u && !M.b && !M.sm && !M.cb && M.hl === null) return null;

  const out: [number, number][] = [];
  for (const l of lines) {
    if (l.text.trim() === "" || isHeadingLine(l.text)) continue;
    const cs = parseLine(l.text, defaultColor);
    let i = 0;
    while (i < cs.length) {
      if (!eqMarks(cs[i].m, M)) { i++; continue; }
      let j = i;
      while (j < cs.length && eqMarks(cs[j].m, M)) j++;
      out.push([l.start + cs[i].src, l.start + cs[j - 1].src + 1]);
      i = j;
    }
  }
  return out.length > 0 ? out : null;
}
