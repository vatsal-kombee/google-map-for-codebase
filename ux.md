# Codebase Explorer — UX Design Specification

> A complete prompt and design reference for the `HomePage` + `HomeInner` component.  
> Use this document to recreate, extend, or hand off the UI to any designer or AI tool.

---

## 1. Product Overview

**What it is:** A developer tool for visually exploring GitHub repositories as import-based dependency graphs — "Google Maps for codebases."

**Who uses it:** Engineers auditing unfamiliar repos, architects reviewing coupling, and developers debugging circular imports.

**Core user jobs:**
1. Paste a GitHub URL → see a live import graph
2. Click nodes → inspect file-level relationships
3. Ask natural language questions → get AI-powered codebase insights

---

## 2. Design Principles

| Principle                       | What it means in practice                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Terminal-native**             | Feels like a developer tool, not a consumer app. Monospace fonts for data, dark background, no rounded "friendly" UI. |
| **Data first**                  | Every pixel earns its place. No decorative elements — every color, border, and label encodes meaning.                 |
| **One primary action per zone** | Each section of the UI has exactly one job. No competing calls to action.                                             |
| **Dual accent system**          | Green = primary data actions. Cyan = AI/secondary actions. Never swap them.                                           |
| **Always-on AI access**         | The chat strip is persistent across all tab views. Users shouldn't need to navigate to ask a question.                |

---

## 3. Color System

### Palette

| Token                | Hex                      | Usage                                                                                            |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| `--accent-primary`   | `#4fffb0`                | Explore button, active tab indicator, selected node dot, pulse dot, input focus ring (URL field) |
| `--accent-secondary` | `#00d4ff`                | Ask button, hub node dot, modules stat value, input focus ring (chat field)                      |
| `--danger`           | `#ff6b6b`                | Cycle-risk nodes in sidebar list and graph                                                       |
| `--bg-page`          | `#0d0f14`                | Page background, graph canvas background                                                         |
| `--bg-panel`         | `#13151c`                | Header, tab bar, sidebar, chat strip backgrounds                                                 |
| `--bg-surface`       | `#1a1d27`                | Input fields, stat cards, file list hover                                                        |
| `--border`           | `rgba(255,255,255,0.08)` | All dividers (header, tabs, sidebar, footer)                                                     |
| `--border-emphasis`  | `rgba(255,255,255,0.14)` | Input borders, button borders (ghost)                                                            |
| `--text-primary`     | `#e8eaf0`                | All primary readable text                                                                        |
| `--text-muted`       | `#6b7280`                | Placeholder text, secondary labels, stat keys                                                    |

### Color semantics (never deviate)

- **Green (#4fffb0)** = "do something with data" (load repo, select a file, active view)
- **Cyan (#00d4ff)** = "talk to AI" (ask a question, hub node = high connectivity)
- **Red (#ff6b6b)** = "warning: circular dependency risk"
- **Gray (#888)** = neutral/normal nodes with no special status

---

## 4. Typography

| Role           | Font           | Size | Weight | Where                                |
| -------------- | -------------- | ---- | ------ | ------------------------------------ |
| Brand name     | Syne           | 14px | 700    | Top-left header                      |
| Button labels  | Syne           | 13px | 700    | "Explore →", "Local path"            |
| Tab labels     | JetBrains Mono | 12px | 400    | graph / files / dependencies / chat  |
| Input text     | JetBrains Mono | 12px | 400    | URL field, chat field                |
| Input prefix   | JetBrains Mono | 11px | 400    | `github://` label inside URL input   |
| Stat values    | JetBrains Mono | 18px | 600    | 247, 1.4k, 38, 6                     |
| Stat keys      | JetBrains Mono | 9px  | 400    | FILES, IMPORTS, MODULES, CYCLES      |
| File names     | JetBrains Mono | 11px | 400    | Sidebar file list                    |
| File counts    | JetBrains Mono | 10px | 400    | Right-aligned in sidebar list        |
| Status pill    | JetBrains Mono | 10px | 400    | "ready" / "loading"                  |
| Section labels | JetBrains Mono | 9px  | 400    | "repo stats", "top nodes by imports" |
| Brand tagline  | JetBrains Mono | 10px | 400    | "import graph · v2.1"                |

**Rule:** `font-mono` on anything that represents data or code. `font-sans` on UI controls (buttons, brand). This font split is load-bearing — it tells users what's interactive vs informational.

---

## 5. Layout Architecture

```
┌─────────────────────────────────────────────────────────┐
│  HEADER (h-auto, bg-panel)                              │
│  [Brand]          [github:// input]  [Explore] [Local]  │
├─────────────────────────────────────────────────────────┤
│  TAB BAR (h-auto, bg-panel)                             │
│  [graph] [files] [dependencies] [chat]      [● ready]   │
├──────────────┬──────────────────────────────────────────┤
│  SIDEBAR     │  GRAPH CANVAS                            │
│  w-64        │  flex-1                                  │
│  (bg-panel)  │  (bg-page + dot-grid)                   │
│              │                                          │
│  [stat grid] │  <AppShell />                            │
│  [file list] │                                          │
│              │                                          │
├──────────────┴──────────────────────────────────────────┤
│  CHAT STRIP (h-auto, bg-panel)                          │
│  [ask input ................................] [Ask ↗]    │
└─────────────────────────────────────────────────────────┘
```

### Flex structure (Tailwind classes)

```
div.min-h-screen.bg-[#0d0f14]
  div.mx-auto.flex.h-screen.max-w-[1600px].flex-col
    header                          ← shrinks to content
    div.tabrow                      ← shrinks to content
    div.flex.flex-1.min-h-0         ← fills remaining height
      aside.w-64.shrink-0           ← fixed width sidebar
      main.flex-1.overflow-hidden   ← graph fills rest
    div.chat-strip                  ← shrinks to content
```

**Critical:** `min-h-0` on the content row is mandatory. Without it, the sidebar and graph won't scroll correctly inside `h-screen`.

---

## 6. Component Specifications

### 6.1 Header

**Height:** auto (content-driven, ~56px)  
**Background:** `#13151c`  
**Border:** `border-b border-white/[0.08]`  
**Padding:** `px-5 py-3`  
**Layout:** `flex items-center justify-between gap-4`

#### Brand (left)
- Icon: 32×32px, `bg-[#4fffb0]`, `rounded-lg`
- SVG graph icon inside (3 nodes + 3 edges, fill `#0d0f14`)
- Name: "Codebase Explorer", 14px Syne bold
- Tagline: "import graph · v2.1", 10px JetBrains Mono, `text-white/40`

#### Input group (center-right)
- Container: `flex flex-1 max-w-2xl items-center gap-2`
- Wrapper: `relative flex-1`
- Prefix `github://`: absolute positioned, left-3, vertically centered, `text-[#4fffb0]`, 11px mono, `pointer-events-none`
- Input: `h-9 w-full rounded-lg border border-white/[0.14] bg-[#1a1d27] pl-[72px] pr-3 font-mono text-xs`
- Focus state: `focus:border-[#4fffb0]` (green — matches primary accent)
- Placeholder: "owner/repo or paste full URL", `placeholder:text-white/30`

#### Explore button (primary)
- `h-9 rounded-lg bg-[#4fffb0] px-4 font-bold text-[13px] text-[#0d0f14]`
- Hover: `hover:opacity-85`
- Active: `active:scale-95`
- Disabled: `disabled:opacity-50`
- Loading label: "Loading…" (replaces "Explore →")

#### Local path button (ghost)
- `h-9 rounded-lg border border-white/[0.14] bg-transparent px-3 text-xs font-semibold`
- Hover: `hover:border-[#00d4ff] hover:bg-[#00d4ff]/[0.06]` (cyan — secondary accent)

---

### 6.2 Tab Bar

**Height:** auto (~40px)  
**Background:** `#13151c`  
**Border:** `border-b border-white/[0.08]`  
**Padding:** `px-5` horizontal only  
**Layout:** `flex items-center`

#### Tabs
Four tabs: `graph`, `files`, `dependencies`, `chat`

- Font: JetBrains Mono, 12px, lowercase
- Padding: `px-4 py-2.5`
- Inactive: `text-white/40`, transparent border, `hover:text-white/80`
- Active: `text-[#4fffb0]`, `border-b-2 border-[#4fffb0]`
- Transition: `transition-colors`
- State: managed by `useState<"graph"|"files"|"dependencies"|"chat">`

#### Status pill (right-aligned)
- `ml-auto` pushes it to the far right
- Container: `flex items-center gap-1.5 rounded-full border border-[#4fffb0]/20 bg-[#4fffb0]/[0.08] px-2.5 py-1`
- Dot: `h-1.5 w-1.5 animate-pulse rounded-full bg-[#4fffb0]`
- Label: "ready" / "loading" / "error", 10px mono, `tracking-widest text-[#4fffb0]`

---

### 6.3 Sidebar

**Width:** `w-64` (256px), `shrink-0`  
**Background:** `#13151c`  
**Border:** `border-r border-white/[0.08]`  
**Structure:** `flex flex-col overflow-hidden`

#### Stats section
- Border: `border-b border-white/[0.08]`
- Padding: `p-4`
- Section label: "repo stats", 9px mono, `uppercase tracking-widest text-white/40`, `mb-2.5`
- Grid: `grid grid-cols-2 gap-2`

**Each stat card:**
- `rounded-lg border border-white/[0.08] bg-[#1a1d27] px-3 py-2.5`
- Value: 18px mono, font-semibold. Colored if meaningful:
  - Files: `#4fffb0` (green = primary)
  - Modules: `#00d4ff` (cyan = secondary)
  - Imports + Cycles: `#e8eaf0` (default)
- Label: 9px mono, `tracking-widest text-white/30`

| Stat    | Value | Color     |
| ------- | ----- | --------- |
| FILES   | 247   | `#4fffb0` |
| IMPORTS | 1.4k  | default   |
| MODULES | 38    | `#00d4ff` |
| CYCLES  | 6     | default   |

#### File list section
- Section label: `border-b border-white/[0.08] px-4 py-3`, "top nodes by imports", same style as above
- List: `flex-1 overflow-y-auto`

**Each file row:**
- `flex cursor-pointer items-center gap-2 border-l-2 px-4 py-2 transition-colors`
- Inactive: `border-transparent hover:bg-white/[0.03]`
- Active: `border-[#4fffb0] bg-[#4fffb0]/[0.06]`
- Dot: `h-1.5 w-1.5 shrink-0 rounded-full` — color encodes status:
  - `#4fffb0` = currently selected
  - `#00d4ff` = high-connectivity hub
  - `#ff6b6b` = cycle risk
  - `#555` = normal
- Name: `flex-1 truncate font-mono text-[11px] text-[#e8eaf0]/80`
- Count: `font-mono text-[10px] text-white/30`

---

### 6.4 Graph Canvas

**Layout:** `flex-1 overflow-hidden`  
**Background:** `#0d0f14`  
**Background image (dot grid):**
```css
background-image: radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px);
background-size: 28px 28px;
```

The dot grid signals "spatial canvas" — it tells users this area is zoomable/pannable without needing a label. The dots are intentionally very faint (5.5% opacity) so they recede behind graph content.

`<AppShell />` renders as the direct child, filling the entire area.

---

### 6.5 Chat Strip

**Height:** auto (~56px)  
**Background:** `#13151c`  
**Border:** `border-t border-white/[0.08]`  
**Padding:** `px-5 py-3`  
**Layout:** `flex items-center gap-2.5`

#### Chat input
- `h-9 flex-1 rounded-lg border border-white/[0.14] bg-[#1a1d27] px-3.5 font-mono text-xs`
- Focus: `focus:border-[#00d4ff]` (cyan — intentionally different from URL input's green)
- Placeholder: "Ask about this codebase — e.g. 'which files are tightly coupled?'"
- Placeholder style: `placeholder:text-white/30`

#### Ask button
- `h-9 shrink-0 rounded-lg border border-[#00d4ff]/30 bg-[#00d4ff]/[0.12] px-4 font-mono text-xs text-[#00d4ff]`
- Hover: `hover:bg-[#00d4ff]/20`
- Label: "Ask ↗" — the `↗` arrow indicates "sends to AI"

**Why cyan here:** The chat strip uses the secondary accent (cyan) throughout — input focus ring, button border, button text. This visually separates the AI interaction zone from the data exploration zone (green). Users subconsciously learn the color split.

---

## 7. Interaction States

### Input fields

| State    | URL input border         | Chat input border |
| -------- | ------------------------ | ----------------- |
| Default  | `white/14%`              | `white/14%`       |
| Focus    | `#4fffb0` (green)        | `#00d4ff` (cyan)  |
| Disabled | `white/8%` (opacity 50%) | —                 |

### Buttons

| Button     | Default                       | Hover                         | Active     | Disabled     |
| ---------- | ----------------------------- | ----------------------------- | ---------- | ------------ |
| Explore    | `bg-[#4fffb0]`                | `opacity-85`                  | `scale-95` | `opacity-50` |
| Local path | `border-white/14%`            | `border-[#00d4ff] bg-cyan/6%` | —          | `opacity-50` |
| Ask        | `bg-cyan/12% border-cyan/30%` | `bg-cyan/20%`                 | —          | —            |

### File list rows

| State   | Left border     | Background              |
| ------- | --------------- | ----------------------- |
| Default | transparent     | —                       |
| Hover   | transparent     | `white/3%`              |
| Active  | `#4fffb0` (2px) | `#4fffb0` at 6% opacity |

### Loading state
- Both header buttons get `disabled` attribute
- Explore button label changes to "Loading…"
- Status pill label changes from "ready" → "loading"
- Pulse animation continues on status dot

---

## 8. Responsive Behavior

The layout is designed for desktop (1200px+). On smaller viewports:

- Header input group: `max-w-2xl` prevents it from getting too wide on ultra-wide screens
- `max-w-[1600px] mx-auto` caps and centers on very large displays
- Sidebar is fixed width (`w-64`) — on mobile, consider a collapsible drawer pattern (not implemented in current version)
- Graph canvas fills all remaining space regardless of viewport width

---

## 9. Accessibility Notes

- All interactive elements are keyboard focusable
- Focus rings use `transition-colors` for smooth appearance
- Disabled states use `opacity-50` — ensure contrast ratio ≥ 3:1 against `#1a1d27` background
- Color alone does not convey meaning in the file list — dot color is supplemented by position (active row has left border)
- `animate-pulse` on the status dot should respect `prefers-reduced-motion`

---

## 10. Full Prompt for Regeneration

Use this prompt verbatim with any AI coding tool to regenerate the UI from scratch:

---

> Build a dark-themed developer tool UI called "Codebase Explorer" using Next.js and Tailwind CSS. It is a full-viewport app (`h-screen`, no page scroll) for visualizing GitHub repository import graphs.
>
> **Layout:** Vertical flex column. Five zones top to bottom: Header → Tab bar → Content row → Chat strip. The content row is `flex flex-1 min-h-0` and splits into a 256px fixed sidebar on the left and a flex-1 graph canvas on the right.
>
> **Color palette:** Page background `#0d0f14`. Panel/header background `#13151c`. Input/card background `#1a1d27`. Primary accent `#4fffb0` (green). Secondary accent `#00d4ff` (cyan). Danger `#ff6b6b`. All borders are `white/8%` (`rgba(255,255,255,0.08)`). Text is `#e8eaf0`. Muted text is `#6b7280`.
>
> **Typography:** Use JetBrains Mono for all data labels (tab names, file names, stat values, input text, prefixes). Use a geometric sans (Syne or similar) for the brand name and button labels.
>
> **Header:** Single flex row. Left: 32px green rounded icon + brand name "Codebase Explorer" + monospace tagline "import graph · v2.1". Center-right: relative input with absolute `github://` prefix in green, placeholder "owner/repo or paste full URL", focus border green. Then a filled green primary button "Explore →" and a ghost button "Local path". All interactive elements are h-9 (36px).
>
> **Tab bar:** Four monospace lowercase tabs: graph, files, dependencies, chat. Active tab has `border-b-2 border-[#4fffb0] text-[#4fffb0]`. Inactive tabs are `text-white/40`. On the far right, a pill with a pulsing green dot and the text "ready".
>
> **Sidebar:** Fixed w-64. Top section: "repo stats" label + 2×2 grid of stat cards showing FILES (247, green), IMPORTS (1.4k), MODULES (38, cyan), CYCLES (6). Each card is `bg-[#1a1d27] rounded-lg`. Below: "top nodes by imports" label + scrollable file list. Each row has a colored dot (green=selected, cyan=hub, red=cycle-risk, gray=normal), a monospace file name, and a right-aligned import count. Active row has `border-l-2 border-[#4fffb0] bg-[#4fffb0]/[0.06]`.
>
> **Graph canvas:** `flex-1 overflow-hidden bg-[#0d0f14]` with a dot-grid background: `radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)` at `28px 28px`. Renders `<AppShell />` inside.
>
> **Chat strip:** Pinned at the bottom. A full-width monospace input with placeholder "Ask about this codebase — e.g. 'which files are tightly coupled?'" and focus border cyan. A ghost button "Ask ↗" with cyan border and text. The entire strip uses cyan (`#00d4ff`) as its accent — different from the header's green — to visually separate AI interaction from data exploration.
>
> Wire the URL input and buttons to the `repo` object from `useRepository()`. Tab state is local `useState`. Both buttons disable during `repo.loading`. The Explore button label changes to "Loading…" when loading.

---