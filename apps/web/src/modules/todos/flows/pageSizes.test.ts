import { StatusQuerySchema } from "contracts";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "./pageSize";

describe("page sizes", () => {
  it("offers 10, 20, 50 and 100, and the default is one of them", () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 20, 50, 100]);
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    expect(PAGE_SIZE_OPTIONS).toContain(DEFAULT_PAGE_SIZE);
  });

  //The server is the one that decides which sizes are allowed, so the choices are checked against its schema.
  it.each(PAGE_SIZE_OPTIONS)("the server accepts the page size %i", (size) => {
    const result = StatusQuerySchema.safeParse({ pageSize: size });

    expect(result.success).toBe(true);
    expect(result.data?.pageSize).toBe(size);
  });

  it("the default page size is the same as the server default", () => {
    const result = StatusQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data?.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("the server really does have a limit, so the check above means something", () => {
    expect(StatusQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
