/**
 * Verbatim panel — a sidebar pane that plays the role Verbatim's Word ribbon
 * plays: every cutting tool one click away, grouped the way the ribbon groups
 * them, with the current highlight color and Underline Mode visible at a glance.
 *
 * Buttons run the exact same callbacks the commands do; the group list is built
 * in main.ts (`VerbatimPlugin.groups`) so commands and panel can never drift.
 */

import {
  Editor,
  Hotkey,
  ItemView,
  Platform,
  WorkspaceLeaf,
} from "obsidian";
import type VerbatimPlugin from "./main";

export const VIEW_TYPE_VERBATIM = "verbatim-panel";

export interface VbAction {
  id: string;
  /** Full command name, shown in the tooltip. */
  name: string;
  /** Short button label. */
  label: string;
  hotkeys?: Hotkey[];
  /** Toggle-style buttons light up when this returns true. */
  isActive?: () => boolean;
  run: (ed: Editor) => void | Promise<void>;
}

export interface VbGroup {
  title: string;
  items: VbAction[];
  /** Extra controls rendered under the group's buttons (e.g. color swatches). */
  extras?: (el: HTMLElement) => void;
}

const KEY_GLYPHS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Backspace: "⌫",
  Enter: "⏎",
  Escape: "Esc",
  " ": "Space",
};

function formatHotkey(hk: Hotkey): string {
  const mac = Platform.isMacOS;
  const mods = (hk.modifiers ?? []).map((m) => {
    switch (m) {
      case "Mod":
        return mac ? "⌘" : "Ctrl";
      case "Meta":
        return mac ? "⌘" : "Win";
      case "Ctrl":
        return mac ? "⌃" : "Ctrl";
      case "Alt":
        return mac ? "⌥" : "Alt";
      case "Shift":
        return mac ? "⇧" : "Shift";
      default:
        return String(m);
    }
  });
  const key = KEY_GLYPHS[hk.key] ?? (hk.key.length === 1 ? hk.key.toUpperCase() : hk.key);
  return mac ? [...mods, key].join("") : [...mods, key].join("+");
}

/** The user's actual binding if they remapped it, else the declared default. */
function primaryHotkey(view: ItemView, a: VbAction): Hotkey | undefined {
  const mgr = (
    view.app as unknown as {
      hotkeyManager?: {
        getHotkeys?(id: string): Hotkey[] | undefined;
        getDefaultHotkeys?(id: string): Hotkey[] | undefined;
      };
    }
  ).hotkeyManager;
  const id = `verbatim:${a.id}`;
  const custom = mgr?.getHotkeys?.(id);
  if (custom?.length) return custom[0];
  const def = mgr?.getDefaultHotkeys?.(id);
  if (def?.length) return def[0];
  return a.hotkeys?.[0];
}

export class VerbatimPanelView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: VerbatimPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_VERBATIM;
  }

  getDisplayText(): string {
    return "Verbatim";
  }

  getIcon(): string {
    return "scissors";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  /** Called by the plugin whenever state the panel displays changes. */
  refresh(): void {
    this.render();
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("vb-panel");
    for (const g of this.plugin.groups) this.renderGroup(el, g);
  }

  private renderGroup(parent: HTMLElement, g: VbGroup): void {
    if (!g.items.length && !g.extras) return;
    const collapsed = this.plugin.settings.collapsedGroups.includes(g.title);
    const sec = parent.createDiv({ cls: "vb-group" });
    const head = sec.createDiv({ cls: "vb-group-head" });
    head.createSpan({ cls: "vb-group-caret", text: collapsed ? "▸" : "▾" });
    head.createSpan({ cls: "vb-group-title", text: g.title });
    head.addEventListener("click", () => void this.plugin.toggleGroup(g.title));
    if (collapsed) return;
    const body = sec.createDiv({ cls: "vb-group-body" });
    for (const a of g.items) this.renderButton(body, a);
    if (g.extras) g.extras(sec.createDiv({ cls: "vb-group-extras" }));
  }

  private renderButton(parent: HTMLElement, a: VbAction): void {
    const btn = parent.createEl("button", { cls: "vb-btn" });
    if (a.isActive?.()) btn.addClass("is-active");
    btn.createSpan({ cls: "vb-btn-label", text: a.label });
    const hk = primaryHotkey(this, a);
    const hint = hk ? formatHotkey(hk) : "";
    // Bare function keys are short enough to sit on the button itself.
    if (hk && !hk.modifiers?.length) btn.createSpan({ cls: "vb-btn-key", text: hint });
    const tip = hint ? `${a.name} — ${hint}` : a.name;
    btn.setAttribute("title", tip);
    btn.setAttribute("aria-label", tip);
    // Never let the click steal focus: the editor keeps its selection, and
    // `getActiveViewOfType(MarkdownView)` keeps pointing at the note.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => this.plugin.runAction(a));
  }
}
