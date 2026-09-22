import { useEffect, useRef, type PointerEvent } from 'react';
import type { Point } from '../../gestures/recognizer';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 2.5;

/** Zoom factor and pan, the pan as a fraction of the canvas size (so it survives resizes). */
export interface CanvasView {
  zoom: number;
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const viewTransform = (v: CanvasView) => `translate(${v.x * 100}%, ${v.y * 100}%) scale(${v.zoom})`;

/**
 * Two-finger pinch to zoom and pan the canvas. The second finger takes over from whatever the
 * first finger was doing (a card drag is cancelled and snaps back). The transform is written
 * straight to the zoom layer's style, so a pinch doesn't re-render the table.
 */
export function useCanvasZoom() {
  const view = useRef<CanvasView>({ zoom: 1, x: 0, y: 0 });
  const canvas = useRef<HTMLElement | null>(null);
  const layer = useRef<HTMLElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ ids: [number, number]; dist: number; mid: Point; view: CanvasView } | null>(null);
  /** True from the start of a pinch until every finger is lifted: other canvas gestures stand down. */
  const pinched = useRef(false);

  const apply = () => {
    if (layer.current) layer.current.style.transform = viewTransform(view.current);
  };

  // Moves and releases are tracked on the window, so a finger lost by an unmounting element
  // can never leave a stale pointer behind.
  useEffect(() => {
    const onMove = (e: globalThis.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = pinch.current;
      const r = canvas.current?.getBoundingClientRect();
      if (!p || !r) return;
      const a = pointers.current.get(p.ids[0]);
      const b = pointers.current.get(p.ids[1]);
      if (!a || !b) return;
      const zoom = clamp((p.view.zoom * dist(a, b)) / p.dist, MIN_ZOOM, MAX_ZOOM);
      // Keep the table point that was under the fingers' midpoint under their current midpoint.
      const m0 = { x: (p.mid.x - r.left) / r.width, y: (p.mid.y - r.top) / r.height };
      const m = mid(a, b);
      const m1 = { x: (m.x - r.left) / r.width, y: (m.y - r.top) / r.height };
      const lx = (m0.x - p.view.x) / p.view.zoom;
      const ly = (m0.y - p.view.y) / p.view.zoom;
      view.current = {
        zoom,
        x: clamp(m1.x - lx * zoom, 1 - zoom, 0),
        y: clamp(m1.y - ly * zoom, 1 - zoom, 0),
      };
      apply();
    };
    const onUp = (e: globalThis.PointerEvent) => {
      if (!pointers.current.delete(e.pointerId)) return;
      if (pinch.current?.ids.includes(e.pointerId)) pinch.current = null;
      if (pointers.current.size === 0) pinched.current = false;
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, []);

  /** Capture-phase pointerdown on the canvas: runs before any card sees the finger. */
  function onPointerDownCapture(e: PointerEvent<HTMLElement>) {
    if (e.pointerType === 'mouse') return;
    const point = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, point);
    if (pinch.current || pointers.current.size !== 2) return;

    // Second finger: start pinching, and keep the card underneath from reacting to it.
    e.stopPropagation();
    const [first] = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)!;
    const firstPoint = pointers.current.get(first)!;
    // Moving capture to the canvas makes the first finger's card lose it, cancelling its gesture.
    for (const id of [first, e.pointerId]) {
      try {
        canvas.current?.setPointerCapture(id);
      } catch {
        // pointer already gone (or a synthetic event): the pinch still works from window moves
      }
    }
    pinched.current = true;
    pinch.current = {
      ids: [first, e.pointerId],
      dist: Math.max(1, dist(firstPoint, point)),
      mid: mid(firstPoint, point),
      view: { ...view.current },
    };
  }

  return {
    view,
    pinched,
    canvasRef: (el: HTMLElement | null) => (canvas.current = el),
    layerRef: (el: HTMLElement | null) => {
      layer.current = el;
      apply(); // the layer remounts on player switch
    },
    onPointerDownCapture,
  };
}
