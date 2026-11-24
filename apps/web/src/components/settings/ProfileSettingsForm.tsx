"use client";

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui";
import { EditableAvatar } from "@/components/avatar/EditableAvatar";
import { resolveAvatar } from "@/lib/avatar";
import { MAX_PROFILE_INTERESTS } from "@/lib/constants/profile";
import { ProfileCompletionBar } from "./ProfileCompletionBar";
import { AccountsConnected } from "./AccountsConnected";
import { InterestsCard } from "./InterestsCard";
import { PastPartnershipsCard } from "./PastPartnershipsCard";
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
    customAvatarUrl: string | null;
  } | null;
  platformAccounts: PlatformAccountInfo[];
  partnerships: Partnership[];
};

// ─── Input styling ───

const INPUT_CLS = "n-input";

const DISABLED_INPUT_CLS =
  "w-full rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-slate";

function Label({
  children,
  required,
  htmlFor,
}: {
  children: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-n-ink"
    >
      {children}
      {required && <span className="ml-1 text-n-red">(required)</span>}
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
  const [customAvatarOverride, setCustomAvatarOverride] = useState<
    string | null
  >(profile?.customAvatarUrl ?? null);
  const hasDefaultAvatar = Boolean(
    profile?.avatarUrl ||
    user.image ||
    platformAccounts.some((account) => account.avatarUrl),
  );
  const canUploadAvatar = !hasDefaultAvatar;
  const resolvedAvatar = resolveAvatar("creator", {
    user,
    creator: {
      avatarUrl: profile?.avatarUrl ?? null,
      customAvatarUrl: customAvatarOverride,
      platformAccounts: platformAccounts.map((a) => ({
        platformAvatarUrl: a.avatarUrl,
      })),
    },
  });

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
      try {
        const trimmedName = displayName.trim();
        if (trimmedName && trimmedName !== user.name) {
          await updateName.mutateAsync({ name: trimmedName });
        }

        // Update creator profile if user has one
        if (profile) {
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
      } catch (error) {
        setStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "We couldn’t save your profile. Please try again.",
        });
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
      profile,
      updateName,
      updateProfile,
    ],
  );

  const toggleInterest = (interest: string) => {
    setInterests((prev) => {
      if (prev.includes(interest)) return prev.filter((i) => i !== interest);
      if (prev.length >= MAX_PROFILE_INTERESTS) return prev;
      return [...prev, interest];
    });
  };

  const isPending = updateName.isPending || updateProfile.isPending;
  const hasReachedInterestLimit = interests.length >= MAX_PROFILE_INTERESTS;

  return (
    <div className="space-y-10">
      {/* Completion Bar */}
      <ProfileCompletionBar
        displayName={displayName || null}
        email={user.email}
        avatarUrl={resolvedAvatar}
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
        <section className="border-t border-n-line pt-7">
          <h2 className="text-2xl font-bold tracking-tight">Profile details</h2>
          <p className="mt-2 mb-7 max-w-2xl text-sm leading-relaxed text-n-slate">
            Tell visitors who you are. Your connected accounts and analytics
            keep their existing sources.
          </p>
          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_240px]">
            {/* Column 1 */}
            <div className="space-y-4">
              <div>
                <Label required htmlFor="settings-name">
                  Name
                </Label>
                <input
                  id="settings-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Your display name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="settings-user-tag">User Tag</Label>
                <input
                  id="settings-user-tag"
                  value={userTag ?? "No connected account"}
                  disabled
                  className={DISABLED_INPUT_CLS}
                />
              </div>
              <div>
                <Label required htmlFor="settings-country">
                  Country
                </Label>
                <input
                  id="settings-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="e.g. United States"
                  disabled={!profile}
                />
              </div>
              <div>
                <Label htmlFor="settings-age">Age</Label>
                <input
                  id="settings-age"
                  type="number"
                  min={13}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Your age"
                  disabled={!profile}
                />
              </div>
            </div>

            {/* Column 2 */}
            <div className="space-y-4">
              <div>
                <Label required htmlFor="settings-email">
                  Email
                </Label>
                <input
                  id="settings-email"
                  value={user.email ?? ""}
                  disabled
                  className={DISABLED_INPUT_CLS}
                />
              </div>
              <div>
                <Label htmlFor="settings-gender">Gender</Label>
                <select
                  id="settings-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={INPUT_CLS}
                  disabled={!profile}
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
                <Label required htmlFor="settings-language">
                  Language
                </Label>
                <select
                  id="settings-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={INPUT_CLS}
                  disabled={!profile}
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
                <Label required htmlFor="settings-interests">
                  Interests
                </Label>
                <button
                  id="settings-interests"
                  type="button"
                  onClick={() => setShowInterestDropdown((v) => !v)}
                  className={`${INPUT_CLS} text-left`}
                  disabled={!profile}
                  aria-expanded={showInterestDropdown}
                >
                  {interests.length > 0 ? "Interests" : "Select interests"}
                  <span className="float-right text-n-slate">
                    {interests.length}/{MAX_PROFILE_INTERESTS}
                  </span>
                </button>
                {showInterestDropdown && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-n-line bg-n-surface p-2 shadow-lg">
                    {INTEREST_OPTIONS.map((opt) => {
                      const selected = interests.includes(opt);
                      const disabled = hasReachedInterestLimit && !selected;

                      return (
                        <label
                          key={opt}
                          className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                            disabled
                              ? "cursor-not-allowed text-n-slate"
                              : "cursor-pointer text-n-ink hover:bg-n-surface"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={disabled}
                            onChange={() => toggleInterest(opt)}
                            className="rounded border-n-line"
                          />
                          {opt}
                        </label>
                      );
                    })}
                  </div>
                )}
                <p
                  className={`mt-1 text-xs ${
                    hasReachedInterestLimit ? "text-n-warning" : "text-n-slate"
                  }`}
                  role="status"
                >
                  {hasReachedInterestLimit
                    ? `Maximum of ${MAX_PROFILE_INTERESTS} selected. Remove one to choose another.`
                    : `Choose up to ${MAX_PROFILE_INTERESTS} interests.`}
                </p>
              </div>
            </div>

            {/* Column 3, Sidebar */}
            <div className="space-y-4">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-4 border-t border-n-line pt-6 sm:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <EditableAvatar
                  src={resolvedAvatar}
                  displayName={displayName || "?"}
                  size={80}
                  canEdit={canUploadAvatar}
                  onUpdated={setCustomAvatarOverride}
                />
                {!canUploadAvatar && (
                  <p className="text-center text-xs text-n-slate">
                    Your platform avatar is used automatically.
                  </p>
                )}
              </div>
              {/* Connected Accounts */}
              <AccountsConnected accounts={platformAccounts} />
            </div>
          </div>

          {/* Full-width Description */}
          <div className="mt-5">
            <Label required htmlFor="settings-description">
              Description
            </Label>
            <textarea
              id="settings-description"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={4}
              className={INPUT_CLS}
              placeholder="Tell brands about yourself..."
              disabled={!profile}
            />
            <p className="mt-1 text-right text-xs text-n-slate">
              {bio.length}/500
            </p>
          </div>

          {/* Save button */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button appearance="noticed" type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Profile"}
            </Button>
            {status && (
              <p
                role="status"
                className={`text-sm ${status.type === "success" ? "text-n-success" : "text-n-error"}`}
              >
                {status.message}
              </p>
            )}
          </div>
        </section>
      </form>

      {/* Two-column cards: Interests + Partnerships */}
      {profile && (
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
        <div className="border-t border-n-line pt-7">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-n-ink">Featured Posts</h3>
            <span className="rounded bg-n-surface px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-n-slate">
              Coming Soon
            </span>
          </div>
          <p className="mt-3 text-xs text-n-slate">
            Showcase your best social media posts to attract brand deals.
          </p>
        </div>
        <div className="border-t border-n-line pt-7">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-n-ink">Clip selection</h3>
            <span className="rounded bg-n-surface px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-n-slate">
              Coming Soon
            </span>
          </div>
          <p className="mt-3 text-xs text-n-slate">
            Automatic highlights remain on your profile. Manual clip selection
            is coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
