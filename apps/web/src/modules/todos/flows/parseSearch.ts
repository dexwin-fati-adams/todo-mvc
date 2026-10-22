import { SEARCH_MAX_LENGTH, type Status } from "contracts";

import { hasInvalidStatus, parseStatus } from "@/modules/todos/flows/parseStatus";
import { PageSize, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "./pageSize";

export type SearchInput =
  | { kind: "empty" }
  | { kind: "valid"; value: string }
  | { kind: "invalid"; reason: "blank" | "too-long" };

export type ListParams = {
  status: Status;
  search: string | null;
  page: number;
  pageSize: PageSize;
  hadInvalid: boolean;
};

//This function checks text typed in the search box. "" is Clear, spaces only is blank,
// and the length is counted after trimming, the same way the API schema does it.
export function parseSearch(raw: string): SearchInput {
  if (raw === "") {
    return { kind: "empty" };
  }
  const value = raw.trim();
  if (value === "") {
    return { kind: "invalid", reason: "blank" };
  }
  if (value.length > SEARCH_MAX_LENGTH) {
    return { kind: "invalid", reason: "too-long" };
  }
  return { kind: "valid", value };
}

//Missing is no search. One value that passes parseSearch is the search.
// An empty, blank, too long, or repeated value is no search, and it is invalid.
function readSearch(values: string[]): { value: string | null; invalid: boolean } {
  if (values.length === 0) {
    return { value: null, invalid: false };
  }
  const parsed = values.length === 1 ? parseSearch(values[0] ?? "") : null;
  return parsed?.kind === "valid"
    ? { value: parsed.value, invalid: false }
    : { value: null, invalid: true };
}

//Missing is page 1. One whole number of 1 or more is that page.
// Anything else (0, -1, 1.5, abc, empty, repeated) is page 1, and it is invalid.
function readPage(values: string[]): { value: number; invalid: boolean } {
  if (values.length === 0) {
    return { value: 1, invalid: false };
  }
  const [raw = ""] = values;
  const page = /^[1-9]\d*$/.test(raw) ? Number(raw) : Number.NaN;
  return values.length === 1 && Number.isSafeInteger(page)
    ? { value: page, invalid: false }
    : { value: 1, invalid: true };
}

//Missing is the default size. One value that is exactly one of the choices is that size.
// Anything else (0, -1, 7, 101, 1.5, abc, empty, repeated) is the default size, and it is invalid.
function readPageSize(values: string[]): { value: PageSize; invalid: boolean } {
  if (values.length === 0) {
    return { value: DEFAULT_PAGE_SIZE, invalid: false };
  }
  const [raw = ""] = values;
  const size = PAGE_SIZE_OPTIONS.find((option) => String(option) === raw);
  return values.length === 1 && size !== undefined
    ? { value: size, invalid: false }
    : { value: DEFAULT_PAGE_SIZE, invalid: true };
}

export function parseListParams(search: string): ListParams {
  const params = new URLSearchParams(search);
  const parsedSearch = readSearch(params.getAll("search"));
  const parsedPage = readPage(params.getAll("page"));
  const parsedPageSize = readPageSize(params.getAll("pageSize"));
  return {
    status: parseStatus(search),
    search: parsedSearch.value,
    page: parsedPage.value,
    pageSize: parsedPageSize.value,
    hadInvalid:
      hasInvalidStatus(search) ||
      parsedSearch.invalid ||
      parsedPage.invalid ||
      parsedPageSize.invalid,
  };
}
