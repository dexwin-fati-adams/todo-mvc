import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useSelectionFlow } from "@/modules/todos/flows/useSelectionFlow";

const { updateSelected } = vi.hoisted(() => ({ updateSelected: vi.fn() }));
vi.mock("@/modules/todos/hooks/useUpdateSelected", () => ({
  useUpdateSelected: () => ({ update: updateSelected, refresh: vi.fn() }),
}));
const { deleteSelected } = vi.hoisted(() => ({ deleteSelected: vi.fn() }));
vi.mock("@/modules/todos/hooks/useDeleteSelected", () => ({
  useDeleteSelected: () => ({ remove: deleteSelected, refresh: vi.fn() }),
}));

function Harness({ tick = 0 }: { tick?: number }) {
  const flow = useSelectionFlow({
    scopeKey: "all|",
    visibleIds: ["a", "b"],
    loading: false,
  });
  const remove = flow.remove;
  return (
    <div data-tick={tick}>
      <input aria-label="Elsewhere" />
      {!flow.active && (
        <button type="button" onClick={flow.onEnter}>
          Select todos
        </button>
      )}
      {flow.active && (
        <>
          <button type="button" onClick={flow.onSelectVisible}>
            Select all
          </button>
          <button type="button" onClick={() => remove?.onDelete()}>
            Delete
          </button>
          {remove?.confirming && (
            <button type="button" ref={remove.confirmRef} onClick={remove.onConfirm}>
              Confirm
            </button>
          )}
        </>
      )}
    </div>
  );
}

async function openWithTwoSelected() {
  const view = render(<Harness />);
  await userEvent.click(screen.getByRole("button", { name: "Select todos" }));
  await userEvent.click(screen.getByRole("button", { name: "Select all" }));
  return view;
}

describe("useSelectionFlow: delete focus (review 1)", () => {
  it("moves focus to the confirm button after one press of Delete", async () => {
    await openWithTwoSelected();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  });

  it("pressing Delete twice does not pull focus to Confirm on a later render", async () => {
    const { rerender } = await openWithTwoSelected();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    screen.getByLabelText("Elsewhere").focus();

    rerender(<Harness tick={1} />);

    expect(screen.getByLabelText("Elsewhere")).toHaveFocus();
  });
});
