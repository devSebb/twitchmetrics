import { prisma, Prisma } from "@twitchmetrics/database";

export interface AuditLogInput {
  userId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Fire-and-forget audit log writer. Never throws — errors are swallowed to
 * avoid breaking the calling operation.
 */
export function logAudit(input: AuditLogInput): void {
  prisma.auditLog
    .create({
      data: {
        userId: input.userId,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata
          ? (input.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
    .catch((err: unknown) => {
      console.error("[audit] Failed to write audit log", {
        action: input.action,
        err,
      });
    });
}
