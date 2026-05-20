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
    <div className="space-y-6">
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
        <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr_200px]">
            {/* Column 1 — identity */}
            <div className="space-y-4">
              <div>
                <Label required>Name</Label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Your name"
                  required
                  maxLength={50}
                />
              </div>
              <div>
                <Label>Agency / Company</Label>
                <input
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Optional — leave blank if solo"
                  maxLength={80}
                />
              </div>
              <div>
                <Label>Country</Label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="e.g. United States"
                  maxLength={60}
                />
              </div>
              <div>
                <Label>Website</Label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="https://..."
                  maxLength={200}
                />
              </div>
            </div>

            {/* Column 2 — contact + operating */}
            <div className="space-y-4">
              <div>
                <Label required>Login email</Label>
                <input
                  value={user.email ?? ""}
                  disabled
                  className={DISABLED_INPUT_CLS}
                />
              </div>
              <div>
                <Label>Contact email</Label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Business email creators can reach you at"
                  maxLength={200}
                />
              </div>
              <div className="relative">
                <Label>Languages</Label>
                <button
                  type="button"
                  onClick={() => setShowLanguageDropdown((v) => !v)}
                  className={`${INPUT_CLS} text-left`}
                >
                  {languages.length > 0
                    ? `${languages.length} selected`
                    : "Select languages"}
                </button>
                {showLanguageDropdown && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#3F4147] bg-[#2B2D31] p-2 shadow-lg">
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <label
                        key={opt}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-[#DBDEE1] hover:bg-[#383A40]"
                      >
                        <input
                          type="checkbox"
                          checked={languages.includes(opt)}
                          onChange={() => toggleLanguage(opt)}
                          className="rounded border-[#3F4147]"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label>Active roster</Label>
                <input
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

            {/* Column 3 — avatar sidebar */}
            <div className="flex flex-col items-center gap-2">
              <EditableAvatar
                src={resolvedAvatar}
                displayName={name || "?"}
                size={80}
                canEdit={true}
                onUpdated={setAvatarOverride}
              />
              <p className="text-center text-[10px] text-[#949BA4]">
                Click the pencil to update.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <Label>Bio</Label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={BIO_MAX}
              rows={3}
              className={INPUT_CLS}
              placeholder="One or two sentences creators see when you invite them..."
            />
            <p className="mt-1 text-right text-xs text-[#949BA4]">
              {bio.length}/{BIO_MAX}
            </p>
          </div>

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

      <InvitePreviewCard
        managerName={name || null}
        managerImage={resolvedAvatar}
        agencyName={agencyName || null}
        bio={bio || null}
      />
    </div>
  );
}
