import { useEffect, useState } from "react";
import { match } from "ts-pattern";
import type { Status } from "contracts";
import { parseStatus } from "@/modules/todos/flows/parseStatus";

//This function builds a new URL by updating the Todo status in the browser
//  while keeping other URL parameters and the page's hash.
function buildUrl(status: Status | null): string {
  const params = new URLSearchParams(window.location.search);
  params.delete("status");
  if (status !== null && status !== "all") {
    params.set("status", status);
  }
  const query = params.toString();
  return `${window.location.pathname}${query === "" ? "" : `?${query}`}${window.location.hash}`;
}

//This function checks whether the URL contains an invalid status value,
// such as pending or multiple status values, instead of a valid status.
function hasInvalidStatus(search: string): boolean {
  const values = new URLSearchParams(search).getAll("status");
  const isPlainAll = values.length === 1 && values[0] === "all";
  return values.length > 0 && parseStatus(search) === "all" && !isPlainAll;
}

export function useStatusFilter() {
  const [status, setStatus] = useState<Status>(() => parseStatus(window.location.search));

  useEffect(() => {
    if (hasInvalidStatus(window.location.search)) {
      window.history.replaceState(window.history.state, "", buildUrl(null));
    }
  }, []);

  useEffect(() => {
    const onPopState = () => setStatus(parseStatus(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const select = (next: Status) =>
    match(next === status)
      .with(true, () => undefined)
      .with(false, () => {
        window.history.pushState(null, "", buildUrl(next));
        setStatus(next);
      })
      .exhaustive();

  return { status, select };
}
