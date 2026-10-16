import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useStatusFilter } from "@/modules/todos/flows/useStatusFilter";

function visit(url: string) {
  window.history.replaceState(null, "", url);
}

//Pretends the user pressed Back or Forward: the address changes and the browser fires popstate.
function navigateTo(url: string) {
  visit(url);
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

beforeEach(() => {
  visit("/");
});

describe("useStatusFilter", () => {
  it("starts from the address: ?status=completed is Completed", () => {
    visit("/?status=completed");

    const { result } = renderHook(() => useStatusFilter());

    expect(result.current.status).toBe("completed");
  });

  it("starts as All when the address has no status", () => {
    const { result } = renderHook(() => useStatusFilter());

    expect(result.current.status).toBe("all");
  });

  it("select puts the status in the address, adds one history entry, and keeps the path and other params", () => {
    visit("/todos?keep=1");
    const { result } = renderHook(() => useStatusFilter());
    const entries = window.history.length;

    act(() => {
      result.current.select("active");
    });

    const params = new URLSearchParams(window.location.search);
    expect(result.current.status).toBe("active");
    expect(window.location.pathname).toBe("/todos");
    expect(params.get("status")).toBe("active");
    expect(params.get("keep")).toBe("1");
    expect(window.history.length).toBe(entries + 1);
  });

  it("selecting All removes the status from the address", () => {
    visit("/?status=active");
    const { result } = renderHook(() => useStatusFilter());

    act(() => {
      result.current.select("all");
    });

    expect(result.current.status).toBe("all");
    expect(window.location.search).toBe("");
  });

  it("follows Back and Forward", () => {
    const { result } = renderHook(() => useStatusFilter());
    act(() => {
      result.current.select("completed");
    });

    navigateTo("/");
    expect(result.current.status).toBe("all");

    navigateTo("/?status=completed");
    expect(result.current.status).toBe("completed");
  });

  it("treats an invalid value as All and cleans the address without a new history entry", () => {
    visit("/?status=bogus&keep=1");
    const entries = window.history.length;

    const { result } = renderHook(() => useStatusFilter());

    expect(result.current.status).toBe("all");
    expect(window.location.search).toBe("?keep=1");
    expect(window.history.length).toBe(entries);
  });

  it("treats a repeated status as All and cleans the address", () => {
    visit("/?status=active&status=completed");

    const { result } = renderHook(() => useStatusFilter());

    expect(result.current.status).toBe("all");
    expect(window.location.search).toBe("");
  });

  it("does nothing when the selected status is selected again", () => {
    visit("/?status=active");
    const { result } = renderHook(() => useStatusFilter());
    const entries = window.history.length;

    act(() => {
      result.current.select("active");
    });

    expect(window.history.length).toBe(entries);
    expect(window.location.search).toBe("?status=active");
  });
});
