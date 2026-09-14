# Finance readability implementation plan

**Goal:** Make verified balances, planned cash flows and forecast shortfalls readable across desktop and mobile without exposing private data.

**Architecture:** Keep the existing authenticated finance API and schema. Update only the finance renderer and its scoped CSS. Budget workbook and snapshot corrections are handled privately and published separately with revision checks.

**Tech Stack:** Inline application shell, dependency-free JavaScript/CSS, Node test runner; synthetic DOM simulation for responsive interaction checks.

## 1. Presentation tests

- Update `test/institute-ui.test.mjs` with synthetic finance rendering tests: negative/zero/positive balances, selected-month scope, escaped notes, empty lists, balance adjustments and retained selection.
- Run `node --test test/institute-ui.test.mjs` before and after implementation.

## 2. Finance view

- Modify `assets/institute.js`: verified baseline cards; monthly navigation; separated planned income/expense; expandable notes; explicit shortfall labels; signed timeline with selectable months.
- Keep all amounts derived from the authenticated snapshot. Do not infer payment status, invent receipt dates, recompute the source forecast or mix historical receipts into pending income.
- Show source reconciliation adjustments separately from income when the supplied month-end balance requires one.

## 3. Responsive styling

- Modify `assets/institute.css`: warm paper/campus red theme, wider two-column desktop layout, stacked mobile layout, visible negative-state backgrounds, zero-axis forecast tracks.
- All controls remain available on mobile with 44px targets, flexible grid sizing, keyboard focus and reduced motion support.
- Test widths 320–1920 using the existing local synthetic DOM/CSS harness. Do not describe these checks as physical-device visual verification.

## 4. Release

- Run the full Node suite, inspect diffs for private data and verify the private snapshot independently.
- Publish the corrected snapshot through `scripts/publish-finance.mjs` with a fresh revision and exact readback; never commit it.
- Increment `index.html` frontend version and release timestamp, publish to the existing repository and verify live HTML/assets. Preserve login, course revision and original website URL.
