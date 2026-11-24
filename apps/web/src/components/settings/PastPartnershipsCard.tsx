"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { getSafeImageSrc } from "@/lib/safeImage";

type Partnership = {
  id: string;
  brandName: string;
  brandLogoUrl: string | null;
};

type PastPartnershipsCardProps = {
  partnerships: Partnership[];
  profileSlug: string;
};

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

function BrandLogo({ partnership }: { partnership: Partnership }) {
  const logoSrc = getSafeImageSrc(partnership.brandLogoUrl);
  if (logoSrc) {
    return (
      <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-n-surface">
        <Image
          src={logoSrc}
          alt={partnership.brandName}
          fill
          sizes="64px"
          className="object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <div
      className="flex h-16 w-16 items-center justify-center rounded-lg text-lg font-bold text-white"
      style={{ backgroundColor: brandColor(partnership.brandName) }}
    >
      {partnership.brandName.charAt(0).toUpperCase()}
    </div>
  );
}

function AddPartnerForm({
  onClose,
  profileSlug,
}: {
  onClose: () => void;
  profileSlug: string;
}) {
  const formId = useId();
  const [brandName, setBrandName] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");

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
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-n-line bg-n-surface p-4"
    >
      <div>
        <label
          htmlFor={`${formId}-brandName`}
          className="mb-1 block text-xs text-n-slate"
        >
          Brand Name *
        </label>
        <input
          type="text"
          id={`${formId}-brandName`}
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          maxLength={100}
          required
          className="w-full rounded-md border border-n-line bg-n-surface px-3 py-1.5 text-sm text-n-ink outline-none focus:border-n-line"
          placeholder="e.g. NordVPN"
        />
      </div>
      <div>
        <label
          htmlFor={`${formId}-brandLogoUrl`}
          className="mb-1 block text-xs text-n-slate"
        >
          Logo URL (optional)
        </label>
        <input
          type="url"
          id={`${formId}-brandLogoUrl`}
          value={brandLogoUrl}
          onChange={(e) => setBrandLogoUrl(e.target.value)}
          className="w-full rounded-md border border-n-line bg-n-surface px-3 py-1.5 text-sm text-n-ink outline-none focus:border-n-line"
          placeholder="https://..."
        />
      </div>
      {addMutation.error && (
        <p role="alert" className="text-sm text-n-error">
          {addMutation.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={addMutation.isPending || !brandName.trim()}
          className="rounded-md bg-n-red px-3 py-1.5 text-xs font-medium text-white hover:bg-n-red-hover disabled:opacity-50"
        >
          {addMutation.isPending ? "Adding..." : "Add Partner"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-n-line px-3 py-1.5 text-xs text-n-slate hover:bg-n-surface"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PastPartnershipsCard({
  partnerships,
  profileSlug,
}: PastPartnershipsCardProps) {
  const [showForm, setShowForm] = useState(false);

  const utils = trpc.useUtils();
  const removeMutation = trpc.creator.removeBrandPartnership.useMutation({
    onSuccess: () => {
      utils.creator.getProfile.invalidate({ slug: profileSlug });
    },
  });

  return (
    <div className="rounded-xl border border-n-line bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-n-ink">Past Partnerships</h3>
      </div>
      <div className="mt-3">
        {partnerships.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {partnerships.slice(0, 12).map((p) => (
              <div
                key={p.id}
                className="group relative flex flex-col items-center gap-1"
                title={p.brandName}
              >
                <BrandLogo partnership={p} />
                <span className="max-w-full truncate text-xs text-n-slate">
                  {p.brandName}
                </span>
                <button
                  type="button"
                  onClick={() => removeMutation.mutate({ partnershipId: p.id })}
                  aria-label={`Remove ${p.brandName}`}
                  disabled={removeMutation.isPending}
                  className="mt-2 inline-flex min-h-11 items-center justify-center rounded-md border border-n-line px-3 text-xs text-n-error"
                  title="Remove"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-n-slate">No brand partnerships yet.</p>
        )}
      </div>
      {removeMutation.error && (
        <p role="alert" className="mt-4 text-sm text-n-error">
          {removeMutation.error.message}
        </p>
      )}
      <div className="mt-4">
        {showForm ? (
          <AddPartnerForm
            onClose={() => setShowForm(false)}
            profileSlug={profileSlug}
          />
        ) : (
          partnerships.length < 12 && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full rounded-md border border-dashed border-n-line py-2 text-xs text-n-slate hover:border-n-line hover:text-n-ink"
            >
              + Add New
            </button>
          )
        )}
      </div>
    </div>
  );
}
