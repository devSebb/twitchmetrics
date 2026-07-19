import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameCoverImage } from "./GameCoverImage";

describe("GameCoverImage", () => {
  it("renders a visible fallback when the cover is missing", () => {
    const html = renderToStaticMarkup(
      <GameCoverImage src={null} name="Missing Game" sizes="200px" />,
    );

    expect(html).toContain("Cover unavailable");
    expect(html).toContain('aria-label="Missing Game cover unavailable"');
  });

  it("renders the fallback instead of loading an unsafe cover URL", () => {
    const html = renderToStaticMarkup(
      <GameCoverImage
        src="http://example.com/broken.jpg"
        name="Unsafe Game"
        sizes="200px"
      />,
    );

    expect(html).toContain("Cover unavailable");
    expect(html).not.toContain("example.com/broken.jpg");
  });
});
