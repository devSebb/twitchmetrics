import type { Metadata } from "next";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { SolutionPage } from "@/components/marketing/SolutionPage";

export const metadata: Metadata = {
  title: "For Creators",
  description:
    "Bring your channels together in a public profile, explore your connected insights and share a media kit that speaks for your work.",
  openGraph: {
    title: `For Creators | ${SITE_NAME}`,
    type: "website",
    url: `${SITE_URL}/solutions/creators`,
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    title: `For Creators | ${SITE_NAME}`,
  },
  alternates: { canonical: `${SITE_URL}/solutions/creators` },
};
const content = {
  audience: "creators",
  title: "Your talent. Your story. Your audience",
  introduction:
    "Bring your channels together in a public profile, explore your connected insights and share a media kit that speaks for your work.",
  cta: "Create your free profile",
  features: [
    {
      title: "Your full creator profile",
      body: "Keep your tracked channels, follower trends, streaming performance, games and highlights together. Explore the line and bar charts behind your headline numbers.",
    },
    {
      title: "A media kit ready to share",
      body: "Give potential partners a focused view of your work with a separate, shareable media kit. Your detailed analytics profile remains available alongside it.",
    },
    {
      title: "Connected audience insights",
      body: "Connect supported accounts to access private platform analytics and available audience demographics. You control whether connected demographics appear publicly.",
    },
    {
      title: "Space for your story",
      body: "Add your bio, interests and past brand partnerships. Choose which supported sections appear on your public profile.",
    },
    {
      title: "A place to be discovered",
      body: "Help people exploring creators and categories on Noticed find your profile, understand your work and see the channels behind it.",
    },
    {
      title: "Connections you control",
      body: "Manage your linked accounts and accept invitations from talent managers you work with. A roster invitation needs your approval before it grants access.",
    },
  ],
  steps: [
    {
      title: "Find your profile",
      body: "Create an account, then find and claim your existing creator profile or connect a supported channel.",
    },
    {
      title: "Connect your accounts",
      body: "Use the available platform connections to add insights from your accounts. Availability varies by platform.",
    },
    {
      title: "Make it yours",
      body: "Complete your details, add partnerships and choose the sections you want visitors to see.",
    },
    {
      title: "Share your work",
      body: "Send your profile or media kit link to the people you want to work with.",
    },
  ],
  faqs: [
    {
      question: "Is a creator profile free?",
      answer:
        "Yes. You can create a creator profile and share your media kit for free.",
    },
    {
      question: "Do I need a minimum audience or every platform?",
      answer:
        "No. Work with the channels you have. Your profile reflects the platforms and data available for your accounts.",
    },
    {
      question: "What is the difference between a profile and a media kit?",
      answer:
        "Your public profile contains detailed analytics and content sections. Your media kit is a focused view for sharing with potential partners. Both use your existing creator information.",
    },
    {
      question: "Can I choose what appears publicly?",
      answer:
        "Yes. Use profile customisation to select supported sections. Connected audience demographics have their own public-sharing control.",
    },
    {
      question: "How do people find me?",
      answer:
        "People can explore creator listings and categories on Noticed, or open a direct link to your profile. A profile does not guarantee a brand opportunity.",
    },
    {
      question: "How often does my data update?",
      answer:
        "Updates depend on the platform, available data and collection schedule. Check the freshness information beside your metrics; some connected insights may take time to arrive.",
    },
  ],
};
export default function Page() {
  return <SolutionPage {...content} />;
}
