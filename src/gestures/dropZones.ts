// Registry of elements that accept dropped cards, and hit-testing against them.
import { useCallback } from 'react';
import type { Point } from './recognizer';

type Zone = { el: HTMLElement; priority: number };
const zones = new Map<string, Zone>();
let hovered: string | null = null;

/**
 * Registers the element as a drop zone. Higher priority wins where zones overlap
 * (e.g. the deck sits on top of the canvas).
 */
export function useDropZone(id: string, priority = 0) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) zones.set(id, { el, priority });
      else if (zones.get(id)) zones.delete(id);
    },
    [id, priority],
  );
}

export function hitTestDropZone(p: Point): string | null {
  let best: { id: string; priority: number } | null = null;
  for (const [id, { el, priority }] of zones) {
    const r = el.getBoundingClientRect();
    const inside = p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    if (inside && (!best || priority > best.priority)) best = { id, priority };
  }
  return best?.id ?? null;
}

/** Highlights the zone under the finger (via a data attribute, so no React re-render). */
export function setDropHover(id: string | null): void {
  if (id === hovered) return;
  if (hovered) zones.get(hovered)?.el.removeAttribute('data-drop-hover');
  if (id) zones.get(id)?.el.setAttribute('data-drop-hover', '');
  hovered = id;
}

export function getDropZoneRect(id: string): DOMRect | null {
  return zones.get(id)?.el.getBoundingClientRect() ?? null;
}
