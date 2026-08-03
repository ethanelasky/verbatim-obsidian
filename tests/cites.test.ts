import { describe, expect, it } from "vitest";
import { formatCiteLine, previousCiteLine, reformatAllCites } from "../src/cites";
import { buildCiteLine, formatDateMDY } from "../src/citeExtract";
import { autoNumberTags, deNumberTags } from "../src/automation";
import { fixFakeTags, removeNonHighlightedUnderlining } from "../src/fixers";

describe("formatCiteLine", () => {
  it("bolds last name and year for a non-current-year cite (docs example)", () => {
    const out = formatCiteLine(
      'Aaron Hardy, creator of Verbatim, 1-1-3000, "Verbatim Online Manual," https://x.com',
      2026,
    );
    expect(out).toBe(
      'Aaron <b>Hardy</b>, creator of Verbatim, 1-1-<b>3000</b>, "Verbatim Online Manual," https://x.com',
    );
  });

  it("bolds month-day for a current-year cite", () => {
    const out = formatCiteLine(
      'Jane Doe, reporter, 3-15-2026, "News," https://x.com',
      2026,
    );
    expect(out).toBe('Jane <b>Doe</b>, reporter, <b>3-15</b>-2026, "News," https://x.com');
  });

  it("re-formats an already-bolded cite idempotently (either syntax)", () => {
    const fromStars = formatCiteLine(
      'Aaron **Hardy**, creator, 1-1-**3000**, "Title," url',
      2026,
    );
    expect(fromStars).toBe('Aaron <b>Hardy</b>, creator, 1-1-<b>3000</b>, "Title," url');
    const again = formatCiteLine(fromStars!, 2026);
    expect(again).toBe(fromStars);
  });

  it("picks the date before the title, not a year in the quals", () => {
    const out = formatCiteLine(
      'Jane Doe, PhD 1999 Harvard, 2024, "Title," url',
      2026,
    );
    expect(out).toContain("<b>2024</b>");
    expect(out).not.toContain("<b>1999</b>");
  });

  it("returns null for unparseable lines", () => {
    expect(formatCiteLine("just some body text", 2026)).toBeNull();
  });
});

describe("reformatAllCites / previousCiteLine", () => {
  const doc = [
    "###### One",
    'A Alpha, x, 1-1-2020, "T1," u1',
    "body",
    "###### Two",
    'B Beta, y, 2-2-2021, "T2," u2',
    "body2",
  ].join("\n");

  it("formats every cite", () => {
    const res = reformatAllCites(doc, 2026);
    expect(res.formatted).toBe(2);
    expect(res.text).toContain("<b>Alpha</b>");
    expect(res.text).toContain("<b>Beta</b>");
  });

  it("finds the nearest previous cite", () => {
    const idx = doc.indexOf("body2");
    expect(previousCiteLine(doc, idx)).toContain("Beta");
  });
});

describe("buildCiteLine", () => {
  it("assembles the one-line cite with placeholders for missing fields", () => {
    const line = buildCiteLine(
      { url: "https://x.com", title: "A Story", site: "Example News" },
      "XX",
    );
    expect(line).toBe('XX XX, Example News, XX, "A Story," https://x.com');
  });
  it("formats ISO dates as M-D-YYYY", () => {
    expect(formatDateMDY("2026-03-05T10:00:00Z")).toBe("3-5-2026");
  });
});

describe("autoNumberTags", () => {
  const doc = [
    "##### Block A",
    "###### First tag",
    "body",
    "###### 9. Second tag",
    "body",
    "##### Block B",
    "###### Other tag",
  ].join("\n");

  it("numbers per block and renumbers stale numbers", () => {
    const res = autoNumberTags(doc, 0, doc.length);
    expect(res.text).toContain("###### 1. First tag");
    expect(res.text).toContain("###### 2. Second tag");
    expect(res.text).toContain("###### 1. Other tag");
  });

  it("de-numbering strips prefixes", () => {
    const numbered = autoNumberTags(doc, 0, doc.length).text;
    const res = deNumberTags(numbered, 0, numbered.length);
    expect(res.text).toContain("###### First tag");
    expect(res.text).toContain("###### Second tag");
  });
});

describe("fixers", () => {
  it("fixFakeTags converts fully-bold pseudo-tags to H4", () => {
    const doc = ["**Economy strong now**", 'A B, x, 1-1-2020, "T," u', "body"].join("\n");
    const res = fixFakeTags(doc, "yellow");
    expect(res.count).toBe(1);
    expect(res.text.startsWith("###### Economy strong now")).toBe(true);
  });

  it("removeNonHighlightedUnderlining keeps highlighted runs", () => {
    const doc = "<u>plain underline</u> and <u>with ==light== inside</u>";
    const res = removeNonHighlightedUnderlining(doc, "yellow");
    expect(res.text).not.toContain("<u>plain underline</u>");
    expect(res.text).toContain("==light==");
    expect(res.text).toContain("<u>with ==light== inside</u>");
  });
});
