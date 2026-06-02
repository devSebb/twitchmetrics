import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createLogger } from "@/lib/logger";
import {
  fulfillStripeCheckoutSession,
  markStripeCheckoutSessionFailed,
} from "@/server/services/report-payments";

const log = createLogger("stripe-webhook");

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!stripe) {
    log.warn("STRIPE_SECRET_KEY not configured; rejecting webhook");
    return NextResponse.json({ error: "Stripe unavailable" }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    log.warn("STRIPE_WEBHOOK_SECRET not configured; rejecting webhook");
    return NextResponse.json(
      { error: "Webhook secret unavailable" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let payload: string;
  try {
    payload = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    log.warn({ err }, "Invalid Stripe webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const purchaseReference =
          session.metadata?.purchaseId ?? session.client_reference_id;

        if (!purchaseReference) {
          log.info(
            {
              eventId: event.id,
              eventType: event.type,
              sessionId: session.id,
            },
            "Ignoring checkout session without TwitchMetrics purchase reference",
          );
          break;
        }

        const result = await fulfillStripeCheckoutSession(session.id);
        log.info(
          {
            eventId: event.id,
            eventType: event.type,
            sessionId: session.id,
            fulfilled: result.fulfilled,
          },
          "Stripe checkout event processed",
        );
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await markStripeCheckoutSessionFailed(session, "async_payment_failed");
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await markStripeCheckoutSessionFailed(session, "expired");
        break;
      }

      default:
        log.info(
          { eventId: event.id, eventType: event.type },
          "Unhandled Stripe webhook event",
        );
    }
  } catch (err) {
    log.error(
      { err, eventId: event.id, eventType: event.type },
      "Stripe webhook processing failed",
    );
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
