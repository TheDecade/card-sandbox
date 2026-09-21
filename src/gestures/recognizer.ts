// Touch gesture recognizer: tells apart tap, double-tap, long-press and drag on one element.
// Pure TypeScript (no DOM, no React) so it can be unit-tested with fake timers.
//
//   press ──move > dragSlop──────────────▶ drag (start / move / end / cancel)
//     │ ──held ≥ longPressMs──────────────▶ long-press
//     └─release──▶ onDoubleTap handler?  no ──▶ tap (immediately)
//                                        yes ─▶ wait doubleTapMs for a 2nd tap ──▶ double-tap
//                                                                     timeout ──▶ tap

export type Point = { x: number; y: number };

export interface GestureConfig {
  dragSlopPx: number; // movement allowed before a press becomes a drag
  longPressMs: number; // hold time for a long-press
  doubleTapMs: number; // max time between the two taps of a double-tap
  doubleTapSlopPx: number; // max distance between the two taps of a double-tap
}

export interface GestureHandlers {
  onTap?: (info: { point: Point; pressMs: number }) => void;
  onDoubleTap?: (info: { point: Point; gapMs: number }) => void;
  onLongPress?: (info: { point: Point }) => void;
  onDragStart?: (info: { start: Point; point: Point }) => void;
  onDragMove?: (point: Point) => void;
  onDragEnd?: (point: Point) => void;
  onDragCancel?: () => void;
  /** True while a press is held that could still become a long-press (for visual feedback). */
  onPressChange?: (pressing: boolean) => void;
}

export interface Timers {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

const browserTimers: Timers = {
  now: () => performance.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

// Only one gesture at a time across the whole app: a second finger is ignored while one is active.
let activePointer: number | null = null;

/** Test helper: forget any pointer left active by a previous test. */
export function resetActivePointerForTests(): void {
  activePointer = null;
}

type State =
  | { kind: 'idle' }
  | { kind: 'pressed'; pointerId: number; start: Point; startTime: number; timer: unknown }
  | { kind: 'dragging'; pointerId: number }
  | { kind: 'longPressed'; pointerId: number }
  // Moved past the slop on an element without a drag handler: nothing fires on release.
  | { kind: 'ignored'; pointerId: number };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export class GestureRecognizer {
  private state: State = { kind: 'idle' };
  private pendingTap: { point: Point; pressMs: number; time: number; timer: unknown } | null = null;

  constructor(
    private readonly getHandlers: () => GestureHandlers,
    private readonly getConfig: () => GestureConfig,
    private readonly timers: Timers = browserTimers,
  ) {}

  /** Returns true when this recognizer takes the pointer; the caller should then capture it. */
  down(pointerId: number, point: Point): boolean {
    if (activePointer !== null || this.state.kind !== 'idle') return false;
    activePointer = pointerId;
    const h = this.getHandlers();
    const timer = h.onLongPress
      ? this.timers.set(() => this.fireLongPress(), this.getConfig().longPressMs)
      : null;
    this.state = { kind: 'pressed', pointerId, start: point, startTime: this.timers.now(), timer };
    if (h.onLongPress) h.onPressChange?.(true);
    return true;
  }

  move(pointerId: number, point: Point): void {
    const s = this.state;
    if (s.kind === 'dragging' && s.pointerId === pointerId) {
      this.getHandlers().onDragMove?.(point);
      return;
    }
    if (s.kind !== 'pressed' || s.pointerId !== pointerId) return;
    if (distance(s.start, point) <= this.getConfig().dragSlopPx) return;

    this.endPress(s);
    this.dropPendingTap(); // a tap followed by a drag is not a double-tap
    const h = this.getHandlers();
    if (h.onDragStart) {
      this.state = { kind: 'dragging', pointerId };
      h.onDragStart({ start: s.start, point });
    } else {
      this.state = { kind: 'ignored', pointerId };
    }
  }

  up(pointerId: number, point: Point): void {
    const s = this.state;
    if (s.kind === 'idle' || s.pointerId !== pointerId) return;
    this.release();
    const h = this.getHandlers();

    if (s.kind === 'dragging') {
      h.onDragEnd?.(point);
      return;
    }
    if (s.kind !== 'pressed') return; // long-press already fired, or ignored

    this.endPress(s);
    const now = this.timers.now();
    const pressMs = now - s.startTime;

    if (!h.onDoubleTap) {
      h.onTap?.({ point, pressMs });
      return;
    }

    const cfg = this.getConfig();
    const pending = this.pendingTap;
    if (pending && distance(pending.point, point) <= cfg.doubleTapSlopPx) {
      this.dropPendingTap();
      h.onDoubleTap({ point, gapMs: now - pending.time });
      return;
    }
    if (pending) this.flushPendingTap(); // too far from the first tap: two separate taps

    this.pendingTap = {
      point,
      pressMs,
      time: now,
      timer: this.timers.set(() => this.flushPendingTap(), cfg.doubleTapMs),
    };
  }

  /** The system took over the touch (pointercancel / lost capture). */
  cancel(pointerId: number): void {
    const s = this.state;
    if (s.kind === 'idle' || s.pointerId !== pointerId) return;
    this.release();
    if (s.kind === 'pressed') this.endPress(s);
    if (s.kind === 'dragging') this.getHandlers().onDragCancel?.();
    this.dropPendingTap();
  }

  /** Abort everything (element unmounted). The recognizer stays usable afterwards. */
  dispose(): void {
    const s = this.state;
    if (s.kind !== 'idle') this.cancel(s.pointerId);
    this.dropPendingTap();
  }

  private fireLongPress(): void {
    const s = this.state;
    if (s.kind !== 'pressed') return;
    this.getHandlers().onPressChange?.(false);
    this.state = { kind: 'longPressed', pointerId: s.pointerId };
    this.dropPendingTap();
    this.getHandlers().onLongPress?.({ point: s.start });
  }

  private endPress(s: Extract<State, { kind: 'pressed' }>): void {
    if (s.timer === null) return;
    this.timers.clear(s.timer);
    this.getHandlers().onPressChange?.(false);
  }

  private release(): void {
    const s = this.state;
    if (s.kind !== 'idle' && activePointer === s.pointerId) activePointer = null;
    this.state = { kind: 'idle' };
  }

  private flushPendingTap(): void {
    const p = this.pendingTap;
    if (!p) return;
    this.dropPendingTap();
    this.getHandlers().onTap?.({ point: p.point, pressMs: p.pressMs });
  }

  private dropPendingTap(): void {
    if (!this.pendingTap) return;
    this.timers.clear(this.pendingTap.timer);
    this.pendingTap = null;
  }
}
