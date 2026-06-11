import { prisma } from "@twitchmetrics/database";
import { createLogger } from "@/lib/logger";

const log = createLogger("hubspot");

export const HUBSPOT_ENABLED = !!process.env.HUBSPOT_ACCESS_TOKEN;

const BASE_URL = "https://api.hubapi.com";

// Portal-specific IDs supplied by the client; overridable per environment.
// `||` (not `??`) so empty-string env values fall back to the defaults.
const PIPELINE_ID = process.env.HUBSPOT_PIPELINE_ID || "725932936";
const STAGE_INBOUND_LEAD =
  process.env.HUBSPOT_STAGE_INBOUND_LEAD || "1058694705";
const STAGE_PURCHASED = process.env.HUBSPOT_STAGE_PURCHASED || "1058694710";

// HubSpot-defined association type: deal → contact.
const DEAL_TO_CONTACT_TYPE_ID = 3;

class HubspotApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    path: string,
  ) {
    super(`HubSpot API ${status} on ${path}`);
    this.name = "HubspotApiError";
  }
}

async function hubspotFetch(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new HubspotApiError(res.status, text, path);
  }
  return text ? (JSON.parse(text) as unknown) : null;
}

// ─── Contacts ──────────────────────────────────────────────────

function splitName(full: string): { firstname: string; lastname: string } {
  const parts = full.trim().split(/\s+/);
  return {
    firstname: parts[0] ?? "",
    lastname: parts.slice(1).join(" "),
  };
}

async function findContactIdByEmail(email: string): Promise<string | null> {
  try {
    const data = (await hubspotFetch(
      `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
    )) as { id: string };
    return data.id;
  } catch (err) {
    if (err instanceof HubspotApiError && err.status === 404) return null;
    throw err;
  }
}

async function createContact(input: {
  email: string;
  name: string;
  company: string | null;
}): Promise<string> {
  const { firstname, lastname } = splitName(input.name);
  try {
    const data = (await hubspotFetch("/crm/v3/objects/contacts", {
      method: "POST",
      body: {
        properties: {
          email: input.email,
          firstname,
          lastname,
          ...(input.company ? { company: input.company } : {}),
        },
      },
    })) as { id: string };
    return data.id;
  } catch (err) {
    // 409 means the contact already exists; the existing ID is in the message.
    if (err instanceof HubspotApiError && err.status === 409) {
      const existingId = /Existing ID: (\d+)/.exec(err.body)?.[1];
      if (existingId) return existingId;
    }
    throw err;
  }
}

async function getOrCreateContact(input: {
  email: string;
  name: string;
  company: string | null;
}): Promise<string> {
  const existing = await findContactIdByEmail(input.email);
  if (existing) return existing;
  return createContact(input);
}

// ─── Deals ─────────────────────────────────────────────────────

async function createDeal(input: {
  contactId: string;
  dealname: string;
  amountInCents: number;
  stageId: string;
}): Promise<string> {
  const data = (await hubspotFetch("/crm/v3/objects/deals", {
    method: "POST",
    body: {
      properties: {
        dealname: input.dealname,
        pipeline: PIPELINE_ID,
        dealstage: input.stageId,
        amount: (input.amountInCents / 100).toFixed(2),
      },
      associations: [
        {
          to: { id: input.contactId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: DEAL_TO_CONTACT_TYPE_ID,
            },
          ],
        },
      ],
    },
  })) as { id: string };
  return data.id;
}

async function moveDealToStage(dealId: string, stageId: string): Promise<void> {
  await hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
    method: "PATCH",
    body: { properties: { dealstage: stageId } },
  });
}

// ─── Purchase sync entry points ────────────────────────────────

type PurchaseForSync = {
  id: string;
  email: string;
  name: string;
  company: string | null;
  hubspotContactId: string | null;
  hubspotDealId: string | null;
  template: { name: string; priceInCents: number };
};

function dealNameFor(purchase: PurchaseForSync): string {
  return `${purchase.template.name} — ${purchase.company ?? purchase.name}`;
}

async function loadPurchase(
  purchaseId: string,
): Promise<PurchaseForSync | null> {
  return prisma.reportPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      email: true,
      name: true,
      company: true,
      hubspotContactId: true,
      hubspotDealId: true,
      template: { select: { name: true, priceInCents: true } },
    },
  });
}

async function createDealForPurchase(
  purchase: PurchaseForSync,
  stageId: string,
): Promise<void> {
  const contactId =
    purchase.hubspotContactId ??
    (await getOrCreateContact({
      email: purchase.email,
      name: purchase.name,
      company: purchase.company,
    }));

  const dealId = await createDeal({
    contactId,
    dealname: dealNameFor(purchase),
    amountInCents: purchase.template.priceInCents,
    stageId,
  });

  await prisma.reportPurchase.update({
    where: { id: purchase.id },
    data: { hubspotContactId: contactId, hubspotDealId: dealId },
  });

  log.info(
    { purchaseId: purchase.id, contactId, dealId, stageId },
    "HubSpot deal created for report purchase",
  );
}

/**
 * Checkout started: create the contact (if needed) and a deal in the
 * "Inbound Lead" stage. Never throws — a HubSpot outage must not affect
 * the checkout flow.
 */
export async function syncCheckoutStartedToHubspot(
  purchaseId: string,
): Promise<void> {
  if (!HUBSPOT_ENABLED) return;

  try {
    const purchase = await loadPurchase(purchaseId);
    if (!purchase) {
      log.warn({ purchaseId }, "Purchase not found for HubSpot checkout sync");
      return;
    }
    if (purchase.hubspotDealId) return;

    await createDealForPurchase(purchase, STAGE_INBOUND_LEAD);
  } catch (err) {
    log.error({ err, purchaseId }, "HubSpot checkout sync failed");
  }
}

/**
 * Purchase paid: move the existing deal to "Purchased". If no deal exists
 * (HubSpot was down at checkout, or the purchase predates deal tracking),
 * create one directly in the "Purchased" stage. Never throws.
 */
export async function syncPurchasePaidToHubspot(
  purchaseId: string,
): Promise<void> {
  if (!HUBSPOT_ENABLED) return;

  try {
    const purchase = await loadPurchase(purchaseId);
    if (!purchase) {
      log.warn({ purchaseId }, "Purchase not found for HubSpot paid sync");
      return;
    }

    if (purchase.hubspotDealId) {
      await moveDealToStage(purchase.hubspotDealId, STAGE_PURCHASED);
      log.info(
        { purchaseId, dealId: purchase.hubspotDealId },
        "HubSpot deal moved to Purchased",
      );
      return;
    }

    await createDealForPurchase(purchase, STAGE_PURCHASED);
  } catch (err) {
    log.error({ err, purchaseId }, "HubSpot paid sync failed");
  }
}
