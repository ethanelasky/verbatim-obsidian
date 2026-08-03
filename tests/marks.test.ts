import { describe, expect, it } from "vitest";
import { parseLine, plainText, serialize } from "../src/marks";
import { applyInline } from "../src/inline";

const DC = "yellow";

describe("parseLine / serialize round trip", () => {
  it("preserves plain text through parse", () => {
    const line = "The <u>economy ==is growing==</u> **fast** today";
    expect(plainText(parseLine(line, DC))).toBe("The economy is growing fast today");
  });

  it("round-trips canonical markup", () => {
    const line = "a <u>bb </u>==<u>cc</u>== <small>dd</small>";
    const ser = serialize(parseLine(line, DC), DC);
    expect(plainText(parseLine(ser.text, DC))).toBe("a bb cc dd");
    expect(ser.text).toBe(line);
  });

  it("keeps Markdown marks outside HTML tags (Obsidian rendering rule)", () => {
    // <u>==x==</u> would render the == literally; canonical form flips it
    const ser = serialize(parseLine("<u>==x== **y**</u>", DC), DC);
    expect(ser.text).toBe("==<u>x</u>==<u> </u>**<u>y</u>**");
  });

  it("writes non-default highlight colors as mark tags", () => {
    const chars = parseLine("word", DC);
    for (const c of chars) c.m.hl = "green";
    expect(serialize(chars, DC).text).toBe('<mark class="vb-hl-green">word</mark>');
  });

  it("keeps boundary whitespace out of bold runs", () => {
    const chars = parseLine("one two", DC);
    // bold " two" — the run starts on whitespace, which must be pushed out
    for (let i = 3; i < chars.length; i++) chars[i].m.b = true;
    const ser = serialize(chars, DC);
    expect(ser.text).toBe("one **two**");
  });
});

describe("applyInline", () => {
  const doc = "###### Tag\ncite line stays\nplain body text here";

  it("emphasis replaces underline on the selection", () => {
    const src = "###### Tag\ncite line stays\nplain <u>body text</u> here";
    const from = src.indexOf("body");
    const to = from + "body text".length;
    const res = applyInline(src, from, to, "emphasis", {
      defaultColor: DC,
      currentColor: DC,
      coupleBold: false,
    });
    expect(res!.text).toContain("**body text**");
    expect(res!.text).not.toContain("<u>");
  });

  it("toggles underline on and off (idempotent toggle)", () => {
    const from = doc.indexOf("body");
    const to = from + "body text".length;
    const once = applyInline(doc, from, to, "underline", {
      defaultColor: DC,
      currentColor: DC,
      coupleBold: false,
    });
    expect(once!.text).toContain("<u>body text</u>");
    const twice = applyInline(once!.text, once!.selFrom, once!.selTo, "underline", {
      defaultColor: DC,
      currentColor: DC,
      coupleBold: false,
    });
    expect(twice!.text).toBe(doc);
  });

  it("skips heading lines", () => {
    const res = applyInline(doc, 0, doc.length, "underline", {
      defaultColor: DC,
      currentColor: DC,
      coupleBold: false,
    });
    expect(res!.text).toContain("###### Tag");
    expect(res!.text).not.toContain("<u>#");
  });

  it("highlight uses the current color", () => {
    const from = doc.indexOf("plain");
    const res = applyInline(doc, from, from + 5, "highlight", {
      defaultColor: DC,
      currentColor: "green",
      coupleBold: false,
    });
    expect(res!.text).toContain('<mark class="vb-hl-green">plain</mark>');
  });

  it("clear formatting strips u/b/sm/cite-bold but keeps highlights", () => {
    const marked = "a <u>==hi== **there**</u> <small>tiny</small> <b>name</b>";
    const res = applyInline(marked, 0, marked.length, "clear", {
      defaultColor: DC,
      currentColor: DC,
      coupleBold: false,
    });
    expect(res!.text).toBe("a ==hi== there tiny name");
  });

  it("cite op toggles <b> styling on a selection (manual F8)", () => {
    const from = doc.indexOf("cite line");
    const res = applyInline(doc, from, from + 9, "cite", {
      defaultColor: DC,
      currentColor: DC,
      coupleBold: false,
    });
    expect(res!.text).toContain("<b>cite line</b> stays");
    const undone = applyInline(res!.text, res!.selFrom, res!.selTo, "cite", {
      defaultColor: DC,
      currentColor: DC,
      coupleBold: false,
    });
    expect(undone!.text).toBe(doc);
  });

  it("underline couples bold when configured", () => {
    const from = doc.indexOf("body");
    const res = applyInline(doc, from, from + 4, "underline", {
      defaultColor: DC,
      currentColor: DC,
      coupleBold: true,
    });
    expect(res!.text).toContain("**<u>body</u>**");
  });
});
