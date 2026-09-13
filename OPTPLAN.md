# Minitype Rendering Optimization Plan (v0.9.7.6 / Tier 2)

This document provides the technical design, architectural invariants, and step-by-step implementation strategy for the **Tier 2 Rendering Optimization** release (`v0.9.7.6`).

The primary objective is to eliminate all initial layout shifts, font-measurement flashes, theme transition asynchronies, settings adjustment flickers, and DOM re-render churn during high-speed drafting sprints.

---

## 1. Executive Summary & Core Objectives

| Pillar | Target Metric / Outcome | Core Problem Solved |
| :--- | :--- | :--- |
| **1. Page Load Stabilization** | Cumulative Layout Shift (CLS) = 0 | Eliminates platen resize jumps and font-swap flashes during initial paint. |
| **2. Synchronous Theme Transitions** | 0ms / Single paint frame transition | Eliminates 300ms background fade lag, two-tone flashes, and color desync across palettes. |
| **3. Smooth Settings Adjustments** | Zero platen jitter on slider drag | Prevents aperture jump and tracker reflow when scaling height (1–10 lines) or text size (S–XL). |
| **4. Drafting DOM Isolation** | 60/120 FPS typing at 120+ WPM | Completely decouples the active typing head from historical lines; zero unneeded re-renders. |

---

## 2. Detailed Technical Pillars

### Pillar 1: Initial Page Load Stabilization & Zero-CLS Platen

#### 2.1 The Problem
In `src/components/aperture/ApertureFrame.tsx` (lines 90–114), `checkLimit()` dynamically creates a synthetic hidden `<span>` element, appends it to `document.body`, measures 71 characters using `getBoundingClientRect().width`, and removes it:
1. **Forced Synchronous Layout Thrash:** Appending and measuring an element during initial mount forces an immediate synchronous layout calculation in the browser before the first paint is complete.
2. **Font Loading Race Condition:** If `checkLimit()` executes before `Courier Prime` finishes downloading, it measures fallback monospace metrics (e.g. system Courier or monospace). When `Courier Prime` resolves milliseconds later, character widths change, causing the platen to abruptly snap between 35 and 70 columns (visible platen jump).

#### 2.2 The Solution
1. **CSS-Driven Deterministic Bounds:**
   - Replace dynamic DOM measurement with deterministic CSS media queries and container-aware constraints:
     - On desktop/tablet landscape: 70 columns (`71ch`).
     - On mobile portrait (`max-width: 640px` or portrait orientation): 35 columns (`36ch`).
   - Use CSS clamp for viewport fit: `width: min(71ch, calc(100vw - 3rem))`.
2. **Font-Ready Synchronization:**
   - Guard font measurement with `document.fonts.ready` promise or CSS `font-display: swap` metric override (`size-adjust`) so fallback fonts match Courier Prime's exact advance width.
3. **Synchronous Platen Dimension Initialization:**
   - Ensure the initial inline head script in `layout.tsx` sets `data-aperture-height` and `data-page-mode` so the platen renders at its exact physical height on the very first paint frame with zero layout delta.

---

### Pillar 2: Synchronous Theme & Color Scheme Transitions

#### 2.1 The Problem
1. In `src/app/page.tsx` (line 68), `<main>` is styled with `transition-colors duration-300`.
2. When the user switches color schemes (e.g., from Typewriter to Dark Amber or Phosphor Green):
   - CSS custom variables and dataset attributes (`data-theme`) update instantaneously.
   - Child components, borders, and text elements render with the new palette immediately.
   - `<main>` takes 300ms to fade its background color, producing an awkward two-tone inversion/flash during palette selection.
3. Modal overlays and platen backgrounds transition at disparate frame intervals.

#### 2.2 The Solution
1. **Disable Transition Lag on Theme Switches:**
   - Remove `transition-colors duration-300` from `<main>` during theme switches, or wrap theme changes in a temporary `no-transitions` class:
     ```css
     .no-transitions, .no-transitions * {
       transition: none !important;
     }
     ```
2. **Atomic Single-Frame Palette Paint:**
   - Ensure all 7 color schemes (`typewriter`, `dark-amber`, `spotlight`, `high-contrast`, `dark-mode`, `low-contrast`, `phosphor`) update all CSS variables simultaneously:
     - `--background`, `--foreground`, `--card`, `--border`, `--muted`, `--primary`, `--highlight-bg`, `--struck-color`, `--cursor-color`.
   - Update 4-tier storage (`localStorage`, `sessionStorage`, cookies, `document.documentElement` attribute) atomically in `settingsPersistence.ts` without intermediate state dispatch.

---

### Pillar 3: Smooth Settings Adjustments (Aperture Height & Text Size)

#### 3.1 The Problem
1. When dragging the Aperture Height slider (1 to 10 lines) in `SettingsDrawer.tsx`:
   - React dispatches rapid `setApertureHeight` updates on every slider tick.
   - `ApertureFrame` re-slices `lines.slice(startIdx)`.
   - The platen height jumps as lines mount/unmount, causing `SessionTargetTracker` (anchored above) and `DocumentStats` (anchored below) to bounce vertically.
2. In XL text mode, font size changes can cause fractional pixel rounding issues on the platen borders.

#### 3.2 The Solution
1. **CSS Layout Containment on Platen Viewport:**
   - Apply CSS containment to the drafting container in `ApertureFrame.tsx`:
     ```css
     contain: layout size;
     ```
   - This isolates layout reflows strictly within the platen boundary, preventing height changes from causing layout recalculations on the viewport, utility deck, or modals.
2. **CSS Variable Binding for Platen Height:**
   - Drive the platen height strictly via `--aperture-height-rem`:
     ```css
     height: var(--aperture-height-rem);
     transition: height 120ms cubic-bezier(0.4, 0, 0.2, 1);
     ```
   - Provide smooth 120ms height easing so dragging the slider expands/contracts the platen gracefully without jarring layout pops.
3. **Anchor Stabilization for Surrounding Widgets:**
   - Ensure `SessionTargetTracker` and `DocumentStats` use fixed vertical offsets (`calc(100% + 0.5rem)`) so they glide smoothly with platen height changes rather than jumping across paint frames.

---

### Pillar 4: Active Line & Historical DOM Rendering Isolation

#### 4.1 The Problem
1. During fast typing (100–120+ WPM), every keystroke triggers an update to `currentPageLines` in Zustand.
2. Although `HistoricalLine.tsx` is wrapped in `React.memo`, if `lines` array references change or if preceding lines undergo shallow prop comparison, React re-evaluates all visible lines on every single keystroke.
3. In multi-line apertures (e.g. 5 or 10 lines), re-evaluating 5–10 lines $\times$ 70 character cells = 350–700 DOM nodes per keystroke.

#### 4.2 The Solution
1. **Strict Active Line Isolation:**
   - In `ApertureFrame.tsx`, separate the drafting head from the historical line stack:
     - `ActiveLine.tsx` subscribes exclusively to the active line data (`lines[activeLineIndex]`, `activeColIndex`, cursor state).
     - `HistoricalLine.tsx` receives immutable historical line records that never re-render during normal forward typing.
2. **Custom Memoization Equality Function:**
   - Provide a targeted comparator for `HistoricalLine`:
     ```typescript
     export const HistoricalLine = React.memo(
       function HistoricalLine({ line, lineIndex, isTopmost }: HistoricalLineProps) { ... },
       (prev, next) => {
         return (
           prev.line === next.line &&
           prev.lineIndex === next.lineIndex &&
           prev.isTopmost === next.isTopmost
         );
       }
     );
     ```
   - Historical lines re-render *only* when struck out, backspace-highlighted, or shifted upward by a carriage return.
3. **Character Cell Rendering Efficiency:**
   - Ensure `CharacterCell.tsx` memoization prevents re-rendering unhighlighted, standard cells when cursor position advances.

---

## 3. Implementation Phases & Work Breakdown

### Phase A: Platen & Font Stabilization
- [ ] Remove DOM-appending `testSpan` measurement in `ApertureFrame.tsx`.
- [ ] Replace with pure CSS column bounds (`w-[36ch]` / `w-[71ch]` with viewport clamp).
- [ ] Stabilize initial inline script in `layout.tsx` for zero layout shift on cold boot.

### Phase B: Theme & Palette Atomicity
- [ ] Strip `transition-colors duration-300` from `<main>` during theme switches.
- [ ] Unify CSS variables across all 7 color schemes into atomic single-frame paint.
- [ ] Verify zero background flash across dark, high-contrast, and vintage palettes.

### Phase C: Platen Containment & Slider Easing
- [ ] Add `contain: layout size` and smooth height easing to platen lines container.
- [ ] Stabilize `SessionTargetTracker` and `DocumentStats` anchor positions.
- [ ] Test real-time dragging of aperture height slider (1–10 lines) for zero flicker.

### Phase D: Active Line Isolation & Typing Benchmark
- [ ] Audit `ActiveLine` and `HistoricalLine` render cycles using React Profiler.
- [ ] Enforce targeted `React.memo` comparator on `HistoricalLine`.
- [ ] Execute automated high-speed typing simulation test (150 WPM burst) verifying 0 dropped frames and 0 unneeded re-renders.

---

## 4. Verification & Validation Metrics

| Test / Check | Target Metric | Command / Tool |
| :--- | :--- | :--- |
| **Cumulative Layout Shift (CLS)** | CLS < 0.01 (Target: 0.000) | Chrome DevTools Lighthouse / Performance |
| **Theme Switch Paint Duration** | $\le 16\text{ ms}$ (1 frame) | Chrome Performance Timeline |
| **Typing Keystroke Latency** | $< 8\text{ ms}$ per key event | Automated typing benchmark in Vitest |
| **TypeScript Integrity** | 0 errors | `npm run typecheck` |
| **Unit Test Suite** | 154+ passed | `npm run test:unit` |
| **Production Build** | Exit code 0 | `npm run build` |
