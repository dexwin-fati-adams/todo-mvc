import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLastPagination } from "./useLastPagination";

describe("useLastPagination", () => {
  it("returns null before the first known total pages value", () => {
    const { result } = renderHook(({ key, current }) => useLastPagination(key, current), {
      initialProps: { key: "all:20", current: null as number | null },
    });

    expect(result.current).toBeNull();
  });

  it("stores the latest total pages for the current list key", () => {
    const { result, rerender } = renderHook(({ key, current }) => useLastPagination(key, current), {
      initialProps: { key: "all:20", current: 3 as number | null },
    });

    expect(result.current).toBe(3);

    rerender({ key: "all:20", current: 5 });
    expect(result.current).toBe(5);
  });

  it("keeps the old value when the key changes and the new key has no value yet", () => {
    const { result, rerender } = renderHook(({ key, current }) => useLastPagination(key, current), {
      initialProps: { key: "all:20", current: 3 as number | null },
    });

    expect(result.current).toBe(3);

    rerender({ key: "active:20", current: null });
    expect(result.current).toBeNull();

    rerender({ key: "active:20", current: 2 });
    expect(result.current).toBe(2);
  });

  it("returns the previous value for the same key even while the current value is null", () => {
    const { result, rerender } = renderHook(({ key, current }) => useLastPagination(key, current), {
      initialProps: { key: "all:20", current: 3 as number | null },
    });

    expect(result.current).toBe(3);

    rerender({ key: "all:20", current: null });
    expect(result.current).toBe(3);
  });
});
