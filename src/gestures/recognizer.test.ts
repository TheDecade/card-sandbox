import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GestureRecognizer,
  resetActivePointerForTests,
  type GestureConfig,
  type GestureHandlers,
  type Timers,
} from './recognizer';

const CONFIG: GestureConfig = { dragSlopPx: 8, longPressMs: 450, doubleTapMs: 280, doubleTapSlopPx: 30 };

class FakeTimers implements Timers {
  time = 0;
  private nextId = 1;
  private jobs = new Map<number, { at: number; fn: () => void }>();
  now = () => this.time;
  set = (fn: () => void, ms: number) => {
    const id = this.nextId++;
    this.jobs.set(id, { at: this.time + ms, fn });
    return id;
  };
  clear = (id: unknown) => void this.jobs.delete(id as number);
  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const due = [...this.jobs].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.jobs.delete(due[0]);
      this.time = due[1].at;
      due[1].fn();
    }
    this.time = end;
  }
}

function setup(handlers: GestureHandlers) {
  const timers = new FakeTimers();
  const r = new GestureRecognizer(() => handlers, () => CONFIG, timers);
  const p = (x = 100, y = 100) => ({ x, y });
  return { r, timers, p };
}

const allHandlers = () => ({
  onTap: vi.fn(),
  onDoubleTap: vi.fn(),
  onLongPress: vi.fn(),
  onDragStart: vi.fn(),
  onDragMove: vi.fn(),
  onDragEnd: vi.fn(),
  onDragCancel: vi.fn(),
  onPressChange: vi.fn(),
});

beforeEach(resetActivePointerForTests);

describe('tap', () => {
  it('fires immediately when there is no double-tap handler', () => {
    const h = { onTap: vi.fn() };
    const { r, timers, p } = setup(h);
    r.down(1, p());
    timers.advance(100);
    r.up(1, p(103, 101)); // small jitter stays a tap
    expect(h.onTap).toHaveBeenCalledWith({ point: p(103, 101), pressMs: 100 });
  });

  it('waits for the double-tap window when a double-tap handler exists', () => {
    const h = allHandlers();
    const { r, timers, p } = setup(h);
    r.down(1, p());
    r.up(1, p());
    expect(h.onTap).not.toHaveBeenCalled();
    timers.advance(279);
    expect(h.onTap).not.toHaveBeenCalled();
    timers.advance(1);
    expect(h.onTap).toHaveBeenCalledOnce();
    expect(h.onDoubleTap).not.toHaveBeenCalled();
  });
});

describe('double-tap', () => {
  it('fires on two quick taps and suppresses the single tap', () => {
    const h = allHandlers();
    const { r, timers, p } = setup(h);
    r.down(1, p());
    timers.advance(60);
    r.up(1, p());
    timers.advance(120);
    r.down(2, p(110, 105));
    timers.advance(60);
    r.up(2, p(110, 105));
    expect(h.onDoubleTap).toHaveBeenCalledWith({ point: p(110, 105), gapMs: 180 });
    timers.advance(1000);
    expect(h.onTap).not.toHaveBeenCalled();
  });

  it('treats two taps far apart as two taps', () => {
    const h = allHandlers();
    const { r, timers, p } = setup(h);
    r.down(1, p(0, 0));
    r.up(1, p(0, 0));
    r.down(2, p(200, 0));
    r.up(2, p(200, 0));
    timers.advance(1000);
    expect(h.onDoubleTap).not.toHaveBeenCalled();
    expect(h.onTap).toHaveBeenCalledTimes(2);
  });

  it('treats taps slower than the window as two taps', () => {
    const h = allHandlers();
    const { r, timers, p } = setup(h);
    r.down(1, p());
    r.up(1, p());
    timers.advance(300);
    r.down(2, p());
    r.up(2, p());
    timers.advance(300);
    expect(h.onDoubleTap).not.toHaveBeenCalled();
    expect(h.onTap).toHaveBeenCalledTimes(2);
  });
});

describe('long-press', () => {
  it('fires after holding still, and nothing fires on release', () => {
    const h = allHandlers();
    const { r, timers, p } = setup(h);
    r.down(1, p());
    expect(h.onPressChange).toHaveBeenLastCalledWith(true);
    timers.advance(449);
    expect(h.onLongPress).not.toHaveBeenCalled();
    timers.advance(1);
    expect(h.onLongPress).toHaveBeenCalledOnce();
    expect(h.onPressChange).toHaveBeenLastCalledWith(false);
    r.move(1, p(200, 200)); // moving after a long-press does not start a drag
    r.up(1, p(200, 200));
    timers.advance(1000);
    expect(h.onTap).not.toHaveBeenCalled();
    expect(h.onDragStart).not.toHaveBeenCalled();
  });

  it('is cancelled by moving before the timeout', () => {
    const h = allHandlers();
    const { r, timers, p } = setup(h);
    r.down(1, p());
    timers.advance(200);
    r.move(1, p(120, 100));
    timers.advance(1000);
    expect(h.onLongPress).not.toHaveBeenCalled();
    expect(h.onDragStart).toHaveBeenCalledOnce();
  });
});

describe('drag', () => {
  it('starts past the slop and reports moves and the end point', () => {
    const h = allHandlers();
    const { r, p } = setup(h);
    r.down(1, p());
    r.move(1, p(105, 100)); // within slop
    expect(h.onDragStart).not.toHaveBeenCalled();
    r.move(1, p(120, 100));
    expect(h.onDragStart).toHaveBeenCalledWith({ start: p(), point: p(120, 100) });
    r.move(1, p(150, 130));
    expect(h.onDragMove).toHaveBeenCalledWith(p(150, 130));
    r.up(1, p(160, 140));
    expect(h.onDragEnd).toHaveBeenCalledWith(p(160, 140));
    expect(h.onTap).not.toHaveBeenCalled();
  });

  it('reports cancel when the system takes over the touch', () => {
    const h = allHandlers();
    const { r, p } = setup(h);
    r.down(1, p());
    r.move(1, p(150, 100));
    r.cancel(1);
    expect(h.onDragCancel).toHaveBeenCalledOnce();
    expect(h.onDragEnd).not.toHaveBeenCalled();
  });

  it('fires nothing when moving on an element without a drag handler', () => {
    const h = { onTap: vi.fn() };
    const { r, p } = setup(h);
    r.down(1, p());
    r.move(1, p(200, 100));
    r.up(1, p(200, 100));
    expect(h.onTap).not.toHaveBeenCalled();
  });

  it('cancels a pending tap when the next press becomes a drag', () => {
    const h = allHandlers();
    const { r, timers, p } = setup(h);
    r.down(1, p());
    r.up(1, p());
    r.down(2, p());
    r.move(2, p(150, 100));
    r.up(2, p(150, 100));
    timers.advance(1000);
    expect(h.onTap).not.toHaveBeenCalled();
    expect(h.onDoubleTap).not.toHaveBeenCalled();
    expect(h.onDragEnd).toHaveBeenCalledOnce();
  });
});

describe('one gesture at a time', () => {
  it('ignores a second finger on another element while one is active', () => {
    const a = allHandlers();
    const b = allHandlers();
    const ra = setup(a);
    const rb = setup(b);
    expect(ra.r.down(1, ra.p())).toBe(true);
    expect(rb.r.down(2, rb.p())).toBe(false);
    rb.r.move(2, rb.p(300, 300));
    rb.r.up(2, rb.p(300, 300));
    expect(b.onDragStart).not.toHaveBeenCalled();
    ra.r.up(1, ra.p());
    expect(rb.r.down(3, rb.p())).toBe(true); // free again after release
  });

  it('frees the app-wide lock on dispose', () => {
    const a = allHandlers();
    const { r, p } = setup(a);
    r.down(1, p());
    r.move(1, p(200, 100));
    r.dispose();
    expect(a.onDragCancel).toHaveBeenCalledOnce();
    const other = setup(allHandlers());
    expect(other.r.down(2, other.p())).toBe(true);
  });
});
