"use client";

import { useState } from "react";
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
      <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-[#2B2D31]">
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
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={addMutation.isPending || !brandName.trim()}
          className="rounded-md bg-[#E32C19] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#C72615] disabled:opacity-50"
        >
          {addMutation.isPending ? "Adding..." : "Add Partner"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[#3F4147] px-3 py-1.5 text-xs text-[#949BA4] hover:bg-[#383A40]"
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
    <div className="rounded-xl border border-[#3F4147] bg-[#313338] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#F2F3F5]">
          Past Partnerships
        </h3>
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
                <span className="max-w-full truncate text-[10px] text-[#949BA4]">
                  {p.brandName}
                </span>
                <button
                  type="button"
                  onClick={() => removeMutation.mutate({ partnershipId: p.id })}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-[#ef4444] text-[10px] text-white group-hover:flex"
                  title="Remove"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#949BA4]">No brand partnerships yet.</p>
        )}
      </div>
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
              className="w-full rounded-md border border-dashed border-[#3F4147] py-2 text-xs text-[#949BA4] hover:border-[#4E5058] hover:text-[#DBDEE1]"
            >
              + Add New
            </button>
          )
        )}
      </div>
    </div>
  );
}
