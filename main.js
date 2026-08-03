"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VerbatimPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/marks.ts
var HL_COLORS = [
  "yellow",
  "green",
  "cyan",
  "magenta",
  "blue",
  "gray",
  "orange"
];
var MARK_OPEN = /^<mark class="vb-hl-([a-z]+)">/;
function parseLine(line, defaultColor) {
  const chars = [];
  let u = false;
  let b = false;
  let sm = false;
  let cb = false;
  let hl = null;
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    if (rest.startsWith("<u>")) {
      u = true;
      i += 3;
      continue;
    }
    if (rest.startsWith("</u>")) {
      u = false;
      i += 4;
      continue;
    }
    if (rest.startsWith("<b>")) {
      cb = true;
      i += 3;
      continue;
    }
    if (rest.startsWith("</b>")) {
      cb = false;
      i += 4;
      continue;
    }
    if (rest.startsWith("<small>")) {
      sm = true;
      i += 7;
      continue;
    }
    if (rest.startsWith("</small>")) {
      sm = false;
      i += 8;
      continue;
    }
    const mo = MARK_OPEN.exec(rest);
    if (mo) {
      hl = mo[1];
      i += mo[0].length;
      continue;
    }
    if (rest.startsWith("<mark>")) {
      hl = defaultColor;
      i += 6;
      continue;
    }
    if (rest.startsWith("</mark>")) {
      hl = null;
      i += 7;
      continue;
    }
    if (rest.startsWith("**")) {
      b = !b;
      i += 2;
      continue;
    }
    if (rest.startsWith("==")) {
      hl = hl === null ? defaultColor : null;
      i += 2;
      continue;
    }
    chars.push({ ch: line[i], src: i, m: { u, hl, b, sm, cb } });
    i++;
  }
  return chars;
}
function plainText(chars) {
  let s = "";
  for (const c of chars) s += c.ch;
  return s;
}
function stripInline(line) {
  return plainText(parseLine(line, "yellow"));
}
function eqMarks(a, b) {
  return a.u === b.u && a.b === b.b && a.sm === b.sm && a.cb === b.cb && a.hl === b.hl;
}
function rangeToCharIdx(chars, from, to) {
  let ci = chars.findIndex((c) => c.src >= from);
  if (ci < 0) ci = chars.length;
  let cj = 0;
  for (const c of chars) if (c.src < to) cj++;
  if (cj < ci) cj = ci;
  return [ci, cj];
}
function trimIdx(chars, ci, cj) {
  while (ci < cj && /\s/.test(chars[ci].ch)) ci++;
  while (cj > ci && /\s/.test(chars[cj - 1].ch)) cj--;
  return [ci, cj];
}
function normalizeBoundaries(chars) {
  for (const key of ["b", "hl"]) {
    let i = 0;
    while (i < chars.length) {
      const activeAt = (k) => key === "b" ? chars[k].m.b : chars[k].m.hl !== null && chars[k].m.hl === chars[i].m.hl;
      if (!(key === "b" ? chars[i].m.b : chars[i].m.hl !== null)) {
        i++;
        continue;
      }
      let j = i;
      while (j < chars.length && activeAt(j)) j++;
      let s = i;
      let e = j;
      while (s < e && /\s/.test(chars[s].ch)) {
        clearMark(chars[s], key);
        s++;
      }
      while (e > s && /\s/.test(chars[e - 1].ch)) {
        clearMark(chars[e - 1], key);
        e--;
      }
      i = j;
    }
  }
}
function clearMark(c, key) {
  if (key === "b") c.m.b = false;
  else c.m.hl = null;
}
function serialize(chars, defaultColor) {
  normalizeBoundaries(chars);
  let out = "";
  const outOf = [];
  const stack = [];
  const openTok = (t) => t.k === "u" ? "<u>" : t.k === "b" ? "**" : t.k === "sm" ? "<small>" : t.k === "cb" ? "<b>" : t.hl === defaultColor ? "==" : `<mark class="vb-hl-${t.hl}">`;
  const closeTok = (t) => t.k === "u" ? "</u>" : t.k === "b" ? "**" : t.k === "sm" ? "</small>" : t.k === "cb" ? "</b>" : t.hl === defaultColor ? "==" : "</mark>";
  const desired = (m) => {
    const d = [];
    if (m.u) d.push({ k: "u" });
    if (m.hl !== null) d.push({ k: "hl", hl: m.hl });
    if (m.b) d.push({ k: "b" });
    if (m.sm) d.push({ k: "sm" });
    if (m.cb) d.push({ k: "cb" });
    return d;
  };
  const closeDownTo = (n) => {
    for (let j = stack.length - 1; j >= n; j--) out += closeTok(stack[j]);
    stack.length = n;
  };
  for (const c of chars) {
    const d = desired(c.m);
    let common = 0;
    while (common < stack.length && common < d.length && stack[common].k === d[common].k && stack[common].hl === d[common].hl) {
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

// src/cardModel.ts
var LEVELS = { pocket: 3, hat: 4, block: 5, tag: 6 };
var TAG_LEVEL = LEVELS.tag;
var OMISSION_NOTES = [
  "[ Table Omitted ]",
  "[ Figure Omitted ]",
  "< Image Omitted >",
  "< Nothing Omitted >"
];
function splitLines(text) {
  const lines = [];
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
function lineBoundsAt(text, offset) {
  const start = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  let end = text.indexOf("\n", offset);
  if (end < 0) end = text.length;
  return [start, end];
}
function isHeadingLine(line) {
  return /^#{1,6}[ \t]/.test(line);
}
function parseHeadings(text) {
  const hs = [];
  const re = /^(#{1,6})[ \t]+(.*)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    hs.push({
      index: hs.length,
      level: m[1].length,
      start: m.index,
      lineEnd: m.index + m[0].length,
      contentStart: m.index + m[1].length + 1,
      text: m[2],
      sectionEnd: text.length
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
function sectionAt(text, offset, headings) {
  const hs = headings ?? parseHeadings(text);
  let best = null;
  for (const h of hs) {
    if (h.start <= offset && offset < Math.max(h.sectionEnd, h.lineEnd + 1)) {
      best = h;
    }
    if (h.start > offset) break;
  }
  return best;
}
function enclosingSection(text, offset, maxLevel, headings) {
  const hs = headings ?? parseHeadings(text);
  let best = null;
  for (const h of hs) {
    if (h.level <= maxLevel && h.start <= offset && offset < Math.max(h.sectionEnd, h.lineEnd + 1)) {
      best = h;
    }
    if (h.start > offset) break;
  }
  return best;
}
function isCitePattern(line) {
  if (isHeadingLine(line)) return false;
  const plain = stripInline(line).trim();
  const m = /(^|[,\s])(\d{1,2}-\d{1,2}-\d{2,4}|\d{4})\s*,\s*["“]/.exec(plain);
  if (!m) return false;
  return plain.slice(0, m.index + 1).includes(",");
}
function cardAt(text, offset, headings) {
  const hs = headings ?? parseHeadings(text);
  let tag = null;
  for (const h of hs) {
    if (h.level === TAG_LEVEL && h.start <= offset && offset < Math.max(h.sectionEnd, h.lineEnd + 1)) {
      tag = h;
    }
    if (h.start > offset) break;
  }
  if (!tag) return null;
  return cardFromTag(text, tag);
}
function cardFromTag(text, tag) {
  const card = {
    tagStart: tag.start,
    tagEnd: tag.lineEnd,
    citeStart: null,
    citeEnd: null,
    bodyStart: Math.min(tag.lineEnd + 1, tag.sectionEnd),
    end: tag.sectionEnd
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
function cardsInRange(text, from = 0, to = text.length) {
  const hs = parseHeadings(text);
  const out = [];
  for (const h of hs) {
    if (h.level !== TAG_LEVEL) continue;
    if (h.sectionEnd <= from || h.start >= to) continue;
    out.push(cardFromTag(text, h));
  }
  return out;
}
function citeLineStarts(text) {
  const set = /* @__PURE__ */ new Set();
  for (const c of cardsInRange(text)) {
    if (c.citeStart !== null) set.add(c.citeStart);
  }
  return set;
}
function resolveScope(text, selFrom, selTo) {
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
    if (h && h.level < TAG_LEVEL) {
      return { from: h.start, to: h.sectionEnd, kind: "section" };
    }
  }
  const card = cardAt(text, off, hs);
  if (card) return { from: card.tagStart, to: card.end, kind: "card" };
  const sec = sectionAt(text, off, hs);
  if (sec) return { from: sec.start, to: sec.sectionEnd, kind: "section" };
  return { from: ls, to: le, kind: "line" };
}
function bodyChunks(text, from, to) {
  const cites = citeLineStarts(text);
  const chunks = [];
  let cur = null;
  for (const line of splitLines(text)) {
    if (line.end <= from) continue;
    if (line.start >= to) break;
    const boundary = isHeadingLine(line.text) || cites.has(line.start);
    if (boundary) {
      if (cur) {
        chunks.push(cur);
        cur = null;
      }
      continue;
    }
    const f = Math.max(from, line.start);
    const t = Math.min(to, line.end);
    if (cur) cur.to = t;
    else cur = { from: f, to: t };
  }
  if (cur) chunks.push(cur);
  const trimmed = [];
  for (const c of chunks) {
    let { from: f, to: t } = c;
    while (f < t && /\s/.test(text[f])) f++;
    while (t > f && /\s/.test(text[t - 1])) t--;
    if (t > f) trimmed.push({ from: f, to: t });
  }
  return trimmed;
}

// src/cutting.ts
var PILCROW_SEP = " \xB6 ";
function condenseChunkText(s, mode) {
  const sep = mode === "pilcrows" ? PILCROW_SEP : " ";
  let out = s.trim().replace(/[ \t]*(?:\n[ \t]*)+/g, sep);
  out = out.replace(/[ \t]{2,}/g, " ");
  return out;
}
function condenseRange(text, from, to, mode) {
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
function uncondenseRange(text, from, to) {
  const slice = text.slice(from, to);
  let count = 0;
  const replaced = slice.replace(/[ \t]?¶[ \t]?/g, () => {
    count++;
    return "\n\n";
  });
  return { text: text.slice(0, from) + replaced + text.slice(to), count };
}
function shrinkRange(text, from, to, opts) {
  const chunks = bodyChunks(text, from, to);
  const jobs = [];
  for (const chunk of chunks) {
    for (const line of splitLines(text)) {
      if (line.end <= chunk.from) continue;
      if (line.start >= chunk.to) break;
      if (line.text.trim() === "") continue;
      const chars = parseLine(line.text, opts.defaultColor);
      let [ci, cj] = rangeToCharIdx(
        chars,
        Math.max(chunk.from, line.start) - line.start,
        Math.min(chunk.to, line.end) - line.start
      );
      [ci, cj] = trimIdx(chars, ci, cj);
      if (ci >= cj) continue;
      const exempt = new Array(chars.length).fill(false);
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
  const action = opts.force ?? (allShrunk ? "unshrink" : "shrink");
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
function plainizePaste(s) {
  let out = s.replace(/\r\n?/g, "\n");
  out = out.replace(/ /g, " ").replace(/\t/g, " ");
  out = out.replace(/<[^>\n]+>/g, "");
  out = out.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  out = out.replace(/^([ \t]*)[-*+][ \t]+/gm, "$1");
  out = out.replace(/^([ \t]*)>[ \t]?/gm, "$1");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

// src/inline.ts
function applyInline(text, from, to, op, opts) {
  const jobs = [];
  for (const line of splitLines(text)) {
    if (line.end <= from) continue;
    if (line.start >= to) break;
    if (line.text.trim() === "" || isHeadingLine(line.text)) continue;
    const chars = parseLine(line.text, opts.defaultColor);
    let [ci, cj] = rangeToCharIdx(
      chars,
      Math.max(from, line.start) - line.start,
      Math.min(to, line.end) - line.start
    );
    [ci, cj] = trimIdx(chars, ci, cj);
    if (ci >= cj) continue;
    jobs.push({ ls: line.start, le: line.end, chars, ci, cj });
  }
  if (jobs.length === 0) return null;
  let hasAll = true;
  if (op !== "clear" && !opts.force) {
    outer: for (const j of jobs) {
      for (let i = j.ci; i < j.cj; i++) {
        const c = j.chars[i];
        if (/\s/.test(c.ch)) continue;
        const has = op === "underline" ? c.m.u : op === "emphasis" ? c.m.b : c.m.hl === opts.currentColor;
        if (!has) {
          hasAll = false;
          break outer;
        }
      }
    }
  } else {
    hasAll = false;
  }
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
      selFrom = newLineStart + (j.ci < j.chars.length ? ser.outOf[j.ci] : ser.text.length);
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

// src/structure.ts
function setHeadingLevel(text, from, to, level) {
  let out = "";
  let cursor = 0;
  let changed = false;
  let newFrom = -1;
  let newTo = -1;
  const nonEmptySel = to > from;
  for (const line of splitLines(text)) {
    out += text.slice(cursor, line.start);
    cursor = line.end;
    const intersects = nonEmptySel ? line.start < to && line.end > from : line.start <= from && from <= line.end;
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
function ensureNl(text) {
  return text.endsWith("\n") || text === "" ? text : text + "\n";
}
function innermost(text, offset) {
  const t = ensureNl(text);
  const hs = parseHeadings(t);
  const h = sectionAt(t, Math.min(offset, Math.max(0, t.length - 1)), hs);
  return { t, h, hs };
}
function moveSection(text, offset, dir) {
  const { t, h, hs } = innermost(text, offset);
  if (!h) return null;
  const block = t.slice(h.start, h.sectionEnd);
  const rel = Math.max(0, Math.min(offset - h.start, block.length - 1));
  if (dir === "up") {
    let p = null;
    for (let i = h.index - 1; i >= 0; i--) {
      if (hs[i].level < h.level) break;
      if (hs[i].level === h.level) {
        p = hs[i];
        break;
      }
    }
    if (!p || p.sectionEnd !== h.start) return null;
    const newText2 = t.slice(0, p.start) + block + t.slice(p.start, p.sectionEnd) + t.slice(h.sectionEnd);
    return { text: newText2, cursor: p.start + rel };
  }
  if (dir === "down") {
    const n = hs.find((x) => x.start === h.sectionEnd);
    if (!n || n.level !== h.level) return null;
    const nBlock = t.slice(n.start, n.sectionEnd);
    const newText2 = t.slice(0, h.start) + nBlock + block + t.slice(n.sectionEnd);
    return { text: newText2, cursor: h.start + nBlock.length + rel };
  }
  let parentEnd = t.length;
  for (let i = h.index - 1; i >= 0; i--) {
    if (hs[i].level < h.level) {
      parentEnd = hs[i].sectionEnd;
      break;
    }
  }
  if (parentEnd <= h.sectionEnd) return null;
  const newText = t.slice(0, h.start) + t.slice(h.sectionEnd, parentEnd) + block + t.slice(parentEnd);
  return { text: newText, cursor: h.start + (parentEnd - h.sectionEnd) + rel };
}
function deleteSection(text, offset) {
  const { t, h } = innermost(text, offset);
  if (!h) return null;
  return { text: t.slice(0, h.start) + t.slice(h.sectionEnd), cursor: h.start };
}
function sectionRange(text, offset) {
  const { h } = innermost(text, offset);
  if (!h) return null;
  let end = h.sectionEnd;
  while (end > h.lineEnd && /\s/.test(text[end - 1] ?? "\n")) end--;
  return [h.start, end];
}

// src/cites.ts
function formatCiteLine(line, currentYear) {
  const plain = stripInline(line).trim();
  if (plain === "") return null;
  const qIdx = plain.search(/["“]/);
  if (qIdx < 1) return null;
  const commaIdx = plain.indexOf(",");
  if (commaIdx <= 0 || commaIdx > qIdx) return null;
  const dateRe = /\d{1,2}-\d{1,2}-\d{2,4}|\b\d{4}\b/g;
  let dm = null;
  let m;
  while ((m = dateRe.exec(plain)) !== null) {
    if (m.index >= qIdx) break;
    dm = m;
  }
  if (!dm) return null;
  const token = dm[0];
  let rep;
  const mdY = /^(\d{1,2}-\d{1,2})-(\d{2,4})$/.exec(token);
  if (mdY) {
    const yr = parseInt(mdY[2], 10);
    const yrFull = mdY[2].length === 2 ? 2e3 + yr : yr;
    rep = yrFull === currentYear ? `<b>${mdY[1]}</b>-${mdY[2]}` : `${mdY[1]}-<b>${mdY[2]}</b>`;
  } else {
    rep = `<b>${token}</b>`;
  }
  let out = plain.slice(0, dm.index) + rep + plain.slice(dm.index + token.length);
  const seg = out.slice(0, commaIdx);
  const words = seg.trim().split(/\s+/);
  const last = words[words.length - 1];
  if (last) {
    const pos = seg.lastIndexOf(last);
    if (pos >= 0) out = out.slice(0, pos) + `<b>${last}</b>` + out.slice(pos + last.length);
  }
  return out;
}
function reformatAllCites(text, currentYear) {
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
function previousCiteLine(text, offset) {
  const [curStart] = lineBoundsAt(text, offset);
  let best = null;
  for (const line of splitLines(text)) {
    if (line.start >= curStart) break;
    if (isHeadingLine(line.text)) continue;
    if (isCitePattern(line.text)) best = line.text;
  }
  return best;
}

// src/citeExtract.ts
function formatDateMDY(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (m) return `${parseInt(m[2], 10)}-${parseInt(m[3], 10)}-${m[1]}`;
  const d = new Date(iso);
  if (!isNaN(d.getTime())) {
    return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
  }
  return null;
}
function buildCiteLine(meta, placeholder) {
  const author = meta.author?.trim() || `${placeholder} ${placeholder}`;
  const quals = meta.site?.trim() || placeholder;
  const date = meta.date ? formatDateMDY(meta.date) ?? placeholder : placeholder;
  const title = (meta.title?.trim() || placeholder).replace(/"/g, "'");
  return `${author}, ${quals}, ${date}, "${title}," ${meta.url}`;
}
function collectJsonLdNodes(value, acc) {
  if (Array.isArray(value)) {
    for (const v of value) collectJsonLdNodes(v, acc);
    return;
  }
  if (value && typeof value === "object") {
    const node = value;
    acc.push(node);
    if (node["@graph"]) collectJsonLdNodes(node["@graph"], acc);
  }
}
function authorName(author) {
  if (typeof author === "string") return author;
  if (Array.isArray(author)) {
    for (const a of author) {
      const n = authorName(a);
      if (n) return n;
    }
    return void 0;
  }
  if (author && typeof author === "object") {
    const n = author["name"];
    if (typeof n === "string") return n;
  }
  return void 0;
}
function extractCiteMeta(html, url) {
  const meta = { url };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      collectJsonLdNodes(JSON.parse(s.textContent ?? ""), nodes);
    } catch {
    }
  });
  for (const node of nodes) {
    const type = node["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (!types.some((t) => typeof t === "string" && /article|report|posting/i.test(t))) {
      continue;
    }
    meta.author = meta.author ?? authorName(node["author"]);
    const date = node["datePublished"] ?? node["dateCreated"];
    if (!meta.date && typeof date === "string") meta.date = date;
    const headline = node["headline"];
    if (!meta.title && typeof headline === "string") meta.title = headline;
    const pub = node["publisher"];
    if (!meta.site && pub && typeof pub === "object") {
      const n = pub["name"];
      if (typeof n === "string") meta.site = n;
    }
  }
  const content = (sel) => doc.querySelector(sel)?.getAttribute("content")?.trim() || void 0;
  meta.author = meta.author ?? content('meta[name="author"]') ?? content('meta[property="article:author"]');
  meta.date = meta.date ?? content('meta[property="article:published_time"]') ?? content('meta[name="date"]') ?? content('meta[name="publish-date"]');
  meta.title = meta.title ?? content('meta[property="og:title"]') ?? content('meta[name="twitter:title"]');
  meta.site = meta.site ?? content('meta[property="og:site_name"]');
  if (!meta.title) {
    const t = doc.querySelector("title")?.textContent?.trim();
    if (t) meta.title = t;
  }
  if (!meta.site) {
    try {
      meta.site = new URL(url).hostname.replace(/^www\./, "");
    } catch {
    }
  }
  if (meta.author && /https?:\/\//.test(meta.author)) meta.author = void 0;
  return meta;
}

// src/automation.ts
function autoEmphasizeFirst(text, from, to, defaultColor) {
  let out = "";
  let cursor = 0;
  let changed = false;
  for (const line of splitLines(text)) {
    out += text.slice(cursor, line.start);
    cursor = line.end;
    if (line.end <= from || line.start >= to || line.text.trim() === "" || isHeadingLine(line.text)) {
      out += line.text;
      continue;
    }
    const chars = parseLine(line.text, defaultColor);
    let [ci, cj] = rangeToCharIdx(
      chars,
      Math.max(from, line.start) - line.start,
      Math.min(to, line.end) - line.start
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
function standardizeHighlighting(text, color, exception, defaultColor) {
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
function autoNumberTags(text, from, to) {
  return renumberTags(text, from, to, true);
}
function deNumberTags(text, from, to) {
  return renumberTags(text, from, to, false);
}
function renumberTags(text, from, to, number) {
  const hs = parseHeadings(text);
  const counters = /* @__PURE__ */ new Map();
  const edits = [];
  for (const h of hs) {
    if (h.level !== 6 || h.start < from || h.start >= to) continue;
    let parentKey = -1;
    for (let i = h.index - 1; i >= 0; i--) {
      if (hs[i].level < 6) {
        parentKey = hs[i].index;
        break;
      }
    }
    const bare = h.text.replace(/^\d+\.[ \t]+/, "");
    let newLine;
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

// src/fixers.ts
function mapLines(text, fn) {
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
function fixFakeTags(text, defaultColor) {
  const lines = splitLines(text);
  const nextNonBlank = (i) => {
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
    if (fullyBold || startsBold && aboveCite) return `###### ${plain}`;
    return null;
  });
}
function fixFormattingGaps(text, defaultColor) {
  const cites = citeLineStarts(text);
  return mapLines(text, (t, start) => {
    if (t.trim() === "" || isHeadingLine(t) || cites.has(start)) return null;
    if (!/[<*=]/.test(t)) return null;
    const chars = parseLine(t, defaultColor);
    let changed = false;
    for (let i = 1; i < chars.length - 1; i++) {
      if (!/\s/.test(chars[i].ch)) continue;
      if (!eqMarks(chars[i].m, chars[i - 1].m) && eqMarks(chars[i - 1].m, chars[i + 1].m)) {
        chars[i].m = { ...chars[i - 1].m };
        changed = true;
      }
    }
    return changed ? serialize(chars, defaultColor).text : null;
  });
}
function convertToDefaultStyles(text) {
  let count = 0;
  const sub = (s, re, rep) => s.replace(re, () => {
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
  out = sub(out, /<\/?(?!(?:u|small|mark|b)[\s>/])[a-zA-Z][^>\n]*>/g, "");
  const fixed = mapLines(out, (t) => {
    if (!/[“”‘’]/.test(t)) return null;
    if (!isCitePattern(t)) return null;
    return t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  });
  return { text: fixed.text, count: count + fixed.count };
}
function removeBlanks(text) {
  let count = 0;
  let out = text.replace(/^#{1,6}[ \t]*$\n?/gm, () => {
    count++;
    return "";
  });
  out = out.replace(/\n{3,}/g, () => {
    count++;
    return "\n\n";
  });
  return { text: out, count };
}
function removePilcrows(text) {
  let count = 0;
  const res = mapLines(text, (t) => {
    if (!t.includes("\xB6")) return null;
    const repl = t.replace(/[ \t]?¶[ \t]?/g, () => {
      count++;
      return " ";
    }).replace(/[ \t]{2,}/g, " ");
    return repl;
  });
  return { text: res.text, count };
}
function removeHyperlinks(text) {
  const cites = citeLineStarts(text);
  let count = 0;
  const res = mapLines(text, (t, start) => {
    if (!/\[|<https?:/.test(t)) return null;
    const isCite = cites.has(start) || isCitePattern(t);
    let repl = t.replace(
      /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      (_all, label, url) => {
        count++;
        return isCite ? url : label;
      }
    );
    repl = repl.replace(/<(https?:[^>\s]+)>/g, (_all, url) => {
      count++;
      return url;
    });
    return repl;
  });
  return { text: res.text, count };
}
function removeEmphasis(text, defaultColor) {
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
function removeNonHighlightedUnderlining(text, defaultColor) {
  return mapLines(text, (t) => {
    if (t.trim() === "" || isHeadingLine(t) || !t.includes("<u>")) return null;
    const chars = parseLine(t, defaultColor);
    let changed = false;
    let i = 0;
    while (i < chars.length) {
      if (!chars[i].m.u) {
        i++;
        continue;
      }
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
function similarRanges(text, offset, defaultColor) {
  const lines = splitLines(text);
  const line = lines.find((l) => l.start <= offset && offset <= l.end);
  if (!line) return null;
  const hm = /^(#{1,6})[ \t]+/.exec(line.text);
  if (hm) {
    const level = hm[1].length;
    const out2 = [];
    for (const l of lines) {
      const m = /^(#{1,6})[ \t]+/.exec(l.text);
      if (m && m[1].length === level) {
        out2.push([l.start + m[0].length, l.end]);
      }
    }
    return out2.length > 0 ? out2 : null;
  }
  const chars = parseLine(line.text, defaultColor);
  const rel = offset - line.start;
  let target = null;
  for (const c of chars) {
    if (c.src >= rel) {
      target = c;
      break;
    }
    target = c;
  }
  if (!target) return null;
  const M = target.m;
  if (!M.u && !M.b && !M.sm && !M.cb && M.hl === null) return null;
  const out = [];
  for (const l of lines) {
    if (l.text.trim() === "" || isHeadingLine(l.text)) continue;
    const cs = parseLine(l.text, defaultColor);
    let i = 0;
    while (i < cs.length) {
      if (!eqMarks(cs[i].m, M)) {
        i++;
        continue;
      }
      let j = i;
      while (j < cs.length && eqMarks(cs[j].m, M)) j++;
      out.push([l.start + cs[i].src, l.start + cs[j - 1].src + 1]);
      i = j;
    }
  }
  return out.length > 0 ? out : null;
}

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  condenseMode: "pilcrows",
  condenseOnPaste: false,
  boldUnderline: false,
  autoEmphasis: false,
  shrinkOmissions: false,
  shrinkFactor: 60,
  defaultHl: "yellow",
  exceptionHl: "green",
  currentHl: "yellow",
  emphasisMode: "bold",
  pinnedYear: "",
  placeholder: "XX"
};
var VbSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    new import_obsidian.Setting(containerEl).setName("Format").setHeading();
    new import_obsidian.Setting(containerEl).setName("Default condense mode").setDesc("How Condense joins paragraphs inside a card body.").addDropdown(
      (d) => d.addOptions({
        pilcrows: "With pilcrows (\xB6)",
        nopilcrows: "Without pilcrows",
        nointegrity: "No paragraph integrity"
      }).setValue(s.condenseMode).onChange(async (v) => {
        s.condenseMode = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Condense on paste").setDesc("Automatically condense text inserted by Paste Text.").addToggle(
      (t) => t.setValue(s.condenseOnPaste).onChange(async (v) => {
        s.condenseOnPaste = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Bold underline").setDesc("Underline also bolds the selected text.").addToggle(
      (t) => t.setValue(s.boldUnderline).onChange(async (v) => {
        s.boldUnderline = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Auto emphasis").setDesc("Underline also applies Emphasis.").addToggle(
      (t) => t.setValue(s.autoEmphasis).onChange(async (v) => {
        s.autoEmphasis = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Shrink omission notes").setDesc(
      'Include notes like "[ Table Omitted ]" when shrinking non-underlined text.'
    ).addToggle(
      (t) => t.setValue(s.shrinkOmissions).onChange(async (v) => {
        s.shrinkOmissions = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Shrink factor").setDesc("Rendered size of shrunk text, as a percentage of normal.").addSlider(
      (sl) => sl.setLimits(30, 90, 5).setValue(s.shrinkFactor).setDynamicTooltip().onChange(async (v) => {
        s.shrinkFactor = v;
        await this.plugin.saveSettings();
        this.plugin.applyAppearance();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Highlighting").setHeading();
    const colorOptions = Object.fromEntries(HL_COLORS.map((c) => [c, c]));
    new import_obsidian.Setting(containerEl).setName("Default highlight color").setDesc("The color written as ==\u2026== ; other colors use <mark> tags.").addDropdown(
      (d) => d.addOptions(colorOptions).setValue(s.defaultHl).onChange(async (v) => {
        s.defaultHl = v;
        await this.plugin.saveSettings();
        this.plugin.applyAppearance();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Exception color").setDesc("Color preserved by Standardize Highlighting (with exception).").addDropdown(
      (d) => d.addOptions(colorOptions).setValue(s.exceptionHl).onChange(async (v) => {
        s.exceptionHl = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Emphasis").setHeading();
    new import_obsidian.Setting(containerEl).setName("Emphasis rendering").setDesc("How Emphasis (bold) is displayed in evidence.").addDropdown(
      (d) => d.addOptions({ bold: "Bold", box: "Boxed", large: "Larger text" }).setValue(s.emphasisMode).onChange(async (v) => {
        s.emphasisMode = v;
        await this.plugin.saveSettings();
        this.plugin.applyAppearance();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Cites").setHeading();
    new import_obsidian.Setting(containerEl).setName("Pinned year").setDesc(
      "Auto Format Cite bolds month-day for cites from this year. Leave empty to use the system year."
    ).addText(
      (t) => t.setPlaceholder("e.g. 2026").setValue(s.pinnedYear).onChange(async (v) => {
        s.pinnedYear = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Placeholder token").setDesc("Inserted by Cite from URL for fields it cannot extract.").addText(
      (t) => t.setValue(s.placeholder).onChange(async (v) => {
        s.placeholder = v || "XX";
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/main.ts
function selOffsets(ed) {
  return [
    ed.posToOffset(ed.getCursor("from")),
    ed.posToOffset(ed.getCursor("to"))
  ];
}
var CiteUrlModal = class extends import_obsidian2.Modal {
  constructor(app, initial, onSubmit) {
    super(app);
    this.initial = initial;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    this.titleEl.setText("Cite from URL");
    const input = this.contentEl.createEl("input", {
      type: "text",
      value: this.initial,
      placeholder: "https://\u2026"
    });
    input.style.width = "100%";
    input.focus();
    input.select();
    const submit = () => {
      this.close();
      this.onSubmit(input.value.trim());
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    const row = this.contentEl.createDiv();
    row.style.marginTop = "0.8em";
    row.style.textAlign = "right";
    row.createEl("button", { text: "Insert cite" }).addEventListener("click", submit);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var HlColorModal = class extends import_obsidian2.FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.setPlaceholder("Set current highlight color\u2026");
  }
  getItems() {
    return [...HL_COLORS];
  }
  getItemText(c) {
    return c === this.plugin.settings.currentHl ? `${c} (current)` : c;
  }
  onChooseItem(c) {
    this.plugin.settings.currentHl = c;
    void this.plugin.saveSettings();
    new import_obsidian2.Notice(`Highlight color: ${c}`);
  }
};
var VerbatimPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.underlineMode = false;
    this.applyingUnderline = false;
    this.statusEl = null;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new VbSettingTab(this.app, this));
    this.statusEl = this.addStatusBarItem();
    this.updateStatus();
    this.applyAppearance();
    this.registerCommands();
    this.registerDomEvent(document, "mouseup", () => this.maybeUnderlineSelection());
    this.registerDomEvent(document, "keyup", (e) => {
      if (e.key === "Shift") this.maybeUnderlineSelection();
    });
  }
  onunload() {
    const body = document.body;
    for (const c of HL_COLORS) body.classList.remove(`vb-default-hl-${c}`);
    body.classList.remove("vb-emphasis-box", "vb-emphasis-large");
    body.style.removeProperty("--vb-shrink-scale");
  }
  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() ?? {} };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  applyAppearance() {
    const body = document.body;
    for (const c of HL_COLORS) body.classList.remove(`vb-default-hl-${c}`);
    body.classList.add(`vb-default-hl-${this.settings.defaultHl}`);
    body.classList.remove("vb-emphasis-box", "vb-emphasis-large");
    if (this.settings.emphasisMode === "box") body.classList.add("vb-emphasis-box");
    if (this.settings.emphasisMode === "large") body.classList.add("vb-emphasis-large");
    body.style.setProperty("--vb-shrink-scale", String(this.settings.shrinkFactor / 100));
  }
  currentYear() {
    const pinned = parseInt(this.settings.pinnedYear, 10);
    return Number.isFinite(pinned) && pinned > 1e3 ? pinned : (/* @__PURE__ */ new Date()).getFullYear();
  }
  updateStatus() {
    if (!this.statusEl) return;
    this.statusEl.setText(this.underlineMode ? "U-mode" : "");
    this.statusEl.toggleClass("vb-underline-mode-status", this.underlineMode);
  }
  /** Replace the minimal differing region so cursor/scroll/undo stay sane. */
  applyNewText(ed, oldT, newT, sel) {
    if (newT !== oldT) {
      let p = 0;
      const maxP = Math.min(oldT.length, newT.length);
      while (p < maxP && oldT[p] === newT[p]) p++;
      let s = 0;
      const maxS = Math.min(oldT.length, newT.length) - p;
      while (s < maxS && oldT[oldT.length - 1 - s] === newT[newT.length - 1 - s]) s++;
      ed.replaceRange(
        newT.slice(p, newT.length - s),
        ed.offsetToPos(p),
        ed.offsetToPos(oldT.length - s)
      );
    }
    if (sel) {
      const clamp = (n) => Math.max(0, Math.min(n, newT.length));
      ed.setSelection(ed.offsetToPos(clamp(sel[0])), ed.offsetToPos(clamp(sel[1])));
    }
  }
  runInline(ed, op, force = false) {
    const text = ed.getValue();
    const [f, t] = selOffsets(ed);
    if (t <= f) return;
    const res = applyInline(text, f, t, op, {
      defaultColor: this.settings.defaultHl,
      currentColor: this.settings.currentHl,
      coupleBold: op === "underline" && (this.settings.boldUnderline || this.settings.autoEmphasis),
      force
    });
    if (res) this.applyNewText(ed, text, res.text, [res.selFrom, res.selTo]);
  }
  maybeUnderlineSelection() {
    if (!this.underlineMode || this.applyingUnderline) return;
    const view = this.app.workspace.getActiveViewOfType(import_obsidian2.MarkdownView);
    const ed = view?.editor;
    if (!ed || !ed.somethingSelected()) return;
    this.applyingUnderline = true;
    try {
      this.runInline(ed, "underline", true);
      const to = ed.getCursor("to");
      ed.setSelection(to, to);
    } finally {
      this.applyingUnderline = false;
    }
  }
  registerCommands() {
    const cmd = (id, name, cb, hotkeys) => {
      this.addCommand({ id, name, hotkeys, editorCallback: (ed) => void cb(ed) });
    };
    const heading = (level) => (ed) => {
      const text = ed.getValue();
      const [f, t] = selOffsets(ed);
      const res = setHeadingLevel(text, f, t, level);
      if (res) this.applyNewText(ed, text, res.text, [res.to, res.to]);
    };
    cmd("pocket", "Pocket (heading 3)", heading(3), [
      { modifiers: [], key: "F4" },
      { modifiers: ["Mod", "Alt"], key: "4" }
    ]);
    cmd("hat", "Hat (heading 4)", heading(4), [
      { modifiers: [], key: "F5" },
      { modifiers: ["Mod", "Alt"], key: "5" }
    ]);
    cmd("block", "Block (heading 5)", heading(5), [
      { modifiers: [], key: "F6" },
      { modifiers: ["Mod", "Alt"], key: "6" }
    ]);
    cmd("tag", "Tag (heading 6)", heading(6), [
      { modifiers: [], key: "F7" },
      { modifiers: ["Mod", "Alt"], key: "7" }
    ]);
    const move = (dir) => (ed) => {
      const text = ed.getValue();
      const [f] = selOffsets(ed);
      const res = moveSection(text, f, dir);
      if (res) this.applyNewText(ed, text, res.text, [res.cursor, res.cursor]);
    };
    cmd("move-heading-up", "Move heading up", move("up"), [
      { modifiers: ["Mod", "Alt"], key: "ArrowUp" }
    ]);
    cmd("move-heading-down", "Move heading down", move("down"), [
      { modifiers: ["Mod", "Alt"], key: "ArrowDown" }
    ]);
    cmd("move-heading-bottom", "Move heading to bottom", move("bottom"), [
      { modifiers: ["Mod", "Alt", "Shift"], key: "ArrowDown" }
    ]);
    cmd(
      "select-heading",
      "Select heading",
      (ed) => {
        const text = ed.getValue();
        const [f] = selOffsets(ed);
        const r = sectionRange(text, f);
        if (r) ed.setSelection(ed.offsetToPos(r[0]), ed.offsetToPos(r[1]));
      },
      [{ modifiers: ["Mod", "Alt"], key: "A" }]
    );
    cmd(
      "delete-heading",
      "Delete heading",
      (ed) => {
        const text = ed.getValue();
        const [f] = selOffsets(ed);
        const res = deleteSection(text, f);
        if (res) this.applyNewText(ed, text, res.text, [res.cursor, res.cursor]);
      },
      [{ modifiers: ["Mod", "Alt"], key: "ArrowLeft" }]
    );
    cmd(
      "paste-text",
      "Paste text (unformatted)",
      async (ed) => {
        let clip = "";
        try {
          clip = await navigator.clipboard.readText();
        } catch {
          new import_obsidian2.Notice("Could not read the clipboard");
          return;
        }
        if (!clip) {
          new import_obsidian2.Notice("Clipboard is empty");
          return;
        }
        let s = plainizePaste(clip);
        if (this.settings.condenseOnPaste) {
          s = condenseChunkText(s, this.settings.condenseMode);
        }
        ed.replaceSelection(s);
      },
      [
        { modifiers: [], key: "F2" },
        { modifiers: ["Mod", "Alt"], key: "2" }
      ]
    );
    const condense = (mode) => (ed) => {
      const text = ed.getValue();
      const [f, t] = selOffsets(ed);
      const scope = resolveScope(text, f, t);
      const res = condenseRange(text, scope.from, scope.to, mode ?? this.settings.condenseMode);
      if (res.text !== text) {
        this.applyNewText(ed, text, res.text, null);
        if (scope.kind === "document") new import_obsidian2.Notice(`Condensed ${res.count} chunk(s)`);
      }
    };
    cmd("condense", "Condense", condense(), [
      { modifiers: [], key: "F3" },
      { modifiers: ["Mod", "Alt"], key: "3" }
    ]);
    cmd("condense-pilcrows", "Condense (with pilcrows)", condense("pilcrows"), [
      { modifiers: ["Mod", "Alt"], key: "F3" }
    ]);
    cmd("condense-no-pilcrows", "Condense (no pilcrows)", condense("nopilcrows"), [
      { modifiers: ["Mod"], key: "F3" }
    ]);
    cmd(
      "uncondense",
      "Uncondense",
      (ed) => {
        const text = ed.getValue();
        const [f, t] = selOffsets(ed);
        const scope = resolveScope(text, f, t);
        const res = uncondenseRange(text, scope.from, scope.to);
        if (res.count > 0) {
          this.applyNewText(ed, text, res.text, null);
          if (scope.kind === "document") new import_obsidian2.Notice(`Restored ${res.count} paragraph break(s)`);
        }
      },
      [{ modifiers: ["Mod", "Alt", "Shift"], key: "F3" }]
    );
    const shrink = (force, wholeDoc = false) => (ed) => {
      const text = ed.getValue();
      const [f, t] = selOffsets(ed);
      const scope = wholeDoc ? { from: 0, to: text.length, kind: "document" } : resolveScope(text, f, t);
      const res = shrinkRange(text, scope.from, scope.to, {
        defaultColor: this.settings.defaultHl,
        shrinkOmissions: this.settings.shrinkOmissions,
        force
      });
      if (res) this.applyNewText(ed, text, res.text, null);
    };
    cmd("shrink", "Shrink non-underlined text", shrink(), [
      { modifiers: ["Alt"], key: "F3" },
      { modifiers: ["Mod"], key: "8" }
    ]);
    cmd("shrink-all", "Shrink all cards in document", shrink("shrink", true));
    cmd("unshrink-all", "Unshrink all cards in document", shrink("unshrink", true));
    cmd("underline", "Underline", (ed) => this.runInline(ed, "underline"), [
      { modifiers: [], key: "F9" },
      { modifiers: ["Mod", "Alt"], key: "9" }
    ]);
    cmd("emphasis", "Emphasis", (ed) => this.runInline(ed, "emphasis"), [
      { modifiers: [], key: "F10" },
      { modifiers: ["Mod", "Alt"], key: "0" }
    ]);
    cmd("highlight", "Highlight", (ed) => this.runInline(ed, "highlight"), [
      { modifiers: [], key: "F11" },
      { modifiers: ["Mod", "Alt"], key: "-" }
    ]);
    cmd("clear-formatting", "Clear formatting (keeps highlights)", (ed) => this.runInline(ed, "clear"), [
      { modifiers: [], key: "F12" },
      { modifiers: ["Mod", "Alt"], key: "=" }
    ]);
    cmd("underline-mode", "Toggle underline mode", () => {
      this.underlineMode = !this.underlineMode;
      this.updateStatus();
      new import_obsidian2.Notice(`Underline mode ${this.underlineMode ? "on" : "off"}`);
    });
    cmd("set-highlight-color", "Set highlight color", () => {
      new HlColorModal(this.app, this).open();
    });
    cmd(
      "auto-format-cite",
      "Auto format cite",
      (ed) => {
        const text = ed.getValue();
        const [f] = selOffsets(ed);
        const card = cardAt(text, f);
        if (!card) {
          new import_obsidian2.Notice("Cursor is not in a card");
          return;
        }
        let cs = card.citeStart;
        let ce = card.citeEnd;
        if (cs === null || ce === null) {
          let pos = card.tagEnd + 1;
          while (pos < card.end) {
            const [ls, le] = lineBoundsAt(text, pos);
            if (text.slice(ls, le).trim() !== "") {
              cs = ls;
              ce = le;
              break;
            }
            pos = le + 1;
          }
        }
        if (cs === null || ce === null) {
          new import_obsidian2.Notice("No cite line found under this tag");
          return;
        }
        const raw = text.slice(cs, ce);
        const fmt = formatCiteLine(raw, this.currentYear());
        if (fmt === null) {
          new import_obsidian2.Notice('Cite line is not parseable \u2014 use: First Last, quals, M-D-YYYY, "Title," URL');
          return;
        }
        if (fmt !== raw) {
          this.applyNewText(ed, text, text.slice(0, cs) + fmt + text.slice(ce), null);
        }
      },
      [
        { modifiers: [], key: "F8" },
        { modifiers: ["Mod", "Alt"], key: "8" }
      ]
    );
    cmd("reformat-all-cites", "Reformat all cites", (ed) => {
      const text = ed.getValue();
      const res = reformatAllCites(text, this.currentYear());
      if (res.text !== text) this.applyNewText(ed, text, res.text, null);
      new import_obsidian2.Notice(`Cites: ${res.formatted} formatted, ${res.skipped} skipped`);
    });
    cmd(
      "duplicate-cite",
      "Duplicate previous cite",
      (ed) => {
        const text = ed.getValue();
        const [f] = selOffsets(ed);
        const cite = previousCiteLine(text, f);
        if (!cite) {
          new import_obsidian2.Notice("No previous cite found");
          return;
        }
        ed.replaceSelection(cite);
      },
      [{ modifiers: ["Alt"], key: "F8" }]
    );
    cmd(
      "cite-from-url",
      "Cite from URL",
      async (ed) => {
        let initial = "";
        try {
          const clip = (await navigator.clipboard.readText()).trim();
          if (/^https?:\/\/\S+$/.test(clip)) initial = clip;
        } catch {
        }
        new CiteUrlModal(this.app, initial, async (url) => {
          if (!url) return;
          if (!/^https?:\/\//.test(url)) {
            new import_obsidian2.Notice("Not an http(s) URL");
            return;
          }
          const working = new import_obsidian2.Notice("Fetching cite\u2026", 0);
          try {
            const resp = await (0, import_obsidian2.requestUrl)({
              url,
              headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
              }
            });
            const meta = extractCiteMeta(resp.text, url);
            const line = buildCiteLine(meta, this.settings.placeholder);
            const formatted = formatCiteLine(line, this.currentYear()) ?? line;
            ed.replaceSelection(formatted);
          } catch (e) {
            new import_obsidian2.Notice(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            working.hide();
          }
        }).open();
      },
      [{ modifiers: ["Alt"], key: "F2" }]
    );
    cmd(
      "auto-emphasize-first",
      "Auto-emphasize first letters",
      (ed) => {
        const text = ed.getValue();
        const [f, t] = selOffsets(ed);
        if (t <= f) {
          new import_obsidian2.Notice("Select the words to emphasize");
          return;
        }
        const res = autoEmphasizeFirst(text, f, t, this.settings.defaultHl);
        if (res) this.applyNewText(ed, text, res, null);
      },
      [{ modifiers: ["Mod", "Alt"], key: "F10" }]
    );
    cmd("standardize-highlighting", "Standardize highlighting", (ed) => {
      const text = ed.getValue();
      const res = standardizeHighlighting(text, this.settings.currentHl, null, this.settings.defaultHl);
      if (res.text !== text) this.applyNewText(ed, text, res.text, null);
      new import_obsidian2.Notice(`Standardized highlighting on ${res.count} line(s)`);
    });
    cmd(
      "standardize-highlighting-exception",
      "Standardize highlighting (with exception)",
      (ed) => {
        const text = ed.getValue();
        const res = standardizeHighlighting(
          text,
          this.settings.currentHl,
          this.settings.exceptionHl,
          this.settings.defaultHl
        );
        if (res.text !== text) this.applyNewText(ed, text, res.text, null);
        new import_obsidian2.Notice(`Standardized highlighting on ${res.count} line(s)`);
      }
    );
    const numberCmd = (number) => (ed) => {
      const text = ed.getValue();
      const [f, t] = selOffsets(ed);
      let range;
      if (t > f) range = [f, t];
      else if (f === 0) range = [0, text.length];
      else {
        const sec = enclosingSection(text, f, 5);
        range = sec ? [sec.start, sec.sectionEnd] : [0, text.length];
      }
      const res = number ? autoNumberTags(text, range[0], range[1]) : deNumberTags(text, range[0], range[1]);
      if (res.text !== text) this.applyNewText(ed, text, res.text, null);
      new import_obsidian2.Notice(`${number ? "Numbered" : "De-numbered"} ${res.count} tag(s)`);
    };
    cmd("auto-number-tags", "Auto number tags", numberCmd(true), [
      { modifiers: ["Mod", "Shift"], key: "3" }
    ]);
    cmd("de-number-tags", "De-number tags", numberCmd(false));
    const fix = (label, fn) => (ed) => {
      const text = ed.getValue();
      const res = fn(text);
      if (res.text !== text) this.applyNewText(ed, text, res.text, null);
      new import_obsidian2.Notice(`${label}: ${res.count} change(s)`);
    };
    const hl = () => this.settings.defaultHl;
    cmd("fix-fake-tags", "Fix fake tags", fix("Fix fake tags", (t) => fixFakeTags(t, hl())));
    cmd(
      "fix-formatting-gaps",
      "Fix formatting gaps",
      fix("Fix formatting gaps", (t) => fixFormattingGaps(t, hl()))
    );
    cmd(
      "convert-default-styles",
      "Convert to default styles",
      fix("Convert to default styles", convertToDefaultStyles)
    );
    cmd("remove-blanks", "Remove blanks", fix("Remove blanks", removeBlanks));
    cmd("remove-pilcrows", "Remove pilcrows", fix("Remove pilcrows", removePilcrows));
    cmd("remove-hyperlinks", "Remove hyperlinks", fix("Remove hyperlinks", removeHyperlinks));
    cmd(
      "remove-emphasis",
      "Remove emphasis (convert to underlining)",
      fix("Remove emphasis", (t) => removeEmphasis(t, hl()))
    );
    cmd(
      "remove-non-highlighted-underlining",
      "Remove non-highlighted underlining",
      fix(
        "Remove non-highlighted underlining",
        (t) => removeNonHighlightedUnderlining(t, hl())
      )
    );
    cmd(
      "select-similar",
      "Select similar formatting",
      (ed) => {
        const text = ed.getValue();
        const [f] = selOffsets(ed);
        const ranges = similarRanges(text, f, this.settings.defaultHl);
        if (!ranges) {
          new import_obsidian2.Notice("Nothing similar to select");
          return;
        }
        ed.setSelections(
          ranges.map(([a, b]) => ({
            anchor: ed.offsetToPos(a),
            head: ed.offsetToPos(b)
          }))
        );
        new import_obsidian2.Notice(`${ranges.length} selection(s)`);
      },
      [{ modifiers: ["Mod"], key: "F2" }]
    );
  }
};
