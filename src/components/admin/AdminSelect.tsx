"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";

/** The console's filter dropdown — the admin palette's FilterSelect. */
export function AdminSelect<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`${label}: ${current}`}
        className="flex h-9 min-w-[150px] items-center justify-between gap-3 rounded-none border border-adm-line-strong bg-adm-surface px-3 text-left text-[13px] text-adm-ink data-[state=open]:border-adm-accent"
      >
        {current}
        <ChevronDown size={14} className="text-adm-ink-3" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="adm-root z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] border border-adm-line bg-adm-surface py-1 shadow-lg"
        >
          {options.map((option) => (
            <DropdownMenu.Item
              key={option.value}
              onSelect={() => onChange(option.value)}
              className="flex cursor-pointer items-center justify-between gap-4 px-3 py-2 text-[13px] text-adm-ink outline-none data-[highlighted]:bg-adm-subtle"
            >
              {option.label}
              {option.value === value ? <Check size={14} className="text-adm-accent" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
