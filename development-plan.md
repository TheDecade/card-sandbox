# Card Game Sandbox — Development Plan

Companion to [brief.md](brief.md). Section numbers below follow the 20 points requested in brief §23.

---

## 0. Key decisions at a glance

| Topic | Decision |
|---|---|
| Platform | Touch-first **PWA**, installed on iPad via Safari *Add to Home Screen*. Personal use, no App Store. |
| Language / UI | **TypeScript + React**, built with **Vite** |
| Tabletop rendering | **DOM elements with CSS transforms** (no `<canvas>` engine) |
| Gestures | **Custom pointer-events recognizer** (drag / tap / double-tap / long-press) |
| State | **Zustand** stores + **pure reducer functions** for all game changes |
| Persistence | **IndexedDB via Dexie** — cards, image blobs, settings, playtest state, all local on the iPad |
| Backup | Export/Import a single **`.zip`** (JSON + images), via iPad Share sheet / Files |
| Hosting | **GitHub Pages** (or Cloudflare Pages), deployed by GitHub Actions |
| Mac needed? | **No.** MacBook Air optional, only for Safari Web Inspector debugging |

Interpretations of ambiguous brief points are marked **[Decision]** and gathered in §21 for confirmation.

---

## 1. Recommended technology stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | The data model is the heart of this app; types catch zone/instance mistakes early |
| UI framework | React (current stable) | Huge ecosystem, simple mental model, excellent tooling on Windows |
| Build / dev server | Vite | Instant reload, trivial LAN access from the iPad (`--host`) |
| PWA | `vite-plugin-pwa` (Workbox) | Generates manifest + service worker, offline caching, update prompt |
| State | `zustand` + `immer` | Minimal boilerplate, works outside React (persistence, tests), immutable updates |
| Storage | `dexie` (IndexedDB wrapper) | Versioned schema + migrations, reliable blob storage, good Safari track record |
| Validation | `zod` | Validate imported backups and data loaded from storage |
| Dialogs / popovers | `@radix-ui/react-dialog` (+ other Radix primitives as needed) | Accessible, unstyled, focus handling done right, touch-friendly |
| Long list | `@tanstack/react-virtual` | Virtualized Card Edit list for large card counts |
| Zip (backup) | `fflate` | Small, fast, works in the browser |
| Styling | CSS Modules + CSS custom properties | Zero extra tooling; card sizes driven by CSS variables |
| Tests | `vitest`, `@testing-library/react`, `fake-indexeddb`, `fast-check`, `@playwright/test` (WebKit) | See §12 |

No routing library: the app has four screens, handled by a simple `screen` state (standalone PWAs have no browser back button anyway).

## 2. Why this stack fits a touch-first iPad web app developed on Windows

- **Everything runs on Windows**: Node, Vite, VS Code, Chrome DevTools device mode with touch emulation, and **Playwright's WebKit engine** (the same engine as iPad Safari) for automated tests.
- **Zero Apple tooling**: no Xcode, no signing, no provisioning profiles, no 7-day expiry.
- **Fast iteration**: save → hot reload in Chrome; on the iPad, open `http://<pc-ip>:5173` on the same Wi-Fi for instant real-device checks.
- **Deployment = `git push`**: GitHub Actions builds and publishes; the installed app picks up the update.
- **DOM rendering** gives crisp text, native image handling, and easy dialogs; a few hundred cards on screen is far below where DOM performance becomes an issue.
- **Escape hatch**: if a native app is ever wanted, Capacitor can wrap the same code.

## 3. Project architecture

Layered, with dependencies pointing inward only:

```
┌──────────────────────────────────────────────────────────┐
│ features/  (screens & components: Menu, Playtest,         │
│            CardEdit, Options, dialogs)                    │
├──────────────────────────────────────────────────────────┤
│ gestures/  images/  ui/   (touch recognizer, image        │
│                            URLs, shared UI primitives)    │
├──────────────────────────────────────────────────────────┤
│ state/     (Zustand stores: library, playtest, ui)        │
├───────────────────────────┬──────────────────────────────┤
│ domain/  (pure TS: types, │ persistence/ (Dexie DB,       │
│  reducers, rules, shuffle,│  repositories, migrations,    │
│  visibility, invariants)  │  autosave, backup)            │
└───────────────────────────┴──────────────────────────────┘
```

- **`domain/`** has *no* React, no IndexedDB, no DOM. It is pure functions over plain data: fully unit-testable, and reusable later for undo/redo, networking, or scripting.
- **All playtest changes go through one reducer**: `applyCommand(state, command) → state`. The UI never mutates game state directly. This is the single most important extensibility decision:
  - undo/redo = keep a stack of previous states or commands
  - multiplayer = send commands over the network
  - scripting = scripts emit commands
- **Randomness stays outside the reducer**: the store computes a shuffle order and passes it inside the command, so reducers stay deterministic and replayable.
- **Transient UI state** (the card being dragged, open dialogs, the magnified card) lives in component state or a small `uiStore`, and is **never persisted**.

## 4. Recommended UI framework & rendering approach

**React + plain DOM**, with these specifics:

- **Tabletop**: an absolutely positioned container; each canvas card is a `<div>` positioned with `transform: translate3d(x, y, 0) rotate(0|90deg)` (GPU-composited, smooth dragging).
- **Drag layer**: while dragging, the card is rendered in a top-level overlay layer that follows the finger, so it can travel between zones (deck → hand → canvas) without re-parenting DOM mid-gesture.
- **Hit-testing on drop**: zones register their rectangles; on release, the drop point is tested against the zones in priority order (dialog-triggering zones first: deck, graveyard, exile, hand, then canvas).
- **Card rendering**: a single `CardView` component used everywhere (canvas, hand, dialogs, magnified, editor preview), sized by a `--card-w` CSS variable, with **container queries** scaling the text so the same layout works at all sizes. Aspect ratio is fixed (63:88, standard playing card).
- **Animations**: CSS transitions (tap rotation, snap-back on cancelled drop, flip on reveal). Add a motion library only if needed.

## 5. Data model / schema

### 5.1 Card library (persistent, independent of any playtest)

```ts
// domain/cards/types.ts
export type CardId = string;   // crypto.randomUUID()
export type ImageId = string;

export interface CardDefinition {
  id: CardId;               // generated once, never edited
  name: string;
  cost: string;             // [Decision] text, not number: allows "3", "X", "2R", "—"
  description: string;
  imageId: ImageId | null;  // reference into the image library, never a copy
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  extra?: Record<string, unknown>; // future custom properties, without a schema change
}

// domain/images/types.ts
export interface ImageAsset {
  id: ImageId;
  name: string;             // original file name, for the picker
  mime: string;             // image/jpeg | image/png
  width: number;
  height: number;
  blob: Blob;               // downscaled full image (long edge ≤ 1200 px)
  thumb: Blob;              // small thumbnail (long edge ≤ 256 px) for lists and pickers
  createdAt: number;
}
```

### 5.2 Playtest (card instances and zones)

```ts
// domain/playtest/types.ts
export type InstanceId = string;
export type PlayerId = number;                 // 0-based index; displayed as "Player N+1"
export type ZoneId = 'deck' | 'hand' | 'canvas' | 'graveyard' | 'exile';
export type CounterColorId = string;           // keys of COUNTER_COLORS

export interface Vec2 { x: number; y: number } // normalized 0..1 within the canvas rect (card centre)

export interface CardInstance {
  id: InstanceId;
  definitionId: CardId;     // reference to the definition — edits to the card show up live
  ownerId: PlayerId;
  zone: ZoneId;             // kept in sync with PlayerState.zones by moveCard only
  position: Vec2 | null;    // only when zone === 'canvas'
  faceUp: boolean;
  tapped: boolean;
  counters: Partial<Record<CounterColorId, number>>;
}

export interface PlayerState {
  id: PlayerId;
  // Ordered instance ids per zone — the source of truth for membership AND order.
  // deck[0] = top of deck; canvas order = z-order (last = on top); hand order = left to right.
  zones: Record<ZoneId, InstanceId[]>;
}

export interface PlaytestState {
  schemaVersion: number;
  id: string;
  createdAt: number;
  players: PlayerState[];
  instances: Record<InstanceId, CardInstance>;
  currentPlayer: PlayerId;
}
```

**Why positions are normalized (0..1)**: when the iPad rotates between portrait and landscape, cards keep their relative place on the table and never end up off-screen.

### 5.3 Zone rules (data-driven, easy to extend with new zones)

```ts
// domain/playtest/zones.ts
export interface ZoneRule {
  faceUp: boolean;          // face state forced on entering the zone
  ordered: boolean;
  keepsTapped: boolean;
  keepsCounters: boolean;
  hasPosition: boolean;
}

export const ZONE_RULES: Record<ZoneId, ZoneRule> = {
  deck:      { faceUp: false, ordered: true, keepsTapped: false, keepsCounters: false, hasPosition: false },
  hand:      { faceUp: true,  ordered: true, keepsTapped: false, keepsCounters: true,  hasPosition: false },
  canvas:    { faceUp: true,  ordered: true, keepsTapped: true,  keepsCounters: true,  hasPosition: true  },
  graveyard: { faceUp: true,  ordered: true, keepsTapped: false, keepsCounters: true,  hasPosition: false },
  exile:     { faceUp: true,  ordered: true, keepsTapped: false, keepsCounters: true,  hasPosition: false },
};
```

**[Decision]** Counters are removed when a card goes into the deck, because a face-down card carrying counters would reveal which card it is. Counters are kept in all other zones. Tapped status resets when a card leaves the canvas.

### 5.4 Counter colors (registry)

```ts
// domain/counters/colors.ts
export const COUNTER_COLORS = [
  { id: 'red',    label: 'Red',    hex: '#e5484d' },
  { id: 'blue',   label: 'Blue',   hex: '#3e63dd' },
  { id: 'green',  label: 'Green',  hex: '#30a46c' },
  { id: 'yellow', label: 'Yellow', hex: '#f5d90a' },
  { id: 'purple', label: 'Purple', hex: '#8e4ec6' },
  { id: 'white',  label: 'White',  hex: '#f0f0f0' },
] as const;
// Adding a color = adding a line here. Stored counters reference ids, so unknown ids are ignored safely.
```

### 5.5 Settings

```ts
export interface Settings {
  schemaVersion: number;
  playerCount: number;       // MIN_PLAYERS..MAX_PLAYERS
  lastBackupAt: number | null;
}
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;  // [Decision] a constant: raising it is a one-line change
```

### 5.6 Hidden information

Components never read `CardInstance` + `CardDefinition` directly. They go through one selector:

```ts
// domain/playtest/visibility.ts
export type VisibleCard =
  | { kind: 'hidden'; instanceId: InstanceId }
  | { kind: 'revealed'; instanceId: InstanceId; def: CardDefinition; tapped: boolean;
      counters: CardInstance['counters'] };

export function viewCard(state: PlaytestState, lib: CardLibrary, id: InstanceId): VisibleCard {
  const inst = state.instances[id];
  if (!inst.faceUp) return { kind: 'hidden', instanceId: id };
  return { kind: 'revealed', instanceId: id, def: lib.get(inst.definitionId)!,
           tapped: inst.tapped, counters: inst.counters };
}
```

The deck component only ever receives a **count**, and the top card while it's being dragged is shown as a card back until it's dropped. So a face-down card's identity can't leak through the UI.

## 6. State-management architecture

Three Zustand stores:

| Store | Contents | Persisted |
|---|---|---|
| `libraryStore` | card definitions (`Map<CardId, CardDefinition>`), image metadata, settings | yes (per record) |
| `playtestStore` | `PlaytestState` | yes (single record, debounced) |
| `uiStore` | current screen, open dialog, magnified card, active drag, toasts | no |

### 6.1 Playtest commands (pure reducer)

```ts
// domain/playtest/commands.ts
export type ZoneTarget =
  | { zone: 'canvas'; position: Vec2 }
  | { zone: 'hand'; index?: number }             // insertion index, default = end
  | { zone: 'deck'; placement: 'top' | 'bottom' }
  | { zone: 'graveyard' | 'exile' };

export type PlaytestCommand =
  | { type: 'moveCard'; instanceId: InstanceId; to: ZoneTarget }   // same owner's zones in MVP
  | { type: 'moveOnCanvas'; instanceId: InstanceId; position: Vec2 } // also brings to front
  | { type: 'toggleTapped'; instanceId: InstanceId }
  | { type: 'changeCounters'; instanceId: InstanceId; color: CounterColorId; delta: number }
  | { type: 'setDeckOrder'; playerId: PlayerId; order: InstanceId[] } // shuffle result
  | { type: 'selectPlayer'; playerId: PlayerId }
  | { type: 'addPlayers'; players: PlayerState[]; instances: CardInstance[] }
  | { type: 'removePlayersFrom'; playerId: PlayerId };

export function applyCommand(s: PlaytestState, c: PlaytestCommand): PlaytestState { /* immer produce */ }
```

`moveCard` does everything in one place: it removes the id from the old zone array, inserts it into the new one, and applies the `ZONE_RULES` (face state, tapped, counters, position). Counters are clamped at ≥ 0, and a color whose count reaches 0 is deleted.

### 6.2 Invariants (checked in tests and on load)

```ts
// domain/playtest/invariants.ts — returns a list of violations
// 1. every instance appears in exactly one zone array of its owner
// 2. instance.zone matches the array it is in
// 3. position !== null  ⇔  zone === 'canvas'
// 4. faceUp matches ZONE_RULES[zone].faceUp
// 5. tapped only on canvas; counters all > 0
// 6. total instances per player never changes (a card never disappears or duplicates)
```

On load, if a violation is found the app repairs what it can (for example, orphaned instances go to the graveyard) and shows a toast instead of crashing.

### 6.3 Dragging performance

While a finger is moving, the position lives only in the drag layer (a ref plus a CSS transform). **No store updates at 60 fps.** The store gets exactly one command when the card is dropped.

## 7. Persistence strategy

### 7.1 Database (Dexie)

```ts
// persistence/db.ts
export class SandboxDB extends Dexie {
  cards!:  Table<CardDefinition, CardId>;
  images!: Table<ImageAsset, ImageId>;
  kv!:     Table<{ key: string; value: unknown }, string>; // 'settings', 'playtest'
  constructor() {
    super('card-sandbox');
    this.version(1).stores({
      cards:  'id, name, enabled, createdAt',
      images: 'id, createdAt',
      kv:     'key',
    });
  }
}
```

### 7.2 When data is written

- **Cards / images**: written immediately on Save or Import (they're rare, explicit actions).
- **Playtest state**: the store subscription writes it **debounced 300 ms** as one record. It's small: even 4 players × 200 cards is only tens of KB of JSON.
- **Flush on `visibilitychange` (hidden) and `pagehide`**: iPadOS can kill a backgrounded PWA without warning, so any pending write is committed as soon as the app goes into the background.
- **Settings**: written immediately.

### 7.3 Startup

1. Open the database and run Dexie migrations.
2. Load settings, card definitions and image *metadata*. Image blobs load lazily, when displayed.
3. Load the playtest. Validate it with zod plus the invariants, and migrate its `schemaVersion` if needed.
4. Call `navigator.storage.persist()`. Show the result in Options, along with the storage in use (`navigator.storage.estimate()`).

### 7.4 Images in the UI

`useImageUrl(imageId, 'thumb' | 'full')` creates an object URL from the blob and caches it with reference counting, revoking it when nothing uses it anymore. This avoids leaking memory in long sessions.

### 7.5 Backup format

`card-sandbox-YYYY-MM-DD.zip`:

```
manifest.json   { format: "card-sandbox-backup", schemaVersion, exportedAt,
                  settings, cards: CardDefinition[], images: ImageMeta[], playtest?: PlaytestState }
images/<imageId>.jpg|png
images/<imageId>.thumb.jpg
```

- **Export**: build the zip with `fflate`. Then `navigator.share({ files: [zip] })`, which opens the Share sheet so you can *Save to Files*, with a download-link fallback on desktop. Record `lastBackupAt`.
- **Import**: file picker → unzip → validate with zod → confirmation dialog ("This will replace all cards, images and the playtest") → clear the database and write in one transaction.
- The main menu shows "Last backup: N days ago" as a gentle reminder.

### 7.6 Schema evolution

Every persisted root carries a `schemaVersion`. Migrations are pure functions `vN → vN+1` in `persistence/migrations.ts`, used both on load and on backup import, so old backups keep working. New optional fields (such as `extra`) need no migration at all.

## 8. Folder / project structure

```
card-sandbox/
├─ index.html                     # viewport + apple-touch meta tags
├─ vite.config.ts                 # react + vite-plugin-pwa
├─ tsconfig.json
├─ package.json
├─ .github/workflows/deploy.yml   # build + publish to GitHub Pages
├─ public/
│  ├─ icons/ (192, 512, maskable)  apple-touch-icon.png
│  └─ card-back.svg
├─ src/
│  ├─ main.tsx
│  ├─ app/
│  │  ├─ App.tsx                  # screen switch, startup loading, update prompt
│  │  └─ global.css               # tokens, touch/selection suppression
│  ├─ domain/
│  │  ├─ cards/      types.ts  factory.ts
│  │  ├─ images/     types.ts
│  │  ├─ counters/   colors.ts
│  │  ├─ settings/   types.ts
│  │  └─ playtest/   types.ts  zones.ts  commands.ts  reducer.ts
│  │                 setup.ts  shuffle.ts  visibility.ts  invariants.ts
│  ├─ state/         libraryStore.ts  playtestStore.ts  uiStore.ts
│  ├─ persistence/   db.ts  cardsRepo.ts  imagesRepo.ts  kvRepo.ts
│  │                 autosave.ts  migrations.ts  schemas.ts (zod)
│  │                 backup/ exportBackup.ts  importBackup.ts
│  ├─ gestures/      useCardGestures.ts  dropTargets.ts
│  ├─ images/        processImage.ts  useImageUrl.ts
│  ├─ ui/            Button  Dialog  Stepper  Toggle  Toast  ConfirmDialog
│  ├─ features/
│  │  ├─ menu/       MainMenu.tsx
│  │  ├─ playtest/   PlaytestScreen  Tabletop  CanvasZone  DeckZone  PileZone
│  │  │              HandZone  PlayerNav  CardView  DragLayer
│  │  │              dialogs/ DeckDialog  DropOnDeckDialog  PileListDialog
│  │  │                       CounterDialog  MagnifiedCard
│  │  ├─ cardEdit/   CardEditScreen  CardListItem  CardEditorDialog  ImagePicker
│  │  └─ options/    OptionsScreen  BackupSection
│  └─ lib/           id.ts  random.ts  debounce.ts
└─ tests/
   ├─ unit/          (next to sources as *.test.ts is also fine)
   └─ e2e/           playtest.spec.ts  cardEdit.spec.ts  persistence.spec.ts
```

## 9. Major application components

### Main Menu
Large buttons: **Playtest** (shows "Resume" if one is in progress), **Card Edit**, **Options**, **Reset Playtest** (red, with a confirmation dialog). Also shows the last-backup reminder.

### Playtest screen: layout

```
Landscape                                           Portrait
┌───────────────────────────────────────────┐      ┌──────────────────────┐
│[Grave][Exile]        Player 2        [≡]  │      │[Grave][Exile] P2 [≡] │
│┌──────┐                                   │      │┌──────┐              │
││ DECK │                                   │      ││ DECK │              │
││  37  │         CANVAS (free table)       │      │└──────┘              │
│└──────┘                                   │      │                      │
│                                           │      │       CANVAS         │
├───────────────────────────────────────────┤      │                      │
│ ◀ │  [c][c][c][c][c]  HAND  (scrolls)  │ ▶ │      ├──────────────────────┤
└───────────────────────────────────────────┘      │◀│ [c][c][c] HAND   │▶│
                                                   └──────────────────────┘
```

- **[Decision]** Graveyard and Exile are two small labelled rectangles side by side directly **above** the deck, all in the top-left. They are visually distinct (different color and icon), each with a count badge.
- **Deck**: a card back with a count badge. When empty it becomes a dashed outline labelled "Empty", which still accepts drops.
- **Hand**: a horizontal strip that scrolls sideways if it overflows. Cards overlap slightly as the hand grows.
- **Player nav**: big ◀ ▶ buttons (≥ 60 pt) in the bottom corners. The player label sits top centre. Switching players changes only `currentPlayer`; every player's state is untouched.
- **[≡]** opens a small menu: Back to Main Menu, Reset Playtest.

### Gesture recognizer (`useCardGestures`)

One state machine per pointer, shared by every card:

| Input | Result |
|---|---|
| Move > 8 px before 450 ms | **Drag** (cancels long-press and tap) |
| Held still ≥ 450 ms | **Long-press** → Counter dialog (with a short "grow" animation as feedback) |
| Release < 450 ms, no movement | **Tap**. On the canvas, wait 280 ms for a second tap. In the hand and in lists, magnify immediately (they have no double-tap action). |
| Second tap within 280 ms, ≤ 30 px apart | **Double-tap** → toggle tapped (canvas only) |

Only one active drag at a time: extra fingers are ignored. Apple Pencil is treated the same as a finger.

### Drop behaviour (brief §7.1: "exact behaviour should be defined")

| Dropped on | Result |
|---|---|
| Canvas | Placed where released, face-up, brought to front. Stays tapped if it was already on the canvas. |
| Hand | Inserted at the position nearest the release point, face-up, untapped |
| Graveyard / Exile | Added to that pile, face-up, untapped. The pile flashes and its count updates. |
| Deck | Dialog: **Place on Top / Place on Bottom / Cancel**. The card becomes face-down and loses its counters. Cancel returns it to where it came from. |
| Deck (card just drawn from this deck) | Treated as a cancel: the card goes back on top, with no dialog |
| Outside any valid area | Snaps back to its origin with an animation |

A card drawn from the deck shows its **back while being dragged** and flips face-up when dropped on the hand, canvas, graveyard or exile.

### Dialogs
- **DeckDialog**: *Shuffle Deck* (plus a short "Shuffled" feedback), Cancel.
- **PileListDialog** (Graveyard/Exile): a scrolling list with a thumbnail, name and cost per card. Tap = magnify. **[Decision]** Each entry also has a **Move to…** button (Hand, Canvas, Deck top/bottom, the other pile), because otherwise cards could never come back out of a pile. Dragging directly out of the list is postponed until after the MVP.
- **CounterDialog**: a stepper (default 1, range 1–99, big − / + buttons) and color swatches (≥ 48 pt, the selected one highlighted), then **Add** / **Remove** / **Cancel**. The card's current counters are shown at the top.
- **MagnifiedCard**: a full-screen dimmed backdrop with the card at about 80% of the screen height. Tapping anywhere closes it. It also shows the counters and tapped status.

### Counters on cards
Small colored circles with the count inside, in a row along the **lower edge of the art area**, so they cover neither the name/cost header nor the description text. If there are more than 4 colors the row compresses. Counters are shown on canvas and hand cards and in the magnified view.

### Card Edit screen
- A virtualized list (or grid) with a thumbnail, name, cost and an enabled indicator (disabled cards are dimmed with a "Disabled" tag). Filter chips for All / Enabled / Disabled are cheap to add and useful.
- A floating **+ Add New Card** button creates an unsaved draft with a fresh id and opens the editor. **Discard** throws the draft away and nothing is written.
- **CardEditorDialog**: a live `CardView` preview; a read-only ID (short form, tap to copy); Image, Name, Cost, Description and an Enabled toggle; **Save** / **Discard** (asks for confirmation only if something changed).
- **ImagePicker**: a grid of library thumbnails, plus "No image" and **Import Images** (`<input type="file" accept="image/*" multiple>`, which offers Photos, Files and the camera). Images you import are selected immediately.

Editing a card while a playtest is running updates it live on the table, because instances reference the definition. Enabling or disabling a card only affects decks built at the next reset (see §21).

### Options
- **Number of players**: a stepper from `MIN_PLAYERS` to `MAX_PLAYERS`. **[Decision]** When a playtest is in progress:
  - **More players**: new players are added, each with a freshly built and shuffled deck. Existing players are untouched.
  - **Fewer players**: a confirmation ("Player 4's table, hand and cards will be discarded"), then the highest-numbered players are removed. If the player being viewed was removed, the view moves to Player 1.
- **Backup**: Export, Import, "Last backup…".
- **Storage**: whether storage is persistent, and space used.
- **About**: app version (the build hash), useful for checking that updates arrived.

### Image processing (`processImage.ts`)
Decode the image (`createImageBitmap`, falling back to `<img>.decode()` for HEIC files from the Files app), then:
- downscale so the long edge is at most 1200 px
- save as JPEG at quality 0.85, or PNG if the image has transparency
- create a 256 px thumbnail as well

This keeps storage and memory use small and predictable.

## 10. Implementation phases

| Phase | Goal | Contents |
|---|---|---|
| **P0 — Pipeline** | Prove deployment before writing features | Vite + React + TS scaffold, PWA plugin, icons, GitHub Actions → Pages, install on the iPad, check it works offline, update prompt |
| **P1 — Touch spike** | Remove the biggest risk first | One tabletop with 3 dummy cards: drag, tap, double-tap, long-press recognizer; Safari gesture suppression; tested **on the iPad** |
| **P2 — Domain core** | Rules without UI | Types, zone rules, reducer, setup, shuffle, visibility, invariants, plus full unit and property tests |
| **P3 — Library & persistence** | Real data | Dexie DB, repositories, library store, Card Edit list and editor, image import/processing, image picker |
| **P4 — Playtest table** | Main feature | Layout, deck/hand/canvas/piles, drag between zones, drop rules, deck dialogs, playtest autosave and restore |
| **P5 — Interactions** | Complete the brief | Magnify, tap/untap, counters, pile list dialogs with Move to…, player navigation, Options player count, Reset Playtest |
| **P6 — Backup & polish** | Safety and feel | Export/Import, backup reminder, animations, empty states, portrait/landscape tuning, update toast |
| **P7 — Hardening** | MVP release | E2E suite, pass through the on-device checklist, fuzz tests, fixes |

## 11. Development milestones (each ends with a check on the iPad)

- **M1: "Hello iPad".** The installed PWA opens full-screen offline; pushing to `main` updates it. *(P0)*
- **M2: "Cards feel right".** Dragging is smooth, and double-tap, long-press and tap are never confused; no zooming, scrolling or text selection gets in the way. *(P1)*
- **M3: "Card designer".** Create, edit, enable and disable cards with imported images. Everything survives force-quitting the app. *(P2–P3)*
- **M4: "First playtest".** Build decks, draw, play to the canvas and hand, drop onto the piles and the deck. The state survives force-quitting. *(P4)*
- **M5: "Feature-complete MVP".** All interactions in the brief work, for multiple players, and Reset works. *(P5)*
- **M6: "Safe to rely on".** Backups can be exported and imported; the test suite passes; the on-device checklist passes. *(P6–P7)*

## 12. Testing strategy

| Level | Tool | What |
|---|---|---|
| Unit | Vitest | Reducer (every command, every zone transition), zone rules, shuffle (it's a permutation, and it's uniform enough), setup/reset, visibility (hidden cards never expose `def`), migrations, zod schemas |
| Property-based | fast-check | Random sequences of 1,000 commands → the invariants in §6.2 always hold, and no card is ever lost or duplicated |
| Persistence | Vitest + `fake-indexeddb` | Save/load round trips, migrations, recovery from corrupted records, backup export → import gives identical data |
| Component | Testing Library | Dialogs (counter maths, confirmations), editor Save/Discard behaviour |
| End-to-end | Playwright **WebKit**, iPad device profile, `hasTouch` | Create a card → start a playtest → draw → play → counters → reload → state restored; reset flow; player switching. **Runs on Windows.** |
| On device | Manual checklist (`tests/device-checklist.md`) | Gestures, rotation, force-quit and reopen, offline, update, Share-sheet export, Photos/Files import, low storage |

CI (GitHub Actions) runs the unit, property and E2E tests on every push; deployment happens only if they pass.

## 13. iPad / Safari-specific considerations

**Install and storage**
- ⚠️ **A Home Screen web app has its own storage, separate from Safari tabs.** Data created in a Safari tab won't appear in the installed app. Install first and use only the installed app. (Or export from Safari and import into the app.)
- Home Screen apps are exempt from Safari's 7-day storage deletion. Deleting the app icon, or clearing website data in Settings, **deletes all data**, hence the backups.
- Target **iPadOS 17 or later** (see §21, *to confirm*).

**Required HTML/CSS**
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
```
```css
html, body { height: 100dvh; overflow: hidden; overscroll-behavior: none; }
body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
       -webkit-tap-highlight-color: transparent; }
.tabletop, .card { touch-action: none; }         /* we handle every gesture ourselves */
button, .dialog  { touch-action: manipulation; } /* no double-tap zoom delay */
input, textarea  { -webkit-user-select: text; user-select: text; } /* editing still works */
```
Also cancel Safari's `gesturestart` event, which fires on pinch, so the page can't be zoomed. Use `env(safe-area-inset-*)` padding so nothing sits under the rounded corners or the Home indicator.

**Behaviour**
- Pointer Events cover both fingers and Apple Pencil; call `setPointerCapture` on drag start so the drag isn't lost when the finger leaves the element.
- The manifest uses `display: standalone` and `orientation: any`. Recalculate zone rectangles when the screen rotates or resizes.
- iPadOS may kill a backgrounded PWA without notice, hence the flush on `visibilitychange` (§7.2).
- Split View and Stage Manager can make the window very narrow: set a minimum layout, with a smaller card size variable at narrow widths.
- Touch targets are at least 44 pt everywhere, and 60 pt for the player arrows and the main dialog buttons.
- Text fields: iPad Safari zooms into inputs smaller than 16 px, so use at least 16 px in the editor.

## 14. Hosting, deployment and the MacBook Air

**Hosting.** Use a GitHub repository (it can be private if your plan allows Pages for private repos; otherwise use Cloudflare Pages, which deploys private repos for free) and a GitHub Actions workflow:
`npm ci → npm test → npm run build → deploy dist/`. The URL isn't advertised, and it's for your use only.

**Development on the iPad.** Run `npm run dev -- --host`, then open `http://<pc-lan-ip>:5173` in Safari on the same Wi-Fi. Hot reload works. The service worker doesn't run here (plain HTTP), which is fine for checking layout and gestures. Test offline behaviour and installing using the deployed site.

**Installing.** Open the deployed URL in Safari → Share → **Add to Home Screen**. You do this once.

**Updates.** Using `vite-plugin-pwa` in `prompt` mode: when a new version is detected, a toast says "Update available — Reload". It never reloads by itself mid-game (the state is saved anyway). The build version is shown in Options.

**The MacBook Air is not required.** It's optionally useful for:
- **Safari Web Inspector**, to debug the installed PWA on the iPad over USB/Wi-Fi: console, network, IndexedDB contents, performance. This is the best tool when a bug happens only on the device.
- A Windows-only alternative: a built-in debug overlay (**Eruda**, loaded only when the URL contains `?debug`) that shows the console and storage right on the iPad.

## 15. Recommended libraries / packages

**Runtime**
- `react`, `react-dom`
- `zustand`, `immer`
- `dexie` (optionally `dexie-react-hooks`)
- `zod`
- `@radix-ui/react-dialog` (and other Radix primitives only when needed)
- `@tanstack/react-virtual`
- `fflate`

**Dev**
- `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`, `typescript`
- `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `fake-indexeddb`, `fast-check`
- `@playwright/test`
- `eslint` + `typescript-eslint`, `prettier`
- `eruda` (debug builds only, loaded dynamically)

**Deliberately not used**
- **A canvas/game engine (Pixi, Konva, Phaser).** It's unnecessary at this scale and makes text, images and dialogs harder.
- **dnd-kit / react-dnd.** They're built for lists and sortable items. A free-form table with custom drop rules is simpler with a custom recognizer.
- **A router or CSS framework.** Not needed for four screens.
- **localStorage.** It's too small and synchronous, and has no blob support.

## 16. Technical risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Gestures get confused (tap / double-tap / long-press / drag), or clash with Safari's own gestures | Tackle it first (P1 spike on a real iPad); one custom state machine; tunable thresholds in one config file; CSS/`gesturestart` suppression |
| 2 | **Data loss** (app deleted, website data cleared, storage evicted) | Home Screen install, `storage.persist()`, one-tap zip backup, "last backup" reminder, confirmation before any destructive import or reset |
| 3 | Data created in a Safari tab doesn't appear in the installed app (separate storage) | Documented in the on-device checklist; the app detects when it runs in a browser tab (`display-mode: standalone` media query) and shows a banner suggesting to install it |
| 4 | Safari quirks with IndexedDB blobs | Dexie; test image storage on the device in P3; fallback of storing an `ArrayBuffer` instead of a `Blob` behind the repository interface |
| 5 | Memory pressure from many or large images | Downscale on import, use thumbnails in lists, hand and deck, load full-size only for the magnified view and the editor, revoke object URLs |
| 6 | Slow dragging | Transforms only, no store writes during a drag, `will-change: transform` on the dragged card, memoized `CardView` |
| 7 | Card list grows large | Virtualized list, thumbnails, indexed Dexie queries |
| 8 | Stale service worker keeps an old version running | Prompt-based updates, build version shown in Options, the HTML is never cached by the CDN |
| 9 | Data format changes break saved data or old backups | `schemaVersion` everywhere, migrations, zod validation, tests with sample data from each version |
| 10 | Game state becomes inconsistent (a card lost or duplicated) | Single reducer path, invariants checked on load, property-based fuzz tests |
| 11 | Hidden information leaks | `viewCard` selector is the only way to read card content; the deck UI gets only counts; unit test for it |
| 12 | Card positions go wrong after rotating the screen | Normalized coordinates, clamped so cards stay inside the canvas |

## 17. Suggested MVP scope

Everything in the brief, plus the items this plan adds (Export/Import and Move to…):

- Main menu with Playtest / Card Edit / Options / Reset Playtest (with confirmation)
- Card library: create (auto ID), edit, enable/disable, Save/Discard, live preview
- Image library: multi-image import from Photos/Files, downscaling, a shared library referenced by id, a picker
- Options: number of players (1–4) with the in-progress behaviour from §9
- Playtest:
  - a separate table for each player
  - deck, hand, canvas, graveyard, exile
  - player switching
- Drag from the deck, and between every zone, with the drop rules from §9
- Deck: tap to shuffle; drop on it for Top/Bottom/Cancel, face-down
- Double-tap to tap/untap (canvas); single tap to magnify (canvas, hand, pile lists)
- Counters: long-press dialog with amount and color, per instance
- Pile list dialogs with thumbnails and Move to…
- Full autosave and restore of the playtest; reset rebuilds from the enabled cards
- Export/Import backup (zip) via the Share sheet and file picker
- Installable, offline, update prompt

## 18. Postponed until after the MVP

- Undo/redo (the command architecture is ready for it)
- Dragging cards directly out of the pile list dialogs
- Deleting cards and deleting unused images (the brief has no delete; deleting later needs a decision about instances in play)
- Search and filtering beyond the simple enabled/disabled filter
- Multiple copies of a card per deck, multiple decks, deck building
- Tokens, card types, custom properties UI (the data model already has an `extra` field), abilities, scripting
- Face-down cards on the canvas (the model already supports `faceUp`)
- Moving cards between players; a shared/neutral zone; custom zones (zone rules are already data-driven)
- Pan/zoom on the tabletop
- Several saved playtests or save slots
- Merging or partially importing card databases; syncing between devices; networked multiplayer
- Card rotation other than tapping; grouping and stacking cards

## 19. Recommended implementation order

1. Scaffold Vite + React + TS, ESLint/Prettier, Vitest; set up `global.css` touch rules.
2. PWA plugin, icons, manifest; GitHub Actions → Pages; **install on the iPad and check offline and updates** (M1).
3. **Gesture spike**: `useCardGestures` + `DragLayer` + 3 dummy cards; tune on the iPad (M2).
4. `domain/`: types → zone rules → reducer (`moveCard` first) → shuffle/setup → visibility → invariants, with unit and property tests at each step.
5. `persistence/`: Dexie DB, repositories, zod schemas, migration framework (v1).
6. `libraryStore` + Card Edit list + `CardView` + editor (no images yet).
7. Image pipeline: `processImage` → images repository → `useImageUrl` → ImagePicker + Import (M3).
8. `playtestStore` + autosave/flush + startup restore.
9. Playtest layout: zones, hand, player navigation (display only).
10. Wire the gestures into the real zones: draw from the deck, dropping between zones, the Top/Bottom dialog, snap-back (M4).
11. Deck dialog (shuffle), pile list dialogs with Move to…, magnified view.
12. Double-tap to tap/untap, counters dialog and counter badges.
13. Options: player count behaviour; Reset Playtest flow (M5).
14. Export/Import backup, last-backup reminder, storage info, the "install me" banner in browser tabs.
15. Animations, empty states, portrait/Split View tuning, update toast.
16. Playwright E2E suite, on-device checklist, bug fixes (M6).

## 20. Example code for key pieces

### Deck creation and shuffle

```ts
// lib/random.ts — unbiased random integer from crypto
export function randomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % maxExclusive;
}

// domain/playtest/shuffle.ts — Fisher–Yates, returns a new array
export function shuffled<T>(items: readonly T[], rand = randomInt): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// domain/playtest/setup.ts
export function createPlayer(playerId: PlayerId, enabled: CardDefinition[], rand = randomInt) {
  const instances: CardInstance[] = enabled.map(def => ({
    id: newId(), definitionId: def.id, ownerId: playerId, zone: 'deck',
    position: null, faceUp: false, tapped: false, counters: {},
  }));
  const player: PlayerState = {
    id: playerId,
    zones: { deck: shuffled(instances.map(i => i.id), rand),
             hand: [], canvas: [], graveyard: [], exile: [] },
  };
  return { player, instances };
}

export function createPlaytest(playerCount: number, cards: CardDefinition[]): PlaytestState {
  const enabled = cards.filter(c => c.enabled);
  const created = Array.from({ length: playerCount }, (_, p) => createPlayer(p, enabled));
  return {
    schemaVersion: PLAYTEST_SCHEMA_VERSION, id: newId(), createdAt: Date.now(),
    players: created.map(c => c.player),
    instances: Object.fromEntries(created.flatMap(c => c.instances).map(i => [i.id, i])),
    currentPlayer: 0,
  };
}
// Reset Playtest = replace state with createPlaytest(settings.playerCount, library cards).
```

### The central move

```ts
// domain/playtest/reducer.ts (inside immer `produce`)
function moveCard(draft: PlaytestState, id: InstanceId, to: ZoneTarget) {
  const inst = draft.instances[id];
  const zones = draft.players[inst.ownerId].zones;

  // 1. remove from the current zone
  const from = zones[inst.zone];
  from.splice(from.indexOf(id), 1);

  // 2. insert into the target zone
  const target = zones[to.zone];
  if (to.zone === 'deck') to.placement === 'top' ? target.unshift(id) : target.push(id);
  else if (to.zone === 'hand' && to.index !== undefined) target.splice(to.index, 0, id);
  else target.push(id); // canvas: push = on top of z-order

  // 3. apply zone rules
  const rule = ZONE_RULES[to.zone];
  inst.zone = to.zone;
  inst.faceUp = rule.faceUp;
  inst.position = to.zone === 'canvas' ? clampToCanvas(to.position) : null;
  if (!rule.keepsTapped) inst.tapped = false;
  if (!rule.keepsCounters) inst.counters = {};
}
```

### Playtest store with autosave

```ts
// state/playtestStore.ts
export const usePlaytest = create<PlaytestStoreState>()((set, get) => ({
  state: null as PlaytestState | null,
  dispatch: (cmd: PlaytestCommand) => set(s => ({ state: applyCommand(s.state!, cmd) })),
  shuffleDeck: (playerId: PlayerId) => {
    const deck = get().state!.players[playerId].zones.deck;
    get().dispatch({ type: 'setDeckOrder', playerId, order: shuffled(deck) });
  },
  reset: (playerCount: number, cards: CardDefinition[]) =>
    set({ state: createPlaytest(playerCount, cards) }),
}));

// persistence/autosave.ts
export function startAutosave() {
  const save = debounce((s: PlaytestState) => kvRepo.put('playtest', s), 300);
  usePlaytest.subscribe(({ state }) => state && save(state));
  const flush = () => save.flush();
  document.addEventListener('visibilitychange', () => document.hidden && flush());
  window.addEventListener('pagehide', flush);
}
```

### Card editor draft (Save / Discard)

```ts
// features/cardEdit/CardEditorDialog.tsx (sketch)
const [draft, setDraft] = useState<CardDefinition>(() => existing ?? newCardDefinition());
const dirty = !shallowEqual(draft, existing ?? initialNew);
const save = async () => { await library.upsertCard({ ...draft, updatedAt: Date.now() }); close(); };
const discard = () => (dirty ? confirm('Discard changes?', close) : close());

// domain/cards/factory.ts
export const newCardDefinition = (): CardDefinition => ({
  id: crypto.randomUUID(), name: 'New Card', cost: '', description: '',
  imageId: null, enabled: true, createdAt: Date.now(), updatedAt: Date.now(),
});
```

### Gesture recognizer skeleton

```ts
// gestures/useCardGestures.ts (sketch)
const T = { dragSlopPx: 8, longPressMs: 450, doubleTapMs: 280, doubleTapSlopPx: 30 };

export function useCardGestures(h: {
  onDragStart(e: PointerEvent): void; onDragMove(e: PointerEvent): void; onDragEnd(e: PointerEvent): void;
  onTap(): void; onDoubleTap?(): void; onLongPress(): void;
}) {
  // pointerdown: capture pointer, record start, start the long-press timer
  // pointermove: if distance > dragSlopPx → clear the timer, mode = 'drag', onDragStart
  // pointerup:   drag → onDragEnd; long-press already fired → nothing;
  //              otherwise tap: if onDoubleTap exists, wait doubleTapMs for a second tap
  //              (→ onDoubleTap), else → onTap; without onDoubleTap → onTap immediately
  // pointercancel: abort everything (an OS gesture took over)
}
```

---

## 21. Decisions to confirm before implementation

These interpret points the brief leaves open. Each is easy to change, but confirming them now avoids rework.

1. **Cost is free text** ("3", "X", "2R") rather than a number.
2. **Counters are removed when a card goes into the deck**, and kept in every other zone. Tapped status resets when a card leaves the canvas.
3. **Changing the player count mid-playtest**: adding players leaves existing ones untouched; removing players asks for confirmation and discards the highest-numbered ones.
4. **Players: 1–4** in the MVP (a constant, easy to raise).
5. **Pile list entries get a "Move to…" button** so cards can come back out of the graveyard or exile.
6. **Editing a card mid-playtest updates it live on the table.** Enabling, disabling or creating cards only affects decks built at the next Reset.
7. **Layout**: Graveyard and Exile side by side directly above the deck, in the top-left.
8. **iPad model and iPadOS version**: please confirm it's iPadOS 17 or later (Settings → General → About).
