import { expect, it, vi } from "vitest";
import { EMAIL_FROM, sendEmail } from "./email";
import { SITE_URL } from "@/lib/constants/seo";
import { sendReportPurchaseConfirmation } from "./report-purchase-notifications";

vi.mock("./email", async (original) => ({
  ...(await original<typeof import("./email")>()),
  sendEmail: vi.fn(),
}));

it("rebrands the confirmation while preserving recipient, price, escaping and purchase link", async () => {
  await sendReportPurchaseConfirmation({
    purchaseId: "fixture-id",
    name: "<Buyer> Example",
    email: "buyer@example.test",
    templateName: 'Games & "Channels"',
    amountInCents: 25000,
  });
  expect(sendEmail).toHaveBeenCalledTimes(1);
  const email = vi.mocked(sendEmail).mock.calls[0]![0];
  expect(email.to).toBe("buyer@example.test");
  expect(email.from).toBe(EMAIL_FROM.hello);
  expect(email.from).toBe("Noticed <hello@twitchmetrics.net>");
  expect(email.html).toContain("&lt;Buyer&gt;");
  expect(email.html).toContain("Games &amp; &quot;Channels&quot;");
  expect(email.html).toContain("$250.00 USD");
  expect(email.html).toContain(
    `${SITE_URL}/reports/success?purchase_id=fixture-id`,
  );
  expect(email.text).toContain("Noticed");
  expect(email.html).not.toContain("<Buyer>");
});
