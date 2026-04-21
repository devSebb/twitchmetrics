import { NextResponse } from "next/server";
import { prisma } from "@twitchmetrics/database";
import { stripe } from "@/lib/stripe";

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

    // ── Stripe mode ────────────────────────────────────────────────────────
    if (!sessionId || !stripe) {
      return NextResponse.json(
        { error: "Missing session_id" },
        { status: 400 },
      );
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed" },
        { status: 402 },
      );
    }

    const purchaseIdFromMeta =
      session.metadata?.purchaseId ?? session.client_reference_id;
    if (!purchaseIdFromMeta) {
      return NextResponse.json(
        { error: "Purchase reference missing" },
        { status: 400 },
      );
    }

    const purchase = await prisma.reportPurchase.update({
      where: { id: purchaseIdFromMeta },
      data: { status: "paid" },
      include: { template: true },
    });

    return NextResponse.json({
      purchase: { id: purchase.id, templateName: purchase.template.name },
    });
  } catch {
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
