import { NextResponse, after } from "next/server";
import { prisma } from "@twitchmetrics/database";
import { stripe, STRIPE_ENABLED } from "@/lib/stripe";
import {
  REPORT_TEMPLATES,
  matchTemplate,
} from "@/lib/constants/report-templates";
import type { FormSnapshot } from "@/lib/constants/report-templates";
import { syncCheckoutStartedToHubspot } from "@/server/services/hubspot";
import { sendReportPurchaseConfirmation } from "@/server/services/report-purchase-notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("report-checkout");

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      company?: string;
      formSnapshot?: FormSnapshot;
    };

    const { name, email, company, formSnapshot } = body;

    if (!name || !email || !formSnapshot) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const matched = matchTemplate(formSnapshot);
    if (!matched) {
      return NextResponse.json(
        { error: "No matching template" },
        { status: 400 },
      );
    }

    // Upsert template so stale rows from earlier schema shapes get refreshed.
    const def = REPORT_TEMPLATES.find((t) => t.slug === matched.slug)!;
    const template = await prisma.reportTemplate.upsert({
      where: { slug: def.slug },
      create: {
        slug: def.slug,
        name: def.name,
        description: def.description,
        priceInCents: def.priceInCents,
        config: def.config,
      },
      update: {
        name: def.name,
        description: def.description,
        priceInCents: def.priceInCents,
        config: def.config,
      },
    });

    const origin = request.headers.get("origin") ?? "http://localhost:3000";

    // ── Mock mode (no Stripe key set) ──────────────────────────────────────
    if (!STRIPE_ENABLED) {
      const purchase = await prisma.reportPurchase.create({
        data: {
          email: email.toLowerCase().trim(),
          name: name.trim(),
          company: company?.trim() ?? null,
          templateId: template.id,
          stripeSessionId: `mock_${crypto.randomUUID()}`,
          status: "paid",
          formData: formSnapshot as object,
        },
      });

      log.info(
        { purchaseId: purchase.id, mock: true },
        "Mock purchase created",
      );
      // Mock purchases skip fulfillStripeCheckoutSession, so mirror its
      // confirmation side effect here to keep the two paths behaviorally equal.
      after(() =>
        sendReportPurchaseConfirmation({
          purchaseId: purchase.id,
          name: purchase.name,
          email: purchase.email,
          templateName: template.name,
          amountInCents: template.priceInCents,
        }),
      );
      return NextResponse.json({
        mode: "mock",
        successUrl: `${origin}/reports/success?purchase_id=${purchase.id}`,
      });
    }

    // ── Real Stripe ────────────────────────────────────────────────────────
    const purchase = await prisma.reportPurchase.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        company: company?.trim() ?? null,
        templateId: template.id,
        status: "pending",
        formData: formSnapshot as object,
      },
    });

    const session = await stripe!.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      client_reference_id: purchase.id,
      customer_email: email.toLowerCase().trim(),
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: template.priceInCents,
            product_data: {
              name: template.name,
              description: template.description,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        purchaseId: purchase.id,
        templateSlug: template.slug,
      },
      success_url: `${origin}/reports/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/reports/request`,
    });

    // Store the session ID
    await prisma.reportPurchase.update({
      where: { id: purchase.id },
      data: { stripeSessionId: session.id },
    });

    log.info(
      { purchaseId: purchase.id, sessionId: session.id },
      "Stripe checkout session created",
    );

    // Deal lands in "Inbound Lead" so abandoned checkouts stay visible to sales.
    after(() => syncCheckoutStartedToHubspot(purchase.id));

    return NextResponse.json({ mode: "stripe", sessionUrl: session.url });
  } catch (err) {
    log.error({ err }, "Checkout error");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
