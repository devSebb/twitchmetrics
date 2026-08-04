import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/analytics",
          "/brand-partnerships",
          "/claim",
          "/claims",
          "/connections",
          "/home",
          "/manage-creators",
          "/media-kit",
          "/onboarding",
          "/roster",
          "/talent-manager",
          "/search",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
