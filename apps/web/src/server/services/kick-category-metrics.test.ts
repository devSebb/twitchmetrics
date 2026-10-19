import { describe, expect, it } from "vitest";
import { kickNameKeys } from "./kick-category-metrics";

describe("kickNameKeys", () => {
  it("also matches without Kick's trailing parenthetical", () => {
    expect(kickNameKeys("Grand Theft Auto V (GTA)")).toEqual([
      "grand theft auto v (gta)",
      "grand theft auto v",
    ]);
  });

  it("leaves a plain name as one key", () => {
    expect(kickNameKeys("  Marvel   Rivals ")).toEqual(["marvel rivals"]);
  });

  it("keeps a parenthetical that is not at the end", () => {
    expect(kickNameKeys("Tom Clancy's (R) Rainbow Six Siege")).toEqual([
      "tom clancy's (r) rainbow six siege",
    ]);
  });
});
