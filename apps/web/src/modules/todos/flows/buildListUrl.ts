import type { Status } from "contracts";

//This defines the data needed to build a list URL.
export type ListUrlParams = {
  status: Status;
  search: string | null;
  page: number;
};

//This function is the one place that writes the query string. It keeps params it does not own
// (like utm), writes status and search only when they are not the default, and writes page
// only above 1. URLSearchParams does the encoding, so &, #, % and spaces cannot change the query.
export function buildListUrl(
  pathname: string,
  currentSearch: string,
  params: ListUrlParams,
): string {
  const query = new URLSearchParams(currentSearch);
  query.delete("status");
  query.delete("search");
  query.delete("page");
  if (params.status !== "all") {
    query.set("status", params.status);
  }
  if (params.search !== null) {
    query.set("search", params.search);
  }
  if (params.page > 1) {
    query.set("page", String(params.page));
  }
  const text = query.toString();
  return text === "" ? pathname : `${pathname}?${text}`;
}
