# Alpha Frontend Implementation Record

This document records the approved plan and the actual result for each frontend implementation phase.

## Design authority

- `docs/alpha-design-system.md` is the visual source of truth for every frontend screen and component.
- Real backend behavior and data remain the source of truth for product capabilities and wording.
- Sample content in the design system must not be presented as a real feature when the backend does not support it.

## Documentation rules

- A phase is documented only after its plan has been reviewed and approved.
- Each documented phase must contain both its approved implementation plan and its actual result.
- The result must identify changed files, verification performed, and any deviation from the approved plan.
- A phase is marked complete only after its required checks pass.
- Future phase details are not added before separate approval.

## Phase 1 — Design foundation

**Status:** Complete

### Approved implementation plan

Phase 1 establishes the shared visual foundation from `docs/alpha-design-system.md`. It does not create or redesign screens, add routes, change API behavior, fix feature-level UI bugs, or modify the backend.

1. Replace the remote Google Fonts dependency with local frontend packages for:
   - Space Grotesk for headings and display text.
   - Inter for interface and body text.
   - JetBrains Mono for figures, prices, addresses, and other technical values.
2. Centralize the approved design tokens:
   - Brand, background, surface, border, status, and text colors.
   - Typography families and type-related defaults.
   - Spacing, radius, shadow, motion, layering, and content-width values.
3. Add global browser foundations:
   - Dark application canvas and readable text defaults.
   - Consistent box sizing and form-control inheritance.
   - Accessible keyboard focus treatment.
   - Reduced-motion support.
   - Tabular numeric styling for financial values.
4. Add a small set of reusable layout and accessibility utilities for later screens.
5. Preserve the current frontend during the phased rebuild by moving its existing stylesheet into a temporary legacy layer and providing compatibility aliases for its old variables.
6. Keep `frontend/src/index.css` as the ordered stylesheet entry point.

### Planned files

New files:

- `frontend/src/styles/fonts.css`
- `frontend/src/styles/tokens.css`
- `frontend/src/styles/base.css`
- `frontend/src/styles/utilities.css`
- `frontend/src/styles/legacy.css`

Updated files:

- `frontend/src/index.css`
- `frontend/package.json`
- `frontend/package-lock.json`

### Completion requirements

- Design-system tokens are centralized and use the approved values.
- All three font families are served locally by the frontend bundle.
- The stylesheet layers load in a clear and stable order.
- Existing screens remain usable while they wait for later redesign phases.
- No backend, API, environment, routing, or screen behavior changes are introduced.
- The production frontend build passes.

### Implementation result

Completed on 2026-09-01.

- Added local `@fontsource` packages for Space Grotesk, Inter, and JetBrains Mono. The production bundle now contains local WOFF and WOFF2 assets and has no Google Fonts runtime reference.
- Added the approved Alpha color, typography, spacing, radius, elevation, glow, content-width, and interaction tokens in one central file.
- Added global dark-canvas defaults, inherited form typography, visible keyboard focus, text selection styling, responsive media defaults, and reduced-motion behavior.
- Added reusable numeric typography, screen-reader-only, centered-content, scrolling-panel, stack, and cluster utilities.
- Converted `frontend/src/index.css` into the ordered stylesheet entry point.
- Relocated the existing page styles to `frontend/src/styles/legacy.css`. The legacy layer keeps the current screens usable until they are replaced in later approved phases, while new work can use the design-system tokens directly.
- Replaced the legacy Google Fonts and font-family references with the locally bundled design-system families.
- Kept the backend, API client, adapters, environment files, routes, screens, and application behavior unchanged.

Files added:

- `frontend/src/styles/fonts.css`
- `frontend/src/styles/tokens.css`
- `frontend/src/styles/base.css`
- `frontend/src/styles/utilities.css`
- `frontend/src/styles/legacy.css`

Files updated:

- `frontend/src/index.css`
- `frontend/package.json`
- `frontend/package-lock.json`
- `docs/FRONTEND_IMPLEMENTATION.md`

### Verification performed

- Baseline production build before implementation: passed on 2026-09-01.
- Dependency installation and audit: passed; npm reported zero vulnerabilities.
- Post-implementation production build: passed with 89 modules transformed.
- Local-font bundle check: passed; production output contains all three font families.
- Remote-font reference check: passed; no Google Fonts URL remains in frontend source.
- Development-server smoke test: passed; Vite returned HTTP 200 with the React root element, and the temporary test process was stopped afterward.
- Git whitespace check: passed.
- Scope check: passed; no backend file changed.

### Deviations from plan

None.

## Phase 2 — Reusable UI components and data correctness

**Status:** Complete

### Approved implementation plan

Phase 2 creates reusable UI building blocks based on `docs/alpha-design-system.md` and fixes the two known frontend interpretation bugs before complete screens are assembled.

1. Correct position display logic:
   - Protection positions use `protectionFloorUsdc` and protection wording.
   - Upside positions use `upsideThresholdUsdc` and upside-exposure wording.
   - Missing money values render a neutral placeholder instead of `$0.00`.
2. Support `paymentStatus: "none"` with truthful wording that explains the simulated balance was not charged.
3. Add reusable design-system components for:
   - Buttons and cards.
   - Semantic status and reality badges.
   - Labelled form fields and segmented controls.
   - Monospaced financial or technical values.
   - Alerts and loading, empty, or error states.
4. Ensure components use centralized tokens, visible keyboard focus, semantic HTML, text-plus-symbol status communication, and reduced-motion behavior.
5. Add a compatible frontend component-testing setup and cover component interaction, accessibility contracts, defensive formatting, position-role handling, and payment-status handling.
6. Keep complete page construction, routing changes, backend changes, and unsupported product capabilities outside this phase.

### Planned files

New files are expected under:

- `frontend/src/components/ui/`
- `frontend/src/styles/components.css`
- `frontend/src/test/`

Updated files are expected to include:

- `frontend/src/adapters/quoteViewModel.js`
- `frontend/src/index.css`
- `frontend/package.json`
- `frontend/package-lock.json`

### Completion requirements

- Null or missing currency values cannot render as `$0.00`.
- Protection and upside positions expose different, truthful metric labels and values.
- `paymentStatus: "none"` is recognized and does not display an unavailable status.
- Reusable components follow the approved visual tokens and accessibility requirements.
- Automated component and adapter tests pass.
- The production build and development-server smoke test pass.
- No backend, API contract, environment, routing, or complete-page construction or redesign is introduced.

### Implementation result

Completed on 2026-09-01.

- Made USDC formatting defensive: null, empty, non-numeric, and infinite values now render as `—`, while a genuine numeric zero still renders as `$0.00 USDC`.
- Added `paymentStatus: "none"` with the label `Not charged to demo balance`.
- Preserved explicit unknown future payment statuses as unknown instead of inferring that an on-chain position was paid.
- Added role-aware position view data for downside protection, upside exposure, and unknown legacy shapes.
- Updated the existing dashboard’s position copy and metric binding so upside positions show `Upside threshold` and are never described as protected. This was a targeted bug fix, not a page redesign.
- Added reusable Button, Card, StatusBadge, RealityBadge, FormField, SegmentedControl, MonoValue, Alert, and AsyncState components.
- Added token-driven component styling with primary, ghost, and row buttons; standard, glass, inset, and interactive cards; semantic badges and alerts; accessible fields and native radio controls; and reusable async states.
- Extended the central token file with semantic tints and component-level text/disabled tokens. Component CSS contains no hardcoded color values.
- Added Vitest, jsdom, and React Testing Library with adapter, dashboard regression, interaction, semantic, and accessibility-oriented tests.
- Kept backend code, API contracts, environment files, routing, and complete-page construction unchanged.

Files added:

- `frontend/src/adapters/quoteViewModel.test.js`
- `frontend/src/components/ui/Alert.jsx`
- `frontend/src/components/ui/AsyncState.jsx`
- `frontend/src/components/ui/Button.jsx`
- `frontend/src/components/ui/Button.test.jsx`
- `frontend/src/components/ui/Card.jsx`
- `frontend/src/components/ui/DisplayComponents.test.jsx`
- `frontend/src/components/ui/FormControls.test.jsx`
- `frontend/src/components/ui/FormField.jsx`
- `frontend/src/components/ui/MonoValue.jsx`
- `frontend/src/components/ui/RealityBadge.jsx`
- `frontend/src/components/ui/SegmentedControl.jsx`
- `frontend/src/components/ui/StatusBadge.jsx`
- `frontend/src/components/ui/index.js`
- `frontend/src/screens/DashboardScreen.test.jsx`
- `frontend/src/styles/components.css`
- `frontend/src/test/setup.js`

Files updated:

- `frontend/src/adapters/quoteViewModel.js`
- `frontend/src/screens/DashboardScreen.jsx`
- `frontend/src/styles/tokens.css`
- `frontend/src/index.css`
- `frontend/vite.config.js`
- `frontend/package.json`
- `frontend/package-lock.json`
- `docs/FRONTEND_IMPLEMENTATION.md`

### Verification performed

- Automated tests: passed; 5 test files and 28 tests passed.
- Dashboard regression test: passed; an upside position shows its threshold, uses upside wording, recognizes no demo-balance charge, and contains no protection-floor or protected wording.
- Production frontend build: passed with 89 modules transformed.
- Development-server smoke test: passed; Vite returned HTTP 200 with the React root element, and the temporary test process was stopped afterward.
- Dependency audit: passed; npm reported zero vulnerabilities.
- Component color check: passed; `components.css` contains no hardcoded hex or RGBA color values.
- Remote-font reference check: passed; no Google Fonts URL exists in frontend source.
- Git whitespace check: passed.
- Scope check: passed; no backend or environment file changed and no future phase heading was added.

### Deviations from plan

No scope deviations. During setup, npm identified a critical advisory in the initially evaluated Vitest 3.2.4 release. It was replaced with the compatible patched Vitest 3.2.6 release before completion; the final audit reports zero vulnerabilities.

## Phase 3 — Asset-specific protection checkout

**Status:** Complete

### Approved implementation plan

Phase 3 builds the focused protection checkout flow only. It does not build Coin Detail, redesign Portfolio, add a sidebar, add a general Buy Protection navigation item, or decide the application's future navigation shell.

1. Add an asset-specific entry route:
   - `/protect/:symbol` accepts ETH, BTC, BNB, or SOL from a future Coin Detail “Buy Protection” action.
   - The selected asset is displayed read-only throughout the flow and cannot be changed inside checkout.
   - An unsupported route symbol shows a clear error without calling the backend.
2. Build the three-step flow `Configure → Review → Status`:
   - Configure collects the amount, protection target, and target date.
   - Review presents the selected backend-issued tier and its expiry countdown before confirmation.
   - Status truthfully reports whether the request is waiting for operator execution, active on-chain, or failed.
3. Use backend data as the only product-data authority:
   - Poll `GET /api/market-context` approximately every 30 seconds before a quote exists.
   - Display the selected asset's live price, simulated recorded holding, current protection availability, maximum available duration, update time, and any `unavailableReason` supplied by the backend.
   - Send configuration to `POST /api/quote` and render only the returned tiers, floors, protected amounts, premiums, expiry, recommendation, and disclosures.
   - Send only the returned `quoteId` and selected `tierId` to `POST /api/purchase`.
   - Do not calculate premiums, strikes, availability, balances, or purchase outcomes in the frontend.
4. Preserve the quote snapshot correctly:
   - Before quoting, the displayed market price may refresh from market context.
   - After quoting, stop replacing it with the changing market price and label the returned quote spot as “Price when quoted.”
   - Changing the amount, protection target, or date invalidates the quote and selected tier, then resumes live market refresh.
5. Make expiry and failure states explicit:
   - Cap the date input using the backend's current `longestProtectionDays`; treat zero as “today only.”
   - Disable quoting when the backend says protection is unavailable and show its reason.
   - Expired quotes cannot be submitted and require a fresh quote.
   - Prevent duplicate confirmation while a purchase request is in progress.
6. Follow `docs/alpha-design-system.md`:
   - Use the approved 1160px centered checkout width, dark surfaces, cyan signal color, three font roles, plain-language shield visual language, token-driven components, visible keyboard focus, responsive stacking, and reduced-motion support.
   - Keep this flow visually calm and checkout-oriented; do not use trading-ticket language, order books, or unsupported payment-method choices.
   - Omit all sidebar, topbar, search, avatar, and global navigation UI during this phase.
7. Add automated coverage for supported and unsupported routes, live-context loading and refresh, quote locking and invalidation, tier selection, expiry, review, purchase submission, and status truthfulness.

### Planned files

New files are expected under:

- `frontend/src/features/protection/`
- `frontend/src/styles/protection-flow.css`

Updated files are expected to include:

- `frontend/src/App.jsx`
- `frontend/src/api/client.js`
- `frontend/src/adapters/quoteViewModel.js`
- `frontend/src/index.css`
- `docs/FRONTEND_IMPLEMENTATION.md`

### Completion requirements

- Direct routes for ETH, BTC, BNB, and SOL load a read-only selected asset from real backend market context.
- No Phase 3 price, holding, tier, premium, expiry, transaction, or status value comes from frontend sample data.
- Market price refreshes before quoting, then the quote's spot price remains fixed and clearly labelled.
- Editing quote inputs invalidates stale choices and resumes market refresh.
- Configure, Review, and Status handle loading, unavailable, error, expired, operator-pending, and on-chain outcomes truthfully.
- The flow follows the approved design system and contains no sidebar or general Buy Protection navigation item.
- Automated tests, production build, dependency audit, development smoke test, and Git checks pass.

### Implementation result

Completed on 2026-09-02.

- Added the focused `/protect/:symbol` checkout route for ETH, BTC, BNB, and SOL. The route symbol is normalized, validated before any request, and rendered as a read-only asset; unsupported assets stop with a clear message and make no backend call.
- Kept the existing application screens available outside `/protect/:symbol`. Phase 3 adds no sidebar, topbar, search, avatar, general Buy Protection link, Coin Detail screen, or navigation-shell decision.
- Added a real API client surface for `GET /api/market-context`. The protection flow always receives the live client directly rather than the optional legacy mock client.
- Changed mock mode from implicit-by-default to explicit opt-in: only `VITE_USE_MOCK_API=true` enables the legacy sample client. The approved Phase 3 route does not use that client even when it is enabled.
- Added a market-context hook that loads the backend response, keeps a last-known successful value visible during refetch, reports initial and refresh failures separately, and polls every 30 seconds only while Configure has no quote.
- Added defensive market asset formatting for nullable live prices, simulated recorded holdings, dynamic availability, today-only or multi-day tenor wording, and backend update timestamps.
- Built Configure with a read-only asset, live price, backend holding, amount, protection target, target date, dynamic date cap, backend `unavailableReason`, backend-only tier choices, recommendation, partial-coverage disclosure, quote countdown, and a sticky order summary.
- Refined Configure after visual review: widened and centered this step to 1380px, placed the progress indicator beside the compact header on wide screens, arranged the four configuration controls in one responsive row, increased control and copy sizes, and added more deliberate gaps between components.
- Polished the configuration row after a second visual review: the read-only Asset now follows the same label-and-control structure as the editable fields, redundant visible “Required” labels were removed while native required validation was preserved, helper copy was shortened, and Configure plus Order Summary typography was increased for easier scanning.
- Moved Available Choices into the same card as Configure Protection. Its heading and truthful no-data instruction remain visible before quoting; after a real quote, the instruction is replaced by wide comparison rows for choice, floor, protected amount, premium, and end date. No estimated or sample choice is rendered.
- After `POST /api/quote` succeeds, the header and summary switch from “Current live price” to the quote response's fixed “Price when quoted,” and market polling stops. Editing amount, protection target, or date clears the quote and tier, explains why, and resumes live refresh.
- Built Review with the fixed quote price, expiry countdown, selected backend tier, maximum-loss and partial-coverage disclosures, plain-language settlement explanation, and explicit live/simulated/operator boundaries.
- Confirmation sends only `{ quoteId, tierId }`, prevents duplicate submission while loading, and keeps API failures on Review.
- Built Status for operator-pending, on-chain, and failed outcomes. Pending requests are never called active, payment status uses the backend value, and a BaseScan action appears only when the backend reports an on-chain fill and supplies an explorer URL.
- Applied the approved 1160px centered checkout width, dark token-driven surfaces, cyan signal treatment, Space Grotesk/Inter/JetBrains Mono roles, shield language, visible focus, reduced-motion compatibility, responsive stacking, and desktop internal scrolling. The Phase 3 stylesheet contains no hardcoded color values.
- Added explicit test cleanup so each React test is isolated.

Files added:

- `frontend/src/features/protection/ConfigureProtectionStep.jsx`
- `frontend/src/features/protection/ProtectionFlowPage.jsx`
- `frontend/src/features/protection/ProtectionFlowPage.test.jsx`
- `frontend/src/features/protection/ProtectionProgress.jsx`
- `frontend/src/features/protection/ProtectionStatusStep.jsx`
- `frontend/src/features/protection/ReviewProtectionStep.jsx`
- `frontend/src/features/protection/protectionFlowUtils.js`
- `frontend/src/features/protection/protectionFlowUtils.test.js`
- `frontend/src/features/protection/useMarketContext.js`
- `frontend/src/features/protection/useQuoteCountdown.js`
- `frontend/src/styles/protection-flow.css`

Files updated:

- `frontend/src/App.jsx`
- `frontend/src/api/client.js`
- `frontend/src/adapters/quoteViewModel.js`
- `frontend/src/index.css`
- `frontend/src/test/setup.js`
- `docs/FRONTEND_IMPLEMENTATION.md`

### Verification performed

- Backend prerequisite verification: passed before implementation; 90 backend tests passed and the read-only live market check returned ETH, BTC, SOL, and BNB with their connected database holdings.
- Automated frontend tests: passed; 7 test files and 38 tests passed.
- Phase 3 behavior coverage: passed for supported and unsupported assets, zero backend calls for unsupported routes, read-only route asset, live context rendering, always-discoverable Available Choices without sample data, backend unavailability reason, dynamic date bounds, quote-price locking, polling pause and resume, input invalidation, identifier-only purchase submission, operator-pending wording, missing BaseScan behavior, and expired-quote blocking.
- Production frontend build: passed with 107 modules transformed.
- Dependency audit: passed; npm reported zero vulnerabilities.
- Live integration smoke check: passed; the temporary backend and frontend started successfully, `/protect/BTC` returned HTTP 200 with the React root, and `GET /api/market-context` returned all four expected symbols, live-price reality, simulated-balance reality, and non-null current prices for all four assets at check time. Both temporary processes were stopped afterward.
- Configure visual render check: passed at 1440×900 after both refinements; the 1380px checkout is centered, all four controls share a consistent top alignment and height, helper copy remains readable without crowding, Available Choices is visible inside Configure before quoting, and Order Summary remains aligned in the right column.
- Styling check: passed; `protection-flow.css` contains no hardcoded hex, RGB, or RGBA color values and uses the Phase 1 tokens.
- Scope-content check: passed; the Phase 3 feature contains no sample/mock data references, sidebar, topbar, or hardcoded 30/60/90/180-day protection choices.
- Git whitespace check: passed.
- Backend scope check: passed; no backend, database, environment, or migration file was modified.

### Deviations from plan

- No product-scope deviation. Because the future navigation structure is intentionally undecided, the route is recognized directly in `App.jsx` without adding a routing dependency. A later approved navigation phase can place it inside the final router without changing the protection feature's data or screen boundaries.
- The user-approved Configure refinement supersedes the original 1160px checkout width for this step only and uses 1380px to support the horizontal controls and comparison rows. Review and Status retain their previously approved widths and layouts.
- The active Portfolio action is intentionally not connected from Status yet. Status explains that Portfolio navigation will be connected after the navigation plan is approved, matching the approved Phase 3 boundary.
