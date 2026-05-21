"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { UploadSimple } from "@phosphor-icons/react";
import { trpc } from "@/lib/trpc";
import { getSafeImageSrc } from "@/lib/safeImage";
import { EmptyState } from "./EmptyState";
import type {
  SerializedProfile,
  SerializedBrandPartnership,
} from "@/components/dashboard/DashboardGrid";

type Props = {
  profile: SerializedProfile;
  isOwner: boolean;
};

const LOGO_ACCEPT = "image/jpeg,image/png,image/webp";
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const PRESIGN_TIMEOUT_MS = 30_000;

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
  const logoSrc = getSafeImageSrc(partnership.brandLogoUrl);

  if (logoSrc) {
    return (
      <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-[#2B2D31]">
        <Image
          src={logoSrc}
          alt={partnership.brandName}
          fill
          sizes="40px"
          className="object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback: first letter (no safe URL or disallowed host)
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
      style={{ backgroundColor: brandColor(partnership.brandName) }}
    >
      {partnership.brandName.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Add/Edit Partner Form ───

type PartnerFormProps = {
  onClose: () => void;
  profileSlug: string;
  partnership: SerializedBrandPartnership | null;
};

function PartnerForm({ onClose, profileSlug, partnership }: PartnerFormProps) {
  const router = useRouter();
  const [brandName, setBrandName] = useState(partnership?.brandName ?? "");
  const [brandLogoUrl, setBrandLogoUrl] = useState(
    partnership?.brandLogoUrl ?? "",
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campaignName, setCampaignName] = useState(
    partnership?.campaignName ?? "",
  );
  const isEditing = partnership !== null;

  const utils = trpc.useUtils();
  const presignMutation = trpc.creator.presignBrandLogoUpload.useMutation();
  const addMutation = trpc.creator.addBrandPartnership.useMutation({
    onSuccess: () => {
      utils.creator.getProfile.invalidate({ slug: profileSlug });
      router.refresh();
      onClose();
    },
  });
  const updateMutation = trpc.creator.updateBrandPartnership.useMutation({
    onSuccess: () => {
      utils.creator.getProfile.invalidate({ slug: profileSlug });
      router.refresh();
      onClose();
    },
  });
  const isPending =
    addMutation.isPending || updateMutation.isPending || isSubmitting;
  const isUploadingLogo = presignMutation.isPending;

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  const handleLogoFile = (file: File) => {
    setLogoError(null);
    if (!LOGO_ACCEPT.split(",").includes(file.type)) {
      setLogoError("Use JPG, PNG, or WebP.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError("Logo must be 2 MB or less.");
      return;
    }

    setLogoFile(file);
    setBrandLogoUrl("");
    setLogoPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
  };

  const clearLogo = () => {
    setLogoFile(null);
    setBrandLogoUrl("");
    setLogoError(null);
    setLogoPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  };

  const uploadLogo = async (file: File): Promise<string> => {
    const presigned = await presignMutation.mutateAsync({
      contentType: file.type,
      sizeBytes: file.size,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRESIGN_TIMEOUT_MS);

    const putResponse = await fetch(presigned.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!putResponse.ok) {
      throw new Error(`Logo upload failed (status ${putResponse.status}).`);
    }

    return presigned.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) return;
    setLogoError(null);
    setIsSubmitting(true);

    let nextLogoUrl = brandLogoUrl.trim() || undefined;
    if (logoFile) {
      try {
        nextLogoUrl = await uploadLogo(logoFile);
      } catch (error) {
        setLogoError(
          error instanceof Error ? error.message : "Logo upload failed.",
        );
        setIsSubmitting(false);
        return;
      }
    }

    const payload = {
      brandName: brandName.trim(),
      brandLogoUrl: nextLogoUrl,
      campaignName: campaignName.trim() || undefined,
    };

    if (partnership) {
      updateMutation.mutate(
        {
          partnershipId: partnership.id,
          ...payload,
        },
        {
          onSettled: () => setIsSubmitting(false),
        },
      );
      return;
    }

    addMutation.mutate(payload, {
      onSettled: () => setIsSubmitting(false),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-[#3F4147] bg-[#2B2D31] p-3"
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
          Logo (optional)
        </label>
        <div className="rounded-lg border border-[#3F4147] bg-[#383A40] p-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#2B2D31]">
              {logoPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreviewUrl}
                  alt="Logo preview"
                  className="h-full w-full object-cover"
                />
              ) : getSafeImageSrc(brandLogoUrl) ? (
                <Image
                  src={getSafeImageSrc(brandLogoUrl)!}
                  alt="Current logo"
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <span className="text-sm font-bold text-[#949BA4]">
                  {brandName.trim().charAt(0).toUpperCase() || "?"}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#3F4147] px-3 py-1.5 text-xs font-medium text-[#DBDEE1] transition-colors hover:bg-[#4E5058]">
                <UploadSimple size={14} weight="bold" />
                Choose logo
                <input
                  type="file"
                  accept={LOGO_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleLogoFile(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <p className="mt-1 truncate text-[10px] text-[#949BA4]">
                {logoFile ? logoFile.name : "JPG, PNG, WebP - max 2 MB"}
              </p>
            </div>
            {(brandLogoUrl || logoFile) && (
              <button
                type="button"
                onClick={clearLogo}
                className="text-xs text-[#949BA4] underline hover:text-[#DBDEE1]"
              >
                Remove
              </button>
            )}
          </div>
          {logoError && (
            <p className="mt-2 rounded-md border border-[#ef4444]/40 bg-[#ef4444]/10 px-2 py-1.5 text-xs text-[#fca5a5]">
              {logoError}
            </p>
          )}
        </div>
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
          disabled={isPending || isUploadingLogo || !brandName.trim()}
          className="rounded-md bg-[#E32C19] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#C72615] disabled:opacity-50"
        >
          {isPending || isUploadingLogo
            ? isEditing
              ? "Saving..."
              : "Adding..."
            : isEditing
              ? "Save Partner"
              : "Add Partner"}
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
  const [editingPartner, setEditingPartner] =
    useState<SerializedBrandPartnership | null>(null);
  const router = useRouter();

  const utils = trpc.useUtils();
  const removeMutation = trpc.creator.removeBrandPartnership.useMutation({
    onSuccess: () => {
      utils.creator.getProfile.invalidate({ slug: profile.slug });
      router.refresh();
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

  const closeForm = () => {
    setShowForm(false);
    setEditingPartner(null);
  };

  const openCreateForm = () => {
    setEditingPartner(null);
    setShowForm(true);
  };

  const openEditForm = (partnership: SerializedBrandPartnership) => {
    if (!isOwner) return;
    setEditingPartner(partnership);
    setShowForm(true);
  };

  return (
    <div>
      {/* Logo grid */}
      {partnerships.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
              {isOwner ? (
                <button
                  type="button"
                  onClick={() => openEditForm(p)}
                  className="flex max-w-full flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-[#383A40]"
                  aria-label={`Edit ${p.brandName}`}
                >
                  <BrandLogo partnership={p} />
                  <span className="max-w-full truncate text-[10px] text-[#949BA4]">
                    {p.brandName}
                  </span>
                </button>
              ) : (
                <>
                  <BrandLogo partnership={p} />
                  <span className="max-w-full truncate text-[10px] text-[#949BA4]">
                    {p.brandName}
                  </span>
                </>
              )}

              {/* Delete button (owner only) */}
              {isOwner && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeMutation.mutate({ partnershipId: p.id });
                  }}
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
            <PartnerForm
              key={editingPartner?.id ?? "new"}
              onClose={closeForm}
              profileSlug={profile.slug}
              partnership={editingPartner}
            />
          ) : (
            partnerships.length < 12 && (
              <button
                type="button"
                onClick={openCreateForm}
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
