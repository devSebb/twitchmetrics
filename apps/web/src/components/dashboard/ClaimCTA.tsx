import Link from "next/link";
import { SearchBar } from "@/components/search";
import { Button, Card } from "@/components/ui";

export function ClaimCTA() {
  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <h2 className="text-xl font-semibold text-[#F2F3F5]">
          Claim your creator profile
        </h2>
        <p className="text-sm text-[#949BA4]">
          Unlock private analytics, demographics, subscriber metrics, and media
          kit tools by claiming your profile.
        </p>
        <Link href="/dashboard/claim">
          <Button>Start claim flow</Button>
        </Link>
      </Card>

      <Card>
        <p className="mb-3 text-sm text-[#DBDEE1]">Search for your profile</p>
        <SearchBar mode="full" />
      </Card>
    </div>
  );
}
