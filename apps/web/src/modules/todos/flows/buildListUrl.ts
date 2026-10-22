import type { Status } from "contracts";
import { DEFAULT_PAGE_SIZE } from "./pageSize";

//This defines the data needed to build a list URL.
export type ListUrlParams = {
  status: Status;
  search: string | null;
  page: number;
  //Left out means "do not touch the pageSize that is already in the URL".
  pageSize?: number;
};

//This function builds a URL by taking the current URL, updating its status, search,
// and page parameters based on the user's selections, and keeping other existing parameters unchanged. If there are no query parameters left,
// it returns just the pathname; otherwise, it adds the updated parameters to the URL.
export function buildListUrl(
  pathname: string,
  currentSearch: string,
  params: ListUrlParams,
): string {
  const query = new URLSearchParams(currentSearch);
  query.delete("status");
  query.delete("search");
  query.delete("page");
  //The page size is only replaced when one is given. Left out, the one already in the URL stays.
  if (params.pageSize !== undefined) {
    query.delete("pageSize");
  }
  if (params.status !== "all") {
    query.set("status", params.status);
  }
  if (params.search !== null) {
    query.set("search", params.search);
  }
  if (params.page > 1) {
    query.set("page", String(params.page));
  }
  if (params.pageSize !== undefined && params.pageSize !== DEFAULT_PAGE_SIZE) {
    query.set("pageSize", String(params.pageSize));
  }
  const text = query.toString();
  return text === "" ? pathname : `${pathname}?${text}`;
}
