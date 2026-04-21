import { NextResponse } from "next/server";
import { prisma } from "@twitchmetrics/database";
import { generateReportCsv } from "@/server/services/report-generator";
import type { TemplateConfig } from "@/lib/constants/report-templates";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const purchaseId = searchParams.get("purchase_id");

  if (!purchaseId) {
    return NextResponse.json({ error: "Missing purchase_id" }, { status: 400 });
  }

  const purchase = await prisma.reportPurchase.findUnique({
    where: { id: purchaseId },
    include: { template: true },
  });

  if (!purchase || purchase.status !== "paid") {
    return NextResponse.json(
      { error: "Purchase not found or unpaid" },
      { status: 403 },
    );
  }

  const config = purchase.template.config as TemplateConfig;
  const csv = await generateReportCsv(config, purchase.template.name);

  const filename = `${purchase.template.slug}-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
