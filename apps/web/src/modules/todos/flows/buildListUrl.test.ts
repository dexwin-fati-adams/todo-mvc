import { describe, expect, it } from "vitest";
import { buildListUrl } from "@/modules/todos/flows/buildListUrl";
import { parseListParams } from "@/modules/todos/flows/parseSearch";

describe("buildListUrl", () => {
  it("writes no query string for the defaults", () => {
    expect(buildListUrl("/", "", { status: "all", search: null, page: 1 })).toBe("/");
  });

  it("keeps the path", () => {
    expect(buildListUrl("/todos", "", { status: "active", search: null, page: 1 })).toBe(
      "/todos?status=active",
    );
  });

  it("writes the status only when it is not All", () => {
    expect(buildListUrl("/", "", { status: "completed", search: null, page: 1 })).toBe(
      "/?status=completed",
    );
  });

  it("writes the search when there is one", () => {
    expect(buildListUrl("/", "", { status: "all", search: "milk", page: 1 })).toBe("/?search=milk");
  });

  it("writes the status, then the search, then the page", () => {
    expect(buildListUrl("/", "", { status: "active", search: "milk", page: 2 })).toBe(
      "/?status=active&search=milk&page=2",
    );
  });

  it("writes the page only when it is above 1", () => {
    expect(buildListUrl("/", "", { status: "all", search: null, page: 1 })).toBe("/");
    expect(buildListUrl("/", "", { status: "all", search: null, page: 2 })).toBe("/?page=2");
  });

  it("encodes &, #, %, and spaces so they cannot change the query", () => {
    expect(buildListUrl("/", "", { status: "all", search: "a&b #1 50%", page: 1 })).toBe(
      "/?search=a%26b+%231+50%25",
    );
  });

  it("gives back the same values when its result is parsed again", () => {
    const url = buildListUrl("/", "", { status: "completed", search: "a&b #1 50%", page: 4 });
    const query = url.slice(url.indexOf("?"));
    expect(parseListParams(query)).toEqual({
      status: "completed",
      search: "a&b #1 50%",
      page: 4,
      hadInvalid: false,
    });
  });

  it("keeps params it does not own and replaces the ones it does", () => {
    expect(
      buildListUrl("/", "?utm=1&status=bogus&search=old&page=9", {
        status: "active",
        search: "milk",
        page: 2,
      }),
    ).toBe("/?utm=1&status=active&search=milk&page=2");
  });

  it("removes its own params when they are back to the defaults", () => {
    expect(
      buildListUrl("/", "?utm=1&status=active&search=old&page=9", {
        status: "all",
        search: null,
        page: 1,
      }),
    ).toBe("/?utm=1");
  });
});
