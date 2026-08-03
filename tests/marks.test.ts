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
    const line = "a <u>bb ==cc==</u> <small>dd</small>";
    const ser = serialize(parseLine(line, DC), DC);
    expect(plainText(parseLine(ser.text, DC))).toBe("a bb cc dd");
    expect(ser.text).toBe(line);
  });

  it("normalizes nesting order to u > hl > b > sm", () => {
    const line = "**<u>x</u>**";
    const ser = serialize(parseLine(line, DC), DC);
    expect(ser.text).toBe("<u>**x**</u>");
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

  it("underline couples bold when configured", () => {
    const from = doc.indexOf("body");
    const res = applyInline(doc, from, from + 4, "underline", {
      defaultColor: DC,
      currentColor: DC,
      coupleBold: true,
    });
    expect(res!.text).toContain("<u>**body**</u>");
  });
});
