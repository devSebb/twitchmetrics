"use client";

import { useState } from "react";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { EmptyState } from "./EmptyState";
import type {
  SerializedProfile,
  SerializedBrandPartnership,
} from "@/components/dashboard/DashboardGrid";

type Props = {
  profile: SerializedProfile;
  isOwner: boolean;
};

// Generate a consistent color from brand name
const PALETTE = [
  "#9146ff",
  "#ff0000",
  "#e4405f",
  "#53fc18",
  "#1DA1F2",
  "#f59e0b",
  "#22c55e",
  "#ef4444",
];

function brandColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}

function BrandLogo({
  partnership,
}: {
  partnership: SerializedBrandPartnership;
}) {
  const [imgError, setImgError] = useState(false);

  if (partnership.brandLogoUrl && !imgError) {
    return (
      <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-[#2B2D31]">
        <Image
          src={partnership.brandLogoUrl}
          alt={partnership.brandName}
          fill
          sizes="40px"
          className="object-cover"
          loading="lazy"
          unoptimized
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Fallback: first letter
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
      style={{ backgroundColor: brandColor(partnership.brandName) }}
    >
      {partnership.brandName.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Add Partner Form ───

type AddFormProps = {
  onClose: () => void;
  profileSlug: string;
};

function AddPartnerForm({ onClose, profileSlug }: AddFormProps) {
  const [brandName, setBrandName] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [campaignName, setCampaignName] = useState("");

  const utils = trpc.useUtils();
  const addMutation = trpc.creator.addBrandPartnership.useMutation({
    onSuccess: () => {
      utils.creator.getProfile.invalidate({ slug: profileSlug });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) return;
    addMutation.mutate({
      brandName: brandName.trim(),
      brandLogoUrl: brandLogoUrl.trim() || undefined,
      campaignName: campaignName.trim() || undefined,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-[#3F4147] bg-[#2B2D31] p-4"
    >
      <div>
        <label className="mb-1 block text-xs text-[#949BA4]">
          Brand Name *
        </label>
        <input
          type="text"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          maxLength={100}
          required
          className="w-full rounded-md border border-[#3F4147] bg-[#383A40] px-3 py-1.5 text-sm text-[#DBDEE1] outline-none focus:border-[#4E5058]"
          placeholder="e.g. NordVPN"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-[#949BA4]">
          Logo URL (optional)
        </label>
        <input
          type="url"
          value={brandLogoUrl}
          onChange={(e) => setBrandLogoUrl(e.target.value)}
          className="w-full rounded-md border border-[#3F4147] bg-[#383A40] px-3 py-1.5 text-sm text-[#DBDEE1] outline-none focus:border-[#4E5058]"
          placeholder="https://..."
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-[#949BA4]">
          Campaign Name (optional)
        </label>
        <input
          type="text"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          maxLength={200}
          className="w-full rounded-md border border-[#3F4147] bg-[#383A40] px-3 py-1.5 text-sm text-[#DBDEE1] outline-none focus:border-[#4E5058]"
          placeholder="e.g. Summer 2026"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={addMutation.isPending || !brandName.trim()}
          className="rounded-md bg-[#E32C19] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#C72615] disabled:opacity-50"
        >
          {addMutation.isPending ? "Adding..." : "Add Partner"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[#3F4147] px-3 py-1.5 text-xs text-[#949BA4] transition-colors hover:bg-[#383A40]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main Widget ───

export function BrandPartnersWidget({ profile, isOwner }: Props) {
  const [showForm, setShowForm] = useState(false);

  const utils = trpc.useUtils();
  const removeMutation = trpc.creator.removeBrandPartnership.useMutation({
    onSuccess: () => {
      utils.creator.getProfile.invalidate({ slug: profile.slug });
    },
  });

  const partnerships = profile.brandPartnerships;

  if (partnerships.length === 0 && !isOwner) {
    return (
      <EmptyState
        variant="no_data"
        title="No Partners"
        message="No brand partnerships listed."
        compact
      />
    );
  }

  return (
    <div>
      {/* Logo grid */}
      {partnerships.length > 0 ? (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
          {partnerships.slice(0, 12).map((p) => (
            <div
              key={p.id}
              className="group relative flex flex-col items-center gap-1"
              title={
                p.campaignName
                  ? `${p.brandName} — ${p.campaignName}`
                  : p.brandName
              }
            >
              <BrandLogo partnership={p} />
              <span className="max-w-full truncate text-[10px] text-[#949BA4]">
                {p.brandName}
              </span>

              {/* Delete button (owner only) */}
              {isOwner && (
                <button
                  type="button"
                  onClick={() => removeMutation.mutate({ partnershipId: p.id })}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-[#ef4444] text-[10px] text-white group-hover:flex"
                  title="Remove"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-[#949BA4]">
          No brand partnerships yet.
        </p>
      )}

      {/* Add button / form (owner only) */}
      {isOwner && (
        <div className="mt-4">
          {showForm ? (
            <AddPartnerForm
              onClose={() => setShowForm(false)}
              profileSlug={profile.slug}
            />
          ) : (
            partnerships.length < 12 && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="w-full rounded-md border border-dashed border-[#3F4147] py-2 text-xs text-[#949BA4] transition-colors hover:border-[#4E5058] hover:text-[#DBDEE1]"
              >
                + Add Brand Partner
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
