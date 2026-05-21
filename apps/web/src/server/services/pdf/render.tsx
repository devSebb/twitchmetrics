import { renderToBuffer } from "@react-pdf/renderer";
import { registerPdfFonts } from "./fonts";
import { RosterReport, type RosterReportProps } from "./roster-report";

/**
 * Render a roster PDF to a Buffer. Caller is responsible for passing already-
 * shaped, serializable props — this layer does not touch Prisma.
 */
export async function renderRosterPdf(
  props: RosterReportProps,
): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<RosterReport {...props} />);
}
