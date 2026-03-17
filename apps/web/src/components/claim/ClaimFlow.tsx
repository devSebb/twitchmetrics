"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { signIn } from "next-auth/react";
import type { Platform } from "@twitchmetrics/database";
import { trpc } from "@/lib/trpc";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { getSafeImageSrc } from "@/lib/safeImage";
import { formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

type ClaimableProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  slug: string;
  primaryPlatform: Platform;
  totalFollowers: string;
};

type Step = "confirm" | "method" | "action" | "result";
type MethodChoice = "oauth" | "bio_challenge" | "manual_review";

type ClaimFlowProps = {
  profile: ClaimableProfile;
  autoResumeOAuth?: boolean;
};

const PLATFORM_BIO_INSTRUCTIONS: Record<string, string> = {
  twitch:
    "Go to your Twitch channel → About → Edit → paste the code into your bio",
  youtube:
    "Go to YouTube Studio → Customization → Basic info → Description → paste the code",
  x: "Go to your X profile → Edit profile → Bio → paste the code",
  instagram: "Go to Instagram → Edit Profile → Bio → paste the code",
  tiktok: "Go to TikTok → Edit profile → Bio → paste the code",
};

function ProfileCard({ profile }: { profile: ClaimableProfile }) {
  const platformConfig = PLATFORM_CONFIG[profile.primaryPlatform];
  const avatarSrc = getSafeImageSrc(profile.avatarUrl);

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-[#383A40]">
        {avatarSrc ? (
          <Image
            src={avatarSrc}
            alt={profile.displayName}
            fill
            className="object-cover"
            sizes="56px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-bold text-white bg-[#9146ff]">
            {profile.displayName.charAt(0)}
          </div>
        )}
      </div>
      <div>
        <p className="text-lg font-semibold text-[#F2F3F5]">
          {profile.displayName}
        </p>
        <p className="text-sm text-[#949BA4]">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: platformConfig.color }}
          />
          {platformConfig.name} · {formatNumber(Number(profile.totalFollowers))}{" "}
          followers
        </p>
      </div>
    </div>
  );
}

export function ClaimFlow({ profile, autoResumeOAuth }: ClaimFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(
    autoResumeOAuth ? "action" : "confirm",
  );
  const [selectedMethod, setSelectedMethod] = useState<MethodChoice | null>(
    autoResumeOAuth ? "oauth" : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([""]);
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [bioCooldown, setBioCooldown] = useState(0);
  const autoResumeTriggered = useRef(false);

  const platformConfig = PLATFORM_CONFIG[profile.primaryPlatform];
  const followers = Number(profile.totalFollowers);
  const isHighValue = Number.isFinite(followers) && followers > 100_000;

  const statusQuery = trpc.claim.getStatus.useQuery(
    { creatorProfileId: profile.id },
    {
      refetchInterval: step === "result" && activeClaimId ? 5000 : false,
    },
  );

  const connectionQuery = trpc.claim.checkConnection.useQuery(
    { creatorProfileId: profile.id },
    { enabled: selectedMethod === "oauth" },
  );

  const initiateMutation = trpc.claim.initiate.useMutation();
  const verifyBioMutation = trpc.claim.verifyBio.useMutation();

  const status = statusQuery.data;

  // Bio cooldown timer
  useEffect(() => {
    if (bioCooldown <= 0) return;
    const timer = setInterval(() => {
      setBioCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [bioCooldown]);

  // Auto-resume OAuth claim on return from OAuth flow
  useEffect(() => {
    if (!autoResumeOAuth || autoResumeTriggered.current) return;
    if (!connectionQuery.data) return;
    autoResumeTriggered.current = true;

    if (connectionQuery.data.matches) {
      void handleInitiateClaim("oauth");
    }
  }, [autoResumeOAuth, connectionQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // If existing claim is already approved, jump to result
  useEffect(() => {
    if (status?.status === "approved") {
      setStep("result");
    }
  }, [status?.status]);

  const handleInitiateClaim = useCallback(
    async (method: MethodChoice) => {
      setError(null);
      try {
        const validUrls =
          method === "manual_review"
            ? evidenceUrls.filter((u) => u.trim().length > 0)
            : undefined;

        const result = await initiateMutation.mutateAsync({
          creatorProfileId: profile.id,
          method,
          platform: profile.primaryPlatform,
          ...(validUrls && validUrls.length > 0
            ? { evidenceUrls: validUrls }
            : {}),
        });

        if (result.status === "rejected") {
          setError(result.reason);
          return;
        }

        setActiveClaimId(result.claimRequestId);
        await statusQuery.refetch();
        setStep("result");
      } catch (cause) {
        const msg =
          cause instanceof Error ? cause.message : "Claim initiation failed";
        setError(msg);
      }
    },
    [evidenceUrls, initiateMutation, profile, statusQuery],
  );

  const handleVerifyBio = useCallback(async () => {
    const claimId = activeClaimId ?? status?.id;
    if (!claimId) return;
    setError(null);
    setBioCooldown(5);

    try {
      const result = await verifyBioMutation.mutateAsync({
        claimRequestId: claimId,
      });
      await statusQuery.refetch();

      if (result.verified) {
        setStep("result");
      } else if (result.attemptsRemaining <= 0) {
        setStep("result");
      }
    } catch (cause) {
      const msg =
        cause instanceof Error ? cause.message : "Verification failed";
      setError(msg);
    }
  }, [activeClaimId, status?.id, verifyBioMutation, statusQuery]);

  const challengeExpiresIn = useMemo(() => {
    const expiresAt = status?.challengeExpiresAt;
    if (!expiresAt) return null;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "Expired";
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    return `${hours}h ${minutes}m`;
  }, [status?.challengeExpiresAt]);

  // ─── Step: Confirm ───
  if (step === "confirm") {
    return (
      <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
        <h2 className="text-lg font-semibold text-[#F2F3F5] mb-4">
          Is this your profile?
        </h2>
        <ProfileCard profile={profile} />
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setStep("method")}
            className="rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#C72615] transition-colors"
          >
            Yes, this is me
          </button>
          <button
            type="button"
            onClick={() => router.push("/claim")}
            className="rounded-lg border border-[#3F4147] bg-[#383A40] px-4 py-2.5 text-sm font-semibold text-[#DBDEE1] hover:bg-[#4E5058] transition-colors"
          >
            Not my profile
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: Method Selection ───
  if (step === "method") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
          <ProfileCard profile={profile} />
        </div>

        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
          <h2 className="text-lg font-semibold text-[#F2F3F5] mb-1">
            Choose Verification Method
          </h2>
          <p className="text-sm text-[#949BA4] mb-4">
            Select how you&apos;d like to prove ownership of this profile.
          </p>

          <div className="grid gap-3">
            {/* OAuth */}
            <button
              type="button"
              onClick={() => {
                setSelectedMethod("oauth");
                setStep("action");
              }}
              className="flex items-start gap-4 rounded-lg border border-[#3F4147] bg-[#383A40] p-4 text-left transition-colors hover:border-[#E32C19]/50 hover:bg-[#3F4147]"
            >
              <div
                className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${platformConfig.color}20` }}
              >
                <svg
                  className="h-5 w-5"
                  style={{ color: platformConfig.color }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#F2F3F5]">
                    Verify with {platformConfig.name}
                  </span>
                  <span className="rounded-full bg-[#E32C19]/20 px-2 py-0.5 text-[10px] font-semibold text-[#E32C19]">
                    Recommended
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[#949BA4]">
                  Sign in with your {platformConfig.name} account to instantly
                  verify ownership. Takes ~30 seconds.
                </p>
              </div>
            </button>

            {/* Bio Challenge */}
            <button
              type="button"
              disabled={isHighValue}
              onClick={() => {
                setSelectedMethod("bio_challenge");
                setStep("action");
              }}
              className={cn(
                "flex items-start gap-4 rounded-lg border border-[#3F4147] bg-[#383A40] p-4 text-left transition-colors",
                isHighValue
                  ? "cursor-not-allowed opacity-50"
                  : "hover:border-[#4E5058] hover:bg-[#3F4147]",
              )}
              title={
                isHighValue
                  ? "OAuth verification required for profiles with 100k+ followers"
                  : undefined
              }
            >
              <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#f59e0b]/10">
                <svg
                  className="h-5 w-5 text-[#f59e0b]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <span className="text-sm font-semibold text-[#F2F3F5]">
                  Bio Verification
                </span>
                <p className="mt-0.5 text-xs text-[#949BA4]">
                  Add a code to your {platformConfig.name.toLowerCase()} bio and
                  we&apos;ll check it. Takes ~5 minutes.
                </p>
                {isHighValue && (
                  <p className="mt-1 text-xs text-[#f87171]">
                    Not available for profiles with 100k+ followers
                  </p>
                )}
              </div>
            </button>

            {/* Manual Review */}
            <button
              type="button"
              disabled={isHighValue}
              onClick={() => {
                setSelectedMethod("manual_review");
                setStep("action");
              }}
              className={cn(
                "flex items-start gap-4 rounded-lg border border-[#3F4147] bg-[#383A40] p-4 text-left transition-colors",
                isHighValue
                  ? "cursor-not-allowed opacity-50"
                  : "hover:border-[#4E5058] hover:bg-[#3F4147]",
              )}
              title={
                isHighValue
                  ? "OAuth verification required for profiles with 100k+ followers"
                  : undefined
              }
            >
              <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#6366f1]/10">
                <svg
                  className="h-5 w-5 text-[#6366f1]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <span className="text-sm font-semibold text-[#F2F3F5]">
                  Manual Review
                </span>
                <p className="mt-0.5 text-xs text-[#949BA4]">
                  Submit proof of ownership for our team to review. 24-48 hours.
                </p>
                {isHighValue && (
                  <p className="mt-1 text-xs text-[#f87171]">
                    Not available for profiles with 100k+ followers
                  </p>
                )}
              </div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setStep("confirm")}
            className="mt-4 text-xs text-[#949BA4] hover:text-[#DBDEE1] transition-colors"
          >
            ← Back
          </button>
        </div>

        {error && <p className="text-sm text-[#f87171]">{error}</p>}
      </div>
    );
  }

  // ─── Step: Action ───
  if (step === "action") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
          <ProfileCard profile={profile} />
        </div>

        {/* OAuth Action */}
        {selectedMethod === "oauth" && (
          <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
            <h2 className="text-lg font-semibold text-[#F2F3F5] mb-2">
              Verify with {platformConfig.name}
            </h2>

            {connectionQuery.isLoading ? (
              <p className="text-sm text-[#949BA4]">
                Checking connection status...
              </p>
            ) : connectionQuery.data?.matches ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg bg-[#22c55e]/10 px-3 py-2">
                  <svg
                    className="h-4 w-4 text-[#22c55e]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-sm text-[#86efac]">
                    {platformConfig.name} account connected and matches!
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleInitiateClaim("oauth")}
                  disabled={initiateMutation.isPending}
                  className="rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#C72615] transition-colors disabled:opacity-50"
                >
                  {initiateMutation.isPending
                    ? "Verifying..."
                    : "Complete Verification"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#DBDEE1]">
                  {connectionQuery.data?.connected
                    ? `Your connected ${platformConfig.name} account doesn't match this profile. Please connect the correct account.`
                    : `Connect your ${platformConfig.name} account to verify you own this profile.`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const provider =
                      connectionQuery.data?.provider ?? profile.primaryPlatform;
                    void signIn(provider, {
                      callbackUrl: `/claim?profile=${profile.id}&resume=oauth`,
                    });
                  }}
                  className="rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#C72615] transition-colors"
                >
                  Connect {platformConfig.name}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setSelectedMethod(null);
                setStep("method");
              }}
              className="mt-4 text-xs text-[#949BA4] hover:text-[#DBDEE1] transition-colors"
            >
              ← Choose different method
            </button>
          </div>
        )}

        {/* Bio Challenge Action */}
        {selectedMethod === "bio_challenge" && (
          <BioActionStep
            profile={profile}
            platformConfig={platformConfig}
            status={status}
            activeClaimId={activeClaimId}
            bioCooldown={bioCooldown}
            challengeExpiresIn={challengeExpiresIn}
            initiateMutation={initiateMutation}
            verifyBioMutation={verifyBioMutation}
            onInitiate={() => handleInitiateClaim("bio_challenge")}
            onVerify={handleVerifyBio}
            onBack={() => {
              setSelectedMethod(null);
              setStep("method");
            }}
            error={error}
          />
        )}

        {/* Manual Review Action */}
        {selectedMethod === "manual_review" && (
          <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
            <h2 className="text-lg font-semibold text-[#F2F3F5] mb-2">
              Manual Review
            </h2>
            <p className="text-sm text-[#949BA4] mb-4">
              Provide links that prove you own this profile (screenshots, social
              media posts, etc.)
            </p>

            <div className="space-y-2 mb-3">
              <label className="text-xs font-medium text-[#DBDEE1]">
                Evidence URLs (up to 5)
              </label>
              {evidenceUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      const next = [...evidenceUrls];
                      next[i] = e.target.value;
                      setEvidenceUrls(next);
                    }}
                    placeholder="https://..."
                    className="flex-1 rounded-lg border border-[#3F4147] bg-[#1E1F22] px-3 py-2 text-sm text-[#F2F3F5] outline-none focus:border-[#E32C19]/50 placeholder-[#949BA4]"
                  />
                  {evidenceUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setEvidenceUrls(evidenceUrls.filter((_, j) => j !== i))
                      }
                      className="text-[#949BA4] hover:text-[#f87171] px-1"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {evidenceUrls.length < 5 && (
                <button
                  type="button"
                  onClick={() => setEvidenceUrls([...evidenceUrls, ""])}
                  className="text-xs text-[#E32C19] hover:underline"
                >
                  + Add another URL
                </button>
              )}
            </div>

            <div className="mb-4">
              <label className="text-xs font-medium text-[#DBDEE1]">
                Additional notes (optional)
              </label>
              <textarea
                value={evidenceNotes}
                onChange={(e) => setEvidenceNotes(e.target.value.slice(0, 500))}
                placeholder="Any additional context..."
                rows={3}
                className="mt-1 w-full rounded-lg border border-[#3F4147] bg-[#1E1F22] px-3 py-2 text-sm text-[#F2F3F5] outline-none focus:border-[#E32C19]/50 placeholder-[#949BA4] resize-none"
              />
              <div className="text-right text-xs text-[#949BA4]">
                {evidenceNotes.length}/500
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleInitiateClaim("manual_review")}
              disabled={
                initiateMutation.isPending ||
                evidenceUrls.every((u) => u.trim().length === 0)
              }
              className="rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#C72615] transition-colors disabled:opacity-50"
            >
              {initiateMutation.isPending
                ? "Submitting..."
                : "Submit for Review"}
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedMethod(null);
                setStep("method");
              }}
              className="ml-3 mt-4 text-xs text-[#949BA4] hover:text-[#DBDEE1] transition-colors"
            >
              ← Choose different method
            </button>
          </div>
        )}

        {error && selectedMethod !== "bio_challenge" && (
          <p className="text-sm text-[#f87171]">{error}</p>
        )}
      </div>
    );
  }

  // ─── Step: Result ───
  const resultStatus = status?.status;
  const resultMethod = status?.method ?? selectedMethod;

  if (resultStatus === "approved") {
    return (
      <div className="rounded-xl border border-[#22c55e]/40 bg-[#22c55e]/10 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#22c55e]/20">
            <svg
              className="h-5 w-5 text-[#22c55e]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#86efac]">
              You now manage {profile.displayName}!
            </h2>
            <p className="text-sm text-[#DBDEE1]">
              Your claim was approved. Access creator tools and analytics from
              your dashboard.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard/home")}
          className="rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#C72615] transition-colors"
        >
          Go to Dashboard
        </button>
        <AutoRedirect to="/dashboard/home" delay={5000} />
      </div>
    );
  }

  if (resultStatus === "pending" && resultMethod === "bio_challenge") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
          <ProfileCard profile={profile} />
        </div>
        <BioActionStep
          profile={profile}
          platformConfig={platformConfig}
          status={status}
          activeClaimId={activeClaimId}
          bioCooldown={bioCooldown}
          challengeExpiresIn={challengeExpiresIn}
          initiateMutation={initiateMutation}
          verifyBioMutation={verifyBioMutation}
          onInitiate={() => handleInitiateClaim("bio_challenge")}
          onVerify={handleVerifyBio}
          onBack={() => {
            setSelectedMethod(null);
            setStep("method");
          }}
          error={error}
        />
      </div>
    );
  }

  if (resultStatus === "pending" && resultMethod === "manual_review") {
    return (
      <div className="rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/10 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f59e0b]/20">
            <svg
              className="h-5 w-5 text-[#f59e0b]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#fcd34d]">
              Claim Submitted
            </h2>
            <p className="text-sm text-[#DBDEE1]">
              Your claim has been submitted for review. We&apos;ll notify you
              within 24-48 hours.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard/home")}
          className="rounded-lg border border-[#3F4147] bg-[#383A40] px-4 py-2.5 text-sm font-semibold text-[#DBDEE1] hover:bg-[#4E5058] transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (resultStatus === "rejected" || resultStatus === "expired") {
    return (
      <div className="rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ef4444]/20">
            <svg
              className="h-5 w-5 text-[#ef4444]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#fca5a5]">
              {resultStatus === "expired"
                ? "Verification Expired"
                : "Claim Rejected"}
            </h2>
            <p className="text-sm text-[#DBDEE1]">
              {resultStatus === "expired"
                ? "Your verification window expired. Please try again."
                : "Your claim could not be verified. Please try a different method."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setSelectedMethod(null);
            setActiveClaimId(null);
            setStep("method");
          }}
          className="rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#C72615] transition-colors"
        >
          Try Another Method
        </button>
      </div>
    );
  }

  // Fallback: loading/pending state
  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6 text-center">
      <p className="text-sm text-[#949BA4]">Processing your claim...</p>
    </div>
  );
}

// ─── Bio Action Sub-Component ───

type BioActionStepProps = {
  profile: ClaimableProfile;
  platformConfig: { name: string; color: string };
  status:
    | {
        id: string;
        challengeCode: string | null;
        attemptsRemaining: number | null;
        challengeExpiresAt: string | null;
      }
    | null
    | undefined;
  activeClaimId: string | null;
  bioCooldown: number;
  challengeExpiresIn: string | null;
  initiateMutation: { isPending: boolean };
  verifyBioMutation: { isPending: boolean };
  onInitiate: () => void;
  onVerify: () => void;
  onBack: () => void;
  error: string | null;
};

function BioActionStep({
  profile,
  platformConfig,
  status,
  activeClaimId,
  bioCooldown,
  challengeExpiresIn,
  initiateMutation,
  verifyBioMutation,
  onInitiate,
  onVerify,
  onBack,
  error,
}: BioActionStepProps) {
  const challengeCode = status?.challengeCode;
  const hasChallenge = !!challengeCode || !!activeClaimId;
  const [copied, setCopied] = useState(false);

  const platformKey = profile.primaryPlatform.toLowerCase();
  const instructions =
    PLATFORM_BIO_INSTRUCTIONS[platformKey] ??
    `Add the code to your ${platformConfig.name} profile bio`;

  const handleCopy = useCallback(async () => {
    if (!challengeCode) return;
    try {
      await navigator.clipboard.writeText(challengeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select + copy
    }
  }, [challengeCode]);

  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-6">
      <h2 className="text-lg font-semibold text-[#F2F3F5] mb-2">
        Bio Verification
      </h2>

      {!hasChallenge ? (
        <div className="space-y-3">
          <p className="text-sm text-[#DBDEE1]">
            We&apos;ll generate a unique code for you to add to your{" "}
            {platformConfig.name} bio.
          </p>
          <button
            type="button"
            onClick={onInitiate}
            disabled={initiateMutation.isPending}
            className="rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#C72615] transition-colors disabled:opacity-50"
          >
            {initiateMutation.isPending
              ? "Generating code..."
              : "Generate Verification Code"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Challenge code with copy */}
          {challengeCode && (
            <div>
              <label className="text-xs font-medium text-[#949BA4] mb-1 block">
                Your verification code
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-[#1E1F22] px-3 py-2.5 text-sm font-mono text-[#fca5a5] select-all">
                  {challengeCode}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2.5 text-xs font-medium text-[#DBDEE1] hover:bg-[#4E5058] transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {/* Platform instructions */}
          <div className="rounded-lg bg-[#1E1F22] px-3 py-2.5">
            <p className="text-xs font-medium text-[#949BA4] mb-1">
              Instructions
            </p>
            <p className="text-sm text-[#DBDEE1]">{instructions}</p>
          </div>

          {/* Expiry countdown */}
          {challengeExpiresIn && (
            <p className="text-xs text-[#949BA4]">
              Expires in {challengeExpiresIn}
            </p>
          )}

          {/* Verify button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onVerify}
              disabled={verifyBioMutation.isPending || bioCooldown > 0}
              className="rounded-lg bg-[#E32C19] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#C72615] transition-colors disabled:opacity-50"
            >
              {verifyBioMutation.isPending
                ? "Checking..."
                : bioCooldown > 0
                  ? `Wait ${bioCooldown}s`
                  : "I've added the code — Verify Now"}
            </button>
            {status?.attemptsRemaining != null && (
              <span className="text-xs text-[#949BA4]">
                Attempts remaining: {status.attemptsRemaining}/3
              </span>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-[#f87171]">{error}</p>}

      <button
        type="button"
        onClick={onBack}
        className="mt-4 text-xs text-[#949BA4] hover:text-[#DBDEE1] transition-colors"
      >
        ← Choose different method
      </button>
    </div>
  );
}

function AutoRedirect({ to, delay }: { to: string; delay: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.push(to), delay);
    return () => clearTimeout(timer);
  }, [to, delay, router]);
  return null;
}
