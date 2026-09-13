"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/** Native modal provides focus trapping, Escape, and background inertness. */
export function Dialog({ title, description, pending = false, onClose, children }: {
  title: string;
  description?: string;
  pending?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    const initialFocus = dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]:not(:disabled)") ?? dialog.querySelector<HTMLElement>("input:not(:disabled):not([readonly]), textarea:not(:disabled):not([readonly]), select:not(:disabled)");
    initialFocus?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  return (
    <dialog ref={ref} className="modal" aria-busy={pending} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!pending) onClose(); } }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || pending) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <div className="modal-head">
        <div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div>
        <button className="icon-button" type="button" onClick={onClose} disabled={pending} aria-label="關閉對話框"><X size={18} /></button>
      </div>
      {children}
    </dialog>
  );
}
