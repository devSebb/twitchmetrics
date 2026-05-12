import { NextResponse } from "next/server";
import { prisma, type Prisma } from "@twitchmetrics/database";
import { generateReportCsv } from "@/server/services/report-generator";
import type { TemplateConfig } from "@/lib/constants/report-templates";

type StoredReportArtifact = {
  csv?: string;
  filename?: string;
  generatedAt?: string;
};

type StoredFormData = {
  entityIds?: string[];
  metrics?: string[];
  reportArtifact?: StoredReportArtifact;
};

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
  const formData = (purchase.formData as StoredFormData) ?? {};

  if (
    config.includes[0] === "games" &&
    typeof formData.reportArtifact?.csv === "string" &&
    typeof formData.reportArtifact.filename === "string"
  ) {
    return new NextResponse(formData.reportArtifact.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${formData.reportArtifact.filename}"`,
      },
    });
  }

  const generateArgs = {
    entityIds: formData.entityIds ?? [],
    ...(config.includes[0] === "games"
      ? { selectedMetrics: formData.metrics ?? [] }
      : {}),
  };
  const csv = await generateReportCsv(
    config,
    purchase.template.name,
    generateArgs,
  );

  const filename = `${purchase.template.slug}-${new Date().toISOString().split("T")[0]}.csv`;

  if (config.includes[0] === "games") {
    await prisma.reportPurchase.update({
      where: { id: purchase.id },
      data: {
        formData: {
          ...formData,
          reportArtifact: {
            csv,
            filename,
            generatedAt: new Date().toISOString(),
          },
        } satisfies Prisma.InputJsonValue,
      },
    });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
