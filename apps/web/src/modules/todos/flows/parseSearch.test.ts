import { describe, expect, it } from "vitest";

import { parseListParams, parseSearch } from "@/modules/todos/flows/parseSearch";
import { SEARCH_MAX_LENGTH } from "contracts";

const tooLong = "a".repeat(SEARCH_MAX_LENGTH + 1);

describe("parseSearch", () => {
  it("treats an empty string as empty", () => {
    expect(parseSearch("")).toEqual({ kind: "empty" });
  });

  it.each(["   ", "\t", "\n", " \t\n "])("treats %j as blank", (raw) => {
    expect(parseSearch(raw)).toEqual({ kind: "invalid", reason: "blank" });
  });

  it("accepts a normal value", () => {
    expect(parseSearch("milk")).toEqual({ kind: "valid", value: "milk" });
  });

  it("trims the outside and keeps the spaces inside", () => {
    expect(parseSearch("  buy  milk  ")).toEqual({ kind: "valid", value: "buy  milk" });
  });

  it("accepts exactly the maximum length", () => {
    const exact = "a".repeat(SEARCH_MAX_LENGTH);
    expect(parseSearch(exact)).toEqual({ kind: "valid", value: exact });
  });

  it("rejects one character over the maximum", () => {
    expect(parseSearch(tooLong)).toEqual({ kind: "invalid", reason: "too-long" });
  });

  it("counts the length after trimming", () => {
    const exact = "a".repeat(SEARCH_MAX_LENGTH);
    expect(parseSearch(`  ${exact}  `)).toEqual({ kind: "valid", value: exact });
  });

  it.each(["50%", "a_b", "a&b", "#1", '"quoted"', "😀"])("keeps %s unchanged", (raw) => {
    expect(parseSearch(raw)).toEqual({ kind: "valid", value: raw });
  });
});

describe("parseListParams search", () => {
  it("reads a single search value", () => {
    expect(parseListParams("?search=milk")).toMatchObject({ search: "milk", hadInvalid: false });
  });

  it("gives no search when the param is missing", () => {
    expect(parseListParams("")).toMatchObject({ search: null, hadInvalid: false });
  });

  it.each([
    ["empty", "?search="],
    ["blank", "?search=%20%20"],
    ["too long", `?search=${tooLong}`],
    ["repeated", "?search=a&search=b"],
  ])("gives no search and says it is invalid when it is %s", (_name, query) => {
    expect(parseListParams(query)).toMatchObject({ search: null, hadInvalid: true });
  });
});

describe("parseListParams page", () => {
  it("reads a whole page number", () => {
    expect(parseListParams("?page=2")).toMatchObject({ page: 2, hadInvalid: false });
  });

  it("gives page 1 when the param is missing", () => {
    expect(parseListParams("")).toMatchObject({ page: 1, hadInvalid: false });
  });

  it.each(["?page=0", "?page=-1", "?page=1.5", "?page=abc", "?page=", "?page=2&page=3"])(
    "gives page 1 and says it is invalid for %s",
    (query) => {
      expect(parseListParams(query)).toMatchObject({ page: 1, hadInvalid: true });
    },
  );
});

describe("parseListParams together", () => {
  it("reads status, search, and page from one query string", () => {
    expect(parseListParams("?status=active&search=milk&page=3")).toEqual({
      status: "active",
      search: "milk",
      page: 3,
      pageSize: 20,
      hadInvalid: false,
    });
  });

  it("falls back to All and says it is invalid for an unknown status", () => {
    expect(parseListParams("?status=bogus&search=milk")).toMatchObject({
      status: "all",
      search: "milk",
      hadInvalid: true,
    });
  });
});
