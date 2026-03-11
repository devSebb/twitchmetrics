import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;

  const creator = await db.creatorProfile.findUnique({
    where: { slug },
    include: {
      platformAccounts: true,
      growthRollups: {
        orderBy: { computedAt: "desc" },
      },
      brandPartnerships: {
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!creator) {
    return NextResponse.json(
      {
        data: null,
        meta: {},
        error: "Creator not found",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    serializeBigInt({
      data: creator,
      meta: {},
    }),
  );
}
