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

describe("useListParams reading the URL", () => {
  it("starts as All, no search, page 1 when the URL has no params", () => {
    const { result } = renderHook(() => useListParams());

    expect(result.current).toMatchObject({ status: "all", search: null, page: 1 });
  });

  it("reads the status, search, and page together", () => {
    setUrl("/?status=active&search=milk&page=3");

    const { result } = renderHook(() => useListParams());

    expect(result.current).toMatchObject({ status: "active", search: "milk", page: 3 });
  });

  it("starts as Completed for ?status=completed", () => {
    setUrl("/?status=completed");

    const { result } = renderHook(() => useListParams());

    expect(result.current.status).toBe("completed");
  });
});

describe("useListParams commitSearch", () => {
  it("uses replaceState, writes the search, keeps the status, and removes the page", () => {
    setUrl("/?status=active&page=3");
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    act(() => result.current.commitSearch("milk"));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(currentUrl()).toBe("/?status=active&search=milk");
    expect(result.current).toMatchObject({ status: "active", search: "milk", page: 1 });
  });

  it("removes the search and keeps the status when the value is empty", () => {
    setUrl("/?status=completed&search=milk");
    const { result } = renderHook(() => useListParams());

    act(() => result.current.commitSearch(""));

    expect(currentUrl()).toBe("/?status=completed");
    expect(result.current).toMatchObject({ status: "completed", search: null, page: 1 });
  });

  it("makes no history call when the search is the one already committed", () => {
    setUrl("/?search=milk");
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    act(() => result.current.commitSearch("milk"));

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("makes no history call when clearing a search that is already empty", () => {
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    act(() => result.current.commitSearch(""));

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("useListParams selectStatus", () => {
  it("pushes the status, keeps the path, and starts at All again with no param", () => {
    setUrl("/todos");
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");

    act(() => result.current.selectStatus("active"));

    expect(push).toHaveBeenCalledTimes(1);
    expect(currentUrl()).toBe("/todos?status=active");
    expect(result.current.status).toBe("active");

    act(() => result.current.selectStatus("all"));

    expect(currentUrl()).toBe("/todos");
    expect(result.current.status).toBe("all");
  });

  it("keeps the search and removes the page", () => {
    setUrl("/?search=milk&page=3");
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");

    act(() => result.current.selectStatus("active"));

    expect(push).toHaveBeenCalledTimes(1);
    expect(currentUrl()).toBe("/?status=active&search=milk");
    expect(result.current).toMatchObject({ status: "active", search: "milk", page: 1 });
  });

  it("adds no history entry when the status is already selected", () => {
    setUrl("/?status=active&search=milk");
    const { result } = renderHook(() => useListParams());
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    act(() => result.current.selectStatus("active"));

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("useListParams Back and Forward", () => {
  it("updates the status, the search, and the page", () => {
    const { result } = renderHook(() => useListParams());

    goBackTo("/?status=completed&search=milk&page=2");

    expect(result.current).toMatchObject({ status: "completed", search: "milk", page: 2 });

    goBackTo("/");

    expect(result.current).toMatchObject({ status: "all", search: null, page: 1 });
  });
});

describe("useListParams invalid URL values", () => {
  it("cleans a bad status, search, and page with replaceState and no new entry", () => {
    setUrl("/?status=bogus&search=%20%20&page=0");
    const entries = window.history.length;
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    const { result } = renderHook(() => useListParams());

    expect(replace).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(window.history.length).toBe(entries);
    expect(currentUrl()).toBe("/");
    expect(result.current).toMatchObject({ status: "all", search: null, page: 1 });
  });

  it("keeps the good values when only one value is bad", () => {
    setUrl("/?status=active&search=a&search=b");

    const { result } = renderHook(() => useListParams());

    expect(currentUrl()).toBe("/?status=active");
    expect(result.current).toMatchObject({ status: "active", search: null, page: 1 });
  });

  it("does not touch the URL when every value is good", () => {
    setUrl("/?status=active&search=milk&page=2&utm=1");
    const replace = vi.spyOn(window.history, "replaceState");

    renderHook(() => useListParams());

    expect(replace).not.toHaveBeenCalled();
    expect(currentUrl()).toBe("/?status=active&search=milk&page=2&utm=1");
  });

  it("keeps params it does not own", () => {
    setUrl("/?utm=1&status=bogus");

    renderHook(() => useListParams());

    expect(currentUrl()).toBe("/?utm=1");
  });
});
