# Verbatim for Obsidian — Specification

A reimplementation of the card-cutting core of [Verbatim](https://paperlessdebate.com) (the Microsoft Word template for competitive debate) as an Obsidian plugin, targeted at a single researcher cutting evidence — not at in-round debate use.

Source of truth for feature behavior: https://docs.paperlessdebate.com/ (crawled 2026-08-02).

---

## 1. Goals and scope

### Goals

- Reproduce Verbatim's **card-cutting loop** in Obsidian: paste → condense → structure with headings → cite → underline/emphasize/highlight → clean up.
- Keep evidence files as **plain, portable Markdown**. Every mark the plugin writes must render acceptably in vanilla Obsidian with the plugin disabled, and degrade gracefully in any Markdown viewer.
- Preserve Verbatim's **semantic-styles-only** philosophy: users never hand-format; they invoke commands that apply a small fixed vocabulary of structures and inline marks, which all automation can then rely on.
- Preserve the **machine-parseable card contract** (Tag heading + one-line cite + body) so that condensing, cite automation, and search keep working.

### In scope

1. The Pocket/Hat/Block/Tag heading hierarchy and outline-manipulation commands.
2. The card anatomy and one-line cite format.
3. Inline styles: Underline, Emphasis, Highlight (multi-color), Cite, Clear Formatting.
4. Cutting commands: Paste Text, Condense (all three modes), Uncondense, Shrink.
5. Cite automation: Auto Format Cite, Reformat All Cites, Duplicate Cite, **Cite from URL** (Cite Creator replacement).
6. Card/document automation: Auto-Emphasize First, Standardize Highlighting (with exception color), Auto Number / De-Number Tags, the document fixers and removal tools.
7. Settings, default hotkeys, and the CSS theming layer.

### Out of scope (deliberately)

- All in-round features: Speech documents, Send to Speech, card marking, timers, audio recording, window arranging, Reading View management.
- Virtual Tub, tub organization, Auto-Open Folder, Copy to USB.
- The Excel flowing template and all Send-to-Flow features; Quick Analytics.
- Caselist/disclosure: Wikify, Citeify, openCaselist upload, cite-request cards, Tabroom integration.
- Quick Cards (Obsidian core Templates / community text-expansion plugins cover this).
- Highlights-only reading view (Verbatim's "Invisibility Mode") — cut in triage; see §11 Open questions if revisited.
- Stats/read-time, OCR, Add Warrant, folder search (Obsidian search suffices).
- `.docx` import/export of any kind. Obsidian-native only.
- Word-specific machinery with no Obsidian analog: installation/AV handling, Setup Wizard/Check, distributions, VBA import/export, update checking, Draft/Web view.

---

## 2. Data model

### 2.1 Vault layout — mirror Verbatim

Evidence lives in a small number of **large Markdown notes** (one per topic/file, exactly as Verbatim uses one `.docx` per expando file). Organization *within* a note is by heading level; organization *across* notes is ordinary folders. No one-note-per-card, no required frontmatter, no index notes.

### 2.2 Heading hierarchy

| Level | Verbatim name | Markdown | Role |
|---|---|---|---|
| 3 | **Pocket** | `###` | Major section of a file |
| 4 | **Hat** | `####` | Subsection; groups similar blocks |
| 5 | **Block** | `#####` | One argument — a card or group of cards |
| 6 | **Tag** | `######` | The tag (claim) of an individual card |

(v0.2 revision: shifted from H1–H4 to H3–H6, leaving H1/H2 free for ordinary note structure.)

Rules carried over from Verbatim:

- Not all four levels are required; structure follows content complexity.
- **Tag is always H6** regardless of whether Pocket/Hat/Block levels are present above it. This is what lets automation find cards unambiguously. (Deviation from Markdown convention of contiguous heading levels is accepted and intentional.)
- No blank heading paragraphs as spacers. The "Remove Blanks" fixer enforces this.
- Card files opt into Verbatim heading styling with `cssclasses: cardfile` in frontmatter; the plugin CSS scopes all heading looks (Pocket large bold; Hat bold centered double-underline; Block bold centered underline; Tag body-sized bold) to that class.

### 2.3 Card contract

A **card** is, in document order:

1. A **Tag**: one `####` heading line.
2. A **Cite**: the first non-empty line after the tag, matching the cite grammar (§2.4).
3. A **Body**: everything until the next heading of any level.

An H4 with no cite line under it is an **analytic** (Verbatim: a tag with no card). Automation that needs a card (cite commands, condense-card scope) treats it as tag-only and no-ops on the missing parts. There is deliberately no "hidden analytic" style (Verbatim rejects hiding analytics on debate-ethics grounds; we inherit the simplicity).

### 2.4 Cite grammar

One line, one paragraph:

```
First Last, qualifications, M-D-YYYY, "Title," URL
```

Rendered example (bold = Cite emphasis):

> Aaron **Hardy**, creator of Verbatim, 1-1-**3000**, "Verbatim Online Manual," https://docs.paperlessdebate.com

- **Last name** and the **date portion** carry the Cite emphasis (see §3).
- Date is numeric `M-D-YYYY` (or bare `YYYY`). Per Verbatim's rule: for **current-year** cites the month-day (`1-1`) is emphasized; for older cites the **year** is emphasized.
- First and last name stay together; title in straight quotes; URL last; everything on one line. Multi-line and parenthetical cite formats are unsupported (they defeat parsing, same as in Verbatim).

Parsing regex (normative, applied to the first line after an H4):

```
^(?<first>\S+)\s+(?:\*\*)?(?<last>[^,*]+?)(?:\*\*)?,\s*(?<quals>.*?),\s*
(?:\*\*)?(?<date>(\d{1,2}-\d{1,2}-)?\d{4})(?:\*\*)?\s*(\*\*)?,\s*
"(?<title>[^"]*),?"\s*,?\s*(?<url>\S+)?\s*$
```

(Implementation may loosen this — the required invariant is: a line is a cite iff it contains a comma-separated prefix ending in a parseable date token before a quoted title. Lines that fail the check are body text.)

### 2.5 Inline mark vocabulary

The five Verbatim character styles map to Markdown/HTML as follows. This is the complete set of marks the plugin ever writes into body text:

| Verbatim style | Markdown representation | Rendered by |
|---|---|---|
| **Underline** | `<u>…</u>` | Native HTML in Obsidian |
| **Emphasis** | `**…**` | Native Markdown bold, restyled by plugin CSS (box/bold/larger per setting) |
| **Highlight** (default color) | `==…==` | Native Obsidian highlight; color themed by plugin CSS |
| **Highlight** (non-default color) | `<mark class="vb-hl-COLOR">…</mark>` | Plugin CSS; COLOR ∈ {yellow, green, cyan, magenta, blue, gray, orange} |
| **Cite emphasis** | `<b>…</b>` on the name/date tokens of a cite line | Native HTML bold; distinct from `**` Emphasis so emphasis rendering modes (box/large) never restyle cites (v0.2 revision) |
| **Shrunk text** (from Shrink) | `<small>…</small>` | Native HTML, further reduced by plugin CSS |
| **Pilcrow** (from Condense) | literal `¶` character surrounded by single spaces | Plain text |

Nesting order when marks combine (normalized by the plugin): `<u>` outermost, then `==`/`<mark>`, then `**`, then `<small>`. Example fully-marked run: `<u>==**text**==</u>`.

Design constraints honored:

- With the plugin off, a cut card still reads correctly: underlines are underlined, highlights highlighted, emphasis bold, shrunk text small.
- `**` inside a card body means Emphasis; `**` on a cite line means Cite emphasis. No separate syntax needed because position disambiguates.
- The literal `¶` and the omission notes `[ Table Omitted ]`, `[ Figure Omitted ]`, `< Image Omitted >`, `< Nothing Omitted >` (case-sensitive, exact spacing) are reserved tokens.

---

## 3. Commands

All commands are registered Obsidian commands (usable from the palette) with default hotkeys per §5. "Ctrl/Cmd" means Ctrl on Windows/Linux, Cmd on macOS.

### 3.0 Selection-scope cascade

Shared behavior for every command marked **[scope]**: the target range is resolved in priority order —

1. the explicit selection, if any;
2. else the **current card** (tag/cite/body containing the cursor);
3. else the **enclosing heading section** (Block → Hat → Pocket) if the cursor is on a heading line;
4. else, if the cursor is at the very start of the note, the **entire document**.

### 3.1 Structure

| Command | Behavior |
|---|---|
| **Pocket** | Make current line(s) an H1. Strips existing heading/inline marks from the line first. |
| **Hat** | Same, H2. |
| **Block** | Same, H3. |
| **Tag** | Same, H4. |
| **Select Heading** | Select the current heading and its entire section (all children). |
| **Move Up / Move Down** | Move the current heading section above the previous / below the next sibling section, children included. Works on any level (card through pocket). |
| **Move To Bottom** | Move current heading section to the end of its parent section. |
| **Delete Heading** | Delete the current heading section and all children. |

(Obsidian's built-in outline pane provides the Navigation-Pane browsing/collapsing role; drag-and-drop section moving in the outline is out of plugin scope — the Move commands are the supported path.)

### 3.2 Cutting

| Command | Behavior |
|---|---|
| **Paste Text** | Paste clipboard as plain text: strip all rich formatting, Markdown syntax characters escaped or removed (pasted content must contain no marks from §2.5). If **Condense on Paste** is enabled, apply Condense to the pasted range using the default mode. |
| **Condense** **[scope]** | Collapse the body text of the target to minimal whitespace using the default condense mode (setting). Never touches tag or cite lines. |
| **Condense (with pilcrows)** | Explicit mode: each paragraph break inside the body becomes ` ¶ ` and paragraphs are joined into one. Preserves evidence of original paragraph boundaries. |
| **Condense (no pilcrows)** | Explicit mode: paragraph breaks are joined with a single space, no marker. |
| Mode "no paragraph integrity" | Settings-selectable default only (no dedicated hotkey): equivalent to no-pilcrows; kept for Verbatim parity. |
| **Uncondense** **[scope]** | Replace every ` ¶ ` with a paragraph break, restoring original paragraphs. Document-wide when invoked at document start (scope rule 4). |
| **Shrink** **[scope]** | Wrap every maximal run of body text that is **not underlined** (not inside `<u>`) in `<small>…</small>`. Invoking again on a fully-shrunk target removes the `<small>` wrappers (toggle). Omission notes (§2.5) are exempt unless the **Shrink omissions** setting is on. Highlight/emphasis marks inside shrunk runs are preserved. |
| **Shrink / Unshrink all cards** | Document-wide variants of Shrink. |

### 3.3 Inline styles

All are toggles on the selection (no selection: no-op, except Underline Mode below).

| Command | Behavior |
|---|---|
| **Underline** | Toggle `<u>` around the selection. If **Bold underline** setting is on, also toggles `**` with it. Merges/splits adjacent `<u>` runs so the source stays clean (no `</u><u>` seams). |
| **Emphasis** | Toggle `**` around the selection (rendered per Emphasis-appearance setting). |
| **Highlight** | Toggle highlight in the **current highlight color**. Default color writes `==…==`; any other color writes `<mark class="vb-hl-COLOR">`. |
| **Set Highlight Color** | Palette-style picker (command palette submenu or ribbon menu) selecting the current color from the seven named colors. Light gray is available but not default (Verbatim discourages it). |
| **Clear Formatting** | Strip `<u>`, `**`, `<small>` from the selection/target — **but not highlighting** (Verbatim F12 parity; toggle highlights off separately). Also normalizes broken/nested mark seams. |
| **Underline Mode** (toggle) | While active, completing any text selection in the editor immediately applies Underline to it. Status-bar indicator shows the mode is on. |

### 3.4 Cite commands

| Command | Behavior |
|---|---|
| **Auto Format Cite** | Parse the cite line of the current card (§2.4 grammar). Apply Cite emphasis: bold the last name; bold **month-day** if the cite's year == current year, else bold the **year**. Removes any previous bolding on the line first. Errors (line unparseable) show a Notice and change nothing. |
| **Reformat All Cites** | Run Auto Format Cite on every card in the document. Report count formatted / count skipped. |
| **Duplicate Cite** | Insert a copy of the nearest preceding cite line at the cursor (for cutting several cards from one article). |
| **Cite from URL** | The Cite Creator replacement. Given a URL (from the system clipboard if it holds one, else an input prompt), fetch the page via Obsidian `requestUrl` and build a one-line cite inserted at the cursor, already Cite-emphasized. Extraction order for each field: JSON-LD (`Article`/`NewsArticle`) → OpenGraph/`<meta>` tags (`article:author`, `article:published_time`, `og:title`, `og:site_name`) → `<title>`/heuristics. Author → `First Last`; site name → qualifications slot (user edits quals by hand — auto quals are explicitly non-goals); date → `M-D-YYYY`; title in quotes; URL appended. Fields that can't be extracted are inserted as `XX` placeholders so the cursor can tab through them. |

### 3.5 Card automation

| Command | Behavior |
|---|---|
| **Auto-Emphasize First** | For each word in the selection, apply Emphasis to its first letter (acronym helper: **U**nited **S**tates). |
| **Standardize Highlighting** | Convert every highlight in the document to the current highlight color (rewriting `<mark>`/`==` forms as needed). |
| **Standardize Highlighting (with exception)** | Same, but leave the configured exception color untouched (two-color schemes). |
| **Auto Number Tags** **[scope]** | Prefix the tags in the current block with `1. `, `2. `, … in order; at document start, numbers every block independently. Re-running renumbers (idempotent). |
| **De-Number Tags** **[scope]** | Remove those numeric prefixes. |

Not carried over: **Auto Underline Card** (Word's tag-driven heuristic underliner). Its accuracy was poor in Verbatim and it does not justify the complexity; listed in §11 as a possible LLM-assisted v2 feature.

### 3.6 Document fixers and removal tools

All operate document-wide and report what they changed via Notice.

| Command | Behavior |
|---|---|
| **Fix Fake Tags** | Find paragraphs that look like tags but aren't H4 (whole-paragraph bold, or short bold-leading paragraphs directly above a cite line) and convert them to `####` headings, stripping the manual bold. |
| **Fix Formatting Gaps** | Within each card body, close single-character gaps in `<u>`/`**`/highlight runs (e.g. an un-underlined space between two underlined words) and merge adjacent identical marks. |
| **Convert To Default Styles** | Normalize foreign markup into the §2.5 vocabulary: `<b>`/`__` → `**`, `<i>`/`*` → removed (italic is not a Verbatim style), `<span style>`-based underlines/highlights → `<u>`/`<mark>`, HTML entities unescaped, curly quotes in cite lines straightened. |
| **Remove Blanks** | Delete empty heading lines and collapse runs of 2+ blank lines to one. |
| **Remove Pilcrows** | Delete all ` ¶ ` tokens (join with single space) document-wide. |
| **Remove Hyperlinks** | Convert `[text](url)` links to plain text (keeping the text; on cite lines, keeping the URL). |
| **Remove Emphasis** | Convert all body-text `**` emphasis to plain underlining (`<u>` if not already underlined; else just removed). Cite lines untouched. |
| **Remove Non-Highlighted Underlining** | Strip `<u>` from any run that contains no highlight (trim over-underlined cards). |
| **Select Similar** | Select all ranges in the document carrying the same mark combination as the current selection (all Tags, all highlights of one color, etc.) — implemented as multi-cursor/multi-selection. |

Not carried over: Insert Header (printing), Remove Bookmarks (no Word bookmarks), Show All Formatting (source mode already shows all marks), Update Styles (§4 CSS plays this role automatically), Convert Analytics To Tags (no analytics style exists here).

---

## 4. Appearance and theming

The plugin ships a `styles.css` driven by CSS variables so users restyle without editing files (Verbatim's "customize styles in Settings, never by direct formatting" rule):

- `.vb-hl-yellow` … `.vb-hl-orange` — the seven highlight colors; `==` highlights are themed via `--text-highlight-bg` to the default color.
- Emphasis appearance — the setting (§6) toggles a body class; CSS renders body `<strong>` as **bold** (default), **boxed** (Verbatim default: thin outline), or **larger text**.
- `<small>` inside notes — rendered at a configurable shrink factor (default 60%) with reduced line-height, so shrunk cards compress vertically like Verbatim's.
- Heading styles for H1–H4 tuned to Verbatim's visual hierarchy (Pocket large/centered optional, Tag compact), all overridable by the user's theme.

Editor (Live Preview) rendering must match Reading view for all marks — the CM6 extension decorates `<u>`, `<mark>`, `<small>` and `==` inside the editor.

---

## 5. Default hotkeys

Verbatim's F-row is preserved where Obsidian/OS conflicts allow; every command also gets the Ctrl/Cmd+Alt+number alias exactly as Verbatim provides for laptops. All remappable through Obsidian's native Hotkeys pane (which replaces Verbatim's Keyboard settings tab).

| Command | Primary | Alias |
|---|---|---|
| Paste Text | F2 | Ctrl/Cmd+Alt+2 |
| Condense | F3 | Ctrl/Cmd+Alt+3 |
| Pocket | F4 | Ctrl/Cmd+Alt+4 |
| Hat | F5 | Ctrl/Cmd+Alt+5 |
| Block | F6 | Ctrl/Cmd+Alt+6 |
| Tag | F7 | Ctrl/Cmd+Alt+7 |
| Auto Format Cite | F8 | Ctrl/Cmd+Alt+8 |
| Underline | F9 | Ctrl/Cmd+Alt+9 |
| Emphasis | F10 | Ctrl/Cmd+Alt+0 |
| Highlight | F11 | Ctrl/Cmd+Alt+- |
| Clear Formatting | F12 | Ctrl/Cmd+Alt+= |
| Shrink | Alt+F3 | Ctrl/Cmd+8 |
| Condense (with pilcrows) | Ctrl/Cmd+Alt+F3 | — |
| Condense (no pilcrows) | Ctrl/Cmd+F3 | — |
| Uncondense | Ctrl/Cmd+Alt+Shift+F3 | — |
| Duplicate Cite | Alt+F8 | — |
| Cite from URL | Alt+F2 | — |
| Auto-Emphasize First | Ctrl/Cmd+Alt+F10 | — |
| Auto Number Tags | Ctrl/Cmd+Shift+3 | — |
| Select Similar | Ctrl/Cmd+F2 | — |
| Move Up / Down | Ctrl/Cmd+Alt+Up / Down | — |
| Move To Bottom | Ctrl/Cmd+Alt+Shift+Down | — |
| Select Heading | Ctrl/Cmd+Alt+A | — |
| Delete Heading | Ctrl/Cmd+Alt+Left | — |

Notes: Verbatim's F8 is "Cite style on selection"; since positional cite detection makes manual cite styling unnecessary, F8 maps to Auto Format Cite (its Ctrl+F8 role) directly. On macOS, F-keys require "Use F1, F2… as standard function keys" or the aliases; the plugin's README documents this. Known conflicts (F11 fullscreen on some Linux WMs, etc.) are the user's to resolve via the Hotkeys pane.

---

## 6. Settings

Single plugin settings tab (replaces the relevant subset of Verbatim's 12-tab dialog):

**Format**
- Default condense mode: pilcrows / no pilcrows / no paragraph integrity (default: pilcrows).
- Condense on Paste (default: off).
- Bold underline — Underline also applies bold (default: off).
- Auto-emphasis — Underline also applies Emphasis (Verbatim "Auto Emphasis"; default: off).
- Shrink omissions — include omission notes when shrinking (default: off).
- Shrink factor for `<small>` rendering (default: 60%).

**Highlighting**
- Default highlight color (default: yellow).
- Exception color for Standardize Highlighting (default: green).

**Emphasis**
- Rendering mode: bold / boxed / larger text (default: bold).

**Cites**
- Current-year rule for Auto Format Cite: use system year (default) or a pinned year.
- Cite from URL: placeholder token (default `XX`).

**Hotkeys** — link out to Obsidian's Hotkeys pane filtered to this plugin.

Dropped from Verbatim settings: everything under Profile (name/school/event/WPM/Tabroom), Admin (wizard/troubleshooter/VBA), View, Paperless, VTub, Caselist, Plugins-paths, About/updates — all tied to out-of-scope features or handled natively by Obsidian.

---

## 7. Implementation notes

- **Platform**: standard Obsidian community plugin (TypeScript, esbuild). Desktop-first; nothing here requires Node-only APIs except nothing — `requestUrl` works on mobile too, so mobile support is free but untested/unsupported initially.
- **Editor layer**: all mutations go through the CM6 `EditorTransaction` API on the active `Editor`; document-wide fixers operate on the file text via `Editor.setValue`-free ranged changes to preserve cursor/scroll/undo. Every command is a single undo step.
- **Parsing layer**: a small pure module (`cardModel.ts`) that, given note text, produces the section tree (headings + ranges) and card list (tag/cite/body ranges). All commands consume this; it is the single owner of the §2.3/§2.4 grammar. Unit-test this module heavily — it is the contract.
- **Mark layer**: a pure module for reading/writing the §2.5 mark vocabulary on a text range (toggle, merge seams, nest-order normalization). Property-test: toggle twice == identity; marks never cross paragraph or heading boundaries.
- **Underline Mode**: CM6 update listener on selection changes; applies on selection *completion* (mouseup / shift-release), not on every extension, to avoid churn.
- **Cite from URL**: `requestUrl` with a desktop UA string; parse with `DOMParser`. No headless browser, no paywall circumvention — if the page doesn't yield metadata, emit placeholders.
- **Performance target**: all [scope] commands O(target size); document-wide fixers must handle 5 MB notes (a large backfile) without blocking the UI — chunk via `requestAnimationFrame` if needed.

---

## 8. Milestones

1. **M1 — Model + structure**: card/section parser, heading commands, move/select/delete heading, Paste Text. Usable for organizing.
2. **M2 — Marks**: underline/emphasis/highlight/clear, colors, Underline Mode, CSS layer. Usable for cutting.
3. **M3 — Condense/Shrink**: all condense modes, uncondense, shrink, omission handling.
4. **M4 — Cites**: cite parser, Auto Format Cite, Reformat All, Duplicate Cite, Cite from URL.
5. **M5 — Hygiene**: fixers, removal tools, Standardize Highlighting, Auto Number Tags, Select Similar.
6. **M6 — Polish**: settings tab, hotkey defaults, README with the macOS F-key note, sample vault.

---

## 9. Acceptance criteria (spot checks)

- Cutting a card end-to-end (paste article → condense → tag/cite/underline/highlight → shrink) takes only the F-row, exactly as in Verbatim.
- A cut note opened with the plugin **disabled** still renders: headings, underlines, bold, highlights, small text — no plugin-only syntax in the file.
- `Uncondense` after `Condense (with pilcrows)` restores the original paragraph breaks byte-for-byte (modulo collapsed intra-paragraph whitespace).
- `Auto Format Cite` on the docs example produces `Aaron **Hardy**, creator of Verbatim, 1-1-**3000**, "Verbatim Online Manual," <url>` — year bolded because 3000 ≠ current year.
- Every command is idempotent or a clean toggle; none ever modifies text outside its resolved scope.

---

## 10. Divergences from Verbatim (intentional)

| Verbatim | This plugin | Why |
|---|---|---|
| Cite is a character *style* applied manually (F8) | Cite emphasis is plain `**` + positional detection; F8 runs the auto-formatter | One less syntax; position disambiguates |
| Shrink cycles through several font sizes | Single `<small>` toggle | Markdown has no font-size runs; one level covers the use case |
| Auto Underline Card | Dropped | Low accuracy in the original; candidate for LLM-assisted v2 |
| Nav Pane drag-and-drop | Obsidian outline pane + Move commands | Outline drag-drop isn't exposed to plugins |
| Update Styles / style import-export | CSS variables + Obsidian appearance system | Native mechanism |
| Word bookmarks, headers, printing aids | Dropped | No equivalent need |

---

## 11. Open questions / v2 candidates

- **Highlights-only reading view** (Invisibility Mode): cut in triage, but cheap as a CM6 view plugin that folds non-highlighted body text; revisit after M6.
- **LLM-assisted Auto Underline / Auto Highlight**: tag-conditioned underlining is a much better fit for an LLM call than for Word heuristics; would need an API-key setting and clear opt-in.
- **Two-color highlight workflows**: is the exception-color mechanism enough, or is a per-color "select all of color X" needed beyond Select Similar?
- **Backfile ingestion**: `.docx` import was scoped out; if old Verbatim files ever need to come in, a one-shot external converter script (mammoth.js → this spec's Markdown) is the right shape — not a plugin feature.
