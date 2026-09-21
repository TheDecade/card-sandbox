import { useRef, type ReactNode } from 'react';

/**
 * Dimmed full-screen layer. Closes only when a tap both starts and ends on the backdrop, so the
 * finger lifting after the long-press that opened a dialog can't immediately close it again.
 */
export function Modal({
  onClose,
  children,
  className = 'scrim',
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const downOnBackdrop = useRef(false);
  return (
    <div
      className={className}
      onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      {children}
    </div>
  );
}

export function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={props.onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true">
        <h3>{props.title}</h3>
        <p>{props.message}</p>
        <div className="dialog-actions">
          <button className="btn" onClick={props.onCancel}>
            Cancel
          </button>
          <button className={`btn ${props.danger ? 'btn-danger' : 'btn-primary'}`} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
