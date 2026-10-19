import type { Status } from "contracts";

export type SearchInput =
  | { kind: "empty" }
  | { kind: "valid"; value: string }
  | { kind: "invalid"; reason: "blank" | "too-long" };

export type ListParams = {
  status: Status;
  search: string | null;
  page: number;
  hadInvalid: boolean;
};

export function parseSearch(raw: string): SearchInput {
  void raw;
  return { kind: "empty" };
}

export function parseListParams(search: string): ListParams {
  void search;
  return { status: "all", search: null, page: 1, hadInvalid: false };
}
