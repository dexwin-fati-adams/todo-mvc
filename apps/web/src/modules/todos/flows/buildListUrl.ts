import type { Status } from "contracts";

//This defines the data needed to build a list URL.
export type ListUrlParams = {
  status: Status;
  search: string | null;
  page: number;
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
