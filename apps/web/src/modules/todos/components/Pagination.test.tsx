import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination, type PaginationProps } from "@/modules/todos/components/Pagination";
import { PageSize } from "@/modules/todos/flows/pageSize";

function renderBar(props: Partial<PaginationProps> = {}) {
  const onPageChange = vi.fn<(page: number) => void>();
  const onPageSizeChange = vi.fn<(size: PageSize) => void>();
  render(
    <Pagination
      page={2}
      totalPages={5}
      pageSize={20}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      {...props}
    />,
  );
  return { onPageChange, onPageSizeChange };
}

//A small parent that keeps the page, the way the real page does with the address bar.
function Harness({ start, totalPages }: { start: number; totalPages: number }) {
  const [page, setPage] = useState(start);
  return (
    <Pagination
      page={page}
      totalPages={totalPages}
      pageSize={20}
      onPageChange={setPage}
      onPageSizeChange={vi.fn()}
    />
  );
}

const previous = () => screen.getByRole("button", { name: "Previous page" });
const next = () => screen.getByRole("button", { name: "Next page" });
const sizeSelect = () => screen.getByRole("combobox", { name: "Todos per page" });

describe("Pagination", () => {
  it("is a navigation named Pagination", () => {
    renderBar();

    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
  });

  it("has a Previous page button, a Next page button, and a Todos per page select", () => {
    renderBar();

    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(within(nav).getByRole("button", { name: "Previous page" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Next page" })).toBeInTheDocument();
    expect(within(nav).getByRole("combobox", { name: "Todos per page" })).toBeInTheDocument();
  });

  it("shows Page X of Y in a polite live region", () => {
    renderBar({ page: 2, totalPages: 5 });

    expect(screen.getByText("Page 2 of 5")).toHaveAttribute("aria-live", "polite");
  });

  it("does not use role status, so the list's own status message stays the only one", () => {
    renderBar();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("disables Previous on the first page and leaves Next on", () => {
    renderBar({ page: 1, totalPages: 5 });

    expect(previous()).toBeDisabled();
    expect(next()).toBeEnabled();
  });

  it("disables Next on the last page and leaves Previous on", () => {
    renderBar({ page: 5, totalPages: 5 });

    expect(next()).toBeDisabled();
    expect(previous()).toBeEnabled();
  });

  it("leaves both buttons on in the middle", () => {
    renderBar({ page: 3, totalPages: 5 });

    expect(previous()).toBeEnabled();
    expect(next()).toBeEnabled();
  });

  it("disables both buttons and says Page 1 of 1 when there is only one page", () => {
    renderBar({ page: 1, totalPages: 1 });

    expect(previous()).toBeDisabled();
    expect(next()).toBeDisabled();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("treats zero pages (no todos) like one page", () => {
    renderBar({ page: 1, totalPages: 0 });

    expect(previous()).toBeDisabled();
    expect(next()).toBeDisabled();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("asks for the next page when Next is clicked", async () => {
    const { onPageChange } = renderBar({ page: 2, totalPages: 5 });

    await userEvent.click(next());

    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("shows Page X with both buttons disabled when the page is past the last page", () => {
    renderBar({ page: 9, totalPages: 3 });

    expect(screen.getByText("Page 9")).toBeInTheDocument();
    expect(previous()).toBeDisabled();
    expect(next()).toBeDisabled();
  });

  it("asks for nothing when a disabled button is clicked", async () => {
    const { onPageChange } = renderBar({ page: 1, totalPages: 1 });

    await userEvent.click(previous());
    await userEvent.click(next());

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("offers 10, 20, 50, and 100 per page, in that order", () => {
    renderBar();

    const labels = within(sizeSelect())
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(labels).toEqual(["10", "20", "50", "100"]);
  });

  it("shows the page size that is in use", () => {
    renderBar({ pageSize: 50 });

    expect(sizeSelect()).toHaveValue("50");
  });

  it("asks for the chosen size as a number", async () => {
    const { onPageSizeChange } = renderBar({ pageSize: 20 });

    await userEvent.selectOptions(sizeSelect(), "50");

    expect(onPageSizeChange).toHaveBeenCalledTimes(1);
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("can be used with the keyboard: Tab goes Previous, Next, size, and Enter presses Next", async () => {
    const { onPageChange } = renderBar({ page: 2, totalPages: 5 });

    await userEvent.tab();
    expect(previous()).toHaveFocus();
    await userEvent.tab();
    expect(next()).toHaveFocus();
    await userEvent.tab();
    expect(sizeSelect()).toHaveFocus();

    await userEvent.tab({ shift: true });
    await userEvent.keyboard("{Enter}");

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("has a visible focus style on both buttons and the select", () => {
    renderBar();

    [previous(), next(), sizeSelect()].forEach((control) => {
      expect(control).toHaveClass("focus-visible:outline-2");
    });
  });

  it("keeps focus on Next while Next is still usable", async () => {
    render(<Harness start={2} totalPages={5} />);
    next().focus();

    await userEvent.keyboard("{Enter}");

    expect(screen.getByText("Page 3 of 5")).toBeInTheDocument();
    expect(next()).toHaveFocus();
  });

  it("moves focus to the page text when Next becomes disabled on the last page", async () => {
    render(<Harness start={4} totalPages={5} />);
    next().focus();

    await userEvent.keyboard("{Enter}");

    expect(next()).toBeDisabled();
    expect(screen.getByText("Page 5 of 5")).toHaveFocus();
  });

  it("moves focus to the page text when Previous becomes disabled on the first page", async () => {
    render(<Harness start={2} totalPages={5} />);
    previous().focus();

    await userEvent.keyboard("{Enter}");

    expect(previous()).toBeDisabled();
    expect(screen.getByText("Page 1 of 5")).toHaveFocus();
  });
});
