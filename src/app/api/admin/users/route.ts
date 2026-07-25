import { NextResponse, type NextRequest } from "next/server";
import { guard } from "@/lib/admin/guard";
import type { AdminUser } from "@/lib/admin/types";

/** GET /api/admin/users?q=… — every profile, newest first. */

export const runtime = "nodejs";
// Always hit the database: an admin looking at a user list needs the current
// tier, not a cached one from before they changed it.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

interface ProfileRow {
  id: string;
  phone: string;
  username: string;
  live_tier: string;
  demo_balance: number | string;
  live_balance: number | string;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const gate = guard(request);
  if ("error" in gate) return gate.error;

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  let select = gate.db
    .from("profiles")
    .select("id, phone, username, live_tier, demo_balance, live_balance, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (query) {
    // `%` and `_` are wildcards in ILIKE; escaping them keeps a search for
    // "100%" from matching everything. Commas and parens would break out of
    // PostgREST's `or` filter syntax, so they are dropped.
    const safe = query.replace(/[%_,()]/g, "");
    if (safe) {
      select = select.or(`phone.ilike.%${safe}%,username.ilike.%${safe}%`);
    }
  }

  const { data, error } = await select;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users: AdminUser[] = (data as ProfileRow[]).map((row) => ({
    id: row.id,
    phone: row.phone,
    username: row.username,
    liveTier: row.live_tier === "VIP" ? "VIP" : "STANDARD",
    // BIGINT arrives as a string from PostgREST when it exceeds the safe
    // integer range and as a number when it does not. Normalising to a string
    // here means the client never has to care which it got.
    demoBalanceMinor: String(row.demo_balance ?? 0),
    liveBalanceMinor: String(row.live_balance ?? 0),
    createdAt: row.created_at,
  }));

  return NextResponse.json({ users });
}
