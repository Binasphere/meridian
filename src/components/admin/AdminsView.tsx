"use client";

import { useState } from "react";
import {
  KeyRound,
  Loader2,
  MoreHorizontal,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ADMIN_ROLES,
  MIN_ADMIN_PASSWORD_LENGTH,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AdminAccount,
  type AdminRole,
} from "@/lib/admin/types";
import { Badge, Button, Card, CardHeader, Skeleton, useNotify } from "./ui";
import type { AdminsState } from "./useAdmins";

/**
 * Who can operate this console.
 *
 * Three bands, in the order the questions get asked: change your own password
 * (every admin, and the only thing an ordinary admin can do here), the roster,
 * and — for a super admin — the controls on each row.
 *
 * An ordinary admin sees the roster read-only rather than not at all. Hiding it
 * would mean an unexpected account is visible only to the super admins, who are
 * the people least likely to be surprised by one.
 */
export function AdminsView({
  state,
  me,
}: {
  state: AdminsState;
  me: AdminAccount | null;
}) {
  const isSuper = me?.role === "SUPER_ADMIN";

  return (
    <div className="space-y-5">
      <OwnPasswordCard state={state} />

      {isSuper ? <CreateCard state={state} /> : null}

      <Card>
        <CardHeader
          title="Admins"
          subtitle={
            isSuper
              ? "Everyone who can sign in to this console."
              : "Everyone who can sign in. Only a super admin can change these."
          }
        />

        {state.error ? (
          <p className="px-5 py-4 text-[13px] text-adm-neg">{state.error}</p>
        ) : null}

        {state.admins === null ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : state.admins.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-adm-ink-3">No admins yet.</p>
        ) : (
          <ul className="divide-y divide-adm-line">
            {state.admins.map((admin) => (
              <AdminRow
                key={admin.id}
                admin={admin}
                state={state}
                isSelf={admin.id === me?.id}
                canManage={isSuper}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function OwnPasswordCard({ state }: { state: AdminsState }) {
  const notify = useNotify();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const busy = Boolean(state.pending["own-password"]);
  const ready =
    current.length > 0 && next.length >= MIN_ADMIN_PASSWORD_LENGTH && confirm.length > 0;

  async function submit() {
    if (busy || !ready) return;
    setError(null);

    // Checked here rather than server-side: the server never receives the
    // confirmation, because a typo in it is a browser-side mistake and sending
    // a second copy of a password over the wire buys nothing.
    if (next !== confirm) {
      setError("The two new passwords do not match");
      return;
    }

    const result = await state.changeOwnPassword(current, next);
    if (result.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      notify({
        tone: "success",
        title: "Password changed",
        body: "Every other browser signed in as you has been signed out.",
      });
      return;
    }
    setError(result.reason);
  }

  return (
    <Card>
      <CardHeader
        title="Your password"
        subtitle="Changing it signs out every other browser signed in as you."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="grid gap-3 p-5 sm:grid-cols-3"
      >
        <Input
          id="adm-current"
          label="Current password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <Input
          id="adm-next"
          label="New password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint={`At least ${MIN_ADMIN_PASSWORD_LENGTH} characters`}
        />
        <Input
          id="adm-confirm"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />

        <div className="sm:col-span-3">
          {error ? (
            <p role="alert" className="mb-3 text-[12.5px] text-adm-neg">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={busy || !ready}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function CreateCard({ state }: { state: AdminsState }) {
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("ADMIN");
  const [error, setError] = useState<string | null>(null);

  const busy = Boolean(state.pending.create);
  const ready =
    fullName.trim().length >= 3 &&
    username.trim().length >= 3 &&
    password.length >= MIN_ADMIN_PASSWORD_LENGTH;

  async function submit() {
    if (busy || !ready) return;
    setError(null);

    const result = await state.create({
      username: username.trim(),
      fullName: fullName.trim(),
      password,
      role,
    });

    if (result.ok) {
      notify({
        tone: "success",
        title: "Admin created",
        body: `${fullName.trim()} can now sign in as ${username.trim()}.`,
      });
      setFullName("");
      setUsername("");
      setPassword("");
      setRole("ADMIN");
      setOpen(false);
      return;
    }
    setError(result.reason);
  }

  return (
    <Card>
      <CardHeader
        title="Add an admin"
        subtitle="They sign in with the username and password you set here."
        action={
          <Button onClick={() => setOpen((value) => !value)}>
            <UserPlus size={14} />
            {open ? "Cancel" : "New admin"}
          </Button>
        }
      />

      {open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="grid gap-3 p-5 sm:grid-cols-2"
        >
          <Input
            id="adm-create-name"
            label="Full name"
            type="text"
            value={fullName}
            onChange={setFullName}
            autoComplete="off"
          />
          <Input
            id="adm-create-username"
            label="Username"
            type="text"
            value={username}
            onChange={setUsername}
            autoComplete="off"
            hint="Lowercase letters, numbers, dot, dash or underscore"
          />
          <Input
            id="adm-create-password"
            label="Temporary password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            hint={`At least ${MIN_ADMIN_PASSWORD_LENGTH} characters. Tell them to change it.`}
          />

          <div>
            <label
              htmlFor="adm-create-role"
              className="mb-1.5 block text-[12.5px] font-medium text-adm-ink-2"
            >
              Role
            </label>
            <select
              id="adm-create-role"
              value={role}
              onChange={(event) => setRole(event.target.value as AdminRole)}
              className="h-10 w-full rounded-none border border-adm-line-strong bg-adm-surface px-3 text-[14px] text-adm-ink outline-none focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint"
            >
              {ADMIN_ROLES.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]} — {ROLE_DESCRIPTIONS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            {error ? (
              <p role="alert" className="mb-3 text-[12.5px] text-adm-neg">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" disabled={busy || !ready}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Create account
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function AdminRow({
  admin,
  state,
  isSelf,
  canManage,
}: {
  admin: AdminAccount;
  state: AdminsState;
  isSelf: boolean;
  canManage: boolean;
}) {
  const notify = useNotify();
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetValue, setResetValue] = useState("");

  const busy = Boolean(state.pending[admin.id]);
  const suspended = admin.status === "SUSPENDED";

  async function run(action: Promise<{ ok: boolean; reason?: string }>, done: string) {
    const result = await action;
    if (result.ok) {
      notify({ tone: "success", title: done });
      setMenuOpen(false);
      return;
    }
    notify({
      tone: "error",
      title: "That did not work",
      body: result.reason ?? "Failed",
    });
  }

  return (
    <li className={cn("px-5 py-3.5", suspended && "bg-adm-subtle/60")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-[13.5px] font-medium text-adm-ink",
                suspended && "line-through decoration-adm-ink-4",
              )}
            >
              {admin.fullName}
            </span>
            {admin.role === "SUPER_ADMIN" ? (
              <Badge tone="accent">
                <ShieldCheck size={10} />
                Super
              </Badge>
            ) : admin.role === "SESSION_MANAGER" ? (
              // Named on every row, because "what can this person see" stops
              // being obvious the moment a third role exists.
              <Badge>{ROLE_LABELS.SESSION_MANAGER}</Badge>
            ) : null}
            {suspended ? <Badge>Suspended</Badge> : null}
            {isSelf ? <Badge tone="positive">You</Badge> : null}
          </div>
          <p className="mt-0.5 truncate font-mono text-[12px] text-adm-ink-3">
            {admin.username}
            {admin.lastLoginAt ? (
              <span className="font-sans">
                {" · last signed in "}
                {new Date(admin.lastLoginAt).toLocaleDateString()}
              </span>
            ) : (
              <span className="font-sans"> · never signed in</span>
            )}
          </p>
        </div>

        {canManage && !isSelf ? (
          <Button
            onClick={() => setMenuOpen((value) => !value)}
            disabled={busy}
            aria-expanded={menuOpen}
            aria-label={`Manage ${admin.fullName}`}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <MoreHorizontal size={14} />
            )}
          </Button>
        ) : null}
      </div>

      {menuOpen ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-adm-line pt-3">
          <Button
            onClick={() =>
              void run(
                state.setStatus(admin.id, suspended ? "ACTIVE" : "SUSPENDED"),
                suspended ? "Account restored" : "Account suspended",
              )
            }
            disabled={busy}
          >
            {suspended ? "Restore" : "Suspend"}
          </Button>

          {/* A select rather than a toggle: with three roles there is no single
              "other" to flip to, and a button that guesses which one you meant
              is a button that eventually guesses wrong about a permission. */}
          <label className="flex items-center gap-2 text-[12.5px] text-adm-ink-2">
            Role
            <select
              value={admin.role}
              disabled={busy}
              onChange={(event) =>
                void run(
                  state.setRole(admin.id, event.target.value as AdminRole),
                  "Role updated",
                )
              }
              className="h-9 rounded-none border border-adm-line-strong bg-adm-surface px-2 text-[13px] text-adm-ink outline-none focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint disabled:opacity-45"
            >
              {ADMIN_ROLES.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <Button onClick={() => setResetting((value) => !value)} disabled={busy}>
            <KeyRound size={14} />
            Reset password
          </Button>

          <Button
            onClick={() => void run(state.remove(admin.id), "Account deleted")}
            disabled={busy}
            className="text-adm-neg hover:bg-[#fdeceb]"
            variant="ghost"
          >
            <Trash2 size={14} />
            Delete
          </Button>

          {resetting ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (resetValue.length < MIN_ADMIN_PASSWORD_LENGTH) return;
                void run(
                  state.resetPassword(admin.id, resetValue),
                  "Password reset. Their other sessions are signed out.",
                ).then(() => {
                  setResetValue("");
                  setResetting(false);
                });
              }}
              className="flex w-full flex-wrap items-end gap-2"
            >
              <div className="min-w-[220px] flex-1">
                <Input
                  id={`adm-reset-${admin.id}`}
                  label={`New password for ${admin.fullName}`}
                  value={resetValue}
                  onChange={setResetValue}
                  autoComplete="new-password"
                  hint={`At least ${MIN_ADMIN_PASSWORD_LENGTH} characters. You will have to tell them what it is.`}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || resetValue.length < MIN_ADMIN_PASSWORD_LENGTH}
              >
                Set password
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------

function Input({
  id,
  label,
  value,
  onChange,
  hint,
  type = "password",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: "text" | "password";
  autoComplete?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12.5px] font-medium text-adm-ink-2"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-none border border-adm-line-strong bg-adm-surface px-3 text-[14px] text-adm-ink outline-none transition-colors placeholder:text-adm-ink-4 focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint"
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-[11.5px] text-adm-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
