import { renderToBuffer } from "@react-pdf/renderer";
import { registerPdfFonts } from "./fonts";
import { RosterReport, type RosterReportProps } from "./roster-report";

/**
 * Render a roster PDF to a Buffer. Caller is responsible for passing already-
 * shaped, serializable props — this layer does not touch Prisma.
 *
 * `baseUrl` is used to resolve font URLs (fonts live under /public/fonts/).
 * We try app-level env vars first, then fall back to the public domain.
 */
export async function renderRosterPdf(
  props: RosterReportProps,
): Promise<Buffer> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXTAUTH_URL ??
    "https://twitchmetrics.net";
  registerPdfFonts(baseUrl);

  return renderToBuffer(<RosterReport {...props} />);
}
