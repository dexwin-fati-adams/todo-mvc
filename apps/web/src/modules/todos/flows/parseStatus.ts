import type { Status } from "contracts";

const KNOWN_STATUSES: Record<Status, true> = { all: true, active: true, completed: true };

//This function checks whether the given value exists and is one of the allowed
//  Todo statuses: all, active, or completed.

function isStatus(value: string | undefined): value is Status {
  return value !== undefined && Object.keys(KNOWN_STATUSES).includes(value);
}

//This function gets the status from the URL and returns it if it is valid; otherwise,
// it returns "all" as the default status.
export function parseStatus(search: string): Status {
  const values = new URLSearchParams(search).getAll("status");
  const [value] = values;
  return values.length === 1 && isStatus(value) ? value : "all";
}
