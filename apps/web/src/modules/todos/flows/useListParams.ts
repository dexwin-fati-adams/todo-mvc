import { useEffect, useState } from "react";
import { match } from "ts-pattern";
import type { Status } from "contracts";
import { buildListUrl } from "@/modules/todos/flows/buildListUrl";
import { parseListParams, parseSearch } from "@/modules/todos/flows/parseSearch";
import { PAGE_SIZE_OPTIONS, PageSize } from "./pageSize";

export type ListParamsState = {
  status: Status;
  search: string | null;
  page: number;
  pageSize: PageSize;
  selectStatus: (next: Status) => void;
  //Accepts raw search text. A valid value or "" is applied, and an invalid value does nothing.
  commitSearch: (value: string) => void;
  //Moves to a page. Pushes a history entry, or replaces the current one when replace is true.
  goToPage: (page: number, options?: { replace?: boolean }) => void;
  //Changes the page size and goes back to page 1.
  changePageSize: (size: number) => void;
};

type Current = { status: Status; search: string | null; page: number; pageSize: PageSize };

//The URL is the source of truth, so every function reads it instead of captured state.
function readUrl() {
  return parseListParams(window.location.search);
}

function urlFor(next: Current): string {
  const url = buildListUrl(window.location.pathname, window.location.search, next);
  return `${url}${window.location.hash}`;
}

export function useListParams(): ListParamsState {
  const [current, setCurrent] = useState<Current>(() => {
    const { status, search, page, pageSize } = readUrl();
    return { status, search, page, pageSize };
  });

  //Reads the URL, cleans bad values with replaceState (no new history entry), and updates the state.
  const sync = () => {
    const { hadInvalid, status, search, page, pageSize } = readUrl();
    const next = { status, search, page, pageSize };
    if (hadInvalid) {
      window.history.replaceState(window.history.state, "", urlFor(next));
    }
    setCurrent(next);
  };

  useEffect(() => {
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const selectStatus = (next: Status) => {
    const now = readUrl();
    if (next === now.status) {
      return;
    }
    const target = { status: next, search: now.search, page: 1, pageSize: now.pageSize };
    window.history.pushState(null, "", urlFor(target));
    setCurrent(target);
  };

  const applySearch = (search: string | null) => {
    const now = readUrl();
    if (search === now.search) {
      return;
    }
    const target = { status: now.status, search, page: 1, pageSize: now.pageSize };
    window.history.replaceState(window.history.state, "", urlFor(target));
    setCurrent(target);
  };

  const commitSearch = (value: string) =>
    match(parseSearch(value))
      .with({ kind: "invalid" }, () => undefined)
      .with({ kind: "empty" }, () => applySearch(null))
      .with({ kind: "valid" }, (valid) => applySearch(valid.value))
      .exhaustive();

  //Only a whole number of 1 or more is a page. Anything else is refused. Going to the page that is already shown does nothing.
  const goToPage = (page: number, options?: { replace?: boolean }) => {
    if (!Number.isInteger(page) || page < 1) {
      return;
    }
    const now = readUrl();
    if (page === now.page) {
      return;
    }
    const target = { status: now.status, search: now.search, page, pageSize: now.pageSize };
    if (options?.replace) {
      window.history.replaceState(window.history.state, "", urlFor(target));
    } else {
      window.history.pushState(null, "", urlFor(target));
    }
    setCurrent(target);
  };

  //Only one of the page size choices is accepted. A new size goes back to page 1.
  const changePageSize = (size: number) => {
    const next = PAGE_SIZE_OPTIONS.find((option) => option === size);
    if (next === undefined) {
      return;
    }
    const now = readUrl();
    if (next === now.pageSize) {
      return;
    }
    const target = { status: now.status, search: now.search, page: 1, pageSize: next };
    window.history.pushState(null, "", urlFor(target));
    setCurrent(target);
  };

  return { ...current, selectStatus, commitSearch, goToPage, changePageSize };
}
