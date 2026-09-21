import { useEffect, useMemo, useRef, type PointerEvent } from 'react';
import { getGestureConfig } from './config';
import { GestureRecognizer, type GestureHandlers, type Point } from './recognizer';

const pointOf = (e: PointerEvent): Point => ({ x: e.clientX, y: e.clientY });

/**
 * Binds the gesture recognizer to an element. Spread the result onto the element, which must
 * have `touch-action: none` so Safari doesn't claim the touch for scrolling or zooming.
 */
export function useGestures(handlers: GestureHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const recognizer = useMemo(
    () => new GestureRecognizer(() => handlersRef.current, getGestureConfig),
    [],
  );
  useEffect(() => () => recognizer.dispose(), [recognizer]);

  return useMemo(
    () => ({
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (recognizer.down(e.pointerId, pointOf(e))) {
          // Keep receiving moves even when the finger leaves the element.
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId);
          } catch {
            // pointer already gone (or a synthetic test event): the gesture still works in place
          }
        }
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        recognizer.move(e.pointerId, pointOf(e));
      },
      onPointerUp(e: PointerEvent<HTMLElement>) {
        recognizer.up(e.pointerId, pointOf(e));
      },
      onPointerCancel(e: PointerEvent<HTMLElement>) {
        recognizer.cancel(e.pointerId);
      },
      // Fires after every pointerup too; the recognizer is idle by then, so it's a no-op.
      onLostPointerCapture(e: PointerEvent<HTMLElement>) {
        recognizer.cancel(e.pointerId);
      },
    }),
    [recognizer],
  );
}
