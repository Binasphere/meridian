"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one way a filter is chosen anywhere in the product: a dropdown, never a
 * row of buttons. Keeps every list's header to one control however many
 * options it grows.
 */
export function FilterSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  /** Read by screen readers; the trigger shows the chosen option. */
  label: string;
  className?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`${label}: ${current}`}
        className={cn(
          "flex h-10 min-w-[160px] items-center justify-between gap-3 border border-line-strong bg-surface-1 px-3",
          "text-left text-[13.5px] text-ink transition-colors data-[state=open]:border-cash",
          className,
        )}
      >
        {current}
        <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="rise-in z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] border border-line bg-surface-1 py-1 shadow-[0_12px_32px_-8px_rgba(8,12,24,0.28)]"
        >
          {options.map((option) => (
            <DropdownMenu.Item
              key={option.value}
              onSelect={() => onChange(option.value)}
              className="flex cursor-pointer items-center justify-between gap-4 px-3 py-2.5 text-[13.5px] text-ink outline-none data-[highlighted]:bg-surface-2"
            >
              {option.label}
              {option.value === value ? <Check className="h-4 w-4 text-cash" aria-hidden /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
