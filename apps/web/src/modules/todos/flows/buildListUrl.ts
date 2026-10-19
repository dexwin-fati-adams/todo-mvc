import type { Status } from "contracts";

//This defines the data needed to build a list URL.
//: This function takes the URL path, current search text, and list parameters.
export type ListUrlParams = {
  status: Status;
  search: string | null;
  page: number;
};

//It ignores the search text and parameters and returns only the URL path.
export function buildListUrl(
  pathname: string,
  currentSearch: string,
  params: ListUrlParams,
): string {
  void currentSearch;
  void params;
  return pathname;
}
