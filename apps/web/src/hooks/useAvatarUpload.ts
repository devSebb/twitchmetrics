"use client";

import { useCallback, useState } from "react";
import { trpc } from "@/lib/trpc";

type UploadStatus = "idle" | "uploading" | "error";

const PRESIGN_TIMEOUT_MS = 30_000;

type UseAvatarUploadOptions = {
  onUploaded?: (avatarUrl: string) => void;
  onRemoved?: () => void;
};

/**
 * Encapsulates the three-step avatar upload flow:
 *   1. presignAvatarUpload  → signed PUT URL
 *   2. fetch(uploadUrl, PUT, file)
 *   3. commitAvatar         → DB write
 *
 * Plus a one-shot remove. Caller gets a single { upload, remove, status, error }
 * surface and a callback when the public URL is ready.
 */
export function useAvatarUpload({
  onUploaded,
  onRemoved,
}: UseAvatarUploadOptions = {}) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const presignMutation = trpc.auth.presignAvatarUpload.useMutation();
  const commitMutation = trpc.auth.commitAvatar.useMutation();
  const removeMutation = trpc.auth.removeAvatar.useMutation();

  const upload = useCallback(
    async (file: File) => {
      setStatus("uploading");
      setError(null);
      try {
        const presigned = await presignMutation.mutateAsync({
          contentType: file.type,
          sizeBytes: file.size,
        });

        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          PRESIGN_TIMEOUT_MS,
        );

        const putResponse = await fetch(presigned.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!putResponse.ok) {
          throw new Error(
            `Upload failed (status ${putResponse.status}). Try again.`,
          );
        }

        const committed = await commitMutation.mutateAsync({
          key: presigned.key,
        });

        await Promise.all([
          utils.auth.me.invalidate(),
          utils.auth.canEditAvatar.invalidate(),
        ]);

        setStatus("idle");
        onUploaded?.(committed.avatarUrl);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    },
    [presignMutation, commitMutation, utils, onUploaded],
  );

  const remove = useCallback(async () => {
    setStatus("uploading");
    setError(null);
    try {
      await removeMutation.mutateAsync();
      await Promise.all([
        utils.auth.me.invalidate(),
        utils.auth.canEditAvatar.invalidate(),
      ]);
      setStatus("idle");
      onRemoved?.();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Remove failed.");
    }
  }, [removeMutation, utils, onRemoved]);

  return {
    upload,
    remove,
    status,
    error,
    isBusy: status === "uploading",
  };
}
