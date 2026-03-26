"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui";
import { ProfileCompletionBar } from "./ProfileCompletionBar";
import { AccountsConnected } from "./AccountsConnected";
import { InterestsCard } from "./InterestsCard";
import { PastPartnershipsCard } from "./PastPartnershipsCard";
import { getSafeImageSrc } from "@/lib/safeImage";
import type { Platform } from "@twitchmetrics/database";

// ─── Constants ───

const GENDER_OPTIONS = [
  "Male",
  "Female",
  "Non-binary",
  "Other",
  "Prefer not to say",
];

const LANGUAGE_OPTIONS = [
  "English",
  "Spanish",
  "Portuguese",
  "French",
  "German",
  "Russian",
  "Japanese",
  "Korean",
  "Chinese",
  "Arabic",
  "Hindi",
  "Italian",
  "Dutch",
  "Polish",
  "Swedish",
  "Turkish",
  "Thai",
  "Vietnamese",
];

const INTEREST_OPTIONS = [
  "Gaming",
  "Esports",
  "Music",
  "Art",
  "Cooking",
  "Fitness",
  "Travel",
  "Technology",
  "Fashion",
  "Comedy",
  "Education",
  "IRL",
  "Sports",
  "Science",
  "Crafting",
  "Anime",
  "Movies",
  "Podcasts",
  "Photography",
  "Nature",
];

// ─── Types ───

type PlatformAccountInfo = {
  platform: Platform;
  platformUsername: string;
  avatarUrl: string | null;
  isOAuthConnected: boolean;
};

type Partnership = {
  id: string;
  brandName: string;
  brandLogoUrl: string | null;
};

export type ProfileSettingsFormProps = {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  };
  profile: {
    displayName: string;
    slug: string;
    state: string;
    bio: string | null;
    country: string | null;
    gender: string | null;
    language: string | null;
    age: number | null;
    interests: string[];
    avatarUrl: string | null;
  } | null;
  platformAccounts: PlatformAccountInfo[];
  partnerships: Partnership[];
};

// ─── Input styling ───

const INPUT_CLS =
  "w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#F2F3F5] outline-none focus:border-[#4E5058] placeholder:text-[#949BA4]";

const DISABLED_INPUT_CLS =
  "w-full rounded-lg border border-[#3F4147] bg-[#2B2D31] px-3 py-2 text-sm text-[#949BA4]";

function Label({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mb-1 block text-sm text-[#DBDEE1]">
      {children}
      {required && <span className="ml-1 text-[#E32C19]">(required)</span>}
    </label>
  );
}

// ─── Main Component ───

export function ProfileSettingsForm({
  user,
  profile,
  platformAccounts,
  partnerships,
}: ProfileSettingsFormProps) {
  // Form state
  const [displayName, setDisplayName] = useState(
    profile?.displayName ?? user.name ?? "",
  );
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [country, setCountry] = useState(profile?.country ?? "");
  const [gender, setGender] = useState(profile?.gender ?? "");
  const [language, setLanguage] = useState(profile?.language ?? "");
  const [age, setAge] = useState(profile?.age?.toString() ?? "");
  const [interests, setInterests] = useState<string[]>(
    profile?.interests ?? [],
  );
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showInterestDropdown, setShowInterestDropdown] = useState(false);

  const isClaimed =
    profile?.state === "claimed" || profile?.state === "premium";
  const avatarSrc =
    getSafeImageSrc(profile?.avatarUrl) ?? getSafeImageSrc(user.image);

  // User tag from primary connected platform
  const primaryAccount = platformAccounts[0];
  const userTag = primaryAccount ? `@${primaryAccount.platformUsername}` : null;

  const utils = trpc.useUtils();

  const updateName = trpc.auth.updateName.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const updateProfile = trpc.creator.updateProfile.useMutation({
    onSuccess: () => {
      setStatus({ type: "success", message: "Profile saved successfully." });
    },
    onError: (err) => {
      setStatus({ type: "error", message: err.message });
    },
  });

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setStatus(null);

      // Update user name if changed
      const trimmedName = displayName.trim();
      if (trimmedName && trimmedName !== user.name) {
        await updateName.mutateAsync({ name: trimmedName });
      }

      // Update creator profile if claimed
      if (isClaimed && profile) {
        const ageNum = age ? parseInt(age, 10) : undefined;
        await updateProfile.mutateAsync({
          displayName: trimmedName || undefined,
          bio: bio || undefined,
          country: country || undefined,
          gender: gender || undefined,
          language: language || undefined,
          age: ageNum && !isNaN(ageNum) ? ageNum : undefined,
          interests: interests.length > 0 ? interests : undefined,
        });
      } else {
        setStatus({ type: "success", message: "Name updated." });
      }
    },
    [
      displayName,
      bio,
      country,
      gender,
      language,
      age,
      interests,
      user.name,
      isClaimed,
      profile,
      updateName,
      updateProfile,
    ],
  );

  const toggleInterest = (interest: string) => {
    setInterests((prev) => {
      if (prev.includes(interest)) return prev.filter((i) => i !== interest);
      if (prev.length >= 10) return prev;
      return [...prev, interest];
    });
  };

  const isPending = updateName.isPending || updateProfile.isPending;

  return (
    <div className="space-y-6">
      {/* Completion Bar */}
      <ProfileCompletionBar
        displayName={displayName || null}
        email={user.email}
        avatarUrl={profile?.avatarUrl ?? user.image}
        country={country || null}
        language={language || null}
        gender={gender || null}
        age={age ? parseInt(age, 10) || null : null}
        interests={interests}
        bio={bio || null}
        connectedAccountsCount={
          platformAccounts.filter((a) => a.isOAuthConnected).length
        }
        partnershipsCount={partnerships.length}
      />

      {/* Main Form */}
      <form onSubmit={handleSave}>
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr_200px]">
            {/* Column 1 */}
            <div className="space-y-4">
              <div>
                <Label required>Name</Label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Your display name"
                  required
                />
              </div>
              <div>
                <Label>User Tag</Label>
                <input
                  value={userTag ?? "No connected account"}
                  disabled
                  className={DISABLED_INPUT_CLS}
                />
              </div>
              <div>
                <Label required>Country</Label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="e.g. United States"
                  disabled={!isClaimed}
                />
              </div>
              <div>
                <Label>Age</Label>
                <input
                  type="number"
                  min={13}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Your age"
                  disabled={!isClaimed}
                />
              </div>
            </div>

            {/* Column 2 */}
            <div className="space-y-4">
              <div>
                <Label required>Email</Label>
                <input
                  value={user.email ?? ""}
                  disabled
                  className={DISABLED_INPUT_CLS}
                />
              </div>
              <div>
                <Label>Gender</Label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={INPUT_CLS}
                  disabled={!isClaimed}
                >
                  <option value="">Select gender</option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label required>Language</Label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={INPUT_CLS}
                  disabled={!isClaimed}
                >
                  <option value="">Select language</option>
                  {LANGUAGE_OPTIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <Label required>Interests</Label>
                <button
                  type="button"
                  onClick={() => setShowInterestDropdown((v) => !v)}
                  className={`${INPUT_CLS} text-left`}
                  disabled={!isClaimed}
                >
                  {interests.length > 0
                    ? `${interests.length} selected`
                    : "Select interests"}
                </button>
                {showInterestDropdown && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#3F4147] bg-[#2B2D31] p-2 shadow-lg">
                    {INTEREST_OPTIONS.map((opt) => (
                      <label
                        key={opt}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-[#DBDEE1] hover:bg-[#383A40]"
                      >
                        <input
                          type="checkbox"
                          checked={interests.includes(opt)}
                          onChange={() => toggleInterest(opt)}
                          className="rounded border-[#3F4147]"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Column 3 — Sidebar */}
            <div className="space-y-4">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-2">
                {avatarSrc ? (
                  <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-[#3F4147]">
                    <Image
                      src={avatarSrc}
                      alt="Avatar"
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#3F4147] bg-[#383A40] text-2xl font-bold text-[#949BA4]">
                    {(displayName || "?").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              {/* Connected Accounts */}
              <AccountsConnected accounts={platformAccounts} />
            </div>
          </div>

          {/* Full-width Description */}
          <div className="mt-5">
            <Label required>Description</Label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={4}
              className={INPUT_CLS}
              placeholder="Tell brands about yourself..."
              disabled={!isClaimed}
            />
            <p className="mt-1 text-right text-xs text-[#949BA4]">
              {bio.length}/500
            </p>
          </div>

          {/* Save button */}
          <div className="mt-5 flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Profile"}
            </Button>
            {status && (
              <p
                className={`text-sm ${status.type === "success" ? "text-green-400" : "text-[#ef4444]"}`}
              >
                {status.message}
              </p>
            )}
          </div>
        </div>
      </form>

      {/* Two-column cards: Interests + Partnerships */}
      {isClaimed && (
        <div className="grid gap-6 md:grid-cols-2">
          <InterestsCard interests={interests} />
          <PastPartnershipsCard
            partnerships={partnerships}
            profileSlug={profile?.slug ?? ""}
          />
        </div>
      )}

      {/* Deferred sections */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#F2F3F5]">
              Featured Posts
            </h3>
            <span className="rounded bg-[#383A40] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#949BA4]">
              Coming Soon
            </span>
          </div>
          <p className="mt-3 text-xs text-[#949BA4]">
            Showcase your best social media posts to attract brand deals.
          </p>
        </div>
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#F2F3F5]">
              Featured Clips
            </h3>
            <span className="rounded bg-[#383A40] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#949BA4]">
              Coming Soon
            </span>
          </div>
          <p className="mt-3 text-xs text-[#949BA4]">
            Highlight your best stream clips for potential sponsors.
          </p>
        </div>
      </div>
    </div>
  );
}
