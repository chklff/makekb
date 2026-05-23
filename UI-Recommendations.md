# Make Scenarios KB — UI Recommendations

**Document type:** UI/UX design notes
**Companion to:** see `/docs/archive/AI-Architecture.md` for the original architecture rationale this was written alongside
**Status:** v1.0 — still authoritative on UX principles; color palette overridden by `DECISIONS.md` (Make brand)

---

## Scope

Three mockups covering the core user flows. Skipping generic dashboards — they look impressive but no one uses them after week 1.

The three primary jobs to design for:

1. **Ask a question** — *"do we have something like X?"* (chat-driven, ~80% of usage)
2. **Browse the library** — explore what exists, filter by team/app/category (discovery)
3. **Reuse a scenario** — take an existing one and adapt it (the conversion moment, where value materializes)

---

## Mockup 1 — Chat surface (primary)

This is where 80% of usage lives. A user types a question, gets an answer grounded in their own scenarios, with clickable citations.

**Most important UI principle:** every answer must show what it's based on. No black-box magic. If the system says *"you have a HubSpot→Facebook CAPI scenario"*, the user clicks the citation and lands on that exact scenario in Make.

### Layout

- Top bar: KB name, indexed scenario count, "Browse" and "History" buttons
- Conversation thread: user message → assistant message with inline citations `[1]` `[2]` `[3]` → source cards → suggested follow-ups
- Input pinned to the bottom

### Component breakdown

**User message**

- 26px avatar circle with initials
- "You" label above the message
- 14px body text, line-height 1.6

**Assistant message**

- Sparkle icon avatar in info color
- "KB Assistant" label
- Body text with inline citation pills `[1]` `[2]` — info-colored for primary match, secondary-colored for related results
- Pills are clickable and scroll to / highlight the corresponding source card

**Source citation cards** (the most important component)

- One card per cited scenario
- Card contents:
  - Citation number badge (matches inline pill)
  - Scenario name (14px, weight 500)
  - **Match score as visible percentage** — `98% match` (green pill for ≥90, amber for 70-89, red below)
  - One-line summary (13px, secondary text)
  - Metadata chips: team, category, complexity, apps
  - Two actions only: **Open in Make** (verify) and **Reuse** (act)

**Suggested follow-ups**

- "Ask next" label
- 2-4 pill buttons with context-aware suggestions
- These teach users the system's capabilities organically — most people don't know they can ask *"swap Facebook for TikTok"* until they see it offered

**Input**

- Pinned to bottom of conversation
- 36px height, with send arrow button
- Plain text input, no rich formatting needed in v1

### Key UX decisions

| Decision | Reasoning |
| --- | --- |
| Match scores as visible % numbers | Users develop intuition for when to trust the answer. No hand-waving "best match" |
| Inline citations like Wikipedia | Citations are content, not footnotes — they belong in the flow of the answer |
| Two actions per card, not six | Resist the temptation to add Favorite, Share, Comment, etc. in v1 |
| Suggested follow-ups always present | Onboarding-through-doing instead of help docs |
| No sidebar with chat history in v1 | History lives behind the "History" button in the top bar — keep the main surface clean |

### Color & visual treatment

- Primary container: tertiary background, large radius
- User/assistant messages: no card wrapper, flat conversation flow
- Source cards: white surface, 0.5px tertiary border, large radius
- Match score pills: green/amber/red ramps based on score
- Citation pills: info background for #1, secondary for related results

---

## Mockup 2 — Browse / library view

Used heavily by team leads and architects auditing what exists. Sometimes you don't have a question, you want to explore.

**Critical principle:** filters must be facets backed by real data, not freeform text — apps, teams, categories, triggers, complexity, all extracted by the LLM and stored as JSONB.

The cluster view (pattern library, §11 of the architecture) is what makes this beat raw Make.com — three near-duplicate scenarios collapse into one pattern card.

### Layout

- Header: title, sync status, secondary actions (Ask, Re-sync)
- Search bar + view toggle (Patterns / All)
- Filter chips row
- Stats row (4 metric tiles)
- Pattern cards section
- Unclustered scenarios footer note

### Component breakdown

**Header**

- "Browse scenarios" title (18px, weight 500)
- Subtitle: `487 scenarios · 64 patterns · last sync 8 min ago`
- Right side: "Ask" button (deep link to chat), "Re-sync" button

**Search & view toggle**

- Full-width search input
- Segmented control: **Patterns** (default) | All
- Patterns view groups similar scenarios; All shows every individual scenario as its own row

**Filter chips**

- "Filter:" label
- Dropdowns: Team, App, Trigger type, Complexity
- Active filter rendered as info-colored pill with X to remove
- Filters AND together; multi-select within a dropdown ORs

**Stats tiles** (2×2 or 4-across)

- Scenarios count
- Patterns count
- Apps used
- Teams
- All show the current filtered view's numbers, not global

**Pattern cards** (the main content)

- Leading icon representing the pattern (e.g. arrows-right-left for sync, forms for form intake, bell for alerts)
- Pattern name (15px, weight 500)
- Member count pill: `5 scenarios`
- Pattern description (13px, secondary)
- Implementation breakdown chips: `hubspotcrm × 2`, `pipedrive × 1`, `salesforce × 2`
- "Open" button → drills into the pattern's member scenarios

**Unclustered footer**

- Info-colored notice strip
- `6 scenarios in this category don't fit any pattern yet — unique implementations`
- Link to view all individually
- Honest about what the system doesn't know how to organize

### Key UX decisions

| Decision | Reasoning |
| --- | --- |
| Patterns view is default, not All | The pattern library is what makes the KB better than Make.com itself, not just a copy of it |
| Implementation breakdown on pattern cards | `hubspotcrm × 2, pipedrive × 1` instantly tells the user the breadth of a pattern |
| Show unclustered count, don't hide it | Honesty about gaps builds trust; users click through to understand what's unique |
| Real-data facet dropdowns, not freeform tags | Tags entered freeform always become a mess; JSONB-backed facets stay clean |
| Stats reflect filtered view, not global | A "Scenarios" count that doesn't change when filters apply is misleading |

---

## Mockup 3 — Scenario detail + reuse panel

The moment of value capture. User found something, now they want to either understand it or adapt it.

**Two-column layout:**

- **Left (60%):** the LLM's understanding — the thing that cost $0.03 to produce and is the entire product
- **Right (40%):** action panel — open the original, fork it with modifications, see metadata at a glance

The reuse flow is shown as an inline side panel rather than a modal because users need to keep reading the original while phrasing their modification request.

### Layout

- Breadcrumb: Browse → Category → Pattern → Scenario
- Title row: scenario name + metadata (team, folder, owner, last analyzed)
- One-line summary as prominent callout strip
- Two-column grid

### Left column — Understanding

**Business purpose card**

- Small uppercase label
- 13px body text, line-height 1.6
- This is the LLM's 2-3 sentence framing of what business problem the scenario solves

**Data flow card**

- Numbered step list (1, 2, 3...) with grey circles
- Branch steps marked with a purple git-branch icon instead of a number
- Error handlers inline: `— on error: Resume` in tertiary text
- This replaces a Make-style canvas diagram because:
  - Canvas diagrams are great for editing, terrible for skimming
  - Steps are skimmable in 5 seconds
  - Branches are still visually distinct without needing visual flowchart space

**Reuse notes card** (warning color, important!)

- Warning background, warning border, warning text
- Bulleted list of things that must change to reuse:
  - HubSpot connection (currently ID 86137)
  - Facebook connection (currently ID 35871)
  - Pixel ID
  - Phone normalization assumptions
- This is the single field that turns "look at this scenario" into "actually use this scenario"

### Right column — Actions & metadata

**Primary actions** (white card)

- **Open in Make** — primary, dark button
- **Adapt this scenario** — secondary, scrolls/focuses the Adapt panel
- **Download blueprint JSON** — tertiary

**Adapt with AI panel** (info-colored, inline not modal)

- Sparkle icon + "Adapt with AI" label
- Short instructional text
- Textarea: *"e.g. swap HubSpot for Pipedrive, keep everything else the same"*
- "Generate variant" button → produces a new blueprint user reviews before importing

**At a glance card**

- Compact key-value pairs:
  - Trigger: Polling · Deal Updated
  - Apps: hubspotcrm · facebook-capi
  - Complexity: Medium
  - Modules: 7
  - Error handlers: 3 Resume
  - Pattern: CRM → Ad Conv. (clickable link)

**Same pattern card**

- List of sibling scenarios in the same pattern cluster
- Each row: name + similarity score
- One-click navigation to compare implementations

### Key UX decisions

| Decision | Reasoning |
| --- | --- |
| Numbered steps, not canvas | Skimmable in 5 seconds; editing belongs in Make |
| Reuse notes as warning-colored block | This is the single most actionable field; deserves visual prominence |
| Adapt panel inline, not modal | Users need to read the original while phrasing the modification |
| Same-pattern sidebar | Sideways navigation between siblings is the 3rd most-used action |
| Metadata "at a glance" instead of a tab | Builders want to see error-handler count and pattern membership immediately, not click to find it |

---

## Three design principles that run through all three mockups

### 1. Citations are content, not chrome

Every claim the system makes shows what it's based on, with a clickable path back to the source. This is what separates this tool from a black-box AI feature.

- Chat surface: inline citation pills + source cards
- Browse surface: pattern member counts with drill-down
- Detail surface: explicit attribution to LLM analysis (`Analyzed 8 min ago`) so users know the description is generated

### 2. Two actions per surface, not seven

**Open in Make. Reuse/Adapt. That's it.** Resist Settings panels, History sidebars, Favorites stars, Comments, Reactions in v1 — they only matter if the core flow works.

If you can't do the primary job in two clicks from any surface, the surface is broken.

### 3. The LLM's analysis is the product, not the chrome

The one-line summary, business purpose, data flow, reuse notes — these are the things that cost real money to generate. Surface them prominently and beautifully. The blueprint JSON itself is back-of-house — downloadable, viewable in a raw inspector, but never the primary content.

---

## What was deliberately NOT designed

| Surface | Why not |
| --- | --- |
| Dashboard with charts and KPI tiles | Nobody uses these after week 1. The 4 metric tiles in Browse cover the same need without becoming a separate destination |
| Scenario editor | Editing belongs in Make. This tool is for discovery and adaptation, full stop |
| Admin panel | Re-sync runs on cron. Failures alert via Slack/email. Power users hit Supabase directly. Building admin UI is months of work for ~5 users |
| Favorites / starred scenarios | Premature personalization. Add only if users explicitly ask for it |
| Comments / annotations | Out of scope for v1 — Make has its own scenario notes |
| Mobile app | Web responsive is enough; KB usage is desktop-heavy by nature |

---

## Implementation notes for the design team

### Design system

- **Flat, clean surfaces.** No gradients, no drop shadows except focus rings.
- **0.5px borders** throughout — gives the "native to claude.ai" feel.
- **Border radius:** `--border-radius-md` (8px) for inputs/buttons, `--border-radius-lg` (12px) for cards.
- **Two font weights only:** 400 regular, 500 medium. Never 600+.
- **Sentence case** everywhere. No Title Case, no ALL CAPS.
- **Icons:** Tabler outline only. 14-20px inline, 24px decorative max.

### Color usage

- **Info (blue):** primary actions, citations, "Adapt with AI" panel
- **Warning (amber):** reuse notes, things-to-change blocks
- **Success (green):** high match scores (≥90%)
- **Secondary background:** neutral chips, metric tiles, non-emphasized surfaces
- Avoid red/danger except for true error states (analysis failed, scenario removed)

### Responsive behavior

- All surfaces collapse cleanly to a single column under ~720px
- Two-column detail view becomes stacked: understanding on top, actions below
- Filter chips wrap; metric tiles go from 4-across to 2×2

### Accessibility

- Every citation pill, every chip is keyboard-focusable
- Source cards are landmarks — screen reader users can navigate between them
- Match score percentages also exposed as `aria-label` for context (`"98 percent match"`)
- Dark mode works on all surfaces (all colors use CSS variables, no hardcoded hex)

---

## Surfaces to add in v1.5

Order by user feedback, not by checklist. Likely candidates:

1. **Slack bot** — same chat experience but in Slack, since that's where these conversations naturally happen
2. **"Generated variant ready for review" screen** — what comes after clicking Generate variant in the Adapt panel. Side-by-side diff, warnings list, import button.
3. **Pattern detail page** — drilling into a pattern shows all members in a comparison grid (what's the same, what differs)
4. **Single-scenario timeline** — when did this scenario change, what re-analysis happened, blueprint diff between versions

---

*End of UI recommendations. v1.0.*
