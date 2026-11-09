import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderById } from "@/lib/payments/providers";
import { processWebhook } from "@/lib/payments/webhook";
import { SupabasePaymentRepository } from "@/lib/payments/repo-supabase";

export const dynamic = "force-dynamic";

/** Ödeme kuruluşu webhook'u. Ham gövde imza doğrulaması için olduğu gibi okunur. */
export async function POST(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await ctx.params;
  const provider = getProviderById(id);
  const admin = getSupabaseAdmin();
  if (!provider || !admin) return NextResponse.json({ error: "not_available" }, { status: 404 });
  const rawBody = await request.text();
  if (rawBody.length > 64 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });
  try {
    const out = await processWebhook(provider, { rawBody, headers: request.headers }, new SupabasePaymentRepository(admin));
    return NextResponse.json({ result: out.result }, { status: out.status });
  } catch {
    // 500 döndürülür ki ödeme kuruluşu olayı yeniden denesin; olay idempotent işlenir.
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
