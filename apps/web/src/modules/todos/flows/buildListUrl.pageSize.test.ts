import { describe, expect, it } from "vitest";
import { buildListUrl } from "@/modules/todos/flows/buildListUrl";
import { parseListParams } from "@/modules/todos/flows/parseSearch";

const base = { status: "all", search: null, page: 1 } as const;

describe("buildListUrl pageSize", () => {
  it("writes the page size when it is not the default", () => {
    expect(buildListUrl("/", "", { ...base, pageSize: 10 })).toBe("/?pageSize=10");
  });

  it("writes nothing for the default page size", () => {
    expect(buildListUrl("/", "", { ...base, pageSize: 20 })).toBe("/");
  });

  it("removes a page size that is already in the URL when the new one is the default", () => {
    expect(buildListUrl("/", "?pageSize=50", { ...base, pageSize: 20 })).toBe("/");
  });

  it("replaces a page size that is already in the URL", () => {
    expect(buildListUrl("/", "?pageSize=50", { ...base, pageSize: 10 })).toBe("/?pageSize=10");
  });

  it("writes the keys in the order status, search, page, pageSize", () => {
    expect(buildListUrl("/", "", { status: "active", search: "milk", page: 3, pageSize: 10 })).toBe(
      "/?status=active&search=milk&page=3&pageSize=10",
    );
  });

  it("keeps the page size that is already in the URL when none is given", () => {
    const url = buildListUrl("/", "?pageSize=10&status=active", base);

    expect(new URLSearchParams(url.split("?")[1]).get("pageSize")).toBe("10");
    expect(new URLSearchParams(url.split("?")[1]).get("status")).toBeNull();
  });

  it("builds a URL that parseListParams reads back as the same page size", () => {
    const url = buildListUrl("/", "", { ...base, page: 2, pageSize: 50 });

    expect(parseListParams(url.slice(url.indexOf("?")))).toMatchObject({ page: 2, pageSize: 50 });
  });
});
