/**
 * Cite automation (SPEC.md §3.4): Auto Format Cite, Reformat All Cites,
 * Duplicate Cite. Pure text functions.
 */

import { cardsInRange, isCitePattern, lineBoundsAt, splitLines, isHeadingLine } from "./cardModel";
import { stripInline } from "./marks";

/**
 * Apply Cite emphasis to a one-line cite: bold the last name, and bold the
 * month-day for current-year cites or the year for older ones. Strips any
 * existing inline marks first. Returns null if the line is unparseable.
 */
export function formatCiteLine(line: string, currentYear: number): string | null {
  const plain = stripInline(line).trim();
  if (plain === "") return null;
  const qIdx = plain.search(/["“]/);
  if (qIdx < 1) return null;
  const commaIdx = plain.indexOf(",");
  if (commaIdx <= 0 || commaIdx > qIdx) return null;

  // last date token before the quoted title
  const dateRe = /\d{1,2}-\d{1,2}-\d{2,4}|\b\d{4}\b/g;
  let dm: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = dateRe.exec(plain)) !== null) {
    if (m.index >= qIdx) break;
    dm = m;
  }
  if (!dm) return null;
  const token = dm[0];
  let rep: string;
  const mdY = /^(\d{1,2}-\d{1,2})-(\d{2,4})$/.exec(token);
  if (mdY) {
    const yr = parseInt(mdY[2], 10);
    const yrFull = mdY[2].length === 2 ? 2000 + yr : yr;
    rep =
      yrFull === currentYear
        ? `**${mdY[1]}**-${mdY[2]}`
        : `${mdY[1]}-**${mdY[2]}**`;
  } else {
    rep = `**${token}**`;
  }
  let out = plain.slice(0, dm.index) + rep + plain.slice(dm.index + token.length);

  // bold the last word of the name segment (before the first comma)
  const seg = out.slice(0, commaIdx);
  const words = seg.trim().split(/\s+/);
  const last = words[words.length - 1];
  if (last) {
    const pos = seg.lastIndexOf(last);
    if (pos >= 0) out = out.slice(0, pos) + `**${last}**` + out.slice(pos + last.length);
  }
  return out;
}

export function reformatAllCites(
  text: string,
  currentYear: number,
): { text: string; formatted: number; skipped: number } {
  const cards = cardsInRange(text);
  let out = text;
  let formatted = 0;
  let skipped = 0;
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i];
    if (c.citeStart === null || c.citeEnd === null) {
      skipped++;
      continue;
    }
    const raw = out.slice(c.citeStart, c.citeEnd);
    const fmt = formatCiteLine(raw, currentYear);
    if (fmt === null) {
      skipped++;
      continue;
    }
    if (fmt !== raw) {
      out = out.slice(0, c.citeStart) + fmt + out.slice(c.citeEnd);
      formatted++;
    }
  }
  return { text: out, formatted, skipped };
}

/** Raw text of the nearest cite line strictly above `offset`'s line, or null. */
export function previousCiteLine(text: string, offset: number): string | null {
  const [curStart] = lineBoundsAt(text, offset);
  let best: string | null = null;
  for (const line of splitLines(text)) {
    if (line.start >= curStart) break;
    if (isHeadingLine(line.text)) continue;
    if (isCitePattern(line.text)) best = line.text;
  }
  return best;
}
