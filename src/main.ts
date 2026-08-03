import {
  App,
  Editor,
  FuzzySuggestModal,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  requestUrl,
} from "obsidian";

import {
  cardAt,
  enclosingSection,
  lineBoundsAt,
  resolveScope,
} from "./cardModel";
import {
  condenseChunkText,
  condenseRange,
  plainizePaste,
  shrinkRange,
  uncondenseRange,
  CondenseMode,
} from "./cutting";
import { applyInline, InlineOp } from "./inline";
import { HL_COLORS, HlColor } from "./marks";
import {
  deleteSection,
  moveSection,
  sectionRange,
  setHeadingLevel,
} from "./structure";
import { formatCiteLine, previousCiteLine, reformatAllCites } from "./cites";
import { buildCiteLine, extractCiteMeta } from "./citeExtract";
import {
  autoEmphasizeFirst,
  autoNumberTags,
  deNumberTags,
  standardizeHighlighting,
} from "./automation";
import {
  convertToDefaultStyles,
  fixFakeTags,
  fixFormattingGaps,
  removeBlanks,
  removeEmphasis,
  removeHyperlinks,
  removeNonHighlightedUnderlining,
  removePilcrows,
  similarRanges,
  FixResult,
} from "./fixers";
import { DEFAULT_SETTINGS, VbSettings, VbSettingTab } from "./settings";

function selOffsets(ed: Editor): [number, number] {
  return [
    ed.posToOffset(ed.getCursor("from")),
    ed.posToOffset(ed.getCursor("to")),
  ];
}

class CiteUrlModal extends Modal {
  constructor(
    app: App,
    private initial: string,
    private onSubmit: (url: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Cite from URL");
    const input = this.contentEl.createEl("input", {
      type: "text",
      value: this.initial,
      placeholder: "https://…",
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

  onClose(): void {
    this.contentEl.empty();
  }
}

class HlColorModal extends FuzzySuggestModal<HlColor> {
  constructor(app: App, private plugin: VerbatimPlugin) {
    super(app);
    this.setPlaceholder("Set current highlight color…");
  }

  getItems(): HlColor[] {
    return [...HL_COLORS];
  }

  getItemText(c: HlColor): string {
    return c === this.plugin.settings.currentHl ? `${c} (current)` : c;
  }

  onChooseItem(c: HlColor): void {
    this.plugin.settings.currentHl = c;
    void this.plugin.saveSettings();
    new Notice(`Highlight color: ${c}`);
  }
}

export default class VerbatimPlugin extends Plugin {
  settings: VbSettings = { ...DEFAULT_SETTINGS };
  private underlineMode = false;
  private applyingUnderline = false;
  private statusEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new VbSettingTab(this.app, this));
    this.statusEl = this.addStatusBarItem();
    this.updateStatus();
    this.applyAppearance();
    this.registerCommands();

    // Underline Mode: apply on selection completion (mouseup / shift release)
    this.registerDomEvent(document, "mouseup", () => this.maybeUnderlineSelection());
    this.registerDomEvent(document, "keyup", (e: KeyboardEvent) => {
      if (e.key === "Shift") this.maybeUnderlineSelection();
    });
  }

  onunload(): void {
    const body = document.body;
    for (const c of HL_COLORS) body.classList.remove(`vb-default-hl-${c}`);
    body.classList.remove("vb-emphasis-box", "vb-emphasis-large");
    body.style.removeProperty("--vb-shrink-scale");
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  applyAppearance(): void {
    const body = document.body;
    for (const c of HL_COLORS) body.classList.remove(`vb-default-hl-${c}`);
    body.classList.add(`vb-default-hl-${this.settings.defaultHl}`);
    body.classList.remove("vb-emphasis-box", "vb-emphasis-large");
    if (this.settings.emphasisMode === "box") body.classList.add("vb-emphasis-box");
    if (this.settings.emphasisMode === "large") body.classList.add("vb-emphasis-large");
    body.style.setProperty("--vb-shrink-scale", String(this.settings.shrinkFactor / 100));
  }

  private currentYear(): number {
    const pinned = parseInt(this.settings.pinnedYear, 10);
    return Number.isFinite(pinned) && pinned > 1000 ? pinned : new Date().getFullYear();
  }

  private updateStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.setText(this.underlineMode ? "U-mode" : "");
    this.statusEl.toggleClass("vb-underline-mode-status", this.underlineMode);
  }

  /** Replace the minimal differing region so cursor/scroll/undo stay sane. */
  private applyNewText(
    ed: Editor,
    oldT: string,
    newT: string,
    sel: [number, number] | null,
  ): void {
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
        ed.offsetToPos(oldT.length - s),
      );
    }
    if (sel) {
      const clamp = (n: number) => Math.max(0, Math.min(n, newT.length));
      ed.setSelection(ed.offsetToPos(clamp(sel[0])), ed.offsetToPos(clamp(sel[1])));
    }
  }

  private runInline(ed: Editor, op: InlineOp, force = false): void {
    const text = ed.getValue();
    const [f, t] = selOffsets(ed);
    if (t <= f) return;
    const res = applyInline(text, f, t, op, {
      defaultColor: this.settings.defaultHl,
      currentColor: this.settings.currentHl,
      coupleBold:
        op === "underline" && (this.settings.boldUnderline || this.settings.autoEmphasis),
      force,
    });
    if (res) this.applyNewText(ed, text, res.text, [res.selFrom, res.selTo]);
  }

  private maybeUnderlineSelection(): void {
    if (!this.underlineMode || this.applyingUnderline) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
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

  private registerCommands(): void {
    const cmd = (
      id: string,
      name: string,
      cb: (ed: Editor) => void | Promise<void>,
      hotkeys?: { modifiers: ("Mod" | "Alt" | "Shift" | "Ctrl")[]; key: string }[],
    ) => {
      this.addCommand({ id, name, hotkeys, editorCallback: (ed) => void cb(ed) });
    };

    // ---- Structure ----
    const heading = (level: number) => (ed: Editor) => {
      const text = ed.getValue();
      const [f, t] = selOffsets(ed);
      const res = setHeadingLevel(text, f, t, level);
      if (res) this.applyNewText(ed, text, res.text, [res.to, res.to]);
    };
    cmd("pocket", "Pocket (heading 3)", heading(3), [
      { modifiers: [], key: "F4" },
      { modifiers: ["Mod", "Alt"], key: "4" },
    ]);
    cmd("hat", "Hat (heading 4)", heading(4), [
      { modifiers: [], key: "F5" },
      { modifiers: ["Mod", "Alt"], key: "5" },
    ]);
    cmd("block", "Block (heading 5)", heading(5), [
      { modifiers: [], key: "F6" },
      { modifiers: ["Mod", "Alt"], key: "6" },
    ]);
    cmd("tag", "Tag (heading 6)", heading(6), [
      { modifiers: [], key: "F7" },
      { modifiers: ["Mod", "Alt"], key: "7" },
    ]);

    const move = (dir: "up" | "down" | "bottom") => (ed: Editor) => {
      const text = ed.getValue();
      const [f] = selOffsets(ed);
      const res = moveSection(text, f, dir);
      if (res) this.applyNewText(ed, text, res.text, [res.cursor, res.cursor]);
    };
    cmd("move-heading-up", "Move heading up", move("up"), [
      { modifiers: ["Mod", "Alt"], key: "ArrowUp" },
    ]);
    cmd("move-heading-down", "Move heading down", move("down"), [
      { modifiers: ["Mod", "Alt"], key: "ArrowDown" },
    ]);
    cmd("move-heading-bottom", "Move heading to bottom", move("bottom"), [
      { modifiers: ["Mod", "Alt", "Shift"], key: "ArrowDown" },
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
      [{ modifiers: ["Mod", "Alt"], key: "A" }],
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
      [{ modifiers: ["Mod", "Alt"], key: "ArrowLeft" }],
    );

    // ---- Cutting ----
    cmd(
      "paste-text",
      "Paste text (unformatted)",
      async (ed) => {
        let clip = "";
        try {
          clip = await navigator.clipboard.readText();
        } catch {
          new Notice("Could not read the clipboard");
          return;
        }
        if (!clip) {
          new Notice("Clipboard is empty");
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
        { modifiers: ["Mod", "Alt"], key: "2" },
      ],
    );

    const condense = (mode?: CondenseMode) => (ed: Editor) => {
      const text = ed.getValue();
      const [f, t] = selOffsets(ed);
      const scope = resolveScope(text, f, t);
      const res = condenseRange(text, scope.from, scope.to, mode ?? this.settings.condenseMode);
      if (res.text !== text) {
        this.applyNewText(ed, text, res.text, null);
        if (scope.kind === "document") new Notice(`Condensed ${res.count} chunk(s)`);
      }
    };
    cmd("condense", "Condense", condense(), [
      { modifiers: [], key: "F3" },
      { modifiers: ["Mod", "Alt"], key: "3" },
    ]);
    cmd("condense-pilcrows", "Condense (with pilcrows)", condense("pilcrows"), [
      { modifiers: ["Mod", "Alt"], key: "F3" },
    ]);
    cmd("condense-no-pilcrows", "Condense (no pilcrows)", condense("nopilcrows"), [
      { modifiers: ["Mod"], key: "F3" },
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
          if (scope.kind === "document") new Notice(`Restored ${res.count} paragraph break(s)`);
        }
      },
      [{ modifiers: ["Mod", "Alt", "Shift"], key: "F3" }],
    );

    const shrink = (force?: "shrink" | "unshrink", wholeDoc = false) => (ed: Editor) => {
      const text = ed.getValue();
      const [f, t] = selOffsets(ed);
      const scope = wholeDoc
        ? { from: 0, to: text.length, kind: "document" as const }
        : resolveScope(text, f, t);
      const res = shrinkRange(text, scope.from, scope.to, {
        defaultColor: this.settings.defaultHl,
        shrinkOmissions: this.settings.shrinkOmissions,
        force,
      });
      if (res) this.applyNewText(ed, text, res.text, null);
    };
    cmd("shrink", "Shrink non-underlined text", shrink(), [
      { modifiers: ["Alt"], key: "F3" },
      { modifiers: ["Mod"], key: "8" },
    ]);
    cmd("shrink-all", "Shrink all cards in document", shrink("shrink", true));
    cmd("unshrink-all", "Unshrink all cards in document", shrink("unshrink", true));

    // ---- Inline styles ----
    cmd("underline", "Underline", (ed) => this.runInline(ed, "underline"), [
      { modifiers: [], key: "F9" },
      { modifiers: ["Mod", "Alt"], key: "9" },
    ]);
    cmd("emphasis", "Emphasis", (ed) => this.runInline(ed, "emphasis"), [
      { modifiers: [], key: "F10" },
      { modifiers: ["Mod", "Alt"], key: "0" },
    ]);
    cmd("highlight", "Highlight", (ed) => this.runInline(ed, "highlight"), [
      { modifiers: [], key: "F11" },
      { modifiers: ["Mod", "Alt"], key: "-" },
    ]);
    cmd("clear-formatting", "Clear formatting (keeps highlights)", (ed) =>
      this.runInline(ed, "clear"), [
      { modifiers: [], key: "F12" },
      { modifiers: ["Mod", "Alt"], key: "=" },
    ]);
    cmd("underline-mode", "Toggle underline mode", () => {
      this.underlineMode = !this.underlineMode;
      this.updateStatus();
      new Notice(`Underline mode ${this.underlineMode ? "on" : "off"}`);
    });
    cmd("set-highlight-color", "Set highlight color", () => {
      new HlColorModal(this.app, this).open();
    });

    // ---- Cites ----
    cmd(
      "auto-format-cite",
      "Auto format cite",
      (ed) => {
        const text = ed.getValue();
        const [f] = selOffsets(ed);
        const card = cardAt(text, f);
        if (!card) {
          new Notice("Cursor is not in a card");
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
          new Notice("No cite line found under this tag");
          return;
        }
        const raw = text.slice(cs, ce);
        const fmt = formatCiteLine(raw, this.currentYear());
        if (fmt === null) {
          new Notice("Cite line is not parseable — use: First Last, quals, M-D-YYYY, \"Title,\" URL");
          return;
        }
        if (fmt !== raw) {
          this.applyNewText(ed, text, text.slice(0, cs) + fmt + text.slice(ce), null);
        }
      },
      [
        { modifiers: [], key: "F8" },
        { modifiers: ["Mod", "Alt"], key: "8" },
      ],
    );
    cmd("reformat-all-cites", "Reformat all cites", (ed) => {
      const text = ed.getValue();
      const res = reformatAllCites(text, this.currentYear());
      if (res.text !== text) this.applyNewText(ed, text, res.text, null);
      new Notice(`Cites: ${res.formatted} formatted, ${res.skipped} skipped`);
    });
    cmd(
      "duplicate-cite",
      "Duplicate previous cite",
      (ed) => {
        const text = ed.getValue();
        const [f] = selOffsets(ed);
        const cite = previousCiteLine(text, f);
        if (!cite) {
          new Notice("No previous cite found");
          return;
        }
        ed.replaceSelection(cite);
      },
      [{ modifiers: ["Alt"], key: "F8" }],
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
          /* clipboard unavailable */
        }
        new CiteUrlModal(this.app, initial, async (url) => {
          if (!url) return;
          if (!/^https?:\/\//.test(url)) {
            new Notice("Not an http(s) URL");
            return;
          }
          const working = new Notice("Fetching cite…", 0);
          try {
            const resp = await requestUrl({
              url,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
              },
            });
            const meta = extractCiteMeta(resp.text, url);
            const line = buildCiteLine(meta, this.settings.placeholder);
            const formatted = formatCiteLine(line, this.currentYear()) ?? line;
            ed.replaceSelection(formatted);
          } catch (e) {
            new Notice(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            working.hide();
          }
        }).open();
      },
      [{ modifiers: ["Alt"], key: "F2" }],
    );

    // ---- Automation ----
    cmd(
      "auto-emphasize-first",
      "Auto-emphasize first letters",
      (ed) => {
        const text = ed.getValue();
        const [f, t] = selOffsets(ed);
        if (t <= f) {
          new Notice("Select the words to emphasize");
          return;
        }
        const res = autoEmphasizeFirst(text, f, t, this.settings.defaultHl);
        if (res) this.applyNewText(ed, text, res, null);
      },
      [{ modifiers: ["Mod", "Alt"], key: "F10" }],
    );
    cmd("standardize-highlighting", "Standardize highlighting", (ed) => {
      const text = ed.getValue();
      const res = standardizeHighlighting(text, this.settings.currentHl, null, this.settings.defaultHl);
      if (res.text !== text) this.applyNewText(ed, text, res.text, null);
      new Notice(`Standardized highlighting on ${res.count} line(s)`);
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
          this.settings.defaultHl,
        );
        if (res.text !== text) this.applyNewText(ed, text, res.text, null);
        new Notice(`Standardized highlighting on ${res.count} line(s)`);
      },
    );

    const numberCmd = (number: boolean) => (ed: Editor) => {
      const text = ed.getValue();
      const [f, t] = selOffsets(ed);
      let range: [number, number];
      if (t > f) range = [f, t];
      else if (f === 0) range = [0, text.length];
      else {
        const sec = enclosingSection(text, f, 5);
        range = sec ? [sec.start, sec.sectionEnd] : [0, text.length];
      }
      const res = number
        ? autoNumberTags(text, range[0], range[1])
        : deNumberTags(text, range[0], range[1]);
      if (res.text !== text) this.applyNewText(ed, text, res.text, null);
      new Notice(`${number ? "Numbered" : "De-numbered"} ${res.count} tag(s)`);
    };
    cmd("auto-number-tags", "Auto number tags", numberCmd(true), [
      { modifiers: ["Mod", "Shift"], key: "3" },
    ]);
    cmd("de-number-tags", "De-number tags", numberCmd(false));

    // ---- Fixers ----
    const fix = (label: string, fn: (text: string) => FixResult) => (ed: Editor) => {
      const text = ed.getValue();
      const res = fn(text);
      if (res.text !== text) this.applyNewText(ed, text, res.text, null);
      new Notice(`${label}: ${res.count} change(s)`);
    };
    const hl = () => this.settings.defaultHl;
    cmd("fix-fake-tags", "Fix fake tags", fix("Fix fake tags", (t) => fixFakeTags(t, hl())));
    cmd(
      "fix-formatting-gaps",
      "Fix formatting gaps",
      fix("Fix formatting gaps", (t) => fixFormattingGaps(t, hl())),
    );
    cmd(
      "convert-default-styles",
      "Convert to default styles",
      fix("Convert to default styles", convertToDefaultStyles),
    );
    cmd("remove-blanks", "Remove blanks", fix("Remove blanks", removeBlanks));
    cmd("remove-pilcrows", "Remove pilcrows", fix("Remove pilcrows", removePilcrows));
    cmd("remove-hyperlinks", "Remove hyperlinks", fix("Remove hyperlinks", removeHyperlinks));
    cmd(
      "remove-emphasis",
      "Remove emphasis (convert to underlining)",
      fix("Remove emphasis", (t) => removeEmphasis(t, hl())),
    );
    cmd(
      "remove-non-highlighted-underlining",
      "Remove non-highlighted underlining",
      fix("Remove non-highlighted underlining", (t) =>
        removeNonHighlightedUnderlining(t, hl()),
      ),
    );
    cmd(
      "select-similar",
      "Select similar formatting",
      (ed) => {
        const text = ed.getValue();
        const [f] = selOffsets(ed);
        const ranges = similarRanges(text, f, this.settings.defaultHl);
        if (!ranges) {
          new Notice("Nothing similar to select");
          return;
        }
        ed.setSelections(
          ranges.map(([a, b]) => ({
            anchor: ed.offsetToPos(a),
            head: ed.offsetToPos(b),
          })),
        );
        new Notice(`${ranges.length} selection(s)`);
      },
      [{ modifiers: ["Mod"], key: "F2" }],
    );
  }
}
