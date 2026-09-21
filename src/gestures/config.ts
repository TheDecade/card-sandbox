// Gesture timings. Tunable on the device (Gesture settings panel) and remembered in this browser.
import { useSyncExternalStore } from 'react';
import type { GestureConfig } from './recognizer';

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  dragSlopPx: 8,
  longPressMs: 450,
  doubleTapMs: 280,
  doubleTapSlopPx: 30,
};

const STORAGE_KEY = 'card-sandbox.gestures';
const listeners = new Set<() => void>();
let current: GestureConfig = load();

function load(): GestureConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<GestureConfig> | null;
    return { ...DEFAULT_GESTURE_CONFIG, ...saved };
  } catch {
    return { ...DEFAULT_GESTURE_CONFIG };
  }
}

export function getGestureConfig(): GestureConfig {
  return current;
}

export function setGestureConfig(patch: Partial<GestureConfig>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // storage unavailable: the setting just won't be remembered
  }
  listeners.forEach((l) => l());
}

export function resetGestureConfig(): void {
  setGestureConfig(DEFAULT_GESTURE_CONFIG);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useGestureConfig(): GestureConfig {
  return useSyncExternalStore(subscribe, getGestureConfig);
}
