import { describe, expect, it } from "vitest";
import { canonicalProfileId } from "./canonical-profile";

describe("canonicalProfileId", () => {
  it("keeps a canonical profile's own id", () => {
    expect(
      canonicalProfileId({
        id: "ibai",
        mergedIntoId: null,
      }),
    ).toBe("ibai");
  });

  it("resolves a redirect stub to its canonical profile", () => {
    expect(
      canonicalProfileId({
        id: "ibai-extra",
        mergedIntoId: "ibai",
      }),
    ).toBe("ibai");
  });

  it("collapses merged stubs without hiding genuine ambiguity", () => {
    const oneCreator = new Set(
      [
        { id: "ibai", mergedIntoId: null },
        { id: "ibai-extra", mergedIntoId: "ibai" },
      ].map(canonicalProfileId),
    );
    const differentCreators = new Set(
      [
        { id: "ibai", mergedIntoId: null },
        { id: "another-creator", mergedIntoId: null },
      ].map(canonicalProfileId),
    );

    expect([...oneCreator]).toEqual(["ibai"]);
    expect([...differentCreators]).toEqual(["ibai", "another-creator"]);
  });
});
