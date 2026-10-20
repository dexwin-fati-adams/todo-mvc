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

//This function checks whether the URL contains an invalid status value,
// such as an unknown status or several status values, instead of a valid status.
export function hasInvalidStatus(search: string): boolean {
  const values = new URLSearchParams(search).getAll("status");
  const isPlainAll = values.length === 1 && values[0] === "all";
  return values.length > 0 && parseStatus(search) === "all" && !isPlainAll;
}
