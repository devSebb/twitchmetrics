"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClaimMethod, Platform } from "@twitchmetrics/database";
import { trpc } from "@/lib/trpc";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";

type ClaimableProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  slug: string;
  primaryPlatform: Platform;
  totalFollowers: string;
};

type ClaimFlowProps = {
  profile: ClaimableProfile;
};

export function ClaimFlow({ profile }: ClaimFlowProps) {
  const router = useRouter();
  const [method, setMethod] = useState<ClaimMethod | null>(null);
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);

  const statusQuery = trpc.claim.getStatus.useQuery(
    { creatorProfileId: profile.id },
    { refetchInterval: 5000 },
  );
  const initiateMutation = trpc.claim.initiate.useMutation();
  const verifyBioMutation = trpc.claim.verifyBio.useMutation();

  const followers = Number(profile.totalFollowers);
  const isHighValue = Number.isFinite(followers) && followers > 100_000;

  const status = statusQuery.data;
  const isSuccess = status?.status === "approved";
  const isPending = status?.status === "pending";
  const challengeCode = status?.challengeCode ?? null;

  const evidenceUrls = useMemo(() => {
    return evidence
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }, [evidence]);

  async function startClaim(nextMethod: ClaimMethod) {
    setError(null);
    setMethod(nextMethod);
    try {
      const result = await initiateMutation.mutateAsync({
        creatorProfileId: profile.id,
        method: nextMethod,
        platform: profile.primaryPlatform,
        evidenceUrls: nextMethod === "manual_review" ? evidenceUrls : undefined,
      });

      if (result.status === "rejected") {
        setError(result.reason);
        return;
      }

      setActiveClaimId(result.claimRequestId);
      await statusQuery.refetch();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Claim initiation failed",
      );
    }
  }

  async function checkBioNow() {
    if (!status?.id) return;
    await verifyBioMutation.mutateAsync({ claimRequestId: status.id });
    await statusQuery.refetch();
  }

  if (isSuccess) {
    return (
      <div className="rounded-xl border border-[#22c55e]/40 bg-[#22c55e]/10 p-6">
        <h2 className="text-2xl font-bold text-[#86efac]">
          You now manage {profile.displayName}!
        </h2>
        <p className="mt-2 text-sm text-[#DBDEE1]">
          Your claim was approved. You can now access creator tools and
          connected analytics.
        </p>
        <button
          type="button"
          onClick={() => router.push("/home")}
          className="mt-4 rounded-lg bg-[#E32C19] px-4 py-2 text-sm font-semibold text-white"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
        <h2 className="text-lg font-semibold text-[#F2F3F5]">
          Profile Preview
        </h2>
        <p className="mt-2 text-sm text-[#949BA4]">Is this your profile?</p>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#383A40] text-[#DBDEE1]">
            {profile.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-[#F2F3F5]">
              {profile.displayName}
            </p>
            <p className="text-xs text-[#949BA4]">
              {PLATFORM_CONFIG[profile.primaryPlatform].name} •{" "}
              {Number(profile.totalFollowers).toLocaleString()} followers
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
        <h3 className="text-lg font-semibold text-[#F2F3F5]">
          Choose Verification Method
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => startClaim("oauth")}
            className="rounded-lg bg-[#E32C19] px-3 py-3 text-sm font-semibold text-white"
          >
            Connect {PLATFORM_CONFIG[profile.primaryPlatform].name}{" "}
            (Recommended)
          </button>
          <button
            type="button"
            disabled={isHighValue}
            onClick={() => startClaim("bio_challenge")}
            className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-3 text-sm font-semibold text-[#DBDEE1] disabled:cursor-not-allowed disabled:opacity-50"
            title={isHighValue ? "OAuth required for top creators" : undefined}
          >
            Verify via Bio Challenge
          </button>
          <button
            type="button"
            onClick={() => setMethod("manual_review")}
            className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-3 text-sm font-semibold text-[#DBDEE1]"
          >
            Request Manual Review
          </button>
        </div>

        {method === "manual_review" && (
          <div className="mt-4 space-y-2">
            <label className="block text-sm text-[#DBDEE1]">
              Evidence URLs (one per line)
            </label>
            <textarea
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              className="h-24 w-full rounded-lg border border-[#3F4147] bg-[#383A40] p-3 text-sm text-[#F2F3F5] outline-none"
              placeholder="https://..."
            />
            <button
              type="button"
              onClick={() => startClaim("manual_review")}
              className="rounded-lg bg-[#E32C19] px-3 py-2 text-sm font-semibold text-white"
            >
              Submit for Manual Review
            </button>
          </div>
        )}
      </div>

      {(isPending || activeClaimId) && (
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
          <h3 className="text-lg font-semibold text-[#F2F3F5]">
            Verification Progress
          </h3>
          {challengeCode ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-[#DBDEE1]">
                Add this code to your bio, then click check:
              </p>
              <code className="inline-block rounded bg-[#1E1F22] px-2 py-1 text-sm text-[#fca5a5]">
                {challengeCode}
              </code>
              <div>
                <button
                  type="button"
                  onClick={checkBioNow}
                  className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm font-semibold text-[#DBDEE1]"
                >
                  Check Now
                </button>
              </div>
              <p className="text-xs text-[#949BA4]">
                Attempts remaining: {status?.attemptsRemaining ?? 3}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#DBDEE1]">
              Your claim is being processed. For manual review, expected
              response is 24-48 hours.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-[#f87171]">{error}</p>}
    </div>
  );
}
