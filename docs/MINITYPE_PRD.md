# Minitype: Comprehensive Product Requirements Document (PRD v2.0)

Minitype is a distraction-free, forward-momentum writing web application built on the physical constraints of a mechanical typewriter. By intercepting destructive operations, locking retrospective navigation, and enforcing strict physical bounds, the application prevents real-time editing and compels continuous drafting.

---

## 1. Product Architecture & Layout

The viewport is locked, non-scrollable, and centered vertically and horizontally.

```
+-------------------------------------------------------------+
|                       [ OUTBOX: 0 ]                         |
|                                                             |
|   [⚙]  +-------------------------------------------------+  |
|        | [Line N-2] Historical visible line              |  |
|        | [Line N-1] Historical visible line              |  |
|        | [Line N  ] Active drafting line: HELLO WORL█    |  |
|        +-------------------------------------------------+  |
|                                                             |
|                       [ INBOX: 0 ]                          |
|                  (+ Click to feed sheet)                    |
|                                                             |
|   [Print / Compile]                         [Mode: Local]   |
+-------------------------------------------------------------+

```

### Component Hierarchy

* **Outbox (Top Center):** Displays completed manuscript sheets. Increments when a page threshold is satisfied.
* **Settings Gear (Aperture Left):** Toggles an off-canvas drawer for typography, palette, line count, wrap behavior, and page limits.
* **Typing Aperture (Viewport Center):** Fixed 70-character monospace container. Vertical capacity dynamically set to 1–5 lines. Zero scrollbars, zero native text selection.
* **Inbox (Bottom Center):** Clickable sheet stack counter. Holds unwritten sheets. Clicking manually increments reserve paper.
* **Utility Deck (Viewport Base):** Displays the primary "Print / Compile" trigger on the left and the active persistence mode toggle (`Local` vs. `Temp`) on the right.

---

## 2. Input Engine & State Model

To eliminate the editing loopholes present in standard browser form elements, the typing aperture is rendered via a custom DOM node tree of atomic character cells rather than a native `<textarea>` or `contenteditable` container.

### 2.1 Character Cell Schema

Each line consists of an array of discrete character objects:

```typescript
interface CharacterCell {
  id: string;
  char: string; // Printable ASCII/Unicode character
  state: 'standard' | 'highlighted' | 'struck';
  colIndex: number; // 0 to 69
  lineIndex: number;
}

```

### 2.2 Input Interception & Lockout

The window-level keydown handler captures and suppresses native browser behavior:

* **Blocked Keys:** `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Delete`, `Tab`.
* **Clipboard Blacklist:** `paste`, `copy`, `cut`, and context menu events are strictly suppressed via `e.preventDefault()`. Content entry is restricted exclusively to direct physical keyboard events.
* **Mouse Interception:** `mousedown` events on the aperture are prevented from generating native cursor positions or selections.

### 2.3 Strikeout & Backspace Mechanics

* **Backspace Trigger:**
* Traverses backward from the active typing head.
* Modifies character cell state from `'standard'` to `'highlighted'`.
* **Frame Clamping:** The highlight boundary cannot expand past column 0 of the topmost visible line currently shown in the aperture. If the aperture is set to 3 lines, backspace cannot highlight text that has shifted off-screen into line $N-3$. Once column 0 of line $N-2$ is highlighted, further `Backspace` inputs are dropped.


* **Resolution Keystrokes:**
* **Enter Key (with active highlight):** Immediately converts all `'highlighted'` cells to `'struck'` (rendered with a persistent strikethrough line). Clears the highlight buffer and returns the typing head to the furthest uncommitted position on the active line.
* **Printable Key (with active highlight):** Aborts the highlight sequence. Reverts all `'highlighted'` cells back to `'standard'`, snaps the cursor to the active typing head, and appends the typed character.
* **Enter Key (without active highlight):** Emits a hard return, committing the current line and creating line $N+1$.



### 2.4 Wrapping Modes

A configuration toggle controls how characters behave upon hitting boundary column 69:

* **Hard Break (Mechanical):** The 71st character is placed directly at column 0 of the next line, splitting words mid-character without hyphens.
* **Soft Word Wrap (Manuscript):** If a word spans column 69 without a preceding space, the entire active word shifts to column 0 of the next line. The vacated trailing cells of the previous line are filled with non-printable whitespace padding.

---

## 3. Aperture Mechanics & Page Progression

```
+-----------------------------------------------------------+
| PAGE CYCLE STATE MACHINE                                  |
|                                                           |
| [Page In Progress]                                        |
|        │                                                  |
|   (Line Count == Page Size)                               |
|        ▼                                                  |
| [Commit Page to Document] ──► [Increment Outbox (+1)]     |
|        │                                                  |
|   Check Inbox                                             |
|   ├── Inbox > 0 ──► Decrement Inbox (-1) ──► Reset Frame  |
|   └── Inbox = 0 ──► LOCK APERTURE                         |
|                           │                               |
|                     (User clicks Inbox)                   |
|                           │                               |
|                           ▼                               |
|                    Unlock & Continue                      |
+-----------------------------------------------------------+

```

* **Visible Line Shifting:** As line $N+1$ is generated, existing lines shift upward outside the viewport using `overflow: hidden`.
* **Page Exhaustion:** When total written lines reach the configured page size (e.g., 54 lines):
1. The page buffer is committed to permanent session storage.
2. The Outbox counter increments by $+1$.
3. If Inbox $> 0$: The Inbox counter decrements by $-1$, the active typing frame resets to empty, and drafting continues without pause.
4. If Inbox $= 0$: Keyboard input locks completely, the cursor transitions to an amber/red warning state, and an inline mechanical notification appears: *"Feed paper: Click Inbox to load sheet."* Clicking the Inbox clears the block and resumes the session.



---

## 4. Compilation & Printing Engine

The Print engine produces a sanitized, clean-manuscript export while reinforcing the physical tactile rhythm of mechanical printing.

```
Total Manuscript: [ Page 1 | Page 2 | Page 3 | Page 4 ]
                         ▲                   ▲
                  Previously Printed     Unprinted Delta
                  [Instant Compile]    [Rubber-Banded Print]

```

### 4.1 Content Sanitization Pipeline

1. Scan all document lines sequentially.
2. Filter out all character cells where `state === 'struck'`.
3. Eliminate orphaned blank lines created by full-line strikeouts.
4. Export the resulting clean stream to plain text (`.txt`) and trigger the browser print stylesheet (`@media print`) for physical letter/A4 formatting.

### 4.2 Delta Compilation & Rubber-Banded Pacing

* **Delta Splitting:** The compiler maintains a watermark pointer `lastPrintedCharIndex`. Any content at or below this index compiles instantly ($0\text{ ms}$).
* **Dynamic Pacing for Unprinted Deltas:** Unprinted characters ($C$) stream through a simulated mechanical print dialog at a scalable velocity:
* Baseline delay for minimal text: $30\text{ ms}$ per character.
* Rubber-band velocity equation:

$$\text{Delay per character (ms)} = \max\left(2, \frac{30}{1 + \log_{10}(1 + \frac{C}{100})}\right)$$


* Overall print duration is hard-capped to a maximum of 10 seconds regardless of draft length, ensuring the user experience remains responsive.



---

## 5. Persistence Architecture

```
[Typing Aperture] 
       │
       ├─── Mode === 'Temp'  ──► [Volatile React State / RAM]
       │                              │
       │                              └──► Alert on window:beforeunload
       │
       └─── Mode === 'Local' ──► [IndexedDB via Dexie.js]
                                      │
                                      └──► Auto-save per completed line

```

* **Local Mode:** Automatically writes the manuscript state, page arrays, active line buffer, and Inbox/Outbox counts to local browser storage via IndexedDB. Fully survives browser crashes, refreshes, and tab closures.
* **Temp Mode:** Restricts all manuscript state exclusively to volatile client-side memory (RAM).
* Hooks into `window.addEventListener('beforeunload')` to throw a native system warning: *"Draft is running in Temp Mode. Exiting will permanently erase all unprinted text."*
* Destroying or reloading the session irrevocably purges the buffer.



---

## 6. Technical Stack & Antigravity Directives

To enable autonomous build and verification using Antigravity AI agents with minimal manual intervention, the application relies on an end-to-end, strongly typed, deterministic web stack.

### 6.1 Core Technology Stack

| Layer | Selected Tech | Rationale for Agentic Automation |
| --- | --- | --- |
| **Framework** | Next.js (App Router) + React | Self-contained routing, clean module boundaries, single-repo structure. |
| **Language** | TypeScript (Strict Mode) | Acts as an automated feedback loop. Terminal typechecks catch edge cases autonomously. |
| **Styling & UI** | Tailwind CSS + shadcn/ui | Atomic, non-cascading utility classes prevent visual regression and layout bugs. |
| **Persistence** | Dexie.js (IndexedDB wrapper) | Zero-backend local storage with synchronous-like transactional reliability. |
| **Testing** | Vitest + Playwright | Autonomous headless execution for unit state machines and end-to-end typing tests. |

### 6.2 Workspace Agent Rules (`.antigravity/rules.md`)

The following instructions are embedded for the Antigravity agent:

```markdown
# Antigravity Autonomous Directives for Minitype

1. Quality Verification Loop:
   - Run `npm run typecheck` (tsc --noEmit) and `npm run test` after every file modification.
   - Do not mark any task complete until all tests pass with zero errors.

2. Architecture Constraints:
   - Do NOT use HTML `<textarea>` or `<input>` for the typing aperture.
   - Build a custom React component rendering an array of immutable character objects.
   - Manage all keyboard events from a single top-level `onKeyDown` hook.
   - Use Dexie.js for IndexedDB interactions; never write raw browser LocalStorage calls.

3. Testing Requirements:
   - Write comprehensive unit tests in Vitest for:
     * Backspace clamping to the top visible line.
     * Strikethrough conversion upon pressing Enter.
     * Sanitization pipeline stripping struck-out text.
     * Rubber-band print speed formula limits.

```

---

## 7. Configuration Matrix

| Setting Name | Options | Default Value | Notes |
| --- | --- | --- | --- |
| **Aperture Height** | 1, 2, 3, 4, 5 lines | 3 lines | Modifies the visible vertical window and backspace limit. |
| **Line Wrap Mode** | `Hard Break` | `Soft Word Wrap` | `Soft Word Wrap` | Hard break splits strictly at 70 columns; soft wrap carries words. |
| **Page Length** | 30, 40, 54, 60 lines | 54 lines | Standard manuscript formatting (54 lines $\approx$ 250 words). |
| **Typeface** | Courier Prime, JetBrains Mono, IBM Plex Mono | Courier Prime | High-legibility monospaced typefaces. |
| **Color Scheme** | • Typewriter (Paper `#F5F2EB` / Ink `#1E1E1E`)<br>

<br>• Dark Amber (`#121212` / `#FFB000`)<br>

<br>• Phosphor Green (`#0A120A` / `#33FF33`)<br>

<br>• High Contrast (`#FFFFFF` / `#000000`) | Typewriter | Controls canvas and text theme variables. |
| **Session Mode** | `Local` | `Temp` | `Local` | Toggles persistent IndexedDB writes vs. volatile RAM. |

---

## 8. Full System Review: Technical Edge Cases & Operational Risks

A complete architectural review highlights five critical edge cases that require explicit programmatic controls during implementation:

### 8.1 Input Method Editors (IME) & International Dead Keys

* **The Risk:** Asian languages (CJK) and European accent dead keys require multi-stroke composition buffers before emitting a final character. A naive `keydown` listener intercepts intermediate keys and corrupts the single-character cell mapping.
* **Resolution:** The input pipeline must verify `!e.isComposing` and check `e.keyCode !== 229` before processing keystrokes. Only finalized composition strings are allowed to allocate character cells.

### 8.2 Dynamic Aperture Height Reconfiguration

* **The Risk:** If a user types 4 lines in a 5-line aperture, enters Backspace highlight mode up to line 1, and simultaneously alters the settings to a 2-line aperture, the highlight range now extends into the hidden overflow.
* **Resolution:** Any runtime modification to the aperture height setting must immediately trigger an event that cancels active highlights and returns the selection boundary to the new visible ceiling (`activeLine - (newHeight - 1)`).

### 8.3 State Desynchronization in Soft Wrap Backspacing

* **The Risk:** If an 8-letter word wraps to a new line, it leaves trailing whitespace on the previous line. If the user backspaces across the wrapped line boundary back into the previous line, naive index decrementing will land on ghost padding cells rather than genuine typed characters.
* **Resolution:** The engine must store `explicitTrailingWhitespace` flags on line objects. Backspacing backward across line bounds must automatically skip soft-wrap padding cells and lock onto the last true printable character cell of the preceding line.

### 8.4 Print Watermark Invalidation on Session Restore

* **The Risk:** In `Local` mode, if a user prints Pages 1–3, closes the tab, and reopens it later, `lastPrintedCharIndex` could reset to 0 if stored only in memory. The application would then unnecessarily re-animate the entire document during the next print.
* **Resolution:** `lastPrintedCharIndex` and `printedPagesCount` must be serialized to the IndexedDB manifest alongside page buffers. On boot, the print engine initializes its delta watermark directly from persistent storage.

### 8.5 Antigravity Agent Pitfalls (Component Cascades)

* **The Risk:** Agentic AI coding engines often fall into recursive state update loops when handling multi-keystroke synthetic DOM elements. If typing triggers rapid React re-renders of all 70 columns across 5 lines, keystroke lag will occur at high typing speeds (100+ WPM).
* **Resolution:** The active input line must be decoupled into an isolated drafting component, using transient React refs or a localized Zustand slice, while historical lines remain memoized (`React.memo`) to eliminate frame drops during drafting sprints.