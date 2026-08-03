import { describe, expect, it } from "vitest";
import {
  bodyChunks,
  cardAt,
  isCitePattern,
  parseHeadings,
  resolveScope,
  sectionAt,
} from "../src/cardModel";

const DOC = [
  "# Uniqueness",            // 0
  "## Economy",
  "### Econ High Now",
  "#### 1. Growth is strong",
  'Aaron **Hardy**, creator of Verbatim, 1-1-**3000**, "Verbatim Online Manual," https://example.com',
  "The economy is <u>growing rapidly</u> and ==will continue==.",
  "",
  "Second body paragraph here.",
  "#### 2. AT: Recession",
  "This one is an analytic with no cite.",
  "# Links",
  "body under links",
].join("\n");

describe("parseHeadings", () => {
  it("finds all headings with correct levels and section ends", () => {
    const hs = parseHeadings(DOC);
    expect(hs.map((h) => h.level)).toEqual([1, 2, 3, 4, 4, 1]);
    // first pocket's section ends at "# Links"
    expect(DOC.slice(hs[0].sectionEnd, hs[0].sectionEnd + 7)).toBe("# Links");
    // first tag's section ends at the second tag
    expect(DOC.slice(hs[3].sectionEnd, hs[3].sectionEnd + 4)).toBe("####");
  });
});

describe("isCitePattern", () => {
  it("accepts the docs one-line cite", () => {
    expect(
      isCitePattern(
        'Aaron **Hardy**, creator of Verbatim, 1-1-**3000**, "Verbatim Online Manual," https://x.com',
      ),
    ).toBe(true);
  });
  it("accepts a bare-year cite", () => {
    expect(isCitePattern('Jane Doe, professor at MIT, 2024, "A Title," url')).toBe(true);
  });
  it("rejects body text with a year but no date-comma-quote shape", () => {
    expect(isCitePattern("In 2024 the economy grew by 3 percent.")).toBe(false);
  });
  it("rejects headings and plain prose", () => {
    expect(isCitePattern("#### 1. Growth is strong")).toBe(false);
    expect(isCitePattern("The economy is growing rapidly.")).toBe(false);
  });
});

describe("cardAt", () => {
  it("identifies tag, cite, and body of the card under the cursor", () => {
    const bodyIdx = DOC.indexOf("The economy is");
    const card = cardAt(DOC, bodyIdx);
    expect(card).not.toBeNull();
    expect(DOC.slice(card!.tagStart, card!.tagEnd)).toBe("#### 1. Growth is strong");
    expect(card!.citeStart).not.toBeNull();
    expect(DOC.slice(card!.citeStart!, card!.citeEnd!)).toContain("Hardy");
    expect(DOC.slice(card!.bodyStart, card!.end)).toContain("Second body paragraph");
  });
  it("treats a tag with no cite as an analytic", () => {
    const idx = DOC.indexOf("This one is an analytic");
    const card = cardAt(DOC, idx);
    expect(card).not.toBeNull();
    expect(card!.citeStart).toBeNull();
  });
});

describe("resolveScope cascade", () => {
  it("explicit selection wins", () => {
    const s = resolveScope(DOC, 5, 20);
    expect(s.kind).toBe("selection");
  });
  it("cursor in a body resolves to the card", () => {
    const idx = DOC.indexOf("Second body paragraph");
    const s = resolveScope(DOC, idx, idx);
    expect(s.kind).toBe("card");
    expect(DOC.slice(s.from, s.from + 4)).toBe("####");
  });
  it("cursor on a block heading resolves to the section", () => {
    const idx = DOC.indexOf("### Econ High Now") + 4;
    const s = resolveScope(DOC, idx, idx);
    expect(s.kind).toBe("section");
  });
  it("cursor at document start resolves to the whole document", () => {
    const s = resolveScope(DOC, 0, 0);
    expect(s.kind).toBe("document");
    expect(s.to).toBe(DOC.length);
  });
});

describe("bodyChunks", () => {
  it("excludes headings and cite lines, keeps body paragraphs", () => {
    const chunks = bodyChunks(DOC, 0, DOC.length);
    const texts = chunks.map((c) => DOC.slice(c.from, c.to));
    expect(texts.some((t) => t.startsWith("The economy is"))).toBe(true);
    expect(texts.every((t) => !t.includes("####"))).toBe(true);
    expect(texts.every((t) => !t.includes("Hardy"))).toBe(true);
  });
});

describe("sectionAt", () => {
  it("returns the innermost section", () => {
    const idx = DOC.indexOf("Second body paragraph");
    const h = sectionAt(DOC, idx);
    expect(h!.level).toBe(4);
  });
});
