"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareText, RefreshCw, Send } from "lucide-react";
import { adminFetch } from "@/lib/admin/client";
import { cn } from "@/lib/utils";
import { AdminSelect } from "./AdminSelect";
import { Button, Card, Skeleton, useNotify } from "./ui";

interface ServiceCheck {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
  extra?: string;
}

interface SystemReport {
  services: ServiceCheck[];
  service: { startedAt: string; uptimeSeconds: number; node: string; commit: string | null };
}

interface LogLine {
  at: string;
  level: "info" | "warn" | "error";
  text: string;
}

const uptime = (seconds: number) => {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};

/** Every outside service at a glance, the recent log, and a live SMS test. */
export function SystemView({ onUnauthorised }: { onUnauthorised: () => void }) {
  const [report, setReport] = useState<SystemReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    const response = await adminFetch("/api/admin/system").catch(() => null);
    setChecking(false);
    if (response?.status === 401) return onUnauthorised();
    if (!response?.ok) {
      const body = response ? ((await response.json().catch(() => ({}))) as { error?: string }) : {};
      setError(body.error ?? "Could not reach the payments service");
      return;
    }
    setError(null);
    setReport((await response.json()) as SystemReport);
  }, [onUnauthorised]);

  useEffect(() => {
    void check();
  }, [check]);

  const down = report?.services.filter((s) => !s.ok).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* --- Summary --------------------------------------------------------- */}
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <span
          className={cn(
            "h-3 w-3 rounded-full",
            !report ? "bg-adm-ink-4" : down === 0 ? "bg-adm-pos" : "bg-adm-neg",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-adm-ink">
            {error
              ? "Payments service unreachable"
              : !report
                ? "Checking…"
                : down === 0
                  ? "All systems operational"
                  : `${down} service${down === 1 ? "" : "s"} need attention`}
          </div>
          {report ? (
            <div className="tnum text-[12px] text-adm-ink-3">
              Up {uptime(report.service.uptimeSeconds)} · Node {report.service.node}
              {report.service.commit ? ` · ${report.service.commit}` : ""}
            </div>
          ) : error ? (
            <div className="text-[12px] text-adm-neg">{error}</div>
          ) : null}
        </div>
        <Button onClick={() => void check()} disabled={checking}>
          <RefreshCw size={14} className={checking ? "animate-spin" : undefined} />
          Re-check
        </Button>
      </Card>

      {/* --- Services -------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {report === null && !error
          ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)
          : (report?.services ?? []).map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex items-center gap-2">
                  <span
                    className={cn("h-2 w-2 rounded-full", s.ok ? "bg-adm-pos" : "bg-adm-neg")}
                    aria-hidden
                  />
                  <span className="flex-1 text-[13.5px] font-semibold text-adm-ink">{s.name}</span>
                  <span
                    className={cn(
                      "text-[10.5px] font-semibold uppercase tracking-wide",
                      s.ok ? "text-adm-pos" : "text-adm-neg",
                    )}
                  >
                    {s.ok ? "Live" : "Down"}
                  </span>
                </div>
                <div className="mt-2 truncate text-[12.5px] text-adm-ink-2" title={s.detail}>
                  {s.detail}
                </div>
                <div className="tnum mt-1 flex justify-between text-[11.5px] text-adm-ink-3">
                  <span className="truncate">
                    {s.extra
                      ? s.extra.replace(/(\d{4}-\d\d-\d\dT[\d:.]+Z?)/, (iso) =>
                          new Date(iso).toLocaleString([], {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }),
                        )
                      : ""}
                  </span>
                  <span>{s.ms} ms</span>
                </div>
              </Card>
            ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SmsTest onUnauthorised={onUnauthorised} />
        <Logs onUnauthorised={onUnauthorised} />
      </div>
    </div>
  );
}

/** Preview, then optionally send, the exact text a VIP gets. */
function SmsTest({ onUnauthorised }: { onUnauthorised: () => void }) {
  const notify = useNotify();
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<"WITHDRAWAL" | "DEPOSIT">("WITHDRAWAL");
  const [amount, setAmount] = useState("1000");
  const [balance, setBalance] = useState("12500");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: boolean; reason?: string | null } | null>(null);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);

  async function run(send: boolean) {
    setBusy(send ? "send" : "preview");
    setResult(null);
    const response = await adminFetch("/api/admin/system/sms-test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone,
        kind,
        amountMinor: Math.round(Number(amount.replace(/,/g, "")) * 100),
        balanceMinor: Math.round(Number(balance.replace(/,/g, "")) * 100),
        send,
      }),
    }).catch(() => null);
    setBusy(null);
    if (response?.status === 401) return onUnauthorised();
    const body = response
      ? ((await response.json().catch(() => ({}))) as {
          message?: string;
          sent?: boolean;
          reason?: string | null;
          error?: string;
        })
      : { error: "Could not reach the payments service" };
    if (!response?.ok || !body.message) {
      notify({ tone: "error", title: "Test failed", body: body.error });
      return;
    }
    setMessage(body.message);
    if (send) {
      setResult({ sent: Boolean(body.sent), reason: body.reason });
      notify(
        body.sent
          ? { tone: "success", title: "Text sent" }
          : { tone: "error", title: "Not sent", body: body.reason ?? undefined },
      );
    }
  }

  const input =
    "h-9 w-full rounded-none border border-adm-line-strong bg-adm-surface px-3 text-[13px] text-adm-ink outline-none focus:border-adm-accent";

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquareText size={15} className="text-adm-ink-3" />
        <h2 className="text-[13.5px] font-semibold text-adm-ink">Test a VIP text</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-adm-ink-3">Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" inputMode="tel" className={cn(input, "tnum font-mono")} />
        </label>
        <div>
          <span className="mb-1 block text-[11.5px] text-adm-ink-3">Movement</span>
          <AdminSelect
            label="Movement"
            value={kind}
            onChange={setKind}
            options={[
              { value: "WITHDRAWAL", label: "Withdrawal" },
              { value: "DEPOSIT", label: "Deposit" },
            ]}
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-adm-ink-3">Amount (KSh)</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={cn(input, "tnum font-mono")} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] text-adm-ink-3">New handset balance (KSh)</span>
          <input value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" className={cn(input, "tnum font-mono")} />
        </label>
      </div>

      {message ? (
        <div className="mt-3 border border-adm-line bg-adm-subtle p-3 text-[13px] leading-relaxed text-adm-ink">
          {message}
          {result ? (
            <div className={cn("mt-2 text-[11.5px] font-semibold", result.sent ? "text-adm-pos" : "text-adm-neg")}>
              {result.sent ? "Delivered to Africa's Talking" : `Not sent — ${result.reason ?? "unknown"}`}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Button onClick={() => void run(false)} disabled={!phone || busy !== null}>
          Preview
        </Button>
        <Button variant="primary" onClick={() => void run(true)} disabled={!phone || busy !== null}>
          <Send size={13} />
          {busy === "send" ? "Sending…" : "Send test"}
        </Button>
      </div>
    </Card>
  );
}

/** The payments service's recent log, newest first, refreshed every 10s. */
function Logs({ onUnauthorised }: { onUnauthorised: () => void }) {
  const [level, setLevel] = useState<"all" | "info" | "warn" | "error">("all");
  const [logs, setLogs] = useState<LogLine[] | null>(null);

  const load = useCallback(async () => {
    const response = await adminFetch(`/api/admin/system/logs?level=${level}`).catch(() => null);
    if (response?.status === 401) return onUnauthorised();
    if (!response?.ok) return setLogs((l) => l ?? []);
    const body = (await response.json()) as { logs: LogLine[] };
    setLogs(body.logs);
  }, [level, onUnauthorised]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <Card className="flex max-h-[420px] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-adm-line px-4 py-3">
        <h2 className="text-[13.5px] font-semibold text-adm-ink">Logs</h2>
        <AdminSelect
          label="Level"
          value={level}
          onChange={setLevel}
          options={[
            { value: "all", label: "All" },
            { value: "info", label: "Info" },
            { value: "warn", label: "Warnings" },
            { value: "error", label: "Errors" },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#0f1220] p-3 font-mono text-[11.5px] leading-relaxed">
        {logs === null ? (
          <span className="text-[#8b93ab]">Loading…</span>
        ) : logs.length === 0 ? (
          <span className="text-[#8b93ab]">Nothing logged since the service started.</span>
        ) : (
          logs.map((line, i) => (
            <div key={`${line.at}-${i}`} className="flex gap-2">
              <span className="shrink-0 text-[#6b7390]">
                {new Date(line.at).toLocaleTimeString([], { hour12: false })}
              </span>
              <span
                className={cn(
                  "w-10 shrink-0 uppercase",
                  line.level === "error" ? "text-[#ff6b6b]" : line.level === "warn" ? "text-[#f5b942]" : "text-[#7aa9ee]",
                )}
              >
                {line.level}
              </span>
              <span className="min-w-0 break-words text-[#e4e7f0]">{line.text}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
