# New Cloud Account Migration Implementation Plan

> Execute in the current approved task; retain the original public website and old cloud resources.

**Goal:** Rebuild the institute backend in the newly authorized account without changing the GitHub Pages URL or course data.

**Architecture:** Create a new D1 database, Worker and Pages gateway. Copy the complete current public schedule document (including recycle bin and mentor names), and import the local private finance snapshot only into authenticated storage. Publish the frontend only after backend verification.

**Tech Stack:** Cloudflare Workers / D1 / Pages, GitHub Pages, Node tests.

### 1. Prepare and check
- Confirm the new account and existing resources; do not delete or modify old account resources.
- Read the old live schedule; validate and retain its revision, update time and complete document.
- Validate the private finance snapshot; never commit private data or credentials.

### 2. Build backend
- Create D1; update `cloudflare-worker/wrangler.jsonc` with the returned binding.
- Apply `cloudflare-worker/schema.sql` and migration `0003_institute_sessions_finance.sql` to the new database only.
- Set the existing password and supplied weather key as encrypted Worker secrets, not source files.
- Deploy Worker; create a new Pages gateway and update its upstream.
- Seed the schedule preserving revision/date and import budget with version-conflict protection.
- Verify live login, private-data rejection, session revocation, course equality and weather.

### 3. Release
- Update `index.html`, weather snapshot source, gateway tests and deployment documentation with verified new endpoints.
- Keep v3.5 as the single unreleased candidate; refresh its actual publication time.
- Run all Node tests and the existing multi-width DOM checks (not physical-device tests).
- Fetch upstream, preserve automated weather updates, push to the existing repository.
- Confirm published HTML/CSS/JS, private API and course data. Keep old services intact for rollback.

## Status

Approved by user: rebuild in the new account. New D1, Worker, Pages gateway and encrypted secrets are configured. The complete 19-course document is verified identical to the old service at revision 4; the private budget import is verified without publishing its contents.

Live checks passed: login, authenticated private reads, unauthenticated and wrong-origin rejection, browser-session revocation, course and budget conflict protection, and current weather. Temporary verification sessions were revoked. Both the new gateway and original website returned HTTP 200 in direct (no-proxy) requests from this computer; this is not a guarantee for every mobile network.

94 Node tests, 11 multi-width DOM scenarios and 20 CSS breakpoint checks passed. Publication uses the original GitHub Pages repository and v3.5; old cloud resources remain intact. Existing open pages must be refreshed to switch to the new service.
