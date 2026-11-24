"use client";

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui";
import { EditableAvatar } from "@/components/avatar/EditableAvatar";
import { resolveAvatar } from "@/lib/avatar";
import { ManagerProfileCompletionBar } from "./ManagerProfileCompletionBar";
import { InvitePreviewCard } from "./InvitePreviewCard";

// ─── Constants ───

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

const MAX_LANGUAGES = 10;
const BIO_MAX = 280;

// ─── Types ───

export type ManagerSettingsFormProps = {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  };
  profile: {
    agencyName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    websiteUrl: string | null;
    country: string | null;
    languages: string[];
    contactEmail: string | null;
  };
  activeRosterCount: number;
};

// ─── Styling ───

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

// ─── Main component ───

export function ManagerSettingsForm({
  user,
  profile,
  activeRosterCount,
}: ManagerSettingsFormProps) {
  const [name, setName] = useState(user.name ?? "");
  const [agencyName, setAgencyName] = useState(profile.agencyName ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(profile.websiteUrl ?? "");
  const [country, setCountry] = useState(profile.country ?? "");
  const [languages, setLanguages] = useState<string[]>(profile.languages);
  const [contactEmail, setContactEmail] = useState(profile.contactEmail ?? "");
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [avatarOverride, setAvatarOverride] = useState<string | null>(
    profile.avatarUrl,
  );
  const resolvedAvatar = resolveAvatar("talent_manager", {
    user,
    manager: { avatarUrl: avatarOverride ?? profile.avatarUrl },
  });

  const utils = trpc.useUtils();

  const updateName = trpc.auth.updateName.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const updateProfile = trpc.talentManager.updateMyProfile.useMutation({
    onSuccess: () => {
      utils.talentManager.getMyProfile.invalidate();
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

      try {
        const trimmedName = name.trim();
        if (trimmedName && trimmedName !== user.name) {
          await updateName.mutateAsync({ name: trimmedName });
        }

        await updateProfile.mutateAsync({
          agencyName: agencyName.trim() || null,
          bio: bio.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
          country: country.trim() || null,
          languages,
          contactEmail: contactEmail.trim() || null,
        });
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
      name,
      agencyName,
      bio,
      websiteUrl,
      country,
      languages,
      contactEmail,
      user.name,
      updateName,
      updateProfile,
    ],
  );

  const toggleLanguage = (lang: string) => {
    setLanguages((prev) => {
      if (prev.includes(lang)) return prev.filter((l) => l !== lang);
      if (prev.length >= MAX_LANGUAGES) return prev;
      return [...prev, lang];
    });
  };

  const isPending = updateName.isPending || updateProfile.isPending;

  return (
    <div className="space-y-10">
      <ManagerProfileCompletionBar
        name={name || null}
        email={user.email}
        agencyName={agencyName || null}
        bio={bio || null}
        websiteUrl={websiteUrl || null}
        country={country || null}
        languages={languages}
        contactEmail={contactEmail || null}
        activeRosterCount={activeRosterCount}
      />

      <form onSubmit={handleSave}>
        <section className="border-t border-n-line pt-7">
          <h2 className="text-2xl font-bold tracking-tight">
            Agency & contact details
          </h2>
          <p className="mt-2 mb-7 max-w-2xl text-sm leading-relaxed text-n-slate">
            Set the identity creators see when you invite them, and the contact
            details for your agency.
          </p>
          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_240px]">
            {/* Column 1, identity */}
            <div className="space-y-4">
              <div>
                <Label required htmlFor="settings-name">
                  Name
                </Label>
                <input
                  id="settings-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Your name"
                  required
                  maxLength={50}
                />
              </div>
              <div>
                <Label htmlFor="settings-agency-company">
                  Agency / Company
                </Label>
                <input
                  id="settings-agency-company"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Optional, leave blank if solo"
                  maxLength={80}
                />
              </div>
              <div>
                <Label htmlFor="settings-country">Country</Label>
                <input
                  id="settings-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="e.g. United States"
                  maxLength={60}
                />
              </div>
              <div>
                <Label htmlFor="settings-website">Website</Label>
                <input
                  id="settings-website"
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="https://..."
                  maxLength={200}
                />
              </div>
            </div>

            {/* Column 2, contact + operating */}
            <div className="space-y-4">
              <div>
                <Label required htmlFor="settings-login-email">
                  Login email
                </Label>
                <input
                  id="settings-login-email"
                  value={user.email ?? ""}
                  disabled
                  className={DISABLED_INPUT_CLS}
                />
              </div>
              <div>
                <Label htmlFor="settings-contact-email">Contact email</Label>
                <input
                  id="settings-contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Business email creators can reach you at"
                  maxLength={200}
                />
              </div>
              <div className="relative">
                <Label htmlFor="settings-languages">Languages</Label>
                <button
                  id="settings-languages"
                  type="button"
                  aria-expanded={showLanguageDropdown}
                  onClick={() => setShowLanguageDropdown((v) => !v)}
                  className={`${INPUT_CLS} text-left`}
                >
                  {languages.length > 0
                    ? `${languages.length}/${MAX_LANGUAGES} selected`
                    : "Select languages"}
                </button>
                {showLanguageDropdown && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-n-line bg-n-surface p-2 shadow-lg">
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <label
                        key={opt}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-n-ink hover:bg-n-surface"
                      >
                        <input
                          type="checkbox"
                          checked={languages.includes(opt)}
                          disabled={
                            !languages.includes(opt) &&
                            languages.length >= MAX_LANGUAGES
                          }
                          onChange={() => toggleLanguage(opt)}
                          className="rounded border-n-line"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="settings-active-roster">Active roster</Label>
                <input
                  id="settings-active-roster"
                  value={
                    activeRosterCount === 1
                      ? "1 creator"
                      : `${activeRosterCount} creators`
                  }
                  disabled
                  className={DISABLED_INPUT_CLS}
                />
              </div>
            </div>

            {/* Column 3, avatar sidebar */}
            <div className="flex flex-col items-center gap-4 border-t border-n-line pt-6 sm:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <EditableAvatar
                src={resolvedAvatar}
                displayName={name || "?"}
                size={80}
                canEdit={true}
                onUpdated={setAvatarOverride}
              />
              <p className="text-center text-xs text-n-slate">
                Click the pencil to update.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <Label htmlFor="settings-bio">Bio</Label>
            <textarea
              id="settings-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={BIO_MAX}
              rows={3}
              className={INPUT_CLS}
              placeholder="One or two sentences creators see when you invite them..."
            />
            <p className="mt-1 text-right text-xs text-n-slate">
              {bio.length}/{BIO_MAX}
            </p>
          </div>

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

      <InvitePreviewCard
        managerName={name || null}
        managerImage={resolvedAvatar}
        agencyName={agencyName || null}
        bio={bio || null}
      />
    </div>
  );
}
