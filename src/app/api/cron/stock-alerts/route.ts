import { NextResponse } from "next/server";
import {
  buildStockAlertCard,
  buildStockAlertReport,
  reportHasAlerts,
} from "@/lib/notifications/stock-alerts";
import { getLarkConfig, sendLarkPayload } from "@/lib/notifications/lark";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lark = getLarkConfig();
  if (!lark) {
    return NextResponse.json({
      ok: true,
      sent: false,
      reason: "Lark webhook is not configured (LARK_WEBHOOK_URL / LARK_WEBHOOK_SECRET).",
    });
  }

  try {
    const supabase = createAdminClient();
    const report = await buildStockAlertReport(supabase);

    if (!reportHasAlerts(report)) {
      return NextResponse.json({
        ok: true,
        sent: false,
        reason: "no_alerts",
        counts: {
          low_stock: 0,
          stockout_soon: 0,
          upcoming_shipments: 0,
        },
      });
    }

    const payload = buildStockAlertCard(report);
    const result = await sendLarkPayload(payload, lark);

    if (!result.ok) {
      console.error("Lark webhook failed:", result.status, result.body);
      return NextResponse.json(
        {
          ok: false,
          error: "Lark webhook request failed",
          lark_status: result.status,
          lark_body: result.body,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      counts: {
        low_stock: report.low_stock.length,
        stockout_soon: report.stockout_soon.length,
        upcoming_shipments: report.upcoming_shipments.length,
      },
      lark: result.body,
    });
  } catch (error) {
    console.error("Stock alerts cron failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
