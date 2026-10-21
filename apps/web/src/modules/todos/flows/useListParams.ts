import { useEffect, useState } from "react";
import { match } from "ts-pattern";
import type { Status } from "contracts";
import { buildListUrl } from "@/modules/todos/flows/buildListUrl";
import { parseListParams, parseSearch } from "@/modules/todos/flows/parseSearch";

export type ListParamsState = {
  status: Status;
  search: string | null;
  page: number;
  selectStatus: (next: Status) => void;
  //Accepts raw search text. A valid value or "" is applied, and an invalid value does nothing.
  commitSearch: (value: string) => void;
};

type Current = { status: Status; search: string | null; page: number };

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
    const { status, search, page } = readUrl();
    return { status, search, page };
  });

  //Reads the URL, cleans bad values with replaceState (no new history entry), and updates the state.
  const sync = () => {
    const { hadInvalid, status, search, page } = readUrl();
    const next = { status, search, page };
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
    const target = { status: next, search: now.search, page: 1 };
    window.history.pushState(null, "", urlFor(target));
    setCurrent(target);
  };

  const applySearch = (search: string | null) => {
    const now = readUrl();
    if (search === now.search) {
      return;
    }
    const target = { status: now.status, search, page: 1 };
    window.history.replaceState(window.history.state, "", urlFor(target));
    setCurrent(target);
  };

  const commitSearch = (value: string) =>
    match(parseSearch(value))
      .with({ kind: "invalid" }, () => undefined)
      .with({ kind: "empty" }, () => applySearch(null))
      .with({ kind: "valid" }, (valid) => applySearch(valid.value))
      .exhaustive();

  return { ...current, selectStatus, commitSearch };
}
