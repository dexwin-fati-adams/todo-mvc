import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListParams } from "@/modules/todos/flows/useListParams";

function setUrl(url: string) {
  window.history.replaceState(null, "", url);
}

function currentUrl() {
  return window.location.pathname + window.location.search;
}

function goBackTo(url: string) {
  setUrl(url);
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

beforeEach(() => {
  setUrl("/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useListParams reading the page size", () => {
  it("starts with page size 20 when the URL has none", () => {
    const { result } = renderHook(() => useListParams());

    expect(result.current).toMatchObject({ page: 1, pageSize: 20 });
  });

  it("reads the page and the page size from the URL", () => {
    setUrl("/?status=active&page=3&pageSize=10");

    const { result } = renderHook(() => useListParams());

    expect(result.current).toMatchObject({ status: "active", page: 3, pageSize: 10 });
  });

  it("cleans an invalid page size with replaceState and adds no history entry", () => {
    setUrl("/?pageSize=7&page=2");
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    const { result } = renderHook(() => useListParams());

    expect(result.current).toMatchObject({ page: 2, pageSize: 20 });
    expect(currentUrl()).toBe("/?page=2");
    expect(replace).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("useListParams goToPage", () => {
  it("uses pushState, writes the page, and keeps the status, search, and page size", () => {
    setUrl("/?status=active&search=milk&pageSize=10");
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");

    act(() => result.current.goToPage(3));

    expect(push).toHaveBeenCalledTimes(1);
    expect(currentUrl()).toBe("/?status=active&search=milk&page=3&pageSize=10");
    expect(result.current.page).toBe(3);
  });

  it("removes the page from the URL for page 1", () => {
    setUrl("/?page=3");
    const { result } = renderHook(() => useListParams());

    act(() => result.current.goToPage(1));

    expect(currentUrl()).toBe("/");
    expect(result.current.page).toBe(1);
  });

  it("does nothing for the page that is already shown", () => {
    setUrl("/?page=2");
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    act(() => result.current.goToPage(2));

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses the page %s", (page) => {
    setUrl("/?page=2");
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    act(() => result.current.goToPage(page));

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(currentUrl()).toBe("/?page=2");
    expect(result.current.page).toBe(2);
  });

  it("uses replaceState when told to, so no history entry is added", () => {
    setUrl("/?page=9");
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    act(() => result.current.goToPage(3, { replace: true }));

    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(currentUrl()).toBe("/?page=3");
  });
});

describe("useListParams changePageSize", () => {
  it("uses pushState, drops the page, and keeps the status and search", () => {
    setUrl("/?status=completed&search=milk&page=3");
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");

    act(() => result.current.changePageSize(50));

    expect(push).toHaveBeenCalledTimes(1);
    expect(currentUrl()).toBe("/?status=completed&search=milk&pageSize=50");
    expect(result.current).toMatchObject({ page: 1, pageSize: 50 });
  });

  it("removes pageSize from the URL when the default is chosen", () => {
    setUrl("/?pageSize=50");
    const { result } = renderHook(() => useListParams());

    act(() => result.current.changePageSize(20));

    expect(currentUrl()).toBe("/");
    expect(result.current.pageSize).toBe(20);
  });

  it("does nothing for the size that is already used", () => {
    setUrl("/?pageSize=10&page=2");
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    act(() => result.current.changePageSize(10));

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(currentUrl()).toBe("/?pageSize=10&page=2");
  });

  it("refuses a size that is not one of the choices", () => {
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");

    act(() => result.current.changePageSize(7));

    expect(push).not.toHaveBeenCalled();
    expect(result.current.pageSize).toBe(20);
  });
});

describe("useListParams keeping the page size", () => {
  it("selectStatus drops the page and keeps the page size", () => {
    setUrl("/?page=3&pageSize=10");
    const { result } = renderHook(() => useListParams());

    act(() => result.current.selectStatus("active"));

    expect(currentUrl()).toBe("/?status=active&pageSize=10");
    expect(result.current).toMatchObject({ status: "active", page: 1, pageSize: 10 });
  });

  it("commitSearch drops the page and keeps the page size", () => {
    setUrl("/?page=3&pageSize=10");
    const { result } = renderHook(() => useListParams());

    act(() => result.current.commitSearch("milk"));

    expect(currentUrl()).toBe("/?search=milk&pageSize=10");
    expect(result.current).toMatchObject({ search: "milk", page: 1, pageSize: 10 });
  });
});

describe("useListParams Back and Forward", () => {
  it("updates the page and the page size", () => {
    const { result } = renderHook(() => useListParams());

    goBackTo("/?page=2&pageSize=10");
    expect(result.current).toMatchObject({ page: 2, pageSize: 10 });

    goBackTo("/");
    expect(result.current).toMatchObject({ page: 1, pageSize: 20 });
  });
});
