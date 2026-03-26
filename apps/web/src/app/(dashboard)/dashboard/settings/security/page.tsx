import type { Metadata } from "next";
import SecurityPage from "../../../settings/security/page";

export const metadata: Metadata = {
  title: "Security Settings",
  robots: { index: false, follow: false },
};

export default SecurityPage;
