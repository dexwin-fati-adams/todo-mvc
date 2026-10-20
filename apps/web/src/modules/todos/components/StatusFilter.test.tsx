import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Status } from "contracts";
import { StatusFilter } from "@/modules/todos/components/StatusFilter";

function renderFilter(props: Partial<Parameters<typeof StatusFilter>[0]> = {}) {
  const onSelect = vi.fn<(status: Status) => void>();
  render(<StatusFilter status="all" counts={null} onSelect={onSelect} {...props} />);
  return { onSelect };
}

const link = (name: string) => screen.getByRole("link", { name });

describe("StatusFilter", () => {
  it("has a navigation named Filter todos with All, Active, and Completed in that order", () => {
    renderFilter();

    const nav = screen.getByRole("navigation", { name: "Filter todos" });
    const names = within(nav)
      .getAllByRole("link")
      .map((item) => item.textContent);
    expect(names).toEqual(["All", "Active", "Completed"]);
  });

  it("marks only the selected link with aria-current", () => {
    renderFilter({ status: "active" });

    expect(link("Active")).toHaveAttribute("aria-current", "page");
    expect(link("All")).not.toHaveAttribute("aria-current");
    expect(link("Completed")).not.toHaveAttribute("aria-current");
  });

  it("styles only the selected link as selected", () => {
    renderFilter({ status: "completed" });

    expect(link("Completed")).toHaveClass("font-semibold", "border-slate-900");
    expect(link("All")).not.toHaveClass("font-semibold");
    expect(link("Active")).not.toHaveClass("font-semibold");
  });

  it("shows the counts when they are known: All is active plus completed", () => {
    renderFilter({ counts: { active: 2, completed: 1 } });

    expect(link("All (3)")).toBeInTheDocument();
    expect(link("Active (2)")).toBeInTheDocument();
    expect(link("Completed (1)")).toBeInTheDocument();
  });

  it("shows no number when the counts are not known", () => {
    renderFilter({ counts: null });

    expect(link("All")).toHaveTextContent(/^All$/);
    expect(link("Active")).toHaveTextContent(/^Active$/);
    expect(link("Completed")).toHaveTextContent(/^Completed$/);
  });

  it("gives each link its own address", () => {
    renderFilter();

    expect(link("All")).toHaveAttribute("href", "?");
    expect(link("Active")).toHaveAttribute("href", "?status=active");
    expect(link("Completed")).toHaveAttribute("href", "?status=completed");
  });

  it("calls onSelect with that status on a click, and does not navigate the page", async () => {
    const { onSelect } = renderFilter();

    await userEvent.click(link("Completed"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("completed");
    expect(window.location.search).toBe("");
  });

  it("can be used with the keyboard: Tab goes All, Active, Completed, and Enter selects", async () => {
    const { onSelect } = renderFilter();

    await userEvent.tab();
    expect(link("All")).toHaveFocus();
    await userEvent.tab();
    expect(link("Active")).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("active");
  });

  it("has a visible focus style on every link", () => {
    renderFilter();

    screen.getAllByRole("link").forEach((item) => {
      expect(item).toHaveClass("focus-visible:outline-2");
    });
  });
});
