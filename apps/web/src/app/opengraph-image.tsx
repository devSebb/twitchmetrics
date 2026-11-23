import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NOTICED } from "@/lib/constants/noticed";

export const alt =
  "Noticed. Creator media kits and analytics, powered by Hatchet.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const font = await readFile(
    join(process.cwd(), "public/fonts/golos-text-bold.ttf"),
  );
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: NOTICED.ink,
        color: "white",
        fontFamily: "Golos",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: -2,
        }}
      >
        noticed<span style={{ color: NOTICED.red }}>.</span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 82,
          fontWeight: 700,
          letterSpacing: -4,
          lineHeight: 1.05,
        }}
      >
        <span>Your work. Your audience.</span>
        <span>One link.</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: "1px solid #4A505B",
          paddingTop: 24,
          fontSize: 25,
        }}
      >
        <span>Free media kits for creators</span>
        <span>powered by Hatchet</span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Golos",
          data: new Uint8Array(font).buffer,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}
