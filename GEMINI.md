# GEMINI.md - Antigravity Agent Directives: Minitype

This repository contains the source code for **Minitype**, a distraction-free, forward-momentum writing web application modeled on mechanical typewriter constraints. 

All agents operating in this workspace must adhere to the architectural invariants, strict verification protocols, and implementation standards outlined below.

Project PRD located at /docs/MINITYPE_PRD.md.

---

## 1. Core Architectural Invariants (Non-Negotiable)

1. **No Native Text Inputs:** Under no circumstances should the typing aperture use HTML `<textarea>`, `<input>`, or `contenteditable` elements. The aperture must be a virtual grid composed of discrete, immutable character cell DOM nodes.
2. **Forward-Only Drafting:** Traditional backward deletion is strictly banned. The `Delete` key is disabled. `Backspace` enters Highlight Mode instead of erasing.
3. **Strict Column Bounds:** The typing grid is locked to exactly 70 monospace character columns (or 35 columns in mobile portrait mode).
4. **Visible-Frame Backspace Clamping:** Backspace highlighting can never navigate into lines that have scrolled off-screen above the visible frame ($activeLine - visibleLines + 1$).
5. **No Clipboard Ingress:** Clipboard paste events (`Ctrl+V`, `Cmd+V`, context menu) are completely blocked.
6. **No Pointer Repositioning:** Mouse clicks or touch events inside the typing aperture must not reposition the cursor.
7. **Historical Session Immutability:** Completed historical sessions (`completedAt !== null`) are immutable ledger entries. They must never be re-sliced, recalculated, clamped, or deleted by reconciliation or pruning.
8. **Lazy Active Session Creation:** When a project is loaded or opened, no active session exists until the user types the first character.
9. **Atomic Project Unmount:** When switching or closing projects, the outgoing project must cleanly finalize its active session, flush pending page saves, and persist all session and manifest records before loading the target project.

---

## 2. Versioning Directive

* **Version Scheme:** Minitype version numbers always increment by three decimals (e.g. `0.9.5.1` is next, followed by `0.9.5.2`, unless explicitly instructed otherwise).
* **Implementation Plans:** Do not be verbose about incrementing. Simply include the version number inline at the start of the implementation plan title (e.g. `# [v0.9.5.1] Implementation Plan: ...`).
* **UI Display:** The current version is rendered as a minimal monospace tag at the bottom of `SettingsDrawer.tsx` (e.g. `Minitype v0.9.5.1`).

---

## 3. Technology Stack & Tooling

* **Framework:** Next.js (App Router, React 19)
* **Language:** TypeScript (Strict mode enabled, `noImplicitAny: true`, `strictNullChecks: true`)
* **Styling:** Tailwind CSS + Radix/Lucide icons
* **Local Persistence:** Dexie.js (IndexedDB wrapper) with 4-tier synchronous settings persistence (localStorage, sessionStorage, documentElement dataset attributes, IndexedDB)
* **State Management:** Zustand (for decoupled, high-frequency typing state)
* **Unit/Integration Testing:** Vitest + React Testing Library + fake-indexeddb
* **Audio Synthesis:** Web Audio API mechanical strike, carriage return, and paper feed sounds

---

## 4. Key Data Contracts & Schemas

### 4.1 Character Cell & Line Model (`src/types/aperture.ts`)

```typescript
export type CharacterState = 'standard' | 'highlighted' | 'struck';

export interface CharacterCell {
  id: string;
  char: string;
  state: CharacterState;
  colIndex: number;
  lineIndex: number;
  isSoftPadding?: boolean;
  isStruck?: boolean;
}

export interface LineRecord {
  id: string;
  lineIndex: number;
  cells: CharacterCell[];
  isCommitted: boolean;
  wrapType?: 'soft' | 'hard';
  explicitTrailingWhitespace?: boolean;
}
```

### 4.2 Page, Manifest & Session Model (`src/types/`)

```typescript
export interface PageRecord {
  id?: string;
  manuscriptId?: string;
  pageNumber: number;
  lines: LineRecord[];
  completedAt: string | null;
}

export interface SessionRecord {
  id: string;
  projectId: string;
  sessionNumber: number;
  startedAt: string;
  completedAt: string | null;
  text: string;
  wordCount: number;
  isImported?: boolean;
  importedAt?: string | null;
}

export interface ManuscriptManifest {
  id: string;
  title: string;
  mode: 'local';
  inboxCount: number;
  outboxCount: number;
  lastPrintedCharIndex: number;
  printedPagesCount: number;
  activeApertureHeight: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  wrapMode: 'soft';
  pageSize: 30 | 40 | 54 | 60 | number;
  pageMode: 'scroll' | 'page' | 'notecard' | 'paragraph';
  colorScheme: 'typewriter' | 'dark-amber' | 'spotlight' | 'high-contrast' | 'dark-mode' | 'low-contrast' | 'phosphor';
  typeface: 'courier-prime' | 'jetbrains-mono' | 'ibm-plex-mono';
  textSize?: 's' | 'm' | 'l' | 'xl';
  showStats?: boolean;
  doubleSpaceLinebreaks?: boolean;
  activeSessionId?: string;
  sessionCount?: number;
  totalWordCount?: number;
  createdAt?: string;
  updatedAt?: string;
}
```

---

## 5. Implementation Rules & Anti-Patterns

### 5.1 Keyboard Event Handling
* Central `useTypingEngine` hook attached to `window`.
* IME Guard (`isComposing || keyCode === 229`).
* Resolution Matrix: Backspace enters highlight mode; Enter strikes out highlighted cells or commits line; single printable char strikes out highlighted cells and appends typed char.

### 5.2 Session Management Rules
* **Never delete completed sessions:** `pruneZeroContentSessions` only removes active/uncompleted sessions that have 0 words and no text when exiting a project.
* **Word Count Delta:** Active session words are always calculated as $\max(0, \text{totalDocWords} - \sum \text{completedWords})$.
* **Contiguous Renumbering:** Sessions are always numbered sequentially 1..N.

### 5.3 Performance & Rendering
* Isolate active drafting line in `ActiveLine.tsx`.
* Wrap historical lines in `React.memo` (`HistoricalLine.tsx`).
* Debounce persistence so typing at 120 WPM drops zero frames.

---

## 6. Required CLI Validation Commands
```bash
# 1. Type validation
npm run typecheck       # Must execute `tsc --noEmit` with zero errors

# 2. Unit & state machine tests
npm run test:unit       # Executes Vitest test suite

# 3. Next.js production build
npm run build           # Verifies complete bundle integrity
```