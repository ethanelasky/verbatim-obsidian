import { App, PluginSettingTab, Setting } from "obsidian";
import { HL_COLORS, HlColor } from "./marks";
import type { CondenseMode } from "./cutting";
import type VerbatimPlugin from "./main";

export type EmphasisMode = "bold" | "box" | "large";

export interface VbSettings {
  condenseMode: CondenseMode;
  condenseOnPaste: boolean;
  boldUnderline: boolean;
  autoEmphasis: boolean;
  shrinkOmissions: boolean;
  /** percent, e.g. 60 */
  shrinkFactor: number;
  defaultHl: HlColor;
  exceptionHl: HlColor;
  currentHl: HlColor;
  emphasisMode: EmphasisMode;
  /** "" = use system year */
  pinnedYear: string;
  placeholder: string;
}

export const DEFAULT_SETTINGS: VbSettings = {
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
  placeholder: "XX",
};

export class VbSettingTab extends PluginSettingTab {
  plugin: VerbatimPlugin;

  constructor(app: App, plugin: VerbatimPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl).setName("Format").setHeading();

    new Setting(containerEl)
      .setName("Default condense mode")
      .setDesc("How Condense joins paragraphs inside a card body.")
      .addDropdown((d) =>
        d
          .addOptions({
            pilcrows: "With pilcrows (¶)",
            nopilcrows: "Without pilcrows",
            nointegrity: "No paragraph integrity",
          })
          .setValue(s.condenseMode)
          .onChange(async (v) => {
            s.condenseMode = v as CondenseMode;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Condense on paste")
      .setDesc("Automatically condense text inserted by Paste Text.")
      .addToggle((t) =>
        t.setValue(s.condenseOnPaste).onChange(async (v) => {
          s.condenseOnPaste = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Bold underline")
      .setDesc("Underline also bolds the selected text.")
      .addToggle((t) =>
        t.setValue(s.boldUnderline).onChange(async (v) => {
          s.boldUnderline = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Auto emphasis")
      .setDesc("Underline also applies Emphasis.")
      .addToggle((t) =>
        t.setValue(s.autoEmphasis).onChange(async (v) => {
          s.autoEmphasis = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Shrink omission notes")
      .setDesc(
        'Include notes like "[ Table Omitted ]" when shrinking non-underlined text.',
      )
      .addToggle((t) =>
        t.setValue(s.shrinkOmissions).onChange(async (v) => {
          s.shrinkOmissions = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Shrink factor")
      .setDesc("Rendered size of shrunk text, as a percentage of normal.")
      .addSlider((sl) =>
        sl
          .setLimits(30, 90, 5)
          .setValue(s.shrinkFactor)
          .setDynamicTooltip()
          .onChange(async (v) => {
            s.shrinkFactor = v;
            await this.plugin.saveSettings();
            this.plugin.applyAppearance();
          }),
      );

    new Setting(containerEl).setName("Highlighting").setHeading();

    const colorOptions = Object.fromEntries(HL_COLORS.map((c) => [c, c]));

    new Setting(containerEl)
      .setName("Default highlight color")
      .setDesc("The color written as ==…== ; other colors use <mark> tags.")
      .addDropdown((d) =>
        d
          .addOptions(colorOptions)
          .setValue(s.defaultHl)
          .onChange(async (v) => {
            s.defaultHl = v as HlColor;
            await this.plugin.saveSettings();
            this.plugin.applyAppearance();
          }),
      );

    new Setting(containerEl)
      .setName("Exception color")
      .setDesc("Color preserved by Standardize Highlighting (with exception).")
      .addDropdown((d) =>
        d
          .addOptions(colorOptions)
          .setValue(s.exceptionHl)
          .onChange(async (v) => {
            s.exceptionHl = v as HlColor;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("Emphasis").setHeading();

    new Setting(containerEl)
      .setName("Emphasis rendering")
      .setDesc("How Emphasis (bold) is displayed in evidence.")
      .addDropdown((d) =>
        d
          .addOptions({ bold: "Bold", box: "Boxed", large: "Larger text" })
          .setValue(s.emphasisMode)
          .onChange(async (v) => {
            s.emphasisMode = v as EmphasisMode;
            await this.plugin.saveSettings();
            this.plugin.applyAppearance();
          }),
      );

    new Setting(containerEl).setName("Cites").setHeading();

    new Setting(containerEl)
      .setName("Pinned year")
      .setDesc(
        "Auto Format Cite bolds month-day for cites from this year. Leave empty to use the system year.",
      )
      .addText((t) =>
        t
          .setPlaceholder("e.g. 2026")
          .setValue(s.pinnedYear)
          .onChange(async (v) => {
            s.pinnedYear = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Placeholder token")
      .setDesc("Inserted by Cite from URL for fields it cannot extract.")
      .addText((t) =>
        t.setValue(s.placeholder).onChange(async (v) => {
          s.placeholder = v || "XX";
          await this.plugin.saveSettings();
        }),
      );
  }
}
