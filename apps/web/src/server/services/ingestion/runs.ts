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
  /**
   * `degraded` = the job ran but did not do its work (rate-limited, timed
   * out, or skipped too much); see resolveRunStatus. Defaults to `completed`.
   */
  status?: "completed" | "degraded";
  /** Stored on completed/degraded runs too, e.g. why a run was degraded. */
  errorSummary?: string;
  recordsScanned?: number;
  recordsWritten?: number;
  recordsSkipped?: number;
  recordsFailed?: number;
  partialCount?: number;
  quotaUsed?: number;
  metadata?: Prisma.InputJsonValue;
};

/** Share of a multi-game run's games that may be skipped before it is degraded. */
export const DEGRADED_SKIP_RATIO = 0.25;

/**
 * Status for a run that finished without throwing: `degraded` when the whole
 * upstream fetch was rate-limited / timed out, or when more than
 * DEGRADED_SKIP_RATIO of the games it planned were skipped.
 */
export function resolveRunStatus(input: {
  wholeFetchFailed?: boolean;
  gamesTotal?: number;
  gamesSkipped?: number;
}): "completed" | "degraded" {
  if (input.wholeFetchFailed) return "degraded";
  const total = input.gamesTotal ?? 0;
  const skipped = input.gamesSkipped ?? 0;
  return total > 0 && skipped / total > DEGRADED_SKIP_RATIO
    ? "degraded"
    : "completed";
}

async function updateRun(
  runId: string,
  status: "completed" | "degraded" | "failed",
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
  return updateRun(
    runId,
    summary.status ?? "completed",
    summary,
    summary.errorSummary,
  );
}

export async function failIngestionRun(
  runId: string,
  error: unknown,
  summary: IngestionRunSummary = {},
) {
  const message = error instanceof Error ? error.message : String(error);
  return updateRun(runId, "failed", summary, message.slice(0, 1000));
}

/**
 * Minimal shape of Inngest's `step.run`. Passing `step` memoizes the run
 * lifecycle so that Inngest's replay-per-step model reuses a single
 * IngestionRun row instead of creating a new "running" row on every replay.
 */
type StepRunner = {
  run: <R>(id: string, handler: () => Promise<R> | R) => Promise<unknown>;
};

export async function executeIngestionRun<T>(
  context: IngestionRunContext,
  work: () => Promise<{ result: T; summary?: IngestionRunSummary }>,
  step?: StepRunner,
): Promise<T> {
  // step.run JSON-serializes its return value; we only need the run id.
  const run = step
    ? ((await step.run("ingestion-run:start", () =>
        startIngestionRun(context),
      )) as { id: string })
    : await startIngestionRun(context);

  try {
    const { result, summary } = await work();
    if (step) {
      await step.run("ingestion-run:complete", () =>
        completeIngestionRun(run.id, summary),
      );
    } else {
      await completeIngestionRun(run.id, summary);
    }
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
