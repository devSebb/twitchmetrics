import { Prisma, prisma } from "@twitchmetrics/database";
import { createLogger } from "@/lib/logger";

const log = createLogger("ingestion-runs");

export type IngestionRunContext = {
  domain: "creator" | "game" | "platform" | "system";
  scope: "discovery" | "snapshot" | "aggregate" | "enrichment" | "maintenance";
  jobType: string;
  platform?: string | null;
};

export type IngestionRunSummary = {
  recordsScanned?: number;
  recordsWritten?: number;
  recordsSkipped?: number;
  recordsFailed?: number;
  partialCount?: number;
  quotaUsed?: number;
  metadata?: Prisma.InputJsonValue;
};

async function updateRun(
  runId: string,
  status: "completed" | "failed",
  summary: IngestionRunSummary = {},
  errorSummary?: string,
) {
  return prisma.ingestionRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      recordsScanned: summary.recordsScanned ?? 0,
      recordsWritten: summary.recordsWritten ?? 0,
      recordsSkipped: summary.recordsSkipped ?? 0,
      recordsFailed: summary.recordsFailed ?? 0,
      partialCount: summary.partialCount ?? 0,
      quotaUsed: summary.quotaUsed ?? null,
      metadata: summary.metadata ?? Prisma.JsonNull,
      errorSummary: errorSummary ?? null,
    },
  });
}

export async function startIngestionRun(context: IngestionRunContext) {
  return prisma.ingestionRun.create({
    data: {
      domain: context.domain,
      scope: context.scope,
      jobType: context.jobType,
      platform: context.platform ?? null,
      status: "running",
      startedAt: new Date(),
    },
  });
}

export async function completeIngestionRun(
  runId: string,
  summary: IngestionRunSummary = {},
) {
  return updateRun(runId, "completed", summary);
}

export async function failIngestionRun(
  runId: string,
  error: unknown,
  summary: IngestionRunSummary = {},
) {
  const message = error instanceof Error ? error.message : String(error);
  return updateRun(runId, "failed", summary, message.slice(0, 1000));
}

export async function executeIngestionRun<T>(
  context: IngestionRunContext,
  work: () => Promise<{ result: T; summary?: IngestionRunSummary }>,
): Promise<T> {
  const run = await startIngestionRun(context);

  try {
    const { result, summary } = await work();
    await completeIngestionRun(run.id, summary);
    return result;
  } catch (error) {
    await failIngestionRun(run.id, error);
    log.error(
      {
        runId: run.id,
        jobType: context.jobType,
        domain: context.domain,
        platform: context.platform,
        error,
      },
      "Ingestion run failed",
    );
    throw error;
  }
}
