import { describe, expect, it } from "vitest";
import { createQueryClient } from "@/api/query-client";

describe("createQueryClient", () => {
  it("retries a failed query once, so a failure shows quickly", () => {
    expect(createQueryClient().getDefaultOptions().queries?.retry).toBe(1);
  });
});
