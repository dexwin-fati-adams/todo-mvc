import type { Status } from "contracts";

export type ListParamsState = {
  status: Status;
  search: string | null;
  page: number;
  selectStatus: (next: Status) => void;
  //Defines a function that accepts search text and applies it.
  commitSearch: (value: string) => void;
};

//This function returns default values, but the two functions do not work yet.
export function useListParams(): ListParamsState {
  return {
    status: "all",
    search: null,
    page: 1,
    selectStatus: () => undefined,
    commitSearch: () => undefined,
  };
}
