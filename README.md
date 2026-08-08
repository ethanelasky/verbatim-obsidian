# Verbatim for Obsidian

Debate-style card cutting in Obsidian, modeled on [Verbatim](https://paperlessdebate.com) for Microsoft Word. See `SPEC.md` for the full design.

Evidence lives in plain Markdown: Pocket/Hat/Block/Tag are headings `##`, `###`, `#####`, `######` (H4 reserved), underlining is `<u>`, emphasis is `**bold**`, cite emphasis is `<b>bold</b>` (so it styles independently of Emphasis), highlights are `==…==` (default color) or `<mark class="vb-hl-COLOR">`, shrunk text is `<small>`. Files render correctly even with the plugin disabled.

Add `cssclasses: cardfile` to a note's frontmatter to activate the Verbatim-style heading looks (Pocket large bold; Hat bold centered double-underline; Block bold centered underline; Tag body-sized bold) in that file only.

## Install (manual)

1. Build: `npm install && npm run build`
2. Copy `manifest.json`, `main.js`, and `styles.css` into `<your vault>/.obsidian/plugins/verbatim/`
3. Enable **Verbatim** in Settings → Community plugins.

## The panel

Click the scissors in Obsidian's left ribbon (or run **Open Verbatim panel**) to open a sidebar pane that stands in for Verbatim's Word ribbon: every tool as a button, grouped Cutting / Structure / Format / Cites / Automation / Fixers. Click a group header to fold it; the folded set is remembered.

Buttons act on the note you were just editing — clicking one never steals focus, so the selection you made survives the click. The Format group also carries the seven highlight swatches: clicking one sets the current color (and highlights the selection if there is one). The dot marks the default color, the one written as `==…==`. **U-mode** lights up while Underline Mode is on. Each button's tooltip shows its current hotkey, and bare function keys are printed on the button itself.

## The cutting loop

| Key | Command |
|---|---|
| F2 / Cmd⌥2 | Paste text (unformatted) |
| F3 / Cmd⌥3 | Condense |
| F4–F7 / Cmd⌥4–7 | Pocket / Hat / Block / Tag |
| F8 / Cmd⌥8 | Auto format cite |
| F9 / Cmd⌥9 | Underline |
| F10 / Cmd⌥0 | Emphasis |
| F11 / Cmd⌥- | Highlight |
| F12 / Cmd⌥= | Clear formatting (keeps highlights) |
| Alt+F3 or Cmd8 | Shrink non-underlined text |
| Alt+F2 | Cite from URL |
| Alt+F8 | Duplicate previous cite |
| Cmd⌥↑ / ↓ | Move heading up / down |
| Cmd⌥A / ← | Select / delete heading |

All hotkeys are remappable in Settings → Hotkeys (search "Verbatim"). Everything is also in the command palette, including the document fixers (Fix fake tags, Remove blanks, Standardize highlighting, …).

**macOS note:** enable *System Settings → Keyboard → "Use F1, F2, etc. keys as standard function keys"* (or use the Cmd⌥number aliases). F11 may conflict with Show Desktop; rebind either side.

## Card format

```markdown
---
cssclasses: cardfile
---
## Pocket
### Hat
##### Block
###### Tag — the claim this card supports
Aaron <b>Hardy</b>, creator of Verbatim, 1-1-<b>3000</b>, "Verbatim Online Manual," https://docs.paperlessdebate.com
Card body with <u>underlined ==highlighted== text</u> and <small>shrunk text</small>. ¶ Pilcrows mark condensed paragraph breaks.
```

The one-line cite (`First Last, quals, M-D-YYYY, "Title," URL`) is load-bearing: cite detection, condensing scope, and Auto Format Cite all depend on it.

## Development

- `npm run dev` — watch build
- `npm test` — unit tests for the parsing/marks/cite modules
- `npm run build` — typecheck + production bundle
