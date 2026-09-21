import { useLayoutEffect, type RefObject } from 'react';

/**
 * Shrinks an element's text (via the --fit CSS variable, a scale factor) until it fits its box,
 * down to `min`. Re-fits when the content or the element's size changes.
 */
export function useFitText(
  ref: RefObject<HTMLElement | null>,
  content: unknown,
  {
    min = 0.5,
    step = 0.07,
    maxLines,
  }: {
    min?: number;
    step?: number;
    /** For line-clamped text: shrink only while it needs more than this many lines. */
    maxLines?: number;
  } = {},
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const overflows = () => {
      if (maxLines) {
        const line = parseFloat(getComputedStyle(el).lineHeight) || 16;
        return el.scrollHeight > (maxLines + 0.5) * line; // glyph metrics make pixel checks unreliable
      }
      return el.scrollHeight > el.clientHeight + 1;
    };
    const fit = () => {
      let scale = 1;
      el.style.setProperty('--fit', '1');
      while (overflows() && scale - step >= min) {
        scale -= step;
        el.style.setProperty('--fit', scale.toFixed(3));
      }
    };
    fit();
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, content, min, step, maxLines]);
}
