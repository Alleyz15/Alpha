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
