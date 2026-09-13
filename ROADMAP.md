# Minitype Project Roadmap

This document outlines the near-term feature, polish, safety, and performance milestones for Minitype, progressing from immediate mechanical and session polish through PWA installation to rendering optimizations.

---

## Milestone Overview

| Milestone | Codename | Focus Area | Status |
| :--- | :--- | :--- | :--- |
| **v0.9.7.5** | **Pass A** | Mechanical Polish, Session Polish & Strikeout Toggle | **Next Up** |
| **v0.9.7.5.1** | **Pass B** | PWA Readiness, Data Safety, Manuscript View & Hygiene | Planned |
| **v0.9.7.6** | **Tier 2** | Performance Profiling & Rendering Optimization | Planned |

---

## [v0.9.7.5] — Pass A: Mechanical Polish, Session Polish & Strikeout Toggle

Focuses on resolving session creation edge cases, audio bus stability, modal UI polish, copy refinement, and introducing a configurable strikeout/highlight lockout toggle.

### 1. Strikeout & Back-Highlighting Toggle (Settings)
* **Feature:** Add a user setting in `SettingsDrawer.tsx` to toggle back-highlighting and strikeout mechanics on or off (e.g. `allowStrikeout` / `enableBackspaceHighlighting`, default: `true`).
* **Behavior when Disabled:** 
  * Pressing `Backspace` is completely blocked/suppressed (or locked to forward momentum only), preventing reverse stepping and highlighting.
  * Ensures writers who want an absolute forward-only constraint cannot step backward or strike out previous words.
  * *Note:* Striking out a physical carriage return on an empty line (`wrapType === 'hard'`) continues to be respected per mechanical invariants.

### 2. AudioContext Master Gain & Keystroke Consistency
* **Audio Bus Architecture:** Introduce a central master gain bus in `src/lib/sound.ts` connecting procedural generators to `ctx.destination`.
* **State Synchronization:** Eliminate faint or dropped clicks when starting a new project, switching sessions, or resuming backgrounded browser tabs by synchronizing `ctx.currentTime` and managing asynchronous `resume()` transitions.

### 3. Session Creation & Feedback Polish
* **Empty Project "Start New Session" Resolution:** 
  * In `projectSlice.ts` (`startNewSession`), allow clicking the "Start New Session" card on brand-new projects (`activeSessions.length === 0`) to immediately seed Session 1 without requiring characters to be drafted first.
* **Active Empty Session Card Flash:** 
  * When an unwritten active session already exists and the user clicks the "Start New Session" card, trigger a brief, subtle highlight/pulse animation on the active session card to communicate that drafting is already underway.
* **Sessions Tab Copy Revision:** 
  * Remove the copy `'Start typing in the aperture or start a new session below.'` when no sessions are recorded, presenting a clean empty-state card.

### 4. Modal Copy & Button Affordance Revisions
* **Document Tab Preview Copy:** 
  * Revise the empty preview text from `'No drafted text to preview. Type in the aperture to begin.'` to `'No preview available.'` in `PrintModal.tsx`.
* **Return Button Visual Affordance:** 
  * Update top-right Return buttons in `PrintModal.tsx` and `SettingsDrawer.tsx` with a permanent subtle border (`border-border/60`) instead of transparent borders, ensuring clear touch and click discoverability across all palettes.

*(Note: Mechanical margin warning bell is intentionally excluded per design shift away from pure typewriter simulation).*

---

## [v0.9.7.5.1] — Pass B: PWA Readiness, Data Safety, Manuscript View & Hygiene

Focuses on installability, whole-library backups, manuscript preview formatting, accessibility, and repository hygiene.

### 1. Progressive Web App (PWA) Manifest
* **Web App Manifest:** Add `site.webmanifest` / Next.js `app/manifest.ts` linking existing `/public` icon assets (`android-chrome-512x512.png`, `apple-touch-icon.png`, `favicon-32x32.png`).
* **Standalone Window Support:** Configure `display: "standalone"`, `theme_color`, and `background_color` so Android, Chrome, and desktop environments offer native "Install Minitype" prompts and launch without browser chrome.

### 2. Data Safety: Whole-Library JSON Backup & Restore
* **Catalog Export (Backup All):** Add a single-click action in the Projects tab or Settings drawer that serializes all manuscripts, pages, sessions, and preferences from IndexedDB into a portable, timestamped `.json` archive.
* **Catalog Import (Restore):** Allow uploading a backup `.json` file to restore or merge projects across devices without backend dependence.

### 3. Manuscript View Toggle (Document Tab)
* **View Modes in Document Tab:** Add a segmented toggle in `PrintModal.tsx` between:
  1. **Plaintext View:** Current monospace typewriter output.
  2. **Manuscript View:** Formatted reader/publishing preview featuring traditional serif typography (e.g. Georgia / Times), 0.5-inch paragraph indentations, proportional line height (`1.5`–`1.6`), and clean paragraph separation.

### 4. Accessibility & Focus Management
* **Aperture ARIA Live Region:** Provide a visually hidden live region (`aria-live="polite"`) announcing committed lines and strikeout events for screen readers (VoiceOver, NVDA).
* **Modal Focus Trapping:** Ensure keyboard `Tab` cycles remain strictly contained within `PrintModal` and `SettingsDrawer` while open.

### 5. Technical Debt & Code Hygiene
* **Delete Deprecated Stage:** Remove `src/components/stages/PaperTrayStack.tsx` (deprecated since `v0.9.5.10`).
* **Prune Non-Functional Script:** Remove `"test:e2e": "playwright test"` from `package.json` to keep scripts clean and accurate.

---

## [v0.9.7.6] — Tier 2: Performance Profiling & Rendering Optimization

*See full technical design and execution plan in [OPTPLAN.md](file:///c:/Users/tduyz/Documents/gamedev/Gemini/minitype/OPTPLAN.md).*

Dedicated pass to profile frame rates, isolate DOM re-renders, and optimize persistence at extreme drafting velocities.

### 1. Platen Drafting Line Isolation
* **Render Decoupling:** Verify that the active drafting line in `ActiveLine.tsx` is completely isolated from historical lines (`HistoricalLine.tsx`), ensuring that typing at 120+ WPM triggers zero render cycles on committed lines above the platen head.
* **Component Memoization Audit:** Audit `React.memo` equality functions across character cell spans and historical line records to prevent shallow prop churn during rapid input bursts.

### 2. Layout & Compositor Stabilization
* **Subpixel Containment:** Verify that subpixel font scaling across S, M, L, and XL text sizes maintains stable box dimensions and avoids layout recalculations.
* **Layer Containment:** Apply CSS `contain: layout style` where appropriate to isolate platen layout passes from surrounding utility elements.

### 3. Persistence & Database Queue Tuning
* **Debounced Save Streamlining:** Verify that IndexedDB writes via Dexie batch page saves efficiently under continuous typing sprints, ensuring zero event loop starvation or frame drops while maintaining crash resilience.
* **Session Stats Throttling:** Confirm session word counting calculations and delta comparisons run on debounced boundaries rather than every single keystroke.
