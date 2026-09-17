# Minitype Project Roadmap

This document outlines the near-term feature, polish, safety, architectural, performance, and major evolutionary milestones for Minitype. The roadmap is structured into focused, granular releases to ensure rapid execution, isolated regression testing, and rigorous quality control (QC).

---

## Milestone Overview

| Milestone | Codename | Primary Focus Area | QC Scope | Status |
| :--- | :--- | :--- | :--- | :--- |
| **v0.9.7.5** | **Pass A** | Mechanical & Session Polish, Audio Bus, Strikeout Lockout & Session Boundary | Typing ergonomics, audio stability, session boundary lock, bridge re-renders | **Complete** |
| **v0.9.7.5.1** | **Hotfix** | Theme Switching Latency & SSR Hydration Optimization | Instant CSS variable switching, debounced saving, stable modal callbacks | **Complete** |
| **v0.9.7.5.2** | **Pass B1** | Mobile Ergonomics, Orientation Clamping, Screen Wake Lock & PWA Readiness | Wake Lock API, PWA manifest, iOS app header, dialog focus traps, a11y | **Complete** |
| **v0.9.7.5.3** | **Pass B1.1** | Lossless 70/35-Col Text Re-flow Engine | Bidirectional cell re-flow, exact cursor mapping, 0 scaling, round-trip fidelity | **Complete** |
| **v0.9.7.5.4** | **Hotfix/Polish** | Wake Lock Permanence, File List Optimization & Target Isolation | 5-minute permanent wake lock, conditional modal rendering, target bug fix | **Complete** |
| **v0.9.7.5.5** | **Pass B2** | Data Safety (Full Backup & Restore) | Full-library JSON import/export archive | **Complete** |
| **v0.9.7.6** | **Tier 2 (Pass A)** | Platen Rendering Optimization & Typing Engine Isolation | Zero-CLS platen, single-frame themes, cursor overlay | **Complete** |
| **v0.9.7.6.1** | **Tier 2 (Pass B)** | Storage Architecture, Hydrator Consolidation & Batching | Unified hydrator parity, Dexie `bulkPut()`, schema typing | **Complete** |
| **v0.9.7.6.2** | **Tier 2 (Pass C)** | Large-Scale Concurrency, Web Worker & Stress Profiling | 60k-word stress test, Web Worker background word count, platen windowing, instant Enter | **Complete** |
| **v0.9.8.0** | **Pass C1** | Chrono Suite, Terminal Multi-Phosphor Easter Egg & Keyboard Shortcuts | Digital clock & session elapsed timer, color swatches, platen resize hotkeys | **Complete** |
| **v0.9.8.1** | **Pass C2** | Unified Session Drawer, Redaction Blinders & 3-Deck Architecture | Document/Session tab merge, block masking `[█]`, 3-button deck, remove Paragraph mode | Future |

---

## [v0.9.7.5] — Pass A: Mechanical & Session Polish, Audio Bus, Strikeout Lockout & Session Boundary

Focuses on resolving session creation edge cases, inter-session boundary protection, audio bus architecture, modal UX polish, target persistence, and introducing a configurable strikeout/highlight lockout toggle.

### 1. Previous Session Platen Locking & Visual Divider Line
* **The Issue:** When a project is loaded or a new session is started, text from a preceding session visible on the platen can currently be edited or backspaced into.
* **Locked Previous Session Boundary:**
  * When starting a new session, all preceding session text visible on the platen becomes strictly read-only / immutable.
  * Backspace traversal (`handleBackspace`) is strictly clamped so it cannot step backward across the session boundary or into lines belonging to an older session.
* **Platen-Only Dashed Divider:**
  * Insert a subtle, semi-transparent dashed divider line (`border-t border-dashed border-foreground/30`) in the platen between the preceding session and the new session block.
  * **Ephemeral Platen Element:** This divider line is purely a visual platen artifact—it moves upward and scrolls off the platen as new lines are committed (`Enter`), and is **never** included in the saved manuscript text body, compilation exports, or session records.

### 2. Session Target Persistence Fix
* **Bug Fix:** Session word targets (`sessionWordTarget`) set by the user are currently lost or not saved with the project in IndexedDB.
* **Resolution:** Ensure `sessionWordTarget` is persisted directly onto the project's `ManuscriptManifest` in IndexedDB (`saveManuscript`), correctly retrieved during `loadProject` and `rehydrate`, and preserved across app sessions.

### 3. Strikeout & Back-Highlighting Toggle (Settings)
* **Feature:** Add a user setting in `SettingsDrawer.tsx` to toggle back-highlighting and strikeout mechanics on or off (`allowStrikeout`, default: `true`).
* **Behavior when Disabled:** 
  * Pressing `Backspace` is completely blocked/suppressed (or locked to forward momentum only), preventing reverse stepping and highlighting.
  * Ensures writers who want an absolute forward-only constraint cannot step backward or strike out previous words.
  * *Note:* Striking out a physical carriage return on an empty line (`wrapType === 'hard'`) continues to be respected per mechanical invariants.

### 4. Audio Subsystem: Master Gain Bus & Dynamics Compressor
* **Audio Bus Architecture:** Modernize `src/lib/sound.ts` with a central audio routing graph:
  `[Voice Sources] -> [Voice Gains] -> [Master Gain Node] -> [DynamicsCompressorNode] -> [ctx.destination]`.
* **Keystroke Consistency & Anti-Clipping:** 
  * Dynamics compressor prevents acoustic clipping during rapid burst typing (120+ WPM).
  * Synchronize `ctx.currentTime` and manage asynchronous `resume()` transitions to eliminate faint or dropped clicks when switching sessions or resuming backgrounded browser tabs.

### 5. Mobile Keyboard Bridge Render Efficiency
* **Selector Optimization:** In `MobileKeyboardBridge.tsx`, replace the full-store subscription (`const store = useTypingStore()`) with fine-grained selectors (`useTypingStore(s => s.isLocked)`) and event-handler `useTypingStore.getState()` calls.
* **Impact:** Eliminates hundreds of redundant bridge re-renders per drafting session on every keystroke and timer event.

### 6. Session Creation & Feedback Polish
* **Empty Project "Start New Session" Resolution:** 
  * In `projectSlice.ts` (`startNewSession`), allow clicking the "Start New Session" card on brand-new projects (`activeSessions.length === 0`) to immediately seed Session 1 without requiring characters to be drafted first.
* **Active Empty Session Card Flash:** 
  * When an unwritten active session already exists and the user clicks the "Start New Session" card, trigger a brief, subtle highlight/pulse animation on the active session card to communicate that drafting is already underway.
* **Sessions Tab Copy Revision:** 
  * Remove the copy `'Start typing in the aperture or start a new session below.'` when no sessions are recorded, presenting a clean empty-state card.

### 7. Modal Header & Return Button Uniformity, Ruler Opacity & Escape Dismissal
* **Modal Header & Return Button Sizing:**
  * Resolve visual discrepancies between `Document`, `Sessions`, and `Projects` tabs in `PrintModal.tsx`.
  * Standardize header height, vertical alignment, and Return button dimensions across all tabs so switching tabs produces zero header jumping.
  * Update Return buttons in `PrintModal.tsx` and `SettingsDrawer.tsx` with permanent subtle borders (`border-border/60`) for distinct affordance across light, dark, and high-contrast palettes.
* **Ruler Center Marker Contrast:**
  * In `ApertureFrame.tsx`, the `35` column marker currently uses `text-muted-foreground/60`, making it more prominent than the `01` and `70` markers (`text-muted-foreground/45`). Reduce its opacity to `text-muted-foreground/45` so all ruler notations have balanced, unobtrusive visual weight.
* **Escape Key Dismissal:** Add `Escape` keyboard listeners to `SettingsDrawer.tsx` and `PrintModal.tsx` to dismiss open dialogs cleanly.
* **Document Tab Preview Copy:** 
  * Revise the empty preview text from `'No drafted text to preview. Type in the aperture to begin.'` to `'No preview available.'` in `PrintModal.tsx`.

---

## [v0.9.7.5.2] — Pass B1: Mobile Ergonomics, Orientation Clamping, Screen Wake Lock & PWA Readiness

Focuses on mobile writing ergonomics, orientation-based font sizing, keeping the screen awake during active drafting, evaluating iOS standalone chrome, and dependency hygiene.

### 1. Screen Wake Lock API (Prevent Mobile Sleep)
* **The Need:** Mobile and tablet screens frequently go to sleep during reflective writing pauses, interrupting the drafting flow.
* **Implementation:** Integrate the Screen Wake Lock API (`navigator.wakeLock.request('screen')`).
* **Settings & Policy:**
  * Add a setting in `SettingsDrawer.tsx` to toggle Screen Wake Lock: `Keep Screen Awake` (Options: `Always Awake` vs. `5-Minute Inactivity Delay` vs. `System Default`).
  * Automatically release the lock when the browser tab is hidden (`visibilitychange`) or the app is blurred, and re-acquire it upon focus to conserve device battery.

### 2. Mobile Orientation Change & 35-Column Font Clamping
* **The Bug:** When device rotation or viewport width triggers a 35-column platen, text sometimes overflows the platen boundary instead of adapting smoothly.
* **Resolution & Investigation:**
  * Verify that platen size transitions never mutate underlying character records or alter line-break behavior.
  * Audit CSS container clamps and dynamic font sizing (`clamp()`) in `globals.css` so 35-character lines scale down smoothly to fit within physical screen bounds on narrow mobile portrait viewports without overflow or horizontal scroll.

### 3. iPad / iOS Standalone Web App Header Evaluation
* **Investigation:** Evaluate feasibility of hiding/minimizing native iPad status bar (clock, battery, Wi-Fi display) when installed as a standalone PWA.
* **Configuration:**
  * Configure Next.js metadata and Apple touch meta tags:
    * `apple-mobile-web-app-capable: "yes"`
    * `apple-mobile-web-app-status-bar-style: "black-translucent"`
  * Document platform constraints: On modern iOS/iPadOS Safari, the system status bar can be styled as transparent/translucent overlaying the web canvas, but cannot be entirely eliminated due to Apple security guidelines. Ensure platen margins utilize `env(safe-area-inset-top)` so content remains clear of the status bar.

### 4. Progressive Web App (PWA) Manifest
* **Web App Manifest:** Add `site.webmanifest` / Next.js `app/manifest.ts` linking existing `/public` icon assets (`android-chrome-512x512.png`, `apple-touch-icon.png`, `favicon-32x32.png`).
* **Standalone Window Support:** Configure `display: "standalone"`, `theme_color`, and `background_color` so Android, Chrome, and desktop environments offer native "Install Minitype" prompts and launch without browser chrome.

### 5. Accessibility & Focus Management
* **Aperture ARIA Live Region:** Provide a visually hidden live region (`aria-live="polite"`) announcing committed lines, strikeout events, and page/card completions for screen readers (VoiceOver, NVDA).
* **Modal Focus Trapping:** Ensure keyboard `Tab` cycles remain strictly contained within `PrintModal` and `SettingsDrawer` while open.

### 6. Technical Debt & Dependency Hygiene
* **Prune Unused Dependencies:** Remove unused packages from `package.json` (`@base-ui/react`, `class-variance-authority`).
* **CLI DevDependency Move:** Relocate `shadcn` CLI from runtime dependencies to devDependencies (or prune).
* **Modernize `cn` Helper:** Replace obscure third-party `cn` npm package in `src/lib/utils.ts` with idiomatic `clsx` / template literals.
* **Delete Deprecated Stage:** Remove `src/components/stages/PaperTrayStack.tsx` (deprecated since `v0.9.5.10`) and clean up empty `src/components/ui/` directory.
* **Prune Non-Functional Script:** Remove `"test:e2e": "playwright test"` from `package.json` to keep scripts clean and accurate.

---

## [v0.9.7.5.4] — Wake Lock Permanence, File List Optimization & Target Isolation

Polish and bugfix release focused on wake lock ergonomics, modal render isolation, and project target isolation:

### 1. Permanent 5-Minute Screen Wake Lock
* Removed configurable screen awake policy options ('always', '5-min', 'off') from `SettingsDrawer.tsx`.
* Permanently configured screen wake lock with 5-minute inactivity timeout refreshed on typing, touch, and pointer interactions.
* Released automatically upon backgrounding/tab hide or 5 minutes of total user inactivity.

### 2. UI & Theme Refresh Performance Optimization
* Conditionally rendered `<SettingsDrawer>` and `<PrintModal>` so unmounted modals and `ProjectFilesTab` do not execute Dexie IndexedDB queries, sanitization routines, or re-render during theme or typing state updates.
* Memoized `PrintModal` with `React.memo`.
* Sanitized `docData` in `saveManuscript` to explicitly whitelist manifest properties and prevent leaking large object payloads into IndexedDB.

### 3. Session Target Isolation Bugfix
* Fixed bug where imported text files inherited the `sessionWordTarget` of the active project.
* Removed fallback in `persistenceSlice.ts` (`rehydrate()`) that copied the active project's word target onto loaded manuscripts.

---

## [v0.9.7.5.5] — Pass B2: Data Safety (Full Backup & Restore)

Dedicated pass implementing full-library backup and restore:

### 1. Data Safety: Whole-Library JSON Backup & Restore
* **Catalog Export (Backup All):** Single-click action in the Projects tab that flushes all pending saves, serializes all manuscripts, pages, sessions, and global preferences from IndexedDB into a portable, timestamped JSON archive (`minitype-backup-YYYY-MM-DD.json`), and initiates download.
* **Catalog Import (Restore):** File picker in the Projects tab allowing users to upload a `.json` backup file. Includes schema verification, ID collision handling, atomic transaction semantics via Dexie, and corrupt-data guardrails.
* **Non-Destructive Merge:** Merges backup records into the current library while updating matching IDs and preserving unrelated projects, with automatic active project re-sync.
* **Inline Status Feedback:** Provides animated status badges on successful export, restore completion, or validation error.

---

## [v0.9.7.6] — Tier 2 (Pass A): Platen Rendering Optimization & Typing Engine Isolation

*See full technical design in [OPTPLAN.md](file:///c:/Users/tduyz/Documents/gamedev/Gemini/minitype/OPTPLAN.md) (Pillars 1–4).*

Dedicated pass to profile frame rates, eliminate layout shifts, and isolate DOM re-renders during high-velocity drafting sprints.

### 1. Initial Page Load Stabilization & Zero-CLS Platen
* **Eliminate DOM-Appending Span Measurement:** Replace `checkLimit()` DOM-appending `testSpan` with deterministic CSS media queries and container clamps (`min(71ch, calc(100vw - 3rem))` desktop, `36ch` mobile portrait).
* **Synchronous Head Initialization:** Ensure inline script in `layout.tsx` sets platen height and mode attributes on first paint with zero layout shift.

### 2. Synchronous Theme & Color Scheme Transitions
* **Zero-Lag Palette Switching:** Remove `transition-colors duration-300` lag on `<main>` during color scheme changes, rendering palette switches in a single paint frame without two-tone flashes.

### 3. Smooth Settings Adjustments & CSS Containment
* **Platen Viewport Containment:** Apply CSS `contain: layout size` to the platen drafting box to isolate layout recalculations from surrounding UI.
* **Height Easing:** Bind aperture height strictly to `--aperture-height-rem` with smooth 120ms cubic bezier easing so adjusting aperture lines glides smoothly without jumping widgets.

### 4. Drafting Head & Hardware Cursor Decoupling
* **Cursor Overlay Isolation:** Decouple the cursor block from the character cell list into an absolutely positioned, GPU-accelerated overlay (`transform: translateX`), reducing cell re-renders during normal typing.
* **Historical Line Memoization:** Enforce strict `React.memo` comparators on `HistoricalLine.tsx` ensuring zero re-renders on committed lines during 120+ WPM typing bursts.

---

## [v0.9.7.6.1] — Tier 2 (Pass B): Storage Architecture, Hydrator Consolidation & Batching

*See full technical design in [OPTPLAN.md](file:///c:/Users/tduyz/Documents/gamedev/Gemini/minitype/OPTPLAN.md) (Pillars 5–7).*

Dedicated pass to consolidate data loading architecture, optimize database batching, and enforce strict type safety across the persistence tier.

### 1. Unified Project Hydrator Architecture
* **Consolidate Loading Routines:** Unify the ~485 lines of duplicated parsing, sanitizing, session reconciliation, and partitioning between `persistenceSlice.ts` (`rehydrate()`) and `projectSlice.ts` (`loadProject()`) into a single canonical helper: `hydrateProjectSnapshot()` in `src/lib/importer.ts`.
* **Eliminate Discrepancy Regressions:** Guarantees cold boot reload and runtime project switching produce 100% identical state snapshots.

### 2. Dexie Atomic Batch Operations (`bulkPut`)
* **Single-Transaction Commits:** Replace multi-transaction `Promise.all(pagesToSave.map(savePage))` in `db/index.ts` with Dexie's native `db.pages.bulkPut(pagesToSave)`.
* **Disk I/O Reduction:** Reduces IndexedDB transaction overhead by up to 80% during page mode switches and file imports.

### 3. Database Schema Typing & Cross-Slice Decoupling
* **Strict DB Schemas:** Eliminate `any` casts in `db/index.ts` and persistence routines by declaring explicit `PersistedSettingsRecord` and `PersistedManifestRecord` types.
* **Cross-Slice Pipeline:** Replace circular cross-slice helper invocations with a clean, decoupled drafting event pipeline.

---

## [v0.9.7.6.2] — Tier 2 (Pass C): Large-Scale Concurrency, Web Worker & Stress Profiling

*See full technical design in [OPTPLAN.md](file:///c:/Users/tduyz/Documents/gamedev/Gemini/minitype/OPTPLAN.md) (Pillars 8–10).*

Dedicated pass to profile and scale Minitype persistence, platen responsiveness, and word counting to 60,000+ word manuscripts under continuous high-speed drafting.

### 1. Instant Enter & Keystroke Pipeline (< 0.5ms)
* **Zero Disk Stall on Newlines:** Removed synchronous blocking `flushPendingSave()` from `handleEnter` and soft wrap. Replaced immediate multi-megabyte `savePage()` writes with `debounceSavePage()`, eliminating the 150–300ms freeze on Enter.

### 2. Active Line Word Delta Tracking
* **Instant Calculations:** Track line-level word count deltas during typing and line commits (`committedDocWords + countWords(activeLine)`), updating document stats and session trackers in $< 0.05\text{ ms}$ with zero whole-document scanning.

### 3. Web Worker Background Word Counting
* **Worker Offload:** Offloaded full-text sanitization, Scrivener-grade Unicode regex tokenization, and session text extraction to a dedicated Web Worker thread (`wordCount.worker.ts`), guaranteeing 0ms main-thread delay during typing pauses on 60,000-word manuscripts.

### 4. Platen Head Windowing & Scroll Chunking
* **Bounded Drafting Buffer:** Partitions Scroll mode into bounded virtual chunks, keeping `currentPageLines` capped ($\le 60$ lines) so the active platen buffer remains tiny (~200 KB instead of 30 MB) while seamlessly joining all chunks on export.

### 5. High-Load 60,000-Word Manuscript Stress Testing
* **Stress Benchmarks:** Comprehensive automated Vitest benchmarks verifying $< 1\text{ ms}$ keystroke and Enter latency, instant load/close, and 100% word count fidelity across 60,000 words.

---

## [v0.9.8.0] — Pass C1: Chrono Suite, Terminal Multi-Phosphor Easter Egg & Keyboard Shortcuts

Post-Tier 2 milestone focusing on environmental immersion, writing session pacing, keyboard power-user shortcuts, and retro customization.

### 1. Digital Clock Display & Interactive Session Elapsed Timer
* **Theme-Matching Clock:**
  * Add a subtle, semi-faded digital clock display positioned above the platen (toggleable on/off in Settings).
  * Automatically matches the active typeface: serif for Manuscript, crisp monospace for Typewriter/Spotlight, amber/green console typography for Terminal.
  * Configurable 12-hour (e.g. `4:30 PM`) or 24-hour (`16:30`) display format.
* **Interactive Session Timer:**
  * Tapping the clock immediately stamps the session start time: a compact badge of the start time slides into position above the clock, displaying elapsed minutes to the right (e.g., started at 4:30, at 4:55 displays: `4:30 +25m`).
  * Tapping the clock again starts a new timer run.
  * Tapping the timer badge itself dismisses/clears it away.

### 2. Expanded Keyboard Shortcuts & Platen Resize Controls
* **Direct Platen Height Selection:**
  * `Cmd/Ctrl + 1` through `9`: Directly set platen capacity to 1–9 lines.
  * `Cmd/Ctrl + 0`: Directly set platen capacity to 10 lines.
* **Stepped Platen Capacity Adjustment:**
  * `Cmd/Ctrl + [`: Shrink platen capacity (decrease aperture lines, clamped down to 1).
  * `Cmd/Ctrl + ]`: Expand platen capacity (increase aperture lines, clamped up to 10).
* **Modal & Action Shortcuts:**
  * `Cmd/Ctrl + P`: Open Project/Manuscript modal.
  * `Cmd/Ctrl + ,`: Open Settings drawer.
  * `Cmd/Ctrl + Shift + N`: Start a new drafting session.
  * All keyboard shortcuts respect active dialog states, input field focus, and IME composition.

### 3. Terminal Multi-Phosphor Easter Egg Color Picker
* **Interactive Palette Selector:**
  * In `SettingsDrawer.tsx`, when the `Terminal` (dark-amber) theme is active, tapping the Terminal theme button a second time reveals a compact, horizontal 4-swatch easter egg popover.
  * Features 4 solid square color swatches without text or instructions:
    1. **Amber Phosphor** (classic amber `#FFB000`)
    2. **Nuclear Green Phosphor** (vibrant `#33FF33` / `#39FF14`)
    3. **Cyber Blue Phosphor** (cyan/electric blue `#00E5FF`)
    4. **Warning Red Phosphor** (crimson/radar red `#FF3B30`)
* **Behavioral Rules:**
  * Selecting a color immediately updates the Terminal theme CSS variables (text and cursor) and updates the Terminal theme button indicator, then closes the picker.
  * Tapping inside the Settings drawer outside the color picker dismisses the picker with no change.
  * Tapping outside the Settings drawer closes the drawer, ensuring the easter egg resets to closed upon next opening.

---

## [v0.9.8.1] — Pass C2: Unified Session Drawer, Redaction Blinders & 3-Deck Architecture

Major architectural evolution uniting drafting history, manuscript preview, anti-distraction controls, and a streamlined three-button viewport deck.

### 1. Unified Session Drawer (Consolidating Document & Sessions)
* **Single Drawer Design:**
  * Merge the `Document` and `Sessions` tabs into a single unified `Session` drawer, eliminating tab switching.
  * **Collapsible Session Cards:** Historical sessions render as collapsible cards displaying the full session text.
  * **Near-Contiguous Layout:** Cards feature minimal spacing between them so when expanded, the manuscript reads almost as continuous running text.
  * **Metadata Headers:** Timestamps, dates, and word counts are displayed compactly along the top border of each session card.
* **Unified Drawer Controls:**
  * Session target tracker, double-space toggle, and export/print actions are all cleanly integrated into this single drawer.
  * **Manuscript View / Reader Mode Integration:** Folded into this milestone from Pass B2 to eliminate redundancy and layout overlap. Evaluates providing a traditional serif publishing preview (e.g. Georgia/Times, 0.5-inch paragraph indents, proportional `1.5`–`1.6` line height) directly within this drawer or establishing it as a dedicated full-manuscript view/compile mode entirely.
* **Session Management:**
  * Add explicit **Close Session** action (finalizes the current drafting session without immediately starting a new one).
  * Add ability to reset/clear current session text or delete individual sessions with confirmation.

### 2. Drafting Blinders / Redaction Mode (Anti-Anxiety Masking)
* **The Concept:** Complete freedom from retrospective self-criticism during intense drafting sprints.
* **Hashed Drafting Display:**
  * Option to lock or blind active session text while drafting: characters entered on the active line are visually masked 1:1 with solid block glyphs (`[█]`), concealing written words while confirming continuous typing momentum.
  * Live word count continues to increment accurately.
  * Once the session is explicitly closed or completed, the block mask is lifted, revealing the drafted text in full.

### 3. Three-Button Utility Deck
* **Viewport Base Simplification:**
  * The bottom utility deck is streamlined to exactly three primary actions:
    `[Session]` · `[Project]` · `[Settings]`
  * Clicking `Session` opens the Unified Session Drawer.
  * Clicking `Project` opens the clean Project Files list.
  * Clicking `Settings` opens the Settings Drawer.
  * Completely eliminates the vertical tab rail and nested tabs within modal dialogs.

### 4. Retirement of Paragraph Mode
* **Deprecation & Clean Removal:**
  * Remove `paragraph` mode from `PageMode` options, focusing Minitype exclusively on `scroll`, `notecard`, and `page` modes.
  * Clean migration: any manuscripts previously stored in paragraph mode cleanly transition to `scroll` mode on load with 100% text fidelity and zero line loss.
