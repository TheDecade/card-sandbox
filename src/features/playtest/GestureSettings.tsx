import { resetGestureConfig, setGestureConfig, useGestureConfig } from '../../gestures/config';
import type { GestureConfig } from '../../gestures/recognizer';
import { Modal } from '../../ui/Modal';

const SLIDERS: { key: keyof GestureConfig; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'longPressMs', label: 'Long-press hold', min: 250, max: 900, step: 25, unit: 'ms' },
  { key: 'doubleTapMs', label: 'Double-tap window', min: 150, max: 500, step: 10, unit: 'ms' },
  { key: 'dragSlopPx', label: 'Drag starts after', min: 3, max: 24, step: 1, unit: 'px' },
  { key: 'doubleTapSlopPx', label: 'Double-tap distance', min: 10, max: 60, step: 2, unit: 'px' },
];

export function GestureSettings({ onClose }: { onClose: () => void }) {
  const config = useGestureConfig();
  return (
    <Modal onClose={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Gesture settings">
        <h3>Gesture settings</h3>
        <p>Remembered on this device.</p>
        <div className="sliders">
          {SLIDERS.map((s) => (
            <label key={s.key} className="slider-row">
              <span>{s.label}</span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={config[s.key]}
                onChange={(e) => setGestureConfig({ [s.key]: Number(e.target.value) })}
              />
              <output>
                {config[s.key]} {s.unit}
              </output>
            </label>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={resetGestureConfig}>
            Defaults
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
