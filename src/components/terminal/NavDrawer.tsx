"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  History,
  Gift,
  LifeBuoy,
  MessagesSquare,
  Newspaper,
  ShieldCheck,
  LogIn,
  LogOut,
  Moon,
  RotateCcw,
  Smartphone,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPhoneMasked, useAuth, useCurrentAccount } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { usePrefs, depositPhoneOf } from "@/lib/prefs";
import { useUi } from "@/lib/ui";
import { Wordmark } from "@/components/Wordmark";
import { useAuthGate } from "@/components/auth/SignInGate";

/**
 * Live chat: WhatsApp with support when `NEXT_PUBLIC_SUPPORT_WHATSAPP` holds a
 * number (digits, country code first, e.g. 254712345678); the Support page
 * until then.
 */
const LIVE_CHAT_URL = (() => {
  const digits = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
})();

/**
 * The menu behind the hamburger.
 *
 * Grouped the way a trader thinks about the product — money, trading, account —
 * with the two viewing preferences and sign-out pinned at the foot. Every row
 * is either a real route or a real action; there are no rows for features this
 * build does not have.
 */
export function NavDrawer() {
  const open = useUi((s) => s.drawerOpen);
  const setOpen = useUi((s) => s.setDrawerOpen);
  const setCash = useUi((s) => s.setCash);
  const setVerificationOpen = useUi((s) => s.setVerificationOpen);
  const setDepositNumberOpen = useUi((s) => s.setDepositNumberOpen);

  const account = useCurrentAccount();
  const signedIn = useAuth((s) => s.currentPhone) !== null;
  const signOutAuth = useAuth((s) => s.signOut);
  const showGate = useAuthGate((s) => s.show);
  const depositPhone = depositPhoneOf(account);

  const accountKind = useStore((s) => s.accountKind);
  const clearSession = useStore((s) => s.signOut);
  const resetDemo = useStore((s) => s.resetDemo);

  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const sound = usePrefs((s) => s.sound);
  const setSound = usePrefs((s) => s.setSound);

  const close = () => setOpen(false);

  /** Runs an action that needs an account, or asks for one. */
  const withAccount = (action: () => void) => () => {
    close();
    if (signedIn) action();
    else showGate();
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "drawer-slide fixed inset-y-0 left-0 z-50 flex w-1/2 min-w-[244px] max-w-[340px] flex-col",
            "border-r border-line bg-surface-1 shadow-2xl focus:outline-none",
          )}
        >
          <div className="flex h-14 shrink-0 items-center border-b border-line px-4">
            <Dialog.Title asChild>
              <Link href="/" onClick={close} aria-label="Home">
                <Wordmark className="h-[18px]" />
              </Link>
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close menu"
              className="ml-auto grid h-9 w-9 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <X className="h-[18px] w-[18px]" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* --- Identity -------------------------------------------------- */}
            {account ? (
              <div className="flex items-center gap-3 border-b border-line px-4 py-4">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-semibold text-surface-1"
                  aria-hidden
                >
                  {(account.username?.slice(0, 2) ?? account.phone.slice(-2)).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold uppercase tracking-tight text-ink">
                    {account.username ?? formatPhoneMasked(account.phone)}
                  </div>
                  <div className="tnum truncate font-mono text-[11.5px] text-ink-muted">
                    {formatPhoneMasked(account.phone)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-b border-line p-4">
                <button
                  onClick={() => {
                    close();
                    showGate();
                  }}
                  className="flex h-10 w-full items-center justify-center gap-2 bg-ink text-[13px] font-semibold text-surface-1 transition-opacity hover:opacity-90"
                >
                  <LogIn className="h-4 w-4" aria-hidden />
                  Sign in
                </button>
              </div>
            )}

            {/* --- Money ------------------------------------------------------ */}
            <Group label="Money">
              <Row
                icon={ArrowDownToLine}
                label="Deposit"
                onClick={withAccount(() => setCash("deposit"))}
              />
              <Row
                icon={ArrowUpFromLine}
                label="Withdraw"
                onClick={withAccount(() => setCash("withdraw"))}
              />
              <Row
                icon={Smartphone}
                label="Deposit number"
                value={depositPhone ? formatPhoneMasked(depositPhone) : undefined}
                onClick={withAccount(() => setDepositNumberOpen(true))}
              />
              <Row icon={History} label="Transactions" href="/transactions" onNavigate={close} />
            </Group>

            {/* --- Trading ----------------------------------------------------
                Markets, positions, wallet and profile are the tab bar's; the
                account switch is the balance chip's. This holds the rest. */}
            <Group label="Trading">
              <Row icon={Newspaper} label="Market news" href="/news" onNavigate={close} />
              {accountKind === "DEMO" ? (
                <Row
                  icon={RotateCcw}
                  label="Reset demo balance"
                  onClick={() => {
                    close();
                    resetDemo();
                    toast.success("Demo balance reset");
                  }}
                />
              ) : null}
            </Group>

            {/* --- Account ---------------------------------------------------- */}
            <Group label="Account">
              <Row
                icon={BadgeCheck}
                label="Verification"
                onClick={withAccount(() => setVerificationOpen(true))}
              />
              <Row icon={ShieldCheck} label="Security" href="/security" onNavigate={close} />
              <Row icon={Gift} label="Refer & earn" href="/referrals" onNavigate={close} />
            </Group>

            {/* --- Help ------------------------------------------------------- */}
            <Group label="Help">
              <Row
                icon={MessagesSquare}
                label="Live chat"
                href={LIVE_CHAT_URL ?? "/support"}
                external={Boolean(LIVE_CHAT_URL)}
                onNavigate={close}
              />
              <Row icon={LifeBuoy} label="Support" href="/support" onNavigate={close} />
            </Group>
          </div>

          {/* --- Preferences + sign out --------------------------------------- */}
          <div
            className="shrink-0 border-t border-line"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <Toggle icon={Volume2} label="Sound" checked={sound} onChange={setSound} />
            <Toggle
              icon={Moon}
              label="Dark mode"
              checked={theme === "dark"}
              onChange={(on) => setTheme(on ? "dark" : "light")}
            />
            {signedIn ? (
              <button
                onClick={() => {
                  clearSession();
                  signOutAuth();
                  close();
                }}
                className="flex h-12 w-full items-center gap-3 border-t border-line px-4 text-[13.5px] font-medium text-down transition-colors hover:bg-down/10"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Log out
              </button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-2">
      <div className="px-3.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  href,
  external = false,
  onClick,
  onNavigate,
}: {
  icon: React.ElementType;
  label: string;
  value?: string;
  href?: string;
  /** Opens outside the app (the chat), in a new tab. */
  external?: boolean;
  onClick?: () => void;
  onNavigate?: () => void;
}) {
  const inner = (
    <>
      <Icon className="h-[17px] w-[17px] shrink-0 text-ink-muted" aria-hidden />
      {/* At half the screen there is no room beside the label, so a value
          sits under it instead. */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-ink">{label}</span>
        {value ? (
          <span className="tnum block truncate font-mono text-[10.5px] text-ink-faint">{value}</span>
        ) : null}
      </span>
    </>
  );
  const className =
    "flex min-h-11 w-full items-center gap-3 px-3.5 py-1.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-3";

  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={className}>
        {inner}
      </a>
    );
  }

  return href ? (
    <Link href={href} prefetch onClick={onNavigate} className={className}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

function Toggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex h-12 w-full items-center gap-3 px-3.5 text-left transition-colors hover:bg-surface-2"
    >
      <Icon className="h-[17px] w-[17px] shrink-0 text-ink-muted" aria-hidden />
      <span className="flex-1 text-[13.5px] text-ink">{label}</span>
      {/* Square track, square thumb — the product's one corner rule. */}
      <span
        className={cn(
          "relative h-[22px] w-10 border transition-colors",
          checked ? "border-cash bg-cash" : "border-line-strong bg-surface-3",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-[2px] h-4 w-4 bg-white shadow-sm transition-[left] duration-150",
            checked ? "left-[20px]" : "left-[2px]",
          )}
        />
      </span>
    </button>
  );
}
