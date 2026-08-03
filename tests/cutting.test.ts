import { describe, expect, it } from "vitest";
import {
  condenseChunkText,
  condenseRange,
  plainizePaste,
  shrinkRange,
  uncondenseRange,
} from "../src/cutting";

const CARD = [
  "###### Tag line",
  'Jane Doe, analyst, 1-1-2020, "Title," https://x.com',
  "First paragraph of evidence.",
  "",
  "Second paragraph of evidence.",
  "",
  "Third one.",
].join("\n");

describe("condense", () => {
  it("joins body paragraphs with pilcrows, sparing tag and cite", () => {
    const res = condenseRange(CARD, 0, CARD.length, "pilcrows");
    expect(res.text).toContain(
      "First paragraph of evidence. ¶ Second paragraph of evidence. ¶ Third one.",
    );
    expect(res.text).toContain("###### Tag line");
    expect(res.text).toContain('"Title,"');
  });

  it("no-pilcrows mode joins with plain spaces", () => {
    const res = condenseRange(CARD, 0, CARD.length, "nopilcrows");
    expect(res.text).toContain(
      "First paragraph of evidence. Second paragraph of evidence. Third one.",
    );
    expect(res.text).not.toContain("¶");
  });

  it("uncondense restores the original paragraph breaks", () => {
    const condensed = condenseRange(CARD, 0, CARD.length, "pilcrows").text;
    const restored = uncondenseRange(condensed, 0, condensed.length).text;
    expect(restored).toBe(CARD);
  });

  it("condenseChunkText collapses runs of whitespace", () => {
    expect(condenseChunkText("a  b\n\n\nc", "nopilcrows")).toBe("a b c");
    expect(condenseChunkText("a\nb", "pilcrows")).toBe("a ¶ b");
  });
});

describe("shrink", () => {
  const doc = [
    "###### T",
    'A B, x, 1-1-2020, "T," u',
    "keep <u>this underlined</u> shrink the rest [ Table Omitted ] end",
  ].join("\n");

  it("wraps non-underlined text in <small>, exempting omission notes", () => {
    const res = shrinkRange(doc, 0, doc.length, {
      defaultColor: "yellow",
      shrinkOmissions: false,
    });
    expect(res!.action).toBe("shrink");
    expect(res!.text).toContain("<u>this underlined</u>");
    expect(res!.text).toContain("<small>");
    // the omission note must not be inside <small>
    const line = res!.text.split("\n")[2];
    const noteIdx = line.indexOf("[ Table Omitted ]");
    const before = line.slice(0, noteIdx);
    const opens = (before.match(/<small>/g) ?? []).length;
    const closes = (before.match(/<\/small>/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it("toggles back to unshrunk", () => {
    const once = shrinkRange(doc, 0, doc.length, {
      defaultColor: "yellow",
      shrinkOmissions: true,
    });
    const twice = shrinkRange(once!.text, 0, once!.text.length, {
      defaultColor: "yellow",
      shrinkOmissions: true,
    });
    expect(twice!.action).toBe("unshrink");
    expect(twice!.text).toBe(doc);
  });
});

describe("plainizePaste", () => {
  it("strips html, list markers, and heading markers", () => {
    const s = "<p># Fake heading</p>\n- item one\n> quoted\n\n\n\nplain";
    const out = plainizePaste(s);
    expect(out).not.toContain("<p>");
    expect(out).not.toContain("# ");
    expect(out).not.toContain("- item");
    expect(out).toContain("item one");
    expect(out).not.toContain("\n\n\n");
  });
});
