# Mobile More Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a compact mobile “更多” menu that preserves every schedule, calendar, management, sync, and information entry without crowding the phone dock.

**Architecture:** Keep the existing static HTML/CSS/JavaScript application and add one native bottom-sheet `dialog` controlled by a single setup function. Existing scrolling, calendar, management, and cloud-loading functions remain the source of truth; menu buttons only route to those functions and close the sheet.

**Tech Stack:** Semantic HTML, responsive CSS, vanilla JavaScript, Node.js built-in test runner.

---

### Task 1: Lock the mobile-menu contract with a failing test

**Files:**
- Modify: `test/frontend.test.mjs`

**Step 1: Write the failing test**

Assert that `mobileMoreDialog`, `openMoreMobile`, `closeMoreMobile`, the six menu actions, `aria-expanded`, a setup function, and the bottom-sheet CSS all exist exactly once.

**Step 2: Run test to verify it fails**

Run: `node --test test/frontend.test.mjs`

Expected: FAIL because the new dialog and controls do not exist yet.

### Task 2: Implement the semantic bottom sheet

**Files:**
- Modify: `index.html`
- Modify: `assets/kust-lab-v2.css`

**Step 1: Replace the fourth dock item**

Change “校历” to “更多” and make it control `mobileMoreDialog` with `aria-controls` and `aria-expanded="false"`.

**Step 2: Add the menu dialog**

Add a labeled native `dialog` with six real actions: scroll to today, scroll to week, open the calendar, open management, reload cloud data, and scroll to site information.

**Step 3: Add responsive styling**

Render the dialog as a two-column bottom sheet at `max-width: 800px`, account for the bottom safe area, keep 44px minimum touch targets, and hide it at wider sizes.

### Task 3: Wire interaction and state

**Files:**
- Modify: `index.html`

**Step 1: Add `setupMobileMoreMenu()`**

Open and close the dialog, synchronize `aria-expanded`, close after navigation, reuse `openManagerDialog()` and `loadCloudSchedule()`, and handle the native cancel event.

**Step 2: Initialize the menu**

Call the setup function once from `init()` and remove the old direct mobile-calendar handler.

### Task 4: Verify responsive and data behavior

**Files:**
- Test: `test/frontend.test.mjs`
- Test: `cloudflare-worker/test/worker.test.mjs`

**Step 1: Run frontend tests**

Run: `node --test test/frontend.test.mjs`

Expected: all frontend tests pass.

**Step 2: Run Worker tests**

Run: `node --test cloudflare-worker/test/worker.test.mjs`

Expected: all Worker tests pass; menu work does not change the cloud validation contract.

**Step 3: Run source checks**

Run: `git diff --check`

Expected: no whitespace errors.

### Task 5: Publish and verify

**Files:**
- Modify: `README.md` only if the visible navigation instructions changed materially.

**Step 1: Commit**

Run: `git add index.html assets/kust-lab-v2.css test/frontend.test.mjs docs/plans && git commit -m "fix: improve foldable layout and add mobile menu"`

**Step 2: Push**

Run: `git push origin HEAD`

Expected: GitHub accepts the commit.

**Step 3: Verify GitHub Pages**

Fetch the public HTML and stylesheet with a cache-busting query, compare their SHA-256 hashes with local files, then ask for Honor foldable outer-screen and unfolded-screen screenshots for final device QA.
