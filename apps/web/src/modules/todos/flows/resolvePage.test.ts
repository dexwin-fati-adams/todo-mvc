import { describe, expect, it } from "vitest";
import { resolvePage } from "@/modules/todos/flows/resolvePage";

describe("resolvePage", () => {
  it.each([1, 2, 9])("is ok when the response has rows (page %i)", (page) => {
    expect(resolvePage(page, { rowCount: 5, totalItems: 45, totalPages: 3 })).toEqual({
      kind: "ok",
    });
  });

  it("is ok for an empty response on page 1, so the normal empty message shows", () => {
    expect(resolvePage(1, { rowCount: 0, totalItems: 0, totalPages: 0 })).toEqual({ kind: "ok" });
  });

  it("clamps to the last page when the page is past the end", () => {
    expect(resolvePage(9, { rowCount: 0, totalItems: 45, totalPages: 3 })).toEqual({
      kind: "clamp",
      page: 3,
    });
  });

  it("resets to page 1 when there are no todos at all", () => {
    expect(resolvePage(4, { rowCount: 0, totalItems: 0, totalPages: 0 })).toEqual({
      kind: "reset",
      page: 1,
    });
  });

  it("is ok for an empty response on a page inside the range, so it cannot loop", () => {
    expect(resolvePage(2, { rowCount: 0, totalItems: 45, totalPages: 3 })).toEqual({ kind: "ok" });
  });

  it.each([
    { page: 2, totalItems: 20, totalPages: 1 },
    { page: 9, totalItems: 45, totalPages: 3 },
    { page: 4, totalItems: 0, totalPages: 0 },
    { page: 100, totalItems: 1, totalPages: 1 },
  ])(
    "never sends the user back to the page they asked for (page $page of $totalPages)",
    ({ page, totalItems, totalPages }) => {
      const decision = resolvePage(page, { rowCount: 0, totalItems, totalPages });

      expect(decision.kind).not.toBe("ok");
      if (decision.kind !== "ok") {
        expect(decision.page).not.toBe(page);
      }
    },
  );
});
