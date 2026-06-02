import { NextResponse } from "next/server";
import { prisma } from "@twitchmetrics/database";
import { fulfillStripeCheckoutSession } from "@/server/services/report-payments";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const purchaseId = searchParams.get("purchase_id"); // mock mode

  try {
    // ── Mock mode ──────────────────────────────────────────────────────────
    if (purchaseId) {
      const purchase = await prisma.reportPurchase.findUnique({
        where: { id: purchaseId },
        include: { template: true },
      });
      if (!purchase || purchase.status !== "paid") {
        return NextResponse.json(
          { error: "Purchase not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        purchase: { id: purchase.id, templateName: purchase.template.name },
      });
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session_id" },
        { status: 400 },
      );
    }

    const result = await fulfillStripeCheckoutSession(sessionId);
    if (!result.fulfilled) {
      const status = result.reason === "session_unpaid" ? 402 : 400;
      return NextResponse.json({ error: "Payment not completed" }, { status });
    }

    return NextResponse.json({
      purchase: {
        id: result.purchase.id,
        templateName: result.purchase.templateName,
      },
    });
  } catch {
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
