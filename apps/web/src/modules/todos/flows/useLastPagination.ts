import { useRef } from "react";

//It remembers the last page number for a particular list using a key (name), for example, "all-todos", and returns
// the saved page number only when the current key matches "all-todos".

export function useLastPagination(key: string, current: number | null): number | null {
  const ref = useRef<{ key: string; value: number } | null>(null);
  if (current !== null) ref.current = { key, value: current };
  return ref.current?.key === key ? ref.current.value : null;
}
