/**
 * Accessible modal wrapper around @radix-ui/react-dialog.
 *
 * Behaviors we get for free:
 *  - Focus trap (tab cycles inside the modal)
 *  - ESC closes (unless onEscapeKeyDown.preventDefault())
 *  - Click-outside on backdrop closes
 *  - aria-modal + aria-labelledby/aria-describedby wired
 *  - body scroll locked while open
 *  - returns focus to trigger on close
 *
 * Visual layer is still our own CSS (`.modal-backdrop`, `.modal-card`, etc.),
 * so dropping Radix in did not redesign anything — only fixed the a11y gap.
 */

import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** className for the inner card. Defaults to "modal-card". */
  cardClassName?: string;
  /** Optional aria-labelledby id; required for screen reader announcement. */
  labelledBy?: string;
  /** Optional aria-describedby id. */
  describedBy?: string;
}

export function Dialog({ open, onOpenChange, children, cardClassName = 'modal-card', labelledBy, describedBy }: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="modal-backdrop" />
        <RadixDialog.Content
          className={cardClassName}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          onOpenAutoFocus={(event) => {
            // Let the consumer's first focusable input grab focus naturally.
            // We don't auto-focus the close button.
            event.preventDefault();
          }}
        >
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Title slot — must be present somewhere in the dialog (Radix a11y requirement). */
export const DialogTitle = RadixDialog.Title;
/** Description slot. */
export const DialogDescription = RadixDialog.Description;
/** Close trigger — wire to the X button. */
export const DialogClose = RadixDialog.Close;
