"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A bottom sheet.
 *
 * The phone's answer to a side panel: a list that would take the whole screen
 * on a laptop arrives from the bottom edge, within thumb reach, over a chart
 * that stays visible behind it. Radix handles focus trapping, scroll lock and
 * Escape, which is most of what makes a hand-rolled sheet a trap.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "sheet-content fixed inset-x-0 bottom-0 z-50 flex h-[78dvh] flex-col",
            "rounded-none border-t border-line bg-surface-1 shadow-2xl",
            "focus:outline-none",
          )}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
            <Dialog.Title className="text-[13px] font-medium text-ink">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-none text-ink-muted active:bg-surface-3"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
