"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/**
 * A modal built on the native <dialog>: the browser traps focus inside, closes it on Escape,
 * and puts focus back on the button that opened it. We only mirror `open` onto it.
 */
export function Dialog({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape closes the native dialog; tell the parent so `open` does not go stale.
      onClose={onClose}
      // A click on the dimmed backdrop lands on the <dialog> element itself, not on its content.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[min(92vw,420px)] rounded-sheet border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    >
      {open && (
        <div className="flex flex-col gap-3 p-5">
          <h2 id={titleId} className="text-lg font-bold leading-relaxed">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
