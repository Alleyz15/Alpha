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

## Phase 4 — Welcome page

**Status:** Complete

### Approved implementation plan

Phase 4 replaces the root route with Alpha's public Welcome page. It introduces the product in plain language, shows the current four-asset market context honestly, explains the protection journey and the prototype's reality boundaries, and uses Anime.js as progressive visual enhancement. It does not build Coin Detail, add coin buy or sell execution, add global application navigation, or invent market values.

1. Build the centered public landing structure from `docs/alpha-design-system.md`:
   - A compact Alpha brand header with in-page links for How it works, Live market, and Product reality.
   - A hero explaining the product through the approved message: “Crypto moves. Your plans should not have to.”
   - Clear calls to the live market section and the product journey.
   - Factual product markers for four supported assets, Base execution, and USDC settlement.
2. Add a live hero market snapshot:
   - Read only `GET /api/market-context` through the live API client.
   - Let the user switch between BTC, ETH, BNB, and SOL.
   - Display the backend price, simulated holding, current protection availability, backend update time, and `unavailableReason` when supplied.
   - Poll about every 30 seconds while the page is visible, retain the last successful snapshot on a refresh failure, and never substitute sample prices or availability.
3. Explain the product with approved plain-language sections:
   - Choose the outcome, compare live choices, and verify the result.
   - State that protection should feel like a plan rather than a trading terminal.
   - Present the complete six-step journey from reading the live market through tracking the resulting position.
   - Show all four supported assets in the live market section even when one is unavailable.
4. Add the protection comparison and timing clarification:
   - Compare an unprotected holding with a holding that has a backend-issued end-date floor.
   - Explain USDC settlement and frontend-visible maximum-loss information without presenting a fake example quote.
   - Keep the approved note visible that protection is evaluated at the end date, not whenever the displayed price crosses the floor.
5. Make the prototype boundary prominent:
   - Separate live and verifiable behavior, simulated demo holdings, and operator-executed purchase behavior into distinct cards.
   - State that Alpha simulates the user holding, not the live protection market.
   - Never call a request on-chain before the backend returns transaction evidence.
6. Use Anime.js 4.5.0 creatively but safely:
   - Scope all page motion to the Welcome root and clean it up when the page unmounts.
   - Add a staged hero entrance, animated SVG signal paths, traveling signal pulses, staggered section reveals, a rotating Alpha identity statement, and live-value refresh accents.
   - Use the six-step desktop journey as a scroll-led explanation while rendering a direct static list on compact screens.
   - Keep all content visible before animation, isolate animation errors from product behavior, respect `prefers-reduced-motion`, and avoid using motion to imply a financial result.
7. Add responsive and accessibility behavior:
   - Use semantic headings, sections, lists, tabs, status messages, and keyboard-focus treatment.
   - Collapse multi-column content cleanly for compact screens.
   - Keep the mobile journey static and fully readable without scroll choreography.
8. Add automated coverage for live market rendering, asset switching, backend unavailability reasons, initial API failure, and last-successful-snapshot retention.

### Planned content

- Header: `ALPHA`, `Downside protection`, `How it works`, `Live market`, `Product reality`, and `See live availability`.
- Hero: `LIVE DOWNSIDE PROTECTION`, `Crypto moves. Your plans should not have to.`, the approved product explanation, `See live availability`, and `How Alpha works`.
- Benefits: `Protection without the trading-language barrier`, with `Choose the outcome`, `Compare live choices`, and `Verify the result`.
- Mission: `Protection should feel like a plan, not a trading terminal.` with rotating statements for plain-language protection, live-market behavior, Base verification, and simulation honesty.
- Journey: `From a downside target to a verifiable result`, followed by six steps: read the live market, describe the protection, compare available choices, review before continuing, request operator execution, and track the position.
- Live market: `Availability changes. Alpha shows it honestly.` and four backend-connected asset cards for Bitcoin, Ethereum, BNB, and Solana.
- Comparison: `The same crypto. A clearer downside plan.` with factual with-protection and without-protection explanations and the end-date evaluation note.
- Product reality: `Clear about what is real`, separated into live and verifiable, simulated for the demo, and operator executed.
- Final action: `Know your floor before the market tests it` and `View live market`.
- Footer disclosure: market availability is live, displayed holdings are simulated, and on-chain activity appears only when verified by the backend.

### Completion requirements

- `/` renders the approved Alpha Welcome page and `/protect/:symbol` continues to render Phase 3 unchanged.
- Every displayed price, holding, update time, availability value, and unavailability reason comes from the live backend market-context response.
- Initial loading, initial error, missing asset information, unavailable protection, and refresh failure states contain no substituted market data.
- All four supported assets remain visible and are labelled accurately.
- Reality disclosures clearly distinguish live market information, simulated user holdings, and operator execution.
- Anime.js animations are scoped, cleaned up, reduced-motion safe, non-blocking, and do not control financial truth.
- The page follows the approved design tokens and works at desktop and compact widths.
- Automated tests, production build, live integration, styling checks, visual review, and Git checks pass.

### Implementation result

Completed on 2026-09-02.

- Replaced the `/` legacy entry screen with the approved Welcome page while preserving `/protect/:symbol` and keeping the legacy application accessible at unmatched paths during the phased migration.
- Built the complete header, hero, benefit, mission, journey, live-market, comparison, product-reality, final-action, and footer content defined in the approved plan.
- Connected the page directly to `liveApi.getMarketContext()`. The page normalizes the response into the existing defensive market view model, preserves the documented asset order, polls every 30 seconds only while the document is visible, immediately refreshes after visibility returns, and retains the last successful values if a background update fails.
- Added explicit no-fake-data states: initial failure says no sample values were substituted, missing live prices render `—`, malformed or missing assets say market information is unavailable, and unavailable assets retain the exact backend reason.
- Added a tabbed hero snapshot and four live market cards. Both use the same backend response; the repetition lets the hero introduce one asset while the full market section keeps all four assets visible.
- Added the complete six-step protection journey. Desktop uses a sticky narrative stage with scroll checkpoints and progressive rail state; compact screens receive a direct static six-card list instead of a fragile scroll effect.
- Added an original Signal Grid SVG that communicates a defined floor without plotting invented price history. Its paths and signal nodes are decorative and are hidden from assistive technology.
- Used Anime.js 4.5.0 for a staged hero timeline, SVG path drawing, SVG motion-path signals, ambient signal pulsing, staggered benefit/market/reality entrances, rotating mission wording, and live-value refresh accents.
- Wrapped the page animation setup in `createScope`, scoped selectors to the page root, registered reduced-motion and compact-screen media queries, used `scope.revert()` for cleanup, and kept every animated element visibly rendered before Anime.js starts. Individual motion failures are caught and cannot interrupt data loading or interaction.
- Applied the approved dark navy foundation, glass surfaces, cyan signal accent, blue action gradient, three font roles, tokenized spacing, restrained borders and glow, large centered marketing width, responsive columns, visible focus, and reduced-motion styling. The Welcome stylesheet contains no hardcoded color values.
- Kept the page truthful about the prototype: live market and backend-issued protection choices, simulated displayed holdings with no user deposit flow, operator-controlled execution, and BaseScan evidence only after the backend returns it.
- Added five Welcome page tests covering approved content plus live values, asset tab switching, backend unavailability reasons, initial no-fallback failure, and last-successful-snapshot retention after a refresh failure.

Files added:

- `frontend/src/features/welcome/SignalGrid.jsx`
- `frontend/src/features/welcome/WelcomeJourney.jsx`
- `frontend/src/features/welcome/WelcomePage.jsx`
- `frontend/src/features/welcome/WelcomePage.test.jsx`
- `frontend/src/features/welcome/useWelcomeAnimations.js`
- `frontend/src/features/welcome/useWelcomeMarket.js`
- `frontend/src/features/welcome/welcomeContent.js`
- `frontend/src/styles/welcome.css`

Files updated:

- `frontend/src/App.jsx`
- `frontend/src/index.css`
- `docs/FRONTEND_IMPLEMENTATION.md`

### Verification performed

- Official Anime.js documentation review: completed for React scope setup, `scope.revert()` cleanup, timelines, staggering, SVG drawable paths, SVG motion paths, scroll observers, and media-query-aware scopes.
- Installed animation version check: passed; the lockfile contains Anime.js 4.5.0 and no dependency installation or version change was required.
- Automated frontend tests: passed; 8 test files and 43 tests passed.
- Dependency audit: passed; npm reported zero vulnerabilities.
- Welcome behavior coverage: passed for live market values, asset-tab switching, simulated holdings, backend unavailability reasons, initial API failure with no sample substitution, and last-successful-snapshot retention after a refresh failure.
- Production frontend build: passed with 113 modules transformed.
- Live integration check: passed; the active frontend returned HTTP 200 and `GET /api/market-context` returned HTTP 200 with ETH, BTC, SOL, and BNB, live-price reality, simulated-balance reality, and non-null prices at verification time.
- Desktop visual review: passed at 1440×1000; the hero, signal visual, live card, hierarchy, spacing, and call-to-action balance remain centered and readable.
- Full-page visual review: passed; all approved sections appear in the intended order and the desktop journey keeps its stage visible while the user advances through the steps.
- Compact visual review: passed at the reliable 500px headless-browser width; copy wraps cleanly, calls to action become full width, facts remain scannable, the market card fits the viewport, and compact journey behavior is static.
- Styling check: passed; `welcome.css` contains no hardcoded hex, RGB, or RGBA color values.

### Deviations from plan

- The approved page content and product scope were implemented without deviation.
- No new Anime.js dependency was installed because the frontend already contained Anime.js and its lockfile resolved to the current 4.5.0 release requested for this phase.

## Phase 6 — Portfolio and Protection Details

**Status:** Complete

### Approved implementation plan

Phase 6 builds the real-data Portfolio and Protection Details experience. It consumes the backend portfolio, position-list, position-detail, and candle endpoints without adding sample holdings, estimated payouts, or client-generated contract facts. The final navigation shell remains outside this phase; both pages use centered standalone layouts without a sidebar.

1. Build `/portfolio` as the user's holdings and protection overview:
   - Load `GET /api/portfolio` and `GET /api/positions` together.
   - Show Portfolio Value with an explicit simulated-holdings label and never add a seven-day performance claim.
   - Respect `totalValueComplete`; when it is false, identify `unpricedAssets` and label the displayed value as partial.
   - Keep active and pending protection counts separate and show the backend's next confirmed expiry.
   - Show the six protectable crypto assets returned as holdings while retaining USDC in the backend total only.
   - Render one Protection Overview table with Asset, Holdings, Current Price, Protection, Expiry, and Action.
   - Treat only downside positions with `status: active` and `verifiedOnChain: true` as protected. Calls are upside positions and never count as protection.
   - Enforce exactly one action per row: View for an active or pending downside position, or Buy Protection when no current downside position exists.
   - Add holdings-scoped search plus honest loading, error, empty, no-match, and missing-price states.
2. Build `/protection/:positionId` as the calm single-contract tracker:
   - Load `GET /api/positions/:positionId`; return an ownership-safe not-found message for a 404.
   - Show the contract identity, status, order reference, expiry, Premium/Payment, and Time Left without a current-market-price summary card or estimated-payout card.
   - Add Contract Overview with Asset, Contract Type, Quantity Covered, Entry Price, Strike Price, Purchase Date, Expiry Date, and Status.
   - Add a separate live tracking request using the real 1W candle endpoint. Draw a price line, dashed strike reference, and protected-zone fill; show an explicit unavailable state if no real chart data exists.
   - Keep only Market Price and Protection Status beneath the chart. Do not add Current PnL, Net Result, or Estimated Payout.
   - Add Order Details with Buyer Name, Order ID, Account/Wallet, Order Created, Settlement Type, and Payment Method. State that the wallet is operator-controlled and never imply user self-custody.
   - Show BaseScan only when `verifiedOnChain` is true and an explorer URL is supplied.
   - Render the sanitized backend event timeline, a three-point contract progress display, plain-language “What this means for you” copy, View History, and Buy More Protection.
   - Do not add a manual Claim / Settle action because the backend reports automatic settlement at expiry.
3. Add compatibility for the backend's quote-size evidence:
   - Carry `size.confirmed` and `size.unconfirmedReason` through the quote view model.
   - Display operator-capacity or unreadable-capacity warnings on Configure and Review.
   - Keep the computed size visible while clearly stating that it was not confirmed; never present the number as chain-confirmed.
4. Add responsive, accessibility, and resilience behavior:
   - Follow the Alpha design tokens, centered app-page width, narrow 880px tracker width, visible focus, monospaced financial values, readable mobile stacking, and table-local overflow.
   - Keep contract content usable when the separate chart request fails.
   - Add automated tests for protection truth, one-action table behavior, no-payment display, null formatting, removed metrics, chart success/failure, and unconfirmed quote-size disclosure.

### Planned files

New files:

- `frontend/src/features/portfolio/PortfolioPage.jsx`
- `frontend/src/features/portfolio/ProtectionDetailsPage.jsx`
- `frontend/src/features/portfolio/ProtectionTrackingChart.jsx`
- `frontend/src/features/portfolio/portfolioViewModel.js`
- `frontend/src/features/portfolio/PortfolioPages.test.jsx`
- `frontend/src/features/portfolio/portfolioViewModel.test.js`
- `frontend/src/styles/portfolio.css`

Updated files:

- `frontend/src/App.jsx`
- `frontend/src/api/client.js`
- `frontend/src/adapters/quoteViewModel.js`
- `frontend/src/adapters/quoteViewModel.test.js`
- `frontend/src/features/protection/ConfigureProtectionStep.jsx`
- `frontend/src/features/protection/ReviewProtectionStep.jsx`
- `frontend/src/styles/protection-flow.css`
- `frontend/src/index.css`
- `docs/alpha-design-system.md`
- `docs/FRONTEND_IMPLEMENTATION.md`

### Completion requirements

- Portfolio and Protection Details routes render from real backend responses with no sample financial data.
- Unverified positions are never labelled protected, calls are never treated as downside protection, and BaseScan is gated by `verifiedOnChain`.
- Incomplete totals, null entry prices, no-payment operator purchases, missing wallet information, and missing chart feeds have explicit honest states.
- The requested Contract Overview, Live Tracking, Order Details, Timeline, explanation, and actions are present; removed payout/PnL/current-price-summary/manual-settlement elements are absent.
- All frontend tests and the production build pass.

### Implementation result

Completed on 2026-09-03.

- Added `/portfolio` and `/protection/:positionId` to the application router and extended the live client with `getPortfolio()` and `getPositionDetail()`.
- Built the centered Portfolio page with holdings search, two summary cards, incomplete-total disclosure, simulated-holding disclosure, and a single internally scrollable Protection Overview table.
- Added deterministic position-to-holding matching that prefers confirmed active downside protection, then a pending downside request. Upside calls, settled positions, expired positions, and failed positions do not make an asset appear protected.
- Included USDC in the backend's portfolio total but intentionally excluded it from the protection-action table.
- Enforced exactly one row action. Active or pending downside records open their detail page; unprotected crypto holdings open the asset-specific protection checkout.
- Built the narrow Protection Details tracker with the revised two-card summary, complete Contract Overview, live line chart, strike reference, protected-zone fill, two tracking stats, complete Order Details, operator-custody disclosure, sanitized event history, progress milestones, plain-language contract meaning, and approved actions.
- Kept market tracking independent from contract loading. If a real candle feed is unavailable, the chart reports that no path was invented while every stored contract and order section remains usable.
- Added truthful payment presentation for paid, held, refunded, and operator-no-payment positions. Missing entry price, order ID, wallet, market price, or date values render as an em dash or an explicit not-confirmed state rather than zero.
- Added unconfirmed quote-size handling to Configure and Review. The frontend now distinguishes a backend-computed amount from an amount checked against current operator capacity and explains both supported failure reasons.
- Updated the design-system action rule to reflect automatic settlement at expiry and remove the stale manual Claim / Settle control.
- Installed the dependencies already declared by the frontend after the checkout was found to be missing router and chart packages; no package version or lockfile change was required and npm reported zero vulnerabilities.

Files added:

- `frontend/src/features/portfolio/PortfolioPage.jsx`
- `frontend/src/features/portfolio/ProtectionDetailsPage.jsx`
- `frontend/src/features/portfolio/ProtectionTrackingChart.jsx`
- `frontend/src/features/portfolio/portfolioViewModel.js`
- `frontend/src/features/portfolio/PortfolioPages.test.jsx`
- `frontend/src/features/portfolio/portfolioViewModel.test.js`
- `frontend/src/styles/portfolio.css`

Files updated:

- `frontend/src/App.jsx`
- `frontend/src/api/client.js`
- `frontend/src/adapters/quoteViewModel.js`
- `frontend/src/adapters/quoteViewModel.test.js`
- `frontend/src/features/protection/ConfigureProtectionStep.jsx`
- `frontend/src/features/protection/ReviewProtectionStep.jsx`
- `frontend/src/styles/protection-flow.css`
- `frontend/src/index.css`
- `docs/alpha-design-system.md`
- `docs/FRONTEND_IMPLEMENTATION.md`

### Verification performed

- Frontend dependency installation and audit: passed; six missing declared packages were restored and npm reported zero vulnerabilities.
- Automated frontend tests: passed; 13 test files and 73 tests passed.
- Phase 6 behavior coverage: passed for USDC exclusion from protectable rows, call exclusion, unverified-position wording, one action per holding, route navigation, no-payment display, null entry/order handling, all required detail sections, removed payout/PnL/manual-settlement controls, live chart rendering, and chart-failure resilience.
- Quote evidence coverage: passed; an unconfirmed operator-capacity result remains unconfirmed in the view model and supplies the approved explanation.
- Production frontend build: passed with 138 modules transformed.
- Dependency audit: passed; npm reported zero vulnerabilities.

### Deviations from plan

- The approved product scope was implemented without deviation.
- The final sidebar/global navigation remains intentionally absent because its design has not yet been provided. The pages use local back and route actions so Phase 6 can function independently.
- AVAX and XRP detail charts depend on backend candle availability. Phase 6 implements the correct unavailable state and does not substitute chart data; the page will begin rendering those charts automatically when the same endpoint supports them.

## Phase 7 — Home dashboard

**Status:** Complete

### Approved implementation plan

Phase 7 replaces the legacy `/dashboard` position list with Alpha's daily-use Home page and adds `/home` as an equivalent direct route. The page follows `docs/alpha-design-system.md`, uses only live backend responses, and keeps the previously removed AI brief, watchlist, market movers, protection-coverage summary, estimated payout, and seven-day portfolio performance out of the interface.

1. Build the fixed-viewport Home shell:
   - Add the approved 76px navigation rail, centered 1400px content area, compact topbar, market search, Protection Overview action, and backend-derived avatar initials.
   - Do not add a general Buy Protection navigation link or personalised greeting.
   - Keep the desktop page within one viewport; allow only the trend strip and market table to scroll internally when necessary.
2. Build the Portfolio Value card:
   - Read `GET /api/portfolio` and show the current backend total in USDC.
   - Label displayed holdings as simulated and include a View Full Portfolio action.
   - Respect `totalValueComplete`; identify unpriced assets and call the number partial instead of presenting an incomplete sum as a complete value.
   - Do not show a seven-day portfolio change, estimated payout, protection coverage percentage, or another portfolio snapshot card.
3. Build Trending Now:
   - Read real `priceChange24hPct` values from `GET /api/assets/overview`.
   - Rank Alpha's four supported market assets by absolute 24-hour movement and state that limited scope directly.
   - Keep unavailable movements unavailable rather than treating them as zero.
   - Link each asset to its existing Coin Detail route.
4. Build Top Cryptocurrencies:
   - Show the four real overview assets with coin identity, aggregated USD price, 24-hour change, and market capitalization.
   - Request `GET /api/assets/:symbol/candles?range=1W` and derive each small seven-day line only from returned Binance USDT closes.
   - Label the USD/USDT source distinction and show an explicit per-asset unavailable state if a candle request fails.
   - Filter the table locally from the topbar search without changing backend data.
5. Add resilient live refresh behavior:
   - Refresh portfolio and overview data about every 45 seconds while the page is visible.
   - Preserve the last successful data on a refresh failure and show a warning.
   - Keep Portfolio and Market failure boundaries separate so one provider cannot blank the other section.
   - Use skeletons only for a true initial load and never render a temporary zero.
6. Add Anime.js as progressive enhancement:
   - Use the already bundled Anime.js dependency with a root-scoped timeline and cleanup.
   - Add a staged dashboard entrance, a rotating live-data orbit, pulsing verification nodes, live indicators, and a restrained row refresh accent.
   - Keep all financial values and content synchronously visible, catch animation failures, and respect reduced-motion preferences.
7. Add responsive and automated verification:
   - Preserve the approved colors, typography, spacing, table rules, badges, visible focus, and numeric formatting.
   - Collapse the rail and stacked layout on compact screens while keeping horizontal market data accessible.
   - Test real-data rendering, source labels, ranking, search, partial totals, provider isolation, missing candles, routing, removed content, and route integration.

### Planned files

New files:

- `frontend/src/features/home/HomePage.jsx`
- `frontend/src/features/home/HomePage.test.jsx`
- `frontend/src/features/home/MarketSparkline.jsx`
- `frontend/src/features/home/homeViewModel.js`
- `frontend/src/features/home/homeViewModel.test.js`
- `frontend/src/features/home/useHomeAnimations.js`
- `frontend/src/features/home/useHomeData.js`
- `frontend/src/styles/home.css`

Updated files:

- `frontend/src/App.jsx`
- `frontend/src/App.test.jsx`
- `frontend/src/index.css`
- `docs/FRONTEND_IMPLEMENTATION.md`

### Completion requirements

- `/dashboard` and `/home` render the approved Home page using the live client.
- Portfolio value, 24-hour ranking, market prices, market caps, and seven-day trend paths come from their documented backend responses with no sample values.
- USD market data, USDT candles, and USDC portfolio valuation remain clearly distinguished.
- A failure in one source does not remove valid data from another source, and stale refresh data is disclosed.
- Removed Home features and personalised greeting copy are absent.
- Anime.js remains optional, scoped, cleaned up, and reduced-motion safe.
- Automated tests, production build, live integration, visual review, styling checks, and Git checks pass.

### Implementation result

Completed on 2026-09-03.

- Replaced the legacy `/dashboard` page with the new Home dashboard and added `/home` as an alias. The previous dashboard component remains untouched but is no longer mounted by these routes.
- Added the approved navigation rail and topbar without a general Buy Protection link. Home, Portfolio, Markets, Product Reality, Protection Overview, and asset-detail navigation use existing application routes.
- Changed the Welcome page's “My protection” action to open `/portfolio`, matching the action's meaning now that Phase 6 exists.
- Built the live Portfolio Value card with a prominent USDC total, simulated-holdings disclosure, partial-total handling, unpriced-asset names, and View Full Portfolio action. No portfolio-performance claim is made.
- Built Trending Now from backend 24-hour percentages and made the ranking rule explicit: largest absolute movement first across Alpha's four market assets.
- Built the Top Cryptocurrencies table using CoinGecko USD price/change/market-cap fields and separate Binance USDT seven-day closes. Each asset name and trending card opens Coin Detail.
- Added small responsive SVG sparklines calculated only from returned candle closes. A failed or insufficient candle response produces “Unavailable” and never a fabricated line.
- Added a 45-second visible-page refresh for summary data, a longer candle refresh path, last-successful-value preservation, and separate Portfolio/Market initial error states.
- Added an original live-data orbit around the Portfolio Value card. Anime.js provides the scoped entrance sequence, continuous orbit, verification-node pulses, live-dot pulses, and market refresh accents. All content is visible without animation, reduced motion is respected, errors are isolated, and scope cleanup runs on unmount.
- Applied the Alpha token palette, Space Grotesk/Inter/JetBrains Mono roles, 76px rail, centered 1400px layout, internal scrolling, table styling, semantic change chips, source disclosures, keyboard focus, and compact-screen stacking.
- Kept “Good Morning, Demo User”, AI Market Brief, Favorites/Watchlist, Market Movers, Estimated Payout, Protection Coverage, and seven-day portfolio-change content out of the page.

Files added:

- `frontend/src/features/home/HomePage.jsx`
- `frontend/src/features/home/HomePage.test.jsx`
- `frontend/src/features/home/MarketSparkline.jsx`
- `frontend/src/features/home/homeViewModel.js`
- `frontend/src/features/home/homeViewModel.test.js`
- `frontend/src/features/home/useHomeAnimations.js`
- `frontend/src/features/home/useHomeData.js`
- `frontend/src/styles/home.css`

Files updated:

- `frontend/src/App.jsx`
- `frontend/src/App.test.jsx`
- `frontend/src/index.css`
- `docs/FRONTEND_IMPLEMENTATION.md`

### Verification performed

- Backend prerequisite tests: passed; all 170 backend tests passed before implementation.
- Live backend prerequisite check: passed; portfolio value was complete, all four overview assets returned non-null price, 24-hour change, and market cap, and ETH/BTC/SOL/BNB each returned 168 real one-hour candles for `range=1W`.
- Automated frontend tests: passed after final visual polish; 15 test files and 83 tests passed, including 10 new Home tests.
- Phase 7 behavior coverage: passed for real portfolio and market rendering, USD/USDT/USDC source distinction, absolute-movement ranking, search filtering, qualified partial values, isolated market failure, missing-candle behavior, Portfolio and Coin Detail navigation, and absence of removed content.
- Production build: passed after final visual polish with 139 modules transformed.
- Dependency audit: passed; npm reported zero vulnerabilities.
- Desktop live-data visual review: passed at 1440×900. The centered content fills one viewport, all four ranked assets and market rows are readable, and every real sparkline renders.
- Compact live-data visual review: passed at 500×900. Controls stack cleanly, the trend strip remains horizontally accessible, and the market table uses local horizontal scrolling.
- Failure-state visual review: passed. Portfolio and market provider failures are explicit, no blank panels or sample figures appear, and live-status wording is removed when a source is unavailable.

### Deviations from plan

- No product-scope deviation. The Home page contains only the approved sections and capabilities.
- The market sections intentionally remain four-asset views because `/api/assets/overview` and the candle endpoint currently support ETH, BTC, SOL, and BNB. AVAX and XRP portfolio holdings are not relabelled as Home market-data support.
