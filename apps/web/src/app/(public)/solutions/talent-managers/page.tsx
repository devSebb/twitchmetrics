import type { Metadata } from "next";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { SolutionPage } from "@/components/marketing/SolutionPage";

export const metadata: Metadata = {
  title: "For Talent Managers",
  description:
    "Bring the creators you represent into one workspace. Keep track of invitations, review shared performance and prepare exports for your next conversation.",
  openGraph: {
    title: `For Talent Managers | ${SITE_NAME}`,
    type: "website",
    url: `${SITE_URL}/solutions/talent-managers`,
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    title: `For Talent Managers | ${SITE_NAME}`,
  },
  alternates: { canonical: `${SITE_URL}/solutions/talent-managers` },
};
const content = {
  audience: "talent managers",
  title: "Your roster. In focus",
  introduction:
    "Bring the creators you represent into one workspace. Keep track of invitations, review shared performance and prepare exports for your next conversation.",
  cta: "Set up your manager account",
  features: [
    {
      title: "A clear view of your roster",
      body: "Switch between cards and a sortable table. Review followers, growth, platforms and data freshness, with active, pending and expired invitations clearly marked.",
    },
    {
      title: "Creator-approved access",
      body: "Invite creators through a shareable link. Access begins when the creator accepts, and their permissions determine which private data you can view.",
    },
    {
      title: "Exports for your next pitch",
      body: "Download roster data as CSV or create a PDF with your profile image and selected brand colour. Exports follow the existing access permissions.",
    },
    {
      title: "Performance in context",
      body: "See active-roster follower totals and growth summaries, then open a creator to review platform details and permitted analytics for 7, 30 or 90 days.",
    },
    {
      title: "Your agency identity",
      body: "Set your agency name, website, contact email, country, languages and bio. Preview the identity a creator sees on your invitation.",
    },
    {
      title: "Discovery beyond your roster",
      body: "Explore channels, games and categories to understand what audiences are watching. Open public profiles for deeper context, or explore available reports.",
    },
  ],
  steps: [
    {
      title: "Set up your identity",
      body: "Choose a talent manager account and complete your agency and contact details.",
    },
    {
      title: "Invite a creator",
      body: "Find their profile and generate an invitation. Share the link and message template with them.",
    },
    {
      title: "Wait for acceptance",
      body: "The creator signs in, claims their profile if needed, and accepts. Pending invitations do not grant private access.",
    },
    {
      title: "Review and export",
      body: "Explore your accepted roster, open permitted creator analytics and download the available exports.",
    },
  ],
  faqs: [
    {
      question: "Can I add a creator without their approval?",
      answer:
        "You can send an invitation, but the creator must accept before they become an active roster member. Unclaimed profiles need to be claimed first.",
    },
    {
      question: "What happens when an invitation expires?",
      answer:
        "It remains marked as expired in your roster. Generate a fresh link to invite the creator again. Regenerating an invitation invalidates its previous link.",
    },
    {
      question: "Which private data can I see?",
      answer:
        "Your creator detail page shows the permissions granted for that relationship. Private analytics are displayed only when analytics access is enabled.",
    },
    {
      question: "Can I export with my agency branding?",
      answer:
        "The PDF export uses your manager profile image and lets you choose a brand colour. CSV export is also available. These downloads reflect the data available when generated.",
    },
    {
      question: "Can I manage a creator on just one platform?",
      answer:
        "Yes. The roster and creator detail views reflect the accounts available for each creator.",
    },
    {
      question: "How current are the metrics?",
      answer:
        "Collection schedules vary by platform and profile. The roster shows the latest snapshot time, and private analytics display their reporting periods.",
    },
    {
      question: "Does this include shared team access or campaign management?",
      answer:
        "This workspace currently supports your manager account, creator invitations, roster analytics and exports. Shared team access and campaign tools are not part of this workflow.",
    },
  ],
};
export default function Page() {
  return <SolutionPage {...content} />;
}
