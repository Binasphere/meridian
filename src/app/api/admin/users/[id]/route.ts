import { NextResponse, type NextRequest } from "next/server";
import { guard } from "@/lib/admin/guard";
import { isLiveTier, type AdminUser } from "@/lib/admin/types";

/**
 * PATCH /api/admin/users/:id — change a user's live tier.
 *
 * The tier is the only field this route will write. Deliberately: an admin
 * endpoint that accepts an arbitrary column patch is one typo away from being a
 * balance editor, and the whitelist is what keeps that from ever being possible
 * rather than merely unlikely.
 *
 * Nothing is done to existing trades. `payoutBps` is frozen onto each contract
 * at placement (see `effectivePayoutBps`), so a promotion applies to the next
 * trade and never retroactively repays an old one.
 */

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = guard(request);
  if ("error" in gate) return gate.error;

  const { id } = await context.params;

  let tier: unknown;
  try {
    ({ liveTier: tier } = (await request.json()) as { liveTier?: unknown });
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  if (!isLiveTier(tier)) {
    return NextResponse.json(
      { error: "liveTier must be STANDARD or VIP" },
      { status: 400 },
    );
  }

  const { data, error } = await gate.db
    .from("profiles")
    .update({ live_tier: tier })
    .eq("id", id)
    .select("id, phone, username, live_tier, demo_balance, live_balance, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "No such user" }, { status: 404 });
  }

  const user: AdminUser = {
    id: data.id,
    phone: data.phone,
    username: data.username,
    liveTier: data.live_tier === "VIP" ? "VIP" : "STANDARD",
    demoBalanceMinor: String(data.demo_balance ?? 0),
    liveBalanceMinor: String(data.live_balance ?? 0),
    createdAt: data.created_at,
  };

  return NextResponse.json({ user });
}
