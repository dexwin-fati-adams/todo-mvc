import { describe, expect, it } from "vitest";

import { parseListParams } from "@/modules/todos/flows/parseSearch";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "./pageSize";

describe("parseListParams pageSize", () => {
  it("gives the default size when pageSize is missing, and that is not invalid", () => {
    expect(parseListParams("")).toMatchObject({ pageSize: DEFAULT_PAGE_SIZE, hadInvalid: false });
  });

  it.each(PAGE_SIZE_OPTIONS)("accepts pageSize=%i", (size) => {
    expect(parseListParams(`?pageSize=${size}`)).toMatchObject({
      pageSize: size,
      hadInvalid: false,
    });
  });

  it.each(["0", "-1", "7", "101", "1.5", "abc", "", "1e1", " 10"])(
    "gives the default size and says it is invalid for pageSize=%j",
    (raw) => {
      expect(parseListParams(`?pageSize=${raw}`)).toMatchObject({
        pageSize: DEFAULT_PAGE_SIZE,
        hadInvalid: true,
      });
    },
  );

  it("treats a repeated pageSize as invalid, even when both values are choices", () => {
    expect(parseListParams("?pageSize=10&pageSize=50")).toMatchObject({
      pageSize: DEFAULT_PAGE_SIZE,
      hadInvalid: true,
    });
  });

  it("reads the status, search, page, and page size together", () => {
    expect(parseListParams("?status=active&search=milk&page=3&pageSize=10")).toEqual({
      status: "active",
      search: "milk",
      page: 3,
      pageSize: 10,
      hadInvalid: false,
    });
  });

  it("keeps a good page size when the page is bad, and the other way round", () => {
    expect(parseListParams("?page=0&pageSize=50")).toMatchObject({
      page: 1,
      pageSize: 50,
      hadInvalid: true,
    });
    expect(parseListParams("?page=2&pageSize=7")).toMatchObject({
      page: 2,
      pageSize: DEFAULT_PAGE_SIZE,
      hadInvalid: true,
    });
  });
});
