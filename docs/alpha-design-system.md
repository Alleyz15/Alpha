# Alpha — Design System & Screen Specifications

**Product:** Alpha — a crypto exchange whose core differentiator is downside protection (put-style contracts) for long-term holders.
**Stack:** React + Vite, Anime.js for motion, plain CSS (custom properties) or Tailwind mapped to the tokens below.
**Status:** This document reflects the approved HTML/CSS/JS prototype (`alpha-signal-theme.html`). Treat it as the source of truth for tokens and behavior — reference the prototype directly for anything ambiguous below.
**Audience:** This doc is written to be handed to an implementation agent (e.g. Codex) with no further verbal context required.

---

## 0. How to use this document

1. Section 1 defines every design token (color, type, spacing, radius, shadow). Implement these first as CSS custom properties or a Tailwind theme extension — do not hardcode hex values anywhere else.
2. Section 2 defines every reusable component and its states.
3. Section 3 defines each screen: layout, content, data shape, and behavior.
4. Section 4 defines interaction/edge-case states that apply across screens.
5. Section 5 is the implementation checklist — work through it top to bottom.

---

## 1. Design Tokens

### 1.1 Color

Alpha's palette is "electric blue corporate-tech": a near-black navy base, cobalt as the primary action color, and a single ice-cyan accent reserved **only** for live/real-time data (prices, active states, glow accents). Never use the ice-cyan accent for static decoration — it should always mean "this is live" or "this is the primary highlighted state."

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#060A14` | Page background (near-black navy) |
| `--bg-elevated` | `#0A1120` | Sidebar rail, inset surfaces (input backgrounds, stat boxes) |
| `--surface` | `#0D1830` | Default card background |
| `--surface-glass` | `rgba(14,24,46,0.6)` | Glass panels (hero float card, stack panel) — pair with `backdrop-filter: blur(20px)` |
| `--surface-glass-strong` | `rgba(17,29,54,0.85)` | Denser glass variant for panels over busy backgrounds |
| `--border` | `rgba(94,235,255,0.10)` | Default hairline border on cards/dividers |
| `--border-strong` | `rgba(94,235,255,0.35)` | Emphasized border (active tabs, focused inputs, glass panel edges) |
| `--primary` | `#2E6FFF` | Primary action color (buttons, links, active nav) |
| `--primary-2` | `#5B8CFF` | Primary gradient endpoint / avatar gradient |
| `--signal` | `#5EEBFF` | Ice-cyan accent — live data, glow effects, active/selected state |
| `--success` | `#29D398` | Gains, "Protected," "Active" status |
| `--danger` | `#FF4D6A` | Losses, "Unprotected" status |
| `--warning` | `#FFB84D` | "Expiring Soon" status, caution states |
| `--text` | `#E8EEFC` | Primary text |
| `--text-muted` | `#8792AD` | Secondary text (descriptions, captions) |
| `--text-faint` | `#4B5670` | Tertiary text (labels, timestamps, disabled text) |

**Gradients:**
- Primary button: `linear-gradient(135deg, var(--primary), #4C7EFF)`
- Signature/glow gradient (logo mark, avatar, progress fills): `linear-gradient(135deg, var(--signal), var(--primary))`
- Ambient background wash (used once, behind the Welcome hero only): radial gradients of `--primary` and `--signal` at low opacity (12–16%) over `--bg`.

**Semantic color rule:** success/danger/warning always pair a colored dot or icon (`●`, `○`, `◐`) with the text — never rely on color alone (accessibility).

### 1.2 Typography

Three typefaces, each with a single job. Do not substitute or add a fourth.

| Token | Family | Used for |
|---|---|---|
| `--font-display` | `'Space Grotesk', sans-serif` | Headings (h1–h3), nav logo wordmark, section titles |
| `--font-body` | `'Inter', sans-serif` | Body copy, labels, buttons, table cells (non-numeric) |
| `--font-mono` | `'JetBrains Mono', monospace` | **All numeric data**: prices, percentages, dates in tables, order IDs, wallet addresses. Always pair with `font-variant-numeric: tabular-nums` so digits don't jitter as values update. |

**Type scale** (desktop):

| Role | Size | Weight | Font |
|---|---|---|---|
| Hero H1 | 64px / 1.04 line-height | 700 | Display |
| Page H1 (dashboard headers) | 26–28px | 700 | Display |
| Section H2 | 17–22px | 700 | Display |
| Card title | 15–16.5px | 600–700 | Display or Body |
| Body / description | 13.5–15px | 400 | Body |
| Label (uppercase, e.g. "PORTFOLIO VALUE") | 11–12.5px, `letter-spacing: 0.06em`, uppercase | 600 | Body |
| Big numeric readout (prices, portfolio value) | 22–44px | 600 | Mono |
| Table numeric cell | 13.5–14px | 400–600 | Mono |
| Caption / timestamp | 11–12px | 400 | Body or Mono |

### 1.3 Spacing & Layout

- Base spacing unit: **4px**. Common gaps used throughout: 8, 12, 14, 16, 20, 24, 26, 36, 48px.
- Card padding: 24–26px standard, 20px for compact stat cards.
- Section gap (vertical rhythm between major blocks): 20px on dashboards, 36px on long-form pages (Protection Details).
- Max content width: **1400px** for dashboard/app pages, **1440px** for marketing (Welcome) sections, **1160px** for the Payment/checkout column, **880px** for the single-column Protection Details tracker (deliberately narrower — see §3.5).
- **`--content-max` token:** a per-page CSS custom property set on `.main-col` (1400px default; overridden to 1160px on the Payment page, 880px on Protection Details) that drives the centering technique below — set it once per page rather than repeating the pixel value in multiple rules.
- **Centering rule (revised):** inside the sidebar app-shell layout (rail + main content), do **not** rely on `flex-grow` + `max-width` + `margin: auto` on the content container itself to center it — this combination did not reliably center in practice, even though it's a theoretically valid technique. The reliable pattern used throughout: let the content container (`.main-col`) span the **full** available width with no `max-width` of its own, then center each direct content block *inside* it individually using flex cross-axis auto-margins (`width: 100%; max-width: var(--content-max); margin-left: auto; margin-right: auto;`). Pages outside the app-shell (Welcome, Coin Detail, which use a plain block-level nav instead of a flex sidebar) don't have this problem — ordinary `margin: 0 auto` on a block element is always reliable and is used there directly.

### 1.4 Radius & Elevation

| Token | Value | Usage |
|---|---|---|
| `--radius` | `16px` | Default card radius |
| Small radius | 8–10px | Buttons, inputs, small badges |
| Pill radius | `999px` | Chips, tabs, status badges, nav pills |
| Circle | `50%` | Avatars, coin icons, dots |

**Shadows / glow:**
- Card elevation: `0 30px 80px rgba(0,0,0,0.5)` for glass/floating panels; flat cards use only a 1px border, no shadow.
- Interactive glow (hover on primary button, active nav, live indicators): `0 0 18–24px` in the relevant accent color at ~50–60% opacity. Glow is reserved for **live/primary/active** elements only — do not add glow to static decorative elements.

---

## 2. Components

### 2.1 Buttons

| Variant | Style | States |
|---|---|---|
| **Primary** (`.btn-primary`) | Gradient fill (`--primary` → `#4C7EFF`), white text, 10px radius | Hover: `translateY(-1px)` + glow shadow `0 4px 26px rgba(46,111,255,0.55)`. Disabled: see §4.4 |
| **Ghost** (`.btn-ghost`) | Transparent fill, `1px solid var(--border-strong)`, `--text` color | Hover: `background: rgba(94,235,255,0.06)` |
| **Row action — primary** (`.row-btn.primary-row-btn`) | Small (12px text, 6–12px padding), solid `--primary` fill, used for table-row CTAs like "Buy Protection" | Same hover treatment as primary, scaled down |
| **Row action — secondary** (`.row-btn`) | Small, bordered, `--text` color, used for "View" | Hover: border brightens to `--border-strong` |
| **Protection pill button** (`.protect-btn`) | Distinct from standard buttons — soft gradient fill (`rgba(46,111,255,0.16)` → `rgba(94,235,255,0.10)`), `--signal` text, shield icon prefix. This is the header-level entry point into the Protection flow and should always be visually distinguishable from ordinary primary buttons. | Hover: glow `0 4px 22px rgba(94,235,255,0.35)` |

**Sizing:** default padding `10px 20px`, large (`btn-lg`) `14px 26px`. Font size 13.5–15px, weight 600.

**Rule: one action button per context.** Table rows that represent a binary state (protected vs. not) must show exactly one button, not both — see §3.3.

### 2.2 Inputs & Controls

- **Search box** (`.search-box`): `--surface` background, `1px solid var(--border)`, 10px radius, magnifier glyph + placeholder in `--text-faint`. Fixed width 320px on desktop; do not let it compress the header to the point of crowding other header elements (see §4.6).
- **Amount input** (`.input-box`, used in Coin Detail trade panel): `--bg-elevated` background, mono font for the numeric value, unit label right-aligned in `--text-faint`.
- **Slider** (leverage / amount slider): 4px track in `--border`, thumb is a 16px `--signal` circle with glow (`box-shadow: 0 0 12px var(--signal)`).
- **Tabs** (`.table-tabs`, `.period-tabs`, `.bs-tabs`): pill-shaped button groups. Inactive: transparent, `--text-faint`. Active: `--surface-glass` background + `--border-strong` border + `--signal` text (for neutral tab groups), OR solid colored fill for binary Buy/Sell tabs (`.buy-active` = green tint, `.sell-active` = red tint).
- **Selector pill** (`.pay-pill`, Payment page only): a larger, two-line variant of a tab — a bordered `--bg-elevated` box showing a primary value (mono, bold) and a small caption underneath (e.g. "90%" / "of current price", or "90 Days" / a computed date). Unselected: `--border` outline. Selected: `--signal` border + `rgba(94,235,255,0.08)` fill + inset glow ring (`box-shadow: 0 0 0 1px var(--signal) inset`), primary value text turns `--signal`. Used for mutually-exclusive configuration choices (coverage %, protection level, contract length) where the user needs to compare a few discrete options side by side, not just switch views like a tab does.
- **Payment method option** (`.pay-method`): a horizontal selectable row — custom radio dot + icon + name + one-line detail (e.g. "$12,480.00 available"). Unselected: `--border` outline, hollow radio dot. Selected: `--signal` border + soft tint fill + filled/glowing radio dot. Exactly one is selected at a time (standard radio-group behavior); clicking any row selects it and deselects the others.

### 2.3 Cards & Panels

- **Standard card** (`.card`): `--surface` background, `1px solid var(--border)`, 16px radius, 24–26px padding. This is the default container for every content block.
- **Glass panel** (`.float-card`, `.stack-panel`): `--surface-glass-strong` background, `backdrop-filter: blur(20px)`, `1px solid var(--border-strong)`, large soft shadow. Used for elements meant to feel "elevated" above the page — hero price card, pinned stack content panel. Use sparingly; if every card is glass, none of them read as elevated.
- **Grow card** (`.grow-card`, dashboard-only): a card that flexes to fill remaining vertical space in a fixed-viewport layout, with an internal `.scroll-panel` (see §2.6) so the page itself never scrolls but the card's content can.

### 2.4 Pills, Badges & Chips ("Bubbles")

These are the small pill/rounded elements used throughout for status and metadata. All share a base shape (999px radius, small padding, small bold text) but differ in semantic color:

| Component | Shape/Color rule | Example |
|---|---|---|
| **Change chip** (`.change-chip`) | Green tint (`rgba(41,211,152,0.12)` bg, `--success` text) for positive, red tint (`rgba(255,77,106,0.12)` bg, `--danger` text) for negative. Always prefixed with `▲`/`▼`. | `▲ +4.82% (24h)` |
| **Protection badge** (`.protection-badge`) | `.protected` = green tint + `●` dot; `.unprotected` = red tint + `○` dot | `● Protected` / `○ Unprotected` |
| **Status badge** (`.status-badge`) | `.active-s` = green + `●`; `.soon-s` = amber (`--warning`) + `◐` | `● Active` / `◐ Expiring Soon` |
| **Trend chip** (`.trend-chip`, Trending Now strip) | Neutral `--surface` card, rank number in mono `--text-faint`, change value colored per sign | `#1 SOL +12.4%` |
| **Eyebrow / live indicator** (`.eyebrow`) | Glass pill with a small pulsing `--success` dot, mono uppercase text | `● LIVE · 214,902 signals processed today` |

**Rule:** every badge pairs a glyph (`●`/`○`/`◐`/`▲`/`▼`) with color — never color alone.

### 2.5 Tables

- Header row: uppercase, 11.5px, `--text-faint`, `letter-spacing: 0.05em`, no background.
- Body rows: `1px solid var(--border)` top border (not full grid lines), 14px vertical padding, subtle hover tint (`rgba(94,235,255,0.02)` background).
- Numeric columns always use `.mono` with `tabular-nums`.
- Asset/name columns use the **coin cell** pattern: a colored circular initial badge (`.coin-dot`, background = 13% opacity of the asset's brand color, text = full-opacity brand color) + name (bold) + symbol (small, `--text-faint`) stacked underneath.
- Sparkline columns: inline SVG mini line chart, 90×30px, colored green/red per that row's trend direction.
- Action column: right-aligned, contains 0–2 row-scoped buttons (see §2.1 rule on one-button-per-binary-state).

### 2.6 Scroll containers (fit-to-viewport pattern)

Home, Portfolio, and Payment are all built to fit exactly one viewport with no page-level scroll (see §3.2, §3.3, §3.6). The pattern:

```css
.main-col.dash-fit {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-width: none;   /* let the container span full width... */
  margin: 0;
}
.main-col.dash-fit > * {
  width: 100%;
  max-width: var(--content-max, 1400px);  /* ...then center each child individually */
  margin-left: auto;
  margin-right: auto;
}
```
- Fixed-height rows (headers, stat rows, non-tabular cards) get `flex-shrink: 0`.
- The one row/section meant to consume remaining space gets `flex: 1; min-height: 0;`.
- Inside that row, any table/list that might overflow gets wrapped in a `.scroll-panel` (`flex: 1; min-height: 0; overflow-y: auto;`) — so if content doesn't fit, **that specific panel** scrolls internally, never the page. This is a deliberate safety net for short viewports, not the default expectation.
- **Payment's variant:** unlike Home/Portfolio (where only one specific row/table is the flexible, potentially-scrolling piece), Payment's configuration column has enough content that the *entire* two-column grid below the fixed header is treated as the flexible/scrollable region (`.pay-grid { flex: 1; min-height: 0; overflow-y: auto; }`). In practice, on a normal desktop viewport this shouldn't need to actually scroll — the content was sized to fit — but the safety net is wired up the same way as everywhere else.

### 2.7 Navigation

- **Sidebar rail** (`.rail`, 76px wide, `--bg-elevated`): vertical icon stack, logo mark at top, settings icon pinned to bottom via `margin-top: auto`. Active item gets `--signal`-tinted background + inset border glow.
- **Topbar** (`.topbar`): search box left, action cluster right (protection button, avatar). Keep this cluster lean — do not duplicate data shown immediately below it (e.g., don't show portfolio value in both the topbar and the card directly beneath it). **Not every screen needs a topbar** — Payment omits it entirely (no search, no avatar) since it's a focused, single-purpose checkout flow rather than a browsing screen; don't add chrome back in just for consistency's sake if a screen has no use for it.
- **Marketing nav** (`.site-nav`, Welcome/Coin Detail): logo left, nav links center, auth actions right.
- **Sticky summary card** (`.pay-summary-card`, Payment only): `position: sticky; top: 0;` within its scrolling column, so the order summary and payment method stay visible while the left configuration column is taller. Use this pattern anywhere a summary/CTA panel sits alongside a longer configuration form.

---

## 3. Screens

### 3.1 Welcome (marketing landing)

**Purpose:** Convert visitors; explain the product; is the only screen that scrolls freely (long-form marketing page).

**Sections, top to bottom:**
1. **Nav** — logo, links (Markets/Trade/Learn/Company), Log in / Get Started.
2. **Hero** — two-column: left = eyebrow live-indicator + H1 ("Trade at the speed of **signal.**", with the last word in the signal-gradient text treatment) + subhead + primary/ghost CTA pair + trust stats row (animated count-up). Right = glass float card showing a live coin price with animated ticker and mini sparkline. Background: the "Signal Grid" — an animated SVG of faint connected nodes with light pulses traveling along a subset of the lines. This is the page's signature visual motif; do not reuse it elsewhere (keep it exclusive to the hero so it stays distinctive).
3. **Feature row** — 3 cards (icon + title + description), hover lifts card 4px.
4. **Intro/mission statement** — centered large statement text + a "pill rotator" (auto-cycling one-line claims every ~2.6s, e.g. "Alpha is → Non-custodial by design").
5. **Pinned services stack** ("The stack Alpha runs on") — a **scrollytelling** section: `position: sticky` pins the content for the duration of a tall (600vh) scroll region; scroll progress drives (a) a glowing vertical line growing behind a numbered list of 6 services (Spot, Margin, Staking, API, Custody, Analytics), and (b) the active service's detail swapping in a glass panel on the right (each with a small custom visual — ticker, gauge, donut, code snippet, pulsing shield, bar chart). See §4.7 for the resilience requirements this section has — they are not optional polish, they were bugs in production.
6. **Comparison section** ("Without protection, vs. with Alpha") — two-column aligned row comparison, left column muted with ✕ icons, right column highlighted with ✓ icons, each row fades up on scroll into view.
7. **Footer** — brand blurb + newsletter capture + 4 link columns + social row + copyright bar.

### 3.2 Home (dashboard)

**Purpose:** Daily-use landing screen after login. Market awareness + a clear path into Protection. **Not** a trading terminal — no order book, no depth chart here.

**Layout:** `app-shell` (rail + `main-col.dash-fit`). Fits one viewport (§2.6).

**Content, top to bottom:**
1. **Topbar** — search box, "🛡 Protection Overview" pill button (navigates to Portfolio), avatar. Do not add a personalised greeting such as "Good Morning, Demo User" anywhere on the Home page.
2. **Portfolio Value** (fixed card) — the current displayed value of the user's simulated holdings using live USDC prices from the backend. Label the simulated-holdings basis clearly. Include a "View full portfolio →" link, but no seven-day change or performance claim.
3. **Trending Now** (fixed height) — a horizontal strip ranking only Alpha's four supported assets by their real 24-hour movement. State this four-asset scope in the section copy; do not present it as a market-wide ranking. The strip scrolls horizontally if it overflows.
4. **Top Cryptocurrencies** (fills remaining height, internal scroll if needed) — a full-width market table containing coin, price, 24h change, market cap, and 7-day sparkline.

### 3.3 Portfolio ("My Crypto")

**Purpose:** The user's actual holdings and their protection status. This is where "Protection Overview" leads.

**Layout:** `app-shell` (rail + `main-col.dash-fit`). Fits one viewport.

**Content, top to bottom:**
1. **Topbar** — search box (holdings-scoped placeholder), avatar. No page-level "Buy Protection" button — protection is purchased per-asset from the table (see below).
2. **Header** — "My Crypto" title + one-line subtitle. No button here.
3. **Stat row (2 fixed cards):**
   - Portfolio Value (mono; no 7-day performance claim)
   - Active Protections (count + "Next expiry in N days" caption)
4. **Protection Overview** (fills remaining height, internal scroll):
   - Table: Asset (coin cell) · Holdings · Current Price · Protection (badge) · Expiry · Action.
   - **Action column rule (strict):** exactly one button per row.
     - If `protected === true`: show **"View"** only → navigates to Protection Details.
     - If `protected === false`: show **"Buy Protection"** only → begins the purchase flow (not yet designed; stub as a disabled/placeholder action or a modal trigger, per whatever the next spec covers).
     - Never show both buttons on the same row.

There is intentionally no second table on this page. An earlier version had a separate "Active Protection" table duplicating this same data — it was removed because it was redundant with the Protection column above.

### 3.4 Coin Detail

**Purpose:** Market data and trade execution for a single asset. This is the one screen that *is* allowed to look like a trading interface, since buying/selling the underlying asset is a distinct action from buying protection on it.

**Layout:** `site-nav` (marketing-style nav, reused because this can be reached pre- and post-login) + centered `main-col` (1400px max, `margin: 0 auto`).

**Content:**
1. **Header row** — back link ("← Markets"), coin identity (icon, name, symbol, rank, market cap), and a right-aligned live price block (large mono price + 24h change chip).
2. **Two-column body:**
   - **Left (wider):** timeframe tabs (1H/1D/1W/1M/1Y) → candlestick chart (SVG, bars animate in on load) → a 4-up stat grid (Market Cap, 24h Volume, Circulating Supply, All-Time High) → an "About [Coin]" card with a short description.
   - **Right (narrower):** trade panel — Buy/Sell tab toggle, amount input (USD) with a slider, computed "you receive" read-only field, fee/network summary rows, a full-width primary CTA ("Review Buy Order"), and below it a compact order book (5 bid rows in green, 5 ask rows in red, each with a proportional depth bar).

### 3.5 Protection Details

**Purpose:** Track one specific protection contract in real time. Reached from Portfolio's "View" action.

**Layout:** `app-shell` (rail + `main-col.pd-container`, deliberately narrower at **880px, centered**) — a single stacked column, not a 2-column dense layout. This is intentional: per product requirement, this page must read as a calm order/insurance tracker, not a speculative trading screen. Do not widen it to match the other app pages.

**Content, top to bottom:**
1. **Back link** → Portfolio.
2. **Header** — contract name ("BTC Protection") + status badge, then a meta line: Order ID · Expiry date · days-left (highlighted in `--signal`).
3. **Summary row (2 cards):** Premium Paid and Time Left. Each card is a number + one-line caption in plain language.
4. **Contract Overview** — two-column definition list: Asset, Contract Type, Quantity Covered, Entry Price, Strike Price, Purchase Date, Expiry Date, Status.
5. **Live Tracking** — a calm price-line chart: the current price path plus a **dashed horizontal strike-price reference line** with a label, and a soft gradient fill in the zone between the price line and the strike line (the "protected zone"). No candlesticks, no order book here — that visual language belongs to Coin Detail, not this page. Below the chart: a 2-up stat row containing Market Price and the Protection Status pill.
6. **Order Details** — two-column definition list: Buyer Name, Order ID, Account/Wallet (truncated), Order Created (date+time), Settlement Type, Payment Method.
7. **Contract Timeline** — a horizontal progress bar with three milestones (Purchased → Active → Expiry), filled proportionally to elapsed time; each milestone shows its date.
8. **Coverage Summary** — a single highlighted card (shield icon + heading "What this means for you") containing one plain-language paragraph explaining the protection in human terms. No jargon, no formulas.
9. **Actions** — "View History" (ghost) and "Buy More Protection" (primary). Do not add a manual Claim / Settle button: settlement is automatic at expiry and the interface must not suggest that the user needs to trigger it.

### 3.6 Payment (Buy Protection)

**Purpose:** Configure and purchase a protection contract for one specific, currently-unprotected asset. Reached by clicking **"Buy Protection"** on any unprotected row in Portfolio's Protection Overview table (§3.3) — the asset is pre-selected on arrival, not chosen on this screen.

**Layout:** `app-shell` (rail + `main-col.pay-container`, **1160px content column, centered** — see §1.3/§2.6 centering pattern). No topbar (§2.7) — this is a focused checkout flow, not a browsing screen, so search and avatar are omitted entirely. Fits one viewport (§2.6); the back link and header stay fixed, the configuration + summary grid below is the flexible region.

This screen is deliberately built as a **checkout**, not a trade ticket: two columns, configure-then-pay, same plain-language and shield-icon visual language as Protection Details — not the Coin Detail trade panel's language (no order book, no "market/limit" terminology).

**Content, top to bottom:**

1. **Back link** → Portfolio.
2. **Header** — coin identity (icon + "Buy Protection for [Asset Name]" + symbol/holdings line) on the left; current market price (mono, large) on the right.
3. **Two-column grid** (1.5fr configuration / 1fr sticky summary — stacks to one column under 960px):

   **Left — Configuration (three cards + one info card):**
   - **Coverage Amount** — a label showing the resulting quantity (mono, live-updating), a range slider (10–100%), and four quick-preset buttons (25/50/75/100%). Selecting a preset moves the slider and updates the resulting quantity; dragging the slider deselects any preset.
   - **Protection Level** — four selector pills (100/95/90/85% of current price), each showing the percentage and "of current price" — the *actual* resulting strike-price dollar amount is shown in the summary, not on the pill itself. Default selection: **90%**.
   - **Contract Length** — four selector pills (30/60/90/180 days), each showing the day count and the actual resulting expiry date (computed live from today's date). Default selection: **90 Days**.
   - **How this works** — the same coverage-summary card pattern as Protection Details §3.5.8: shield icon + one plain-language paragraph, dynamically naming the selected asset, no formulas.

   **Right — Order Summary & Payment (sticky):**
   - Order Summary rows: Asset, Coverage Amount, Protection Level (as a dollar strike price), Expires (as a date), Premium, Processing Fee, then a visually distinct **Total Due** row (larger, `--signal` colored). Every row recalculates live as any configuration control changes — there is no separate "calculate" step.
   - Payment Method — three selectable payment-method options (§2.2): USDC Wallet Balance (shows available balance, selected by default), Credit/Debit Card (shows masked card number), Bank Transfer (shows settlement time).
   - **"Confirm & Pay"** primary button, full width, showing the live total (or a static "Confirm & Pay" label with the total already visible in the summary above it — either is acceptable, keep it consistent with whichever the final visual pass settles on).
   - A small secured-checkout reassurance line (lock icon + "Secured checkout · Cancel anytime before expiry").
   - A quiet "Cancel and go back" text link → Portfolio.

**Pricing logic (implementation note, not a UI element):** the premium shown is computed from a rate lookup based on the selected protection level and contract length (deeper protection + longer duration = higher rate), multiplied by the coverage value, plus a flat processing fee. This calculation happens client-side for the live summary preview; **the authoritative price at time of purchase must be confirmed server-side** before the transaction is finalized — never trust the client-computed number as the actual charged amount. As with Protection Details, the *mechanics* of this calculation are never surfaced in the UI — the user sees only the resulting dollar figures.

**On confirm:** submit the configured order for processing. On success, route to Protection Details (§3.5) for the newly created contract, so the user lands on the same tracker screen they'd see for any other active protection. On failure (payment declined, price moved outside an acceptable slippage band, etc.), keep the user on this screen with an inline error — do not silently fail or navigate away on failure.

---

## 4. Interaction States

### 4.1 Hover
- Buttons: see §2.1 per-variant hover treatment.
- Cards that are clickable (table rows leading somewhere, contract names): cursor `pointer`, and either a color shift (e.g., row text becomes `--signal`) or a background tint — never rely on cursor alone.
- Nav/rail items: background tint + icon color shift to `--signal`.

### 4.2 Active / Selected
- Tabs, nav pills: solid or tinted fill per §2.2.
- Sidebar rail active item: persistent tinted background (not just on click, but reflecting current screen).

### 4.3 Focus (keyboard)
- All interactive elements need a visible focus ring — recommend `outline: 2px solid var(--signal); outline-offset: 2px;` since no focus styling exists yet in the prototype. This is a gap to fill during implementation, not a token to invent freely — use the signal color for consistency with the "live/active" meaning it carries elsewhere.

### 4.4 Disabled
- Reduce opacity to `.45`, set `cursor: not-allowed`, `pointer-events: none`.
- **Always pair a disabled action with a one-line reason nearby** (see Protection Details Claim/Settle button) rather than leaving the user to guess why something is inactive.

### 4.5 Loading
- Not present in the static prototype — implement per data source:
  - Numeric counters (prices, portfolio value): show the last-known value immediately (never a blank or "0"), then animate to the fresh value on update. Never show a loading spinner over a number that already has a cached value.
  - Tables: skeleton rows (same row height, shimmer or muted placeholder blocks) only on true first load; on refetch, keep old rows visible until new data resolves.

### 4.6 Empty states
- Not present in the static prototype (all data is seeded) — implement:
  - Portfolio with zero holdings: replace the table with a centered message + primary CTA ("Buy your first crypto" or similar), not an empty table shell.

### 4.7 Resilience (non-negotiable — this was a real production bug)

The prototype originally depended on Anime.js from a CDN with no fallback. When that CDN was unreachable, one failed animation call threw an uncaught error that silently halted **the rest of the page's JavaScript**, leaving entire sections permanently blank (empty glass panels, invisible comparison rows) because several elements were built "hidden by default, shown by JS." This must not be reproduced in the React implementation. Concretely:

1. **Bundle the animation library** — do not load Anime.js (or any other animation dependency) from a CDN at runtime; install it as a normal package dependency.
2. **Default state = correct and visible.** Any element with a numeric value (prices, percentages, counts) must render its correct final value in initial markup/state — never `0` or blank as a placeholder while waiting for an animation to "reveal" it. Animations should animate *from* a state to the *already-correct* final state being the fallback, not the other way around.
3. **Wrap every animation call so a failure can't cascade.** One broken chart or counter must never prevent unrelated components elsewhere on the page from rendering. In practice: don't let a content-setting operation live inside an animation's completion callback — set content synchronously, then layer the animation on top as pure enhancement.
4. **Scroll-driven effects (the pinned stack section) need a static fallback.** If the scroll-progress calculation ever fails to initialize, the section should still show its first step's content by default, not an empty panel.

---

## 5. Implementation Checklist (for Codex)

### Setup
- [ ] Scaffold Vite + React project; install `animejs` as a dependency (not a CDN script tag).
- [ ] Add Google Fonts (Space Grotesk, Inter, JetBrains Mono) via `@fontsource` packages or a self-hosted approach — do not depend on the Google Fonts CDN being reachable at runtime for the page to be usable; treat font-loading failure as a "falls back to system font" case, not a blocker.
- [ ] Define all tokens from §1 as CSS custom properties on `:root` (or a Tailwind theme extension) in one file. No component should hardcode a hex value.
- [ ] Set up client-side routing for the 6 screens (React Router or equivalent): `/`, `/home`, `/portfolio`, `/coin/:symbol`, `/protection/:orderId`, `/payment/:symbol`.

### Components (build in this order, each as an independent, reusable component)
- [ ] Button (primary / ghost / row variants, disabled state) — §2.1
- [ ] Badge/Pill/Chip family (ChangeChip, ProtectionBadge, StatusBadge, TrendChip) — §2.4
- [ ] Card (base, glass variant, grow-card variant) — §2.3
- [ ] Table (with CoinCell sub-component, sparkline cell, action cell enforcing the one-button rule) — §2.5
- [ ] Sidebar rail + Topbar — §2.7
- [ ] Tabs (generic pill-tab component reused for period tabs, table tabs, buy/sell tabs)
- [ ] Selector pill (two-line value + caption, radio-group behavior — Payment's coverage/strike/expiry pickers) — §2.2
- [ ] Payment method option (radio row: icon + name + detail) — §2.2
- [ ] Sparkline / mini-chart (SVG line, animated draw-in per §4.7 resilience rules)
- [ ] Candlestick chart (Coin Detail only)
- [ ] Protection tracking chart (price line + dashed strike reference + protected-zone fill — Protection Details only; do **not** reuse the candlestick component here, see §3.5)

### Screens
- [ ] Welcome — hero, Signal Grid background animation, feature row, intro + pill rotator, pinned scrollytelling stack section (§3.1.5 — build the scroll-progress logic as a reusable hook, e.g. `useScrollProgress(sectionRef)`), comparison section, footer
- [ ] Home — dash-fit layout (§2.6), current Portfolio Value card without a seven-day change, four-asset Trending Now strip, and a full-width Top Cryptocurrencies table; no personalised greeting sentence
- [ ] Portfolio — dash-fit layout, 2 stat cards, single Protection Overview table with strict one-button-per-row logic
- [ ] Coin Detail — header, chart + stats + about, trade panel + order book
- [ ] Protection Details — narrow centered layout (§3.5), all approved content sections, automatic-settlement wording, and no manual Claim/Settle action
- [ ] Payment — dash-fit layout with no topbar (§3.6), live-recalculating order summary, radio-group payment method, confirm → creates a `ProtectionContract` and routes to Protection Details on success

### Data layer
- [ ] Define a `Coin` type: `{ symbol, name, price, change24h, marketCap, color, holdings, isProtected, sparkline: number[] }`
- [ ] Define a `ProtectionContract` type: `{ orderId, asset, contractType, quantityCovered, entryPrice, strikePrice, purchaseDate, expiryDate, status, premiumPaid, buyerName, wallet, settlementType, paymentMethod }`
- [ ] `isProtected` on a `Coin` should be derived from whether an associated `ProtectionContract` exists — not a separately-maintained flag — to avoid the two ever disagreeing.
- [ ] Define a premium-rate lookup (protection level × contract length → rate) for the Payment screen's live summary preview, and treat it as **client-side estimate only** — the real charge must be confirmed by the backend at submit time (§3.6).
- [ ] The asset a user is buying protection for is passed into Payment via route param / navigation state from wherever "Buy Protection" was clicked — Payment does not let the user pick a different asset once inside the flow.

### QA pass (do this before calling any screen done)
- [ ] Every numeric element shows a correct value with no animation library loaded (temporarily stub out Anime.js to verify) — per §4.7.
- [ ] Home, Portfolio, and Payment never scroll the outer page on a standard 1440×900 viewport; only their internal `.scroll-panel` elements scroll if content overflows.
- [ ] Every table action column shows exactly one button per row where the spec calls for mutually exclusive states (Portfolio's Protection column).
- [ ] Keyboard tab order reaches every interactive element with a visible focus ring (§4.3).
- [ ] Run the page at 1280px, 1440px, and 1920px widths — confirm content stays centered (§1.3/§2.6 centering pattern) rather than drifting to one side. This applies to Payment as much as Home/Portfolio.
- [ ] On Payment, changing any control (slider, preset, protection level, contract length) updates every affected row in the Order Summary — there should be no stale value left over from a previous selection.
