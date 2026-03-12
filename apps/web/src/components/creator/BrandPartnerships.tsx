import Image from "next/image";
import { Card } from "@/components/ui/Card";

type BrandPartnershipData = {
  id: string;
  brandName: string;
  brandLogoUrl: string | null;
};

type BrandPartnershipsProps = {
  partnerships: BrandPartnershipData[];
};

export function BrandPartnerships({ partnerships }: BrandPartnershipsProps) {
  if (partnerships.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-lg font-bold text-[#F2F3F5]">
        Past Partnerships
      </h2>
      <Card>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {partnerships.map((p) => (
            <div
              key={p.id}
              className="flex flex-col items-center gap-2 rounded-md p-2"
            >
              <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#383A40]">
                {p.brandLogoUrl ? (
                  <Image
                    src={p.brandLogoUrl}
                    alt={p.brandName}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                ) : (
                  <span className="text-sm font-bold text-[#949BA4]">
                    {p.brandName.charAt(0)}
                  </span>
                )}
              </div>
              <span className="text-center text-[10px] font-medium leading-tight text-[#949BA4]">
                {p.brandName}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
