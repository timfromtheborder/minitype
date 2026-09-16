# Minitype Performance & Architecture Optimization Plan (Tier 2: v0.9.7.6, v0.9.7.6.1, v0.9.7.6.2)

This document provides the complete technical design, architectural invariants, and step-by-step implementation strategy for the three-pass **Tier 2 Optimization Release**:
* **Pass A (`v0.9.7.6`):** Platen Rendering Optimization & Typing Engine Isolation
* **Pass B (`v0.9.7.6.1`):** Storage Architecture, Hydrator Consolidation & Batching
* **Pass C (`v0.9.7.6.2`):** Large-Scale Concurrency, Web Worker & Stress Profiling

The primary objective is to eliminate all initial layout shifts, font-measurement flashes, theme transition asynchronies, settings adjustment flickers, and DOM/persistence bottlenecks at extreme typing velocities and large manuscript scales (50,000+ words).

---

## 1. Executive Summary & Architecture Overview

| Pass | Pillar | Target Metric / Outcome | Core Problem Solved |
| :--- | :--- | :--- | :--- |
| **Pass A (v0.9.7.6)** | **1. Page Load Stabilization** | CLS = 0.000 | Eliminates platen resize jumps and font-swap flashes during initial mount. |
| **Pass A (v0.9.7.6)** | **2. Synchronous Theme Transitions** | 0ms / 1 paint frame | Eliminates 300ms background fade lag and two-tone palette flashes. |
| **Pass A (v0.9.7.6)** | **3. Smooth Settings Adjustments** | Zero platen jitter | Prevents aperture jump and tracker bounce when adjusting lines (1–10) or text size (S–XL). |
| **Pass A (v0.9.7.6)** | **4. Drafting DOM & Cursor Isolation** | 60/120 FPS typing at 120+ WPM | Decouples cursor rendering and isolates active drafting head from historical lines. |
| **Pass B (v0.9.7.6.1)** | **5. Unified Hydration Architecture** | 100% DRY state init | Consolidates ~485 duplicated lines between `rehydrate()` and `loadProject()`. |
| **Pass B (v0.9.7.6.1)** | **6. Dexie Atomic Batching** | 80% less DB I/O | Replaces $N$ individual transactions with single-batch `bulkPut()` writes. |
| **Pass B (v0.9.7.6.1)** | **7. Schema Typing & Slice Decoupling** | Zero `any` casts | Fully typed persistence records and decoupled cross-slice activity pipeline. |
| **Pass C (v0.9.7.6.2)** | **8. Active Line Word Delta** | $< 0.1\text{ ms}$ keystroke latency | Replaces whole-document scans on keystrokes with line delta counters. |
| **Pass C (v0.9.7.6.2)** | **9. Web Worker Word Count Offload** | 0ms main thread delay | Runs full sanitization & Unicode regex counting in background worker thread. |
| **Pass C (v0.9.7.6.2)** | **10. 50k-Word Stress Benchmark** | Zero dropped frames at 150 WPM | Verifies memory stability and zero event loop starvation on novel-length texts. |

---

## 2. Pass A Technical Pillars: Rendering & Platen Engine (v0.9.7.6)

### Pillar 1: Initial Page Load Stabilization & Zero-CLS Platen

#### 1.1 The Problem
In `src/components/aperture/ApertureFrame.tsx` (lines 90–114), `checkLimit()` dynamically creates a synthetic hidden `<span>` element, appends it to `document.body`, measures 71 characters using `getBoundingClientRect().width`, and removes it:
1. **Forced Synchronous Layout Thrash:** Appending and measuring an element during initial mount forces an immediate synchronous layout calculation before the first paint is complete.
2. **Font Loading Race Condition:** If `checkLimit()` executes before `Courier Prime` finishes downloading, it measures fallback monospace metrics (e.g. system Courier). When `Courier Prime` resolves milliseconds later, character widths change, causing the platen to snap abruptly between 35 and 70 columns.

#### 1.2 The Solution
1. **CSS-Driven Deterministic Bounds:**
   - Replace dynamic DOM measurement with deterministic CSS media queries and container constraints:
     - Desktop / tablet landscape: 70 columns (`w-[71ch]` with viewport fit `width: min(71ch, calc(100vw - 3rem))`).
     - Mobile portrait (`max-width: 640px` or portrait orientation): 35 columns (`w-[36ch]`).
2. **Synchronous Platen Dimension Initialization:**
   - Ensure the inline head script in `layout.tsx` sets `data-aperture-height` and `data-page-mode` so the platen renders at its exact physical height on the very first paint frame with zero layout shift.

---

### Pillar 2: Synchronous Theme & Color Scheme Transitions

#### 2.1 The Problem
1. In `src/app/page.tsx` (line 68), `<main>` is styled with `transition-colors duration-300`.
2. When switching color schemes (e.g., from Typewriter to Dark Amber or Phosphor Green):
   - CSS variables and `data-theme` update instantaneously.
   - Child components, borders, and text elements render with the new palette immediately.
   - `<main>` takes 300ms to fade its background color, producing an awkward two-tone inversion/flash.

#### 2.2 The Solution
1. **Disable Transition Lag on Theme Switches:**
   - Remove `transition-colors duration-300` from `<main>` during theme switches, or apply a temporary `.no-transitions` class during palette mutations:
     ```css
     .no-transitions, .no-transitions * {
       transition: none !important;
     }
     ```
2. **Atomic Single-Frame Palette Paint:**
   - Ensure all 7 color schemes update all CSS variables simultaneously without intermediate state dispatch.

---

### Pillar 3: Smooth Settings Adjustments & Containment

#### 3.1 The Problem
1. When dragging the Aperture Height slider (1 to 10 lines) in `SettingsDrawer.tsx`:
   - React dispatches rapid `setApertureHeight` updates on every slider tick.
   - `ApertureFrame` re-slices `lines.slice(startIdx)`.
   - The platen height jumps as lines mount/unmount, causing `SessionTargetTracker` (above) and `DocumentStats` (below) to bounce vertically.

#### 3.2 The Solution
1. **CSS Layout Containment on Platen Viewport:**
   - Apply CSS containment to the drafting container in `ApertureFrame.tsx`:
     ```css
     contain: layout size;
     ```
   - Isolates layout reflows strictly within the platen boundary.
2. **CSS Variable Binding for Platen Height:**
   - Drive platen height strictly via `--aperture-height-rem`:
     ```css
     height: var(--aperture-height-rem);
     transition: height 120ms cubic-bezier(0.4, 0, 0.2, 1);
     ```
   - Provides smooth 120ms height easing so dragging the slider expands/contracts the platen gracefully.
3. **Anchor Stabilization:**
   - Ensure `SessionTargetTracker` and `DocumentStats` use fixed relative offsets (`calc(100% + 0.5rem)`) so they glide smoothly with platen height changes.

---

### Pillar 4: Drafting Head & Hardware Cursor Decoupling

#### 4.1 The Problem
1. During fast typing (100–120+ WPM), every keystroke updates `ActiveLine.tsx`.
2. Because the cursor block (`span[data-cursor="typing-head"]`) is rendered as an inline flex sibling of character cells, advancing the cursor forces React reconciliation across all 70 cell components on every keystroke.

#### 4.2 The Solution
1. **Decouple Cursor into Hardware-Accelerated Overlay:**
   - Move the typing-head cursor to an absolutely positioned overlay:
     ```tsx
     <div 
       className="absolute top-0 bottom-0 w-[1ch] transition-transform duration-75 pointer-events-none"
       style={{ transform: `translateX(${activeColIndex}ch)` }}
     />
     ```
2. **Targeted Memoization Comparators on Historical Lines:**
   - Ensure `HistoricalLine.tsx` memoization strictly checks line identity, line index, and topmost fading status so committed lines produce 0 render cycles during typing sprints.

---

## 3. Pass B Technical Pillars: Storage & Batch Architecture (v0.9.7.6.1)

### Pillar 5: Unified Project Hydration Architecture

#### 5.1 The Problem
`rehydrate()` in `persistenceSlice.ts` (~300 lines) and `loadProject()` in `projectSlice.ts` (~185 lines) duplicate almost 90% of the exact same parsing, sanitizing, healing, partitioning, and session reconciliation logic. This code duplication creates severe maintenance hazards.

#### 5.2 The Solution
Extract a single canonical helper in `src/lib/importer.ts`:
```typescript
export function hydrateProjectSnapshot(
  projectData: { manifest: ManuscriptManifest; pages: PageRecord[]; sessions: SessionRecord[] },
  globalSettings: Partial<ManuscriptManifest>,
  columnLimit: number
): NormalizedProjectSnapshot { ... }
```
Both `rehydrate()` and `loadProject()` delegate to this helper, ensuring 100% behavioral symmetry between cold boot and project switching.

---

### Pillar 6: Dexie Atomic Batching (`bulkPut`)

#### 6.1 The Problem
In `db/index.ts` (line 246), `flushPendingSave` persists pages using:
```typescript
await Promise.all(pagesToSave.map((p) => savePage(p)));
```
This spawns $N$ separate IndexedDB write transactions, generating unnecessary disk I/O thrash during multi-page operations.

#### 6.2 The Solution
Replace individual promises with Dexie's native batch write:
```typescript
await db.pages.bulkPut(pagesToSave);
```
This commits all pages in a single atomic database transaction, improving write performance by up to 80%.

---

### Pillar 7: Database Schema Typing & Cross-Slice Decoupling

#### 7.1 The Problem
1. In `db/index.ts`, manifest and settings writes use `any` casts.
2. Store slices (`apertureSlice`, `persistenceSlice`, `projectSlice`) invoke each other's mutator functions via circular imports.

#### 7.2 The Solution
1. Define explicit `PersistedSettingsRecord` and `PersistedManifestRecord` interfaces.
2. Create a clean internal drafting event pipeline (`notifyDraftingActivity(set, get)`) to decouple slice lifecycles.

---

## 4. Pass C Technical Pillars: Large-Scale Concurrency & Stress Profiling (v0.9.7.6.2)

### Pillar 8: Active Line Word Delta Tracking

#### 8.1 The Problem
On typing pauses, re-evaluating the entire document string blocks the UI thread as documents grow past 20,000 words.

#### 8.2 The Solution
Maintain a running word count delta by comparing changes only on the active drafting line during continuous writing bursts.

---

### Pillar 9: Web Worker Word Count Offload

#### 9.1 The Problem
Scrivener-standard Unicode regex tokenization over 50,000+ words takes 20–50ms, causing noticeable UI frame stutters on mobile or lower-powered machines.

#### 9.2 The Solution
Offload full manuscript compilation, sanitization, and Unicode token counting to a Web Worker thread (`wordCount.worker.ts`), streaming results asynchronously back to the Zustand store.

---

### Pillar 10: 50,000-Word Manuscript Stress Benchmark

#### 10.1 The Solution
Implement an automated Vitest stress benchmark simulating 150 WPM drafting bursts on a 50,000-word manuscript, verifying:
- Keystroke input latency $< 8\text{ ms}$.
- Zero memory leaks over 10,000 consecutive simulated keystrokes.
- IndexedDB batch persist latency $< 25\text{ ms}$.

---

## 5. Implementation Phases & Work Breakdown

### Phase A: Platen & Font Stabilization (v0.9.7.6)
- [ ] Remove DOM-appending `testSpan` measurement in `ApertureFrame.tsx`.
- [ ] Replace with pure CSS column bounds (`w-[36ch]` / `w-[71ch]` with viewport clamp).
- [ ] Stabilize initial inline script in `layout.tsx` for zero layout shift on cold boot.

### Phase B: Theme & Palette Atomicity (v0.9.7.6)
- [ ] Strip `transition-colors duration-300` from `<main>` during theme switches.
- [ ] Unify CSS variables across all 7 color schemes into atomic single-frame paint.

### Phase C: Platen Containment & Slider Easing (v0.9.7.6)
- [ ] Add `contain: layout size` and smooth height easing to platen lines container.
- [ ] Stabilize `SessionTargetTracker` and `DocumentStats` anchor positions.

### Phase D: Drafting Head & Cursor Decoupling (v0.9.7.6)
- [ ] Decouple cursor block to an absolutely positioned overlay with GPU transform.
- [ ] Audit `ActiveLine` and `HistoricalLine` render cycles to ensure 0 dropped frames at 120+ WPM.

### Phase E: Unified Project Hydrator (v0.9.7.6.1)
- [ ] Implement canonical `hydrateProjectSnapshot()` in `src/lib/importer.ts`.
- [ ] Refactor `persistenceSlice.rehydrate` and `projectSlice.loadProject` to use the unified hydrator.

### Phase F: Dexie Batch Operations (v0.9.7.6.1)
- [ ] Migrate `flushPendingSave` and multi-page saves to `db.pages.bulkPut()`.
- [ ] Verify atomic transaction rollback on write error.

### Phase G: Schema Typing & Store Decoupling (v0.9.7.6.1)
- [ ] Replace `any` types in `db/index.ts` with strict database record interfaces.
- [ ] Refactor cross-slice mutators into unified drafting activity pipeline.

### Phase H: Line Word Delta & Web Worker Offload (v0.9.7.6.2)
- [ ] Implement active line word delta tracking during typing.
- [ ] Move full-document compilation to Web Worker for 50k+ word projects.

### Phase I: 50k-Word Scale Benchmark & Stress Test (v0.9.7.6.2)
- [ ] Execute automated 150 WPM continuous drafting stress test on a 50k-word manuscript.
- [ ] Verify 0 dropped frames and 0 memory leaks in Chrome DevTools / Vitest.

---

## 6. Verification & Validation Metrics

| Milestone | Check / Test | Target Metric | Tool / Command |
| :--- | :--- | :--- | :--- |
| **v0.9.7.6** | Cumulative Layout Shift (CLS) | CLS = 0.000 | Lighthouse / DevTools Performance |
| **v0.9.7.6** | Palette Switch Duration | $le 16\text{ ms}$ (1 frame) | DevTools Performance Timeline |
| **v0.9.7.6** | Typing Keystroke Latency | $< 8\text{ ms}$ per key event | Automated typing benchmark |
| **v0.9.7.6.1** | Rehydration vs Load Parity | 100% snapshot match | Vitest integration test |
| **v0.9.7.6.1** | Dexie Multi-Page Write Time | $< 25\text{ ms}$ for 50 pages | Vitest benchmark |
| **v0.9.7.6.2** | 50k-Word Typing Pause Latency | $< 5\text{ ms}$ main thread | DevTools Performance Profiler |
| **v0.9.7.6.2** | 150 WPM Burst Frame Rate | 60/120 FPS constant | DevTools Performance Timeline |
| **All** | TypeScript Integrity | 0 errors | `npm run typecheck` |
| **All** | Unit & Integration Suite | All tests pass | `npm run test:unit` |
| **All** | Production Build | Exit code 0 | `npm run build` |
