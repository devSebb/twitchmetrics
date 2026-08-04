import { after } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@twitchmetrics/database";
import { stripe } from "@/lib/stripe";
import { syncPurchasePaidToHubspot } from "@/server/services/hubspot";
import { sendReportPurchaseConfirmation } from "@/server/services/report-purchase-notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("report-payments");

type FulfilledPurchase = {
  id: string;
  templateName: string;
  status: "paid";
};

type FulfillmentResult =
  | {
      fulfilled: true;
      alreadyFulfilled: boolean;
      purchase: FulfilledPurchase;
    }
  | {
      fulfilled: false;
      reason: "stripe_unavailable" | "session_unpaid" | "missing_reference";
    };

function getPurchaseReference(session: Stripe.Checkout.Session) {
  return session.metadata?.purchaseId ?? session.client_reference_id ?? null;
}

function isPaidSession(session: Stripe.Checkout.Session) {
  return session.payment_status === "paid";
}

export async function fulfillStripeCheckoutSession(
  sessionId: string,
): Promise<FulfillmentResult> {
  if (!stripe) {
    log.warn({ sessionId }, "Stripe client unavailable during fulfillment");
    return { fulfilled: false, reason: "stripe_unavailable" };
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items"],
  });

  if (!isPaidSession(session)) {
    log.info(
      { sessionId, paymentStatus: session.payment_status },
      "Checkout session is not paid",
    );
    return { fulfilled: false, reason: "session_unpaid" };
  }

  const purchaseId = getPurchaseReference(session);
  if (!purchaseId) {
    log.warn({ sessionId }, "Paid checkout session missing purchase reference");
    return { fulfilled: false, reason: "missing_reference" };
  }

  const purchase = await prisma.reportPurchase.findUnique({
    where: { id: purchaseId },
    include: { template: true },
  });

  if (!purchase) {
    log.warn({ sessionId, purchaseId }, "Purchase not found for paid session");
    return { fulfilled: false, reason: "missing_reference" };
  }

  if (purchase.status === "paid") {
    return {
      fulfilled: true,
      alreadyFulfilled: true,
      purchase: {
        id: purchase.id,
        templateName: purchase.template.name,
        status: "paid",
      },
    };
  }

  // Atomic flip: the webhook and the success page can both reach this point
  // concurrently — only the caller that wins the update fires side effects.
  const updated = await prisma.reportPurchase.updateMany({
    where: { id: purchase.id, status: { not: "paid" } },
    data: {
      status: "paid",
      stripeSessionId: session.id,
    },
  });

  if (updated.count === 0) {
    return {
      fulfilled: true,
      alreadyFulfilled: true,
      purchase: {
        id: purchase.id,
        templateName: purchase.template.name,
        status: "paid",
      },
    };
  }

  after(() => syncPurchasePaidToHubspot(purchase.id));
  after(() =>
    sendReportPurchaseConfirmation({
      purchaseId: purchase.id,
      name: purchase.name,
      email: purchase.email,
      templateName: purchase.template.name,
      amountInCents: session.amount_total ?? purchase.template.priceInCents,
    }),
  );

  log.info(
    {
      purchaseId: purchase.id,
      sessionId,
      amountTotal: session.amount_total,
      currency: session.currency,
    },
    "Report purchase fulfilled",
  );

  return {
    fulfilled: true,
    alreadyFulfilled: false,
    purchase: {
      id: purchase.id,
      templateName: purchase.template.name,
      status: "paid",
    },
  };
}

export async function markStripeCheckoutSessionFailed(
  session: Stripe.Checkout.Session,
  reason: "async_payment_failed" | "expired",
) {
  const purchaseId = getPurchaseReference(session);
  if (!purchaseId) {
    log.warn(
      { sessionId: session.id, reason },
      "Failed session missing purchase reference",
    );
    return;
  }

  const result = await prisma.reportPurchase.updateMany({
    where: {
      id: purchaseId,
      status: "pending",
    },
    data: { status: "failed" },
  });

  log.info(
    {
      purchaseId,
      sessionId: session.id,
      reason,
      updated: result.count,
    },
    "Report purchase marked failed",
  );
}
