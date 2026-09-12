# Minitype

A distraction-free, forward-momentum writing web application modeled on mechanical typewriter constraints.

---

## Tech Stack

- **Framework:** Next.js (App Router, React 19, Turbopack)
- **Language:** TypeScript (Strict mode enabled)
- **Styling:** Tailwind CSS + Radix/Lucide icons
- **State Management:** Zustand (decoupled typing engine slices)
- **Local Database:** Dexie.js (IndexedDB wrapper)
- **Testing:** Vitest + React Testing Library + `fake-indexeddb`
- **Audio:** Web Audio API procedural synthesis

---

## Getting Started

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Quality Assurance & Validation
```bash
# Type validation
npm run typecheck

# Unit and state machine tests
npm run test:unit

# Next.js production build
npm run build
```

---

## License
MIT
