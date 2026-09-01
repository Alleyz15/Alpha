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
