import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionControls } from "@/modules/todos/components/SelectionControls";
import {
  useSelectionFlow,
  type SelectionFlow,
  type UseSelectionFlowParams,
} from "@/modules/todos/flows/useSelectionFlow";

const { updateSelected } = vi.hoisted(() => ({ updateSelected: vi.fn() }));
vi.mock("@/modules/todos/hooks/useUpdateSelected", () => ({
  useUpdateSelected: () => ({ update: updateSelected, refresh: vi.fn() }),
}));

const ALL = JSON.stringify(["all", null]);
const ACTIVE = JSON.stringify(["active", null]);

const makeIds = (count: number, prefix = "id"): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);

function setup(overrides: Partial<UseSelectionFlowParams> = {}) {
  const initialProps: UseSelectionFlowParams = {
    scopeKey: ALL,
    visibleIds: ["a", "b", "c"],
    loading: false,
    ...overrides,
  };
  return renderHook((props: UseSelectionFlowParams) => useSelectionFlow(props), { initialProps });
}

//The focus tests need real elements, so they draw the real controls from the flow's values.
function renderHarness(params: UseSelectionFlowParams) {
  const latest: { current: SelectionFlow | null } = { current: null };

  function Harness(props: UseSelectionFlowParams) {
    const flow = useSelectionFlow(props);
    latest.current = flow;
    return (
      <>
        <SelectionControls
          visible={flow.visible}
          active={flow.active}
          entryDisabled={flow.entryDisabled}
          countText={flow.countText}
          selectVisibleLabel={flow.selectVisibleLabel}
          selectVisibleDisabled={flow.selectVisibleDisabled}
          clearDisabled={flow.clearDisabled}
          entryRef={flow.entryRef}
          countRef={flow.countRef}
          onEnter={flow.onEnter}
          onExit={flow.onExit}
          onSelectVisible={flow.onSelectVisible}
          onClear={flow.onClear}
        />
        <button type="button">Somewhere else</button>
      </>
    );
  }

  const utils = render(<Harness {...params} />);
  return { ...utils, latest, Harness };
}

const baseParams: UseSelectionFlowParams = {
  scopeKey: ALL,
  visibleIds: ["a", "b", "c"],
  loading: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSelectionFlow", () => {
  // 52
  it("starts off, with nothing selected and no count text", () => {
    const { result } = setup();

    expect(result.current.active).toBe(false);
    expect(result.current.count).toBe(0);
    expect(result.current.countText).toBe("");
    expect(result.current.isSelected("a")).toBe(false);
  });

  it("shows the entry button when there are rows, and nothing when there are none", () => {
    expect(setup().result.current.visible).toBe(true);
    expect(setup({ visibleIds: [] }).result.current.visible).toBe(false);
  });

  it("shows the entry button disabled while the first load runs", () => {
    const { result } = setup({ visibleIds: [], loading: true });

    expect(result.current.visible).toBe(true);
    expect(result.current.entryDisabled).toBe(true);
  });

  it("keeps the toolbar visible with no rows once the mode is on", () => {
    const { result } = setup({ visibleIds: [] });
    act(() => result.current.onEnter());

    expect(result.current.visible).toBe(true);
    expect(result.current.selectVisibleDisabled).toBe(true);
    expect(result.current.clearDisabled).toBe(true);
  });

  // 53
  it("onEnter makes it active with a count of 0", () => {
    const { result } = setup();

    act(() => result.current.onEnter());

    expect(result.current.active).toBe(true);
    expect(result.current.count).toBe(0);
    expect(result.current.countText).toBe("0 of 100 selected");
  });

  it("onEnter moves focus to the count line", async () => {
    renderHarness(baseParams);

    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));

    expect(screen.getByRole("status")).toHaveFocus();
  });

  // 54
  it("onExit makes it inactive, and entering again starts at 0", () => {
    const { result } = setup();
    act(() => result.current.onEnter());
    act(() => result.current.onToggle("a"));
    expect(result.current.count).toBe(1);

    act(() => result.current.onExit());
    expect(result.current.active).toBe(false);

    act(() => result.current.onEnter());
    expect(result.current.count).toBe(0);
  });

  it("onExit moves focus to the Select todos button", async () => {
    renderHarness(baseParams);
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));

    await userEvent.click(screen.getByRole("button", { name: "Done selecting" }));

    expect(screen.getByRole("button", { name: "Select todos" })).toHaveFocus();
  });

  // 55
  it("onToggle selects and unselects, and the count and isSelected follow", () => {
    const { result } = setup();
    act(() => result.current.onEnter());

    act(() => result.current.onToggle("a"));
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.count).toBe(1);
    expect(result.current.countText).toBe("1 of 100 selected");

    act(() => result.current.onToggle("a"));
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("ignores a toggle while the mode is off", () => {
    const { result } = setup();

    act(() => result.current.onToggle("a"));

    expect(result.current.active).toBe(false);
    expect(result.current.count).toBe(0);
  });

  // 56
  it("keeps the selection when the visible ids change and the scope does not (a page change)", () => {
    const { result, rerender } = setup();
    act(() => result.current.onEnter());
    act(() => result.current.onToggle("a"));

    rerender({ scopeKey: ALL, visibleIds: ["d", "e", "f"], loading: false });

    expect(result.current.active).toBe(true);
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.count).toBe(1);
  });

  // 57
  it("empties the selection in the same render when the scope changes, and keeps the mode on", () => {
    const seen: { scopeKey: string; count: number }[] = [];
    const { result, rerender } = renderHook(
      (props: UseSelectionFlowParams) => {
        const flow = useSelectionFlow(props);
        //An effect runs only for a render that is really drawn, so a render that React throws away is not counted.
        useEffect(() => {
          seen.push({ scopeKey: props.scopeKey, count: flow.count });
        });
        return flow;
      },
      { initialProps: baseParams },
    );
    act(() => result.current.onEnter());
    act(() => result.current.onToggle("a"));
    act(() => result.current.onToggle("b"));
    seen.length = 0;

    rerender({ scopeKey: ACTIVE, visibleIds: ["a", "b"], loading: false });

    expect(seen.filter((entry) => entry.scopeKey === ACTIVE && entry.count > 0)).toEqual([]);
    expect(result.current.active).toBe(true);
    expect(result.current.count).toBe(0);
    expect(result.current.countText).toBe(
      "0 of 100 selected. Selection cleared because the status or search changed.",
    );
  });

  it("shows no scope notice when the scope changes with nothing selected", () => {
    const { result, rerender } = setup();
    act(() => result.current.onEnter());

    rerender({ scopeKey: ACTIVE, visibleIds: ["a"], loading: false });

    expect(result.current.countText).toBe("0 of 100 selected");
  });

  it("ignores a scope change while the mode is off", () => {
    const { result, rerender } = setup();

    rerender({ scopeKey: ACTIVE, visibleIds: ["a"], loading: false });

    expect(result.current.active).toBe(false);
  });

  // 58
  it("does not bring the old selection back when the user returns to the earlier scope", () => {
    const { result, rerender } = setup();
    act(() => result.current.onEnter());
    act(() => result.current.onToggle("a"));

    rerender({ scopeKey: ACTIVE, visibleIds: ["a"], loading: false });
    rerender({ scopeKey: ALL, visibleIds: ["a", "b", "c"], loading: false });

    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  // 59
  it("keeps the selection when only the number of visible ids changes (a page size change)", () => {
    const { result, rerender } = setup();
    act(() => result.current.onEnter());
    act(() => result.current.onToggle("a"));

    rerender({ scopeKey: ALL, visibleIds: makeIds(50), loading: false });

    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("a")).toBe(true);
  });

  // 60
  it("onSelectVisible selects every visible id, in page order", () => {
    const { result } = setup({ visibleIds: ["a", "b", "c"] });
    act(() => result.current.onEnter());

    act(() => result.current.onSelectVisible());

    expect(result.current.count).toBe(3);
    expect(["a", "b", "c"].every((id) => result.current.isSelected(id))).toBe(true);
    expect(result.current.countText).toBe("3 of 100 selected");
  });

  it("past the limit, onSelectVisible selects what fits and shows the limit notice", () => {
    const { result } = setup({ visibleIds: makeIds(20, "new") });
    act(() => result.current.onEnter());
    for (const id of makeIds(90)) {
      act(() => result.current.onToggle(id));
    }

    act(() => result.current.onSelectVisible());

    expect(result.current.count).toBe(100);
    expect(result.current.countText).toBe(
      "100 of 100 selected. Limit reached. You can select up to 100 todos. 10 todos were not selected.",
    );
  });

  it("writes the select-visible label for many rows and for one row", () => {
    expect(setup({ visibleIds: makeIds(20) }).result.current.selectVisibleLabel).toBe(
      "Select all 20 todos on this page",
    );
    expect(setup({ visibleIds: ["a"] }).result.current.selectVisibleLabel).toBe(
      "Select the 1 todo on this page",
    );
  });

  // 61
  it("disables select-visible with no visible ids, when all are selected, and at the limit", () => {
    const empty = setup({ visibleIds: [] });
    act(() => empty.result.current.onEnter());
    expect(empty.result.current.selectVisibleDisabled).toBe(true);

    const all = setup({ visibleIds: ["a", "b"] });
    act(() => all.result.current.onEnter());
    expect(all.result.current.selectVisibleDisabled).toBe(false);
    act(() => all.result.current.onSelectVisible());
    expect(all.result.current.selectVisibleDisabled).toBe(true);

    const full = setup({ visibleIds: ["x"] });
    act(() => full.result.current.onEnter());
    for (const id of makeIds(100)) {
      act(() => full.result.current.onToggle(id));
    }
    expect(full.result.current.selectVisibleDisabled).toBe(true);
  });

  // 62
  it("at the limit, selected rows stay enabled and unselected rows report disabled", () => {
    const { result } = setup({ visibleIds: ["id-1", "other"] });
    act(() => result.current.onEnter());
    for (const id of makeIds(100)) {
      act(() => result.current.onToggle(id));
    }

    expect(result.current.atLimit).toBe(true);
    expect(result.current.isDisabled("id-1")).toBe(false);
    expect(result.current.isDisabled("other")).toBe(true);
  });

  it("does not disable any row below the limit", () => {
    const { result } = setup();
    act(() => result.current.onEnter());
    act(() => result.current.onToggle("a"));

    expect(result.current.atLimit).toBe(false);
    expect(result.current.isDisabled("b")).toBe(false);
  });

  // 63
  it("onClear empties the selection and keeps the mode on", () => {
    const { result } = setup();
    act(() => result.current.onEnter());
    act(() => result.current.onSelectVisible());

    act(() => result.current.onClear());

    expect(result.current.active).toBe(true);
    expect(result.current.count).toBe(0);
    expect(result.current.clearDisabled).toBe(true);
    expect(result.current.countText).toBe("0 of 100 selected. Selection cleared.");
  });

  it("onClear moves focus to the count line, because the Clear button disables itself", async () => {
    renderHarness(baseParams);
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));
    await userEvent.click(screen.getByRole("button", { name: /^Select all 3 todos/ }));

    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));

    expect(screen.getByRole("status")).toHaveFocus();
  });

  // 64
  it("onRowDeleted removes that id from the selection and lowers the count", () => {
    const { result } = setup();
    act(() => result.current.onEnter());
    act(() => result.current.onToggle("a"));
    act(() => result.current.onToggle("b"));

    act(() => result.current.onRowDeleted("a"));

    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.count).toBe(1);
  });

  it("ignores onRowDeleted for an id that is not selected", () => {
    const { result } = setup();
    act(() => result.current.onEnter());
    act(() => result.current.onToggle("a"));

    act(() => result.current.onRowDeleted("zzz"));

    expect(result.current.count).toBe(1);
  });

  // 65
  it("moves focus to the count line when the pressed button becomes disabled", async () => {
    renderHarness({ ...baseParams, visibleIds: ["a", "b"] });
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));
    const selectAll = screen.getByRole("button", { name: /^Select all 2 todos/ });

    await userEvent.click(selectAll);

    expect(selectAll).toBeDisabled();
    expect(screen.getByRole("status")).toHaveFocus();
  });

  it("leaves focus alone when the user has moved it elsewhere", async () => {
    const { latest } = renderHarness({ ...baseParams, visibleIds: ["a", "b"] });
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));
    const elsewhere = screen.getByRole("button", { name: "Somewhere else" });
    elsewhere.focus();

    act(() => latest.current?.onSelectVisible());

    expect(elsewhere).toHaveFocus();
  });

  it("does not move focus when the scope changes", async () => {
    const { rerender, Harness } = renderHarness(baseParams);
    await userEvent.click(screen.getByRole("button", { name: "Select todos" }));
    await userEvent.click(screen.getByRole("button", { name: /^Select all 3 todos/ }));
    const elsewhere = screen.getByRole("button", { name: "Somewhere else" });
    elsewhere.focus();

    rerender(<Harness {...baseParams} scopeKey={ACTIVE} />);

    expect(elsewhere).toHaveFocus();
  });

  // 66
  it("a notice goes away when the next action starts", () => {
    const { result } = setup();
    act(() => result.current.onEnter());
    act(() => result.current.onSelectVisible());
    act(() => result.current.onClear());
    expect(result.current.countText).toBe("0 of 100 selected. Selection cleared.");

    act(() => result.current.onToggle("a"));

    expect(result.current.countText).toBe("1 of 100 selected");
  });

  // 67
  it("renders without a QueryClient and makes no network call", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = setup();

    act(() => result.current.onEnter());
    act(() => result.current.onToggle("a"));
    act(() => result.current.onSelectVisible());
    act(() => result.current.onClear());
    act(() => result.current.onRowDeleted("a"));
    act(() => result.current.onExit());

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
