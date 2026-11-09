import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/finance/revenue";
import { audit } from "@/lib/server-utils";

export const dynamic = "force-dynamic";

/** Ödeme raporu CSV — yalnızca sahip + 2FA (RLS ile ayrıca zorlanır). */
export async function GET() {
  const v = await getViewer();
  if (!v || !v.roles.includes("owner") || v.user.aal !== "aal2") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data, error } = await supabase
    .from("payments")
    .select("created_at, paid_at, kind, status, amount_gross, fee_amount, currency, provider, provider_payment_ref, is_test")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await audit(v.user.id, "finance_export", "finance", null, { rows: data?.length ?? 0 });
  const csv = "﻿" + toCsv((data ?? []).map((r) => ({ ...r, is_test: r.is_test ? "evet" : "hayır" })));
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="amedspor-odemeler-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
