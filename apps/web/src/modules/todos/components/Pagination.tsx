import { PageSize } from "@/modules/todos/flows/pageSize";

export type PaginationProps = {
  page: number;
  totalPages: number;
  pageSize: PageSize;
  //onPageSizeChange: Changes how many todos appear on each page.
  onPageChange: (page: number) => void;
  //onPageSizeChange changes how many todos each page displays.
  onPageSizeChange: (size: PageSize) => void;
};

export function Pagination(props: PaginationProps) {
  void props;
  return null;
}
