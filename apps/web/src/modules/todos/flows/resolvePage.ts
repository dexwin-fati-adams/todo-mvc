import { match } from "ts-pattern";

export type PageResponseInfo = {
  rowCount: number;
  totalItems: number;
  totalPages: number;
};

export type PageDecision =
  { kind: "ok" } | { kind: "clamp"; page: number } | { kind: "reset"; page: 1 };

type Situation = "has-rows" | "first-page" | "no-todos" | "past-the-end" | "inside-the-range";

function situationOf(requestedPage: number, response: PageResponseInfo): Situation {
  if (response.rowCount > 0) return "has-rows";
  if (requestedPage <= 1) return "first-page";
  if (response.totalItems === 0) return "no-todos";
  if (requestedPage > response.totalPages) return "past-the-end";
  return "inside-the-range";
}

export function resolvePage(requestedPage: number, response: PageResponseInfo): PageDecision {
  return match(situationOf(requestedPage, response))
    .with("has-rows", "first-page", "inside-the-range", () => ({ kind: "ok" }) as const)
    .with("no-todos", () => ({ kind: "reset", page: 1 }) as const)
    .with("past-the-end", () => ({ kind: "clamp", page: response.totalPages }) as const)
    .exhaustive();
}
