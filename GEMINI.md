```markdown
# GEMINI.md - Antigravity Agent Directives: Minitype

This repository contains the source code for **Minitype**, a distraction-free, forward-momentum writing web application modeled on mechanical typewriter constraints. 

All agents operating in this workspace must adhere to the architectural invariants, strict verification protocols, and implementation standards outlined below.

Project PRD located at /docs/MINITYPE_PRD.md.

---

## 1. Core Architectural Invariants (Non-Negotiable)

1. **No Native Text Inputs:** Under no circumstances should the typing aperture use HTML `<textarea>`, `<input>`, or `contenteditable` elements. The aperture must be a virtual grid composed of discrete, immutable character cell DOM nodes.
2. **Forward-Only Drafting:** Traditional backward deletion is strictly banned. The `Delete` key is disabled. `Backspace` enters Highlight Mode instead of erasing.
3. **Strict Column Bounds:** The typing grid is locked to exactly 70 monospace character columns.
4. **Visible-Frame Backspace Clamping:** Backspace highlighting can never navigate into lines that have scrolled off-screen above the visible frame ($activeLine - visibleLines + 1$).
5. **No Clipboard Ingress:** Clipboard paste events (`Ctrl+V`, `Cmd+V`, context menu) are completely blocked.
6. **No Pointer Repositioning:** Mouse clicks or touch events inside the typing aperture must not reposition the cursor.

---

## 2. Technology Stack & Tooling

* **Framework:** Next.js (App Router, React 19)
* **Language:** TypeScript (Strict mode enabled, `noImplicitAny: true`, `strictNullChecks: true`)
* **Styling:** Tailwind CSS + shadcn/ui
* **Local Persistence:** Dexie.js (IndexedDB wrapper)
* **State Management:** Zustand (for decoupled, high-frequency typing state)
* **Unit/Integration Testing:** Vitest + React Testing Library
* **End-to-End Testing:** Playwright (headless browser verification)

---

## 3. Autonomous Execution & Verification Workflow

When executing tasks, follow this autonomous closed-loop cycle before declaring any task complete:


```

[Write / Modify Code]
│
▼
[Run Typecheck] ──(Fails)──► [Inspect Terminal Diagnostic & Self-Heal]
│ (Passes)
▼
[Run Tests]    ──(Fails)──► [Fix Regressions / Update Mocks]
│ (Passes)
▼
[Browser Check]  ──(Fails)──► [Resolve Visual / Layout Flaws]
│ (Passes)
▼
[Task Done]

```

### Required CLI Validation Commands
Run these commands sequentially in the integrated terminal after every code modification:
```bash
# 1. Type validation
npm run typecheck       # Must execute `tsc --noEmit` with zero errors

# 2. Unit & state machine tests
npm run test:unit       # Executes Vitest test suite

# 3. Headless browser / E2E verification
npm run test:e2e        # Executes Playwright test suite

```

Do not ask the user for confirmation to proceed if all verification commands exit with code `0`. If an error occurs, inspect the terminal stack trace, patch the offending file, and re-run the check.

---

## 4. Key Data Contracts & Schemas

### 4.1 Character Cell Model (`src/types/aperture.ts`)

```typescript
export type CharacterState = 'standard' | 'highlighted' | 'struck';

export interface CharacterCell {
  id: string;
  char: string;
  state: CharacterState;
  colIndex: number;      // 0 to 69
  lineIndex: number;
  isSoftPadding?: boolean; // True if created by soft word-wrap
}

export interface LineRecord {
  id: string;
  lineIndex: number;
  cells: CharacterCell[];
  isCommitted: boolean;
}

```

### 4.2 Page & Manuscript Model (`src/types/manuscript.ts`)

```typescript
export interface PageRecord {
  pageNumber: number;
  lines: LineRecord[];
  completedAt: string | null;
}

export interface ManuscriptManifest {
  id: string;
  title: string;
  mode: 'local' | 'temp';
  inboxCount: number;
  outboxCount: number;
  lastPrintedCharIndex: number;
  printedPagesCount: number;
  activeApertureHeight: 1 | 2 | 3 | 4 | 5;
  wrapMode: 'hard' | 'soft';
  pageSize: 30 | 40 | 54 | 60;
  colorScheme: 'typewriter' | 'dark-amber' | 'phosphor' | 'high-contrast';
  typeface: 'courier-prime' | 'jetbrains-mono' | 'ibm-plex-mono';
}

```

---

## 5. Implementation Rules & Anti-Patterns

### 5.1 Keyboard Event Handling

* **Central Listener:** Manage all keyboard operations from a single top-level `useTypingEngine` hook attached to `window`.
* **IME Guard:** Always check `e.nativeEvent.isComposing || e.keyCode === 229`. Do not mutate state while an Input Method Editor (IME) session is active.
* **Resolution Matrix:**
* `e.key === 'Backspace'`: Highlight previous cell, clamped to visible ceiling.
* `e.key === 'Enter'` with active highlight: Set all highlighted cells to `'struck'`, clear selection, snap cursor to end.
* `e.key === 'Enter'` without active highlight: Commit line, append newline.
* Printable single char with active highlight: Revert highlighted cells to `'standard'`, snap cursor to end, append character.



### 5.2 Performance & Rendering

* **Anti-Pattern:** Do not store the entire active document in a single monolithic React component state. Typing at 120 WPM will drop frames if all visible cells re-render on every keystroke.
* **Pattern:**
* Isolate the active drafting line into a dedicated component (`ActiveLine.tsx`).
* Wrap historical lines in `React.memo` (`HistoricalLine.tsx`).
* Use transient Zustand subscriptions or direct DOM node refs for the blinking cursor.



### 5.3 Rubber-Banded Print Formula

Implement the print engine pacing using the logarithmic curve from the PRD:

```typescript
export function calculatePrintDelayMs(totalDeltaChars: number): number {
  if (totalDeltaChars <= 0) return 0;
  const rawDelay = 30 / (1 + Math.log10(1 + totalDeltaChars / 100));
  return Math.max(2, rawDelay);
}

```

* Bounded total print animation duration: minimum instant compile for historical pages, maximum 10 seconds for unprinted delta.

---

## 6. Project Directory Layout

```
minitype/
├── .antigravity/
│   └── rules.md                  # Agent behavior rules and tool permissions
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Global providers & base monospace fonts
│   │   ├── page.tsx              # Primary application viewport
│   │   └── globals.css           # Custom theme variables and CRT filters
│   ├── components/
│   │   ├── aperture/
│   │   │   ├── ApertureFrame.tsx # 70-character container with line limiter
│   │   │   ├── ActiveLine.tsx    # Uncommitted writing line (high performance)
│   │   │   ├── HistoricalLine.tsx# Memoized visible history lines
│   │   │   └── CharacterCell.tsx # Individual atomic cell renderer
│   │   ├── stages/
│   │   │   ├── InboxCounter.tsx  # Interactive paper feeder
│   │   │   └── OutboxCounter.tsx # Completed sheets stack
│   │   ├── modals/
│   │   │   ├── SettingsDrawer.tsx# Font, color, height, and wrap options
│   │   │   └── PrintModal.tsx    # Mechanical print simulator & text export
│   │   └── ui/                   # shadcn/ui components (buttons, dialogs, sliders)
│   ├── hooks/
│   │   ├── useTypingEngine.ts    # Central keydown & strikeout state machine
│   │   ├── useApertureLimits.ts  # Frame clamping and vertical line shifts
│   │   └── usePrintEngine.ts     # Delta sanitization and pacing engine
│   ├── lib/
│   │   ├── sanitize.ts           # Strips struck text and collapsed lines
│   │   ├── wrap.ts               # Soft wrap and hard break algorithms
│   │   └── sound.ts              # Synthesized mechanical keystroke audio (Web Audio API)
│   ├── db/
│   │   └── index.ts              # Dexie.js database schema and migrations
│   └── types/                    # Core TypeScript definitions
└── tests/
    ├── unit/
    │   ├── engine.test.ts        # Strikeout, highlight, and backspace tests
    │   ├── sanitize.test.ts      # Struck-out export filter tests
    │   └── wrap.test.ts          # 70-column wrap edge cases
    └── e2e/
        ├── typing-flow.spec.ts   # Full page completion, paper feed, lock state
        └── print-export.spec.ts  # Delta compilation and .txt download checks

```

---

## 7. Edge Cases to Guard Against

1. **Soft-Wrap Backspace Desync:** When traversing backward into a preceding line that soft-wrapped, skip generated trailing padding cells and snap selection directly to the last printable character.
2. **Aperture Resizing Mid-Selection:** If the user opens settings and reduces line height from 5 to 2 while cells are highlighted on lines 4 and 5, immediately cancel the highlight and clamp the cursor to the active line.
3. **Session Rehydration in Temp Mode:** If `mode === 'temp'`, ignore any database entries found in IndexedDB and initialize with a sterile, RAM-only state.
4. **BeforeUnload Trapping:** In `temp` mode, register `window.onbeforeunload` whenever the buffer contains unprinted characters. Remove the hook cleanly if the manuscript is completely printed or cleared.

```

```