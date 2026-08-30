# KUST·Lab Cloud Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a redesigned KUST·Lab schedule with a responsive official-site footer and secure cross-device course editing.

**Architecture:** Keep GitHub Pages as the public frontend and embedded schedule as the guaranteed fallback. Add a dependency-free Cloudflare Worker backed by D1 for versioned schedule snapshots; the frontend loads, caches, edits, and saves that snapshot through a password-protected management drawer.

**Tech Stack:** Single-file HTML/CSS/JavaScript, Cloudflare Workers, D1 SQL, Wrangler, Node built-in test runner, GitHub Pages.

---

### Task 1: Add Worker contract tests

**Files:**
- Create: `cloudflare-worker/test/worker.test.mjs`
- Create: `cloudflare-worker/package.json`

1. Write tests for health, public read, authorized write, invalid payload, wrong origin, revision conflict, and oversized payload.
2. Run `npm test` in `cloudflare-worker` and verify the tests fail because the Worker does not exist.
3. Commit the failing contract tests with the Worker implementation in Task 2 so the main branch never contains a deliberately broken state.

### Task 2: Implement Worker and D1 schema

**Files:**
- Create: `cloudflare-worker/src/index.mjs`
- Create: `cloudflare-worker/schema.sql`
- Create: `cloudflare-worker/wrangler.jsonc`

1. Implement `GET /api/health` and `GET /api/schedule`.
2. Implement `PUT /api/schedule` with bearer-secret verification, origin checks, schema validation, size limits, and optimistic revision checks.
3. Implement a memory adapter used by tests and a D1 adapter used in production.
4. Run `npm test`; expect all contract tests to pass.
5. Commit backend source and tests.

### Task 3: Redesign the single-file frontend

**Files:**
- Modify: `index.html`

1. Add the independent top navigation and new warm-neutral campus design tokens.
2. Restyle hero, status, today timeline, week browser, mentor states, and responsive breakpoints.
3. Replace the footer with desktop information columns and mobile disclosure sections.
4. Verify the title, official transparent logo, campus image, and existing 37 meetings remain present.

### Task 4: Add schedule management and sync

**Files:**
- Modify: `index.html`

1. Refactor built-in data into immutable fallback data plus mutable runtime data.
2. Add cloud load, timeout, validation, cache, retry, last-sync status, and conflict handling.
3. Add a responsive management dialog with add, edit, delete, segmented teachers, room input, import, export, and save controls.
4. Keep the administrator secret in `sessionStorage` only.
5. Add deterministic DOM-mock tests for initial load, week navigation, course editing, cloud fallback, mentor highlighting, and all calendar boundaries.

### Task 5: Deploy and verify

**Files:**
- Modify: `cloudflare-worker/wrangler.jsonc` with the created D1 database ID.
- Modify: `index.html` with the deployed Worker endpoint.

1. Authenticate Wrangler manually if needed.
2. Create the D1 database and apply `schema.sql` remotely.
3. Set the administrator secret through `wrangler secret put`; never print or persist it.
4. Deploy the Worker and verify health/read/write behavior without exposing the secret.
5. Copy the final HTML to the delivery and canonical folders, commit, push, wait for GitHub Pages, and compare live/local SHA-256.
