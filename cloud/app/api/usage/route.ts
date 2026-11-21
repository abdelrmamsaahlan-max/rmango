import { NextResponse } from "next/server";
import { getAuthErrorResponse, createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const planLabels: Record<string, string> = {
  free: "Free",
  builder: "Builder",
  creator: "Creator",
};

export async function GET(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;

  const { user } = context!;
  const admin = createAdminClient();
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStartIso = dayStart.toISOString();
  const monthStartIso = monthStart.toISOString();

  try {
    const [{ data: profile, error: profileError }, { data: events, error: eventsError }, { data: reservations, error: reservationsError }] = await Promise.all([
      admin.from("user_profiles").select("role,plan").eq("user_id", user.id).maybeSingle(),
      admin.from("usage_events").select("created_at,input_tokens,output_tokens").eq("owner_id", user.id).gte("created_at", monthStartIso),
      admin.from("usage_reservations").select("created_at,estimated_tokens").eq("owner_id", user.id).gte("created_at", monthStartIso),
    ]);

    if (profileError || eventsError || reservationsError) {
      return NextResponse.json({ error: "Could not load your Rmango plan and usage." }, { status: 503 });
    }

    const role = profile?.role === "admin" ? "admin" : "user";
    const plan = profile?.plan === "builder" || profile?.plan === "creator" ? profile.plan : "free";
    const unlimitedAccount = role === "admin";

    const { data: planLimits, error: limitsError } = await admin
      .from("rmango_plan_limits")
      .select("daily_request_limit,monthly_request_limit,daily_token_limit,monthly_token_limit,max_output_tokens")
      .eq("plan", plan)
      .single();

    if (limitsError || !planLimits) {
      return NextResponse.json({ error: "The active Rmango plan is not configured." }, { status: 503 });
    }

    const eventRows = events || [];
    const reservationRows = reservations || [];
    const isToday = (value: string) => value >= dayStartIso;
    const dailyEvents = eventRows.filter(item => isToday(item.created_at));
    const dailyReservations = reservationRows.filter(item => isToday(item.created_at));

    const sumEventTokens = (rows: typeof eventRows) => rows.reduce(
      (sum, item) => sum + Math.max(0, Number(item.input_tokens) || 0) + Math.max(0, Number(item.output_tokens) || 0),
      0,
    );
    const sumReservedTokens = (rows: typeof reservationRows) => rows.reduce(
      (sum, item) => sum + Math.max(0, Number(item.estimated_tokens) || 0),
      0,
    );

    const usage = {
      dailyRequests: dailyEvents.length + dailyReservations.length,
      monthlyRequests: eventRows.length + reservationRows.length,
      dailyTokens: sumEventTokens(dailyEvents) + sumReservedTokens(dailyReservations),
      monthlyTokens: sumEventTokens(eventRows) + sumReservedTokens(reservationRows),
    };

    const limits = unlimitedAccount
      ? {
          dailyRequests: null,
          monthlyRequests: null,
          dailyTokens: null,
          monthlyTokens: null,
          maxOutputTokens: Number(planLimits.max_output_tokens),
        }
      : {
          dailyRequests: Number(planLimits.daily_request_limit),
          monthlyRequests: Number(planLimits.monthly_request_limit),
          dailyTokens: Number(planLimits.daily_token_limit),
          monthlyTokens: Number(planLimits.monthly_token_limit),
          maxOutputTokens: Number(planLimits.max_output_tokens),
        };

    const remaining = unlimitedAccount
      ? { dailyRequests: null, monthlyRequests: null, dailyTokens: null, monthlyTokens: null }
      : {
          dailyRequests: Math.max(0, limits.dailyRequests! - usage.dailyRequests),
          monthlyRequests: Math.max(0, limits.monthlyRequests! - usage.monthlyRequests),
          dailyTokens: Math.max(0, limits.dailyTokens! - usage.dailyTokens),
          monthlyTokens: Math.max(0, limits.monthlyTokens! - usage.monthlyTokens),
        };

    return NextResponse.json({
      role,
      plan: unlimitedAccount ? "admin" : plan,
      planLabel: unlimitedAccount ? "Administrator" : planLabels[plan],
      unlimitedAccount,
      usage,
      limits,
      remaining,
      globalSpendGuard: true,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Could not load your Rmango plan and usage." }, { status: 503 });
  }
}
