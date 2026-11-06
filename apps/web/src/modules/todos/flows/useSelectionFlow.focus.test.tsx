import { useRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useSelectionFlow } from "@/modules/todos/flows/useSelectionFlow";

//A small page: Select todos, then the toolbar. "Fallback" stands for the search box.
//tick only forces another render, the way an unrelated update would.
function Harness({ ids, tick = 0 }: { ids: readonly string[]; tick?: number }) {
  const fallback = useRef<HTMLInputElement>(null);
  const flow = useSelectionFlow({
    scopeKey: "all|",
    visibleIds: ids,
    loading: false,
    focusFallbackRef: fallback,
  });
  return (
    <div data-tick={tick}>
      <input aria-label="Fallback" ref={fallback} />
      {flow.visible && !flow.active && (
        <button type="button" ref={flow.entryRef} onClick={flow.onEnter}>
          Select todos
        </button>
      )}
      {flow.active && (
        <>
          <p ref={flow.countRef} tabIndex={-1} role="status">
            {flow.countText}
          </p>
          <button type="button" onClick={flow.onSelectVisible}>
            Select all
          </button>
          <button type="button" onClick={flow.onClear}>
            Clear
          </button>
          <button type="button" onClick={flow.onExit}>
            Done
          </button>
        </>
      )}
    </div>
  );
}

const loseFocus = () => (document.activeElement as HTMLElement).blur();

describe("useSelectionFlow: focus (review fixes)", () => {
  it("Clear with nothing selected does not move focus on a later, unrelated render", async () => {
    const { rerender } = render(<Harness ids={["a"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    loseFocus();
    rerender(<Harness ids={["a"]} tick={1} />);

    expect(document.body).toHaveFocus();
  });

  it("Select all with nothing new to add does not move focus on a later render", async () => {
    const { rerender } = render(<Harness ids={["a"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));

    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    loseFocus();
    rerender(<Harness ids={["a"]} tick={1} />);

    expect(document.body).toHaveFocus();
  });

  it("Done selecting goes to Select todos when that button is on screen", async () => {
    render(<Harness ids={["a"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByRole("button", { name: "Select todos" })).toHaveFocus();
  });

  it("Done selecting on an empty page (every row deleted) moves focus to the fallback, not the page body", async () => {
    const { rerender } = render(<Harness ids={["a"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));
    rerender(<Harness ids={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.queryByRole("button", { name: "Select todos" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Fallback" })).toHaveFocus();
  });
});
