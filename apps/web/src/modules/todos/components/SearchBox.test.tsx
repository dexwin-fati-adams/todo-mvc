import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "@/modules/todos/components/SearchBox";

const MAX = 100;
const BLANK_MESSAGE = "Enter a search term, or clear the box to see all todos.";
const TOO_LONG_MESSAGE = `Search can be at most ${MAX} characters.`;

const box = () => screen.getByRole("searchbox", { name: "Search todos" });
const clearButton = () => screen.getByRole("button", { name: "Clear search" });

//Moves the fake clock forward inside act(), so React sees any state change the timer causes.
function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function setup(value = "") {
  const onCommit = vi.fn<(value: string) => void>();
  const user = userEvent.setup({
    advanceTimers: (ms) => {
      vi.advanceTimersByTime(ms);
    },
  });
  const utils = render(<SearchBox value={value} onCommit={onCommit} maxLength={MAX} />);
  return { ...utils, user, onCommit };
}

describe("SearchBox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    //Testing Library waits on a setTimeout(0) after every userEvent action. It only moves fake timers
    // forward when a global called "jest" exists. Vitest has none, so the wait never ends and the test
    // times out. This gives it the one function it needs.
    vi.stubGlobal("jest", { advanceTimersByTime: vi.advanceTimersByTime.bind(vi) });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is a search form with the visible label Search todos", () => {
    setup();

    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByText("Search todos")).toBeVisible();
    expect(box()).toHaveAttribute("type", "search");
  });

  it("shows the committed value in the box", () => {
    setup("milk");

    expect(box()).toHaveValue("milk");
  });

  it("does not commit before 300 ms, then commits once with the trimmed value", async () => {
    const { user, onCommit } = setup();

    await user.type(box(), "  milk  ");
    wait(299);
    expect(onCommit).not.toHaveBeenCalled();

    wait(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("milk");
  });

  it("commits once, with the last value, for fast typing", async () => {
    const { user, onCommit } = setup();

    await user.type(box(), "mil");
    wait(1000);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("mil");
  });

  it("commits at once on Enter and cancels the pending timer", async () => {
    const { user, onCommit } = setup();

    await user.type(box(), "milk{Enter}");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("milk");

    wait(1000);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits nothing for spaces only, marks the box invalid and shows an alert, on Enter", async () => {
    const { user, onCommit } = setup();

    await user.type(box(), "   {Enter}");

    expect(onCommit).not.toHaveBeenCalled();
    expect(box()).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent(BLANK_MESSAGE);
  });

  it("commits nothing for spaces only, and shows the same message, when the timer fires", async () => {
    const { user, onCommit } = setup();

    await user.type(box(), "   ");
    wait(300);

    expect(onCommit).not.toHaveBeenCalled();
    expect(box()).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent(BLANK_MESSAGE);
  });

  it("commits nothing for a value that is too long, and links the message to the box", async () => {
    const { user, onCommit } = setup();

    await user.click(box());
    await user.paste("a".repeat(MAX + 1));
    wait(300);

    expect(onCommit).not.toHaveBeenCalled();
    expect(box()).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent(TOO_LONG_MESSAGE);
    expect(box()).toHaveAccessibleDescription(TOO_LONG_MESSAGE);
  });

  it("removes the message and the invalid mark as soon as the text changes", async () => {
    const { user, onCommit } = setup();
    await user.type(box(), "   {Enter}");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.type(box(), "m");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(box()).toBeValid();
    wait(300);
    expect(onCommit).toHaveBeenCalledWith("m");
  });

  it("shows Clear only when the box has text", async () => {
    const { user } = setup();
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();

    await user.type(box(), "m");

    expect(clearButton()).toBeInTheDocument();
  });

  it("Clear empties the box, commits an empty search at once, and puts focus on the box", async () => {
    const { user, onCommit } = setup("milk");

    await user.click(clearButton());

    expect(box()).toHaveValue("");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("");
    expect(box()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it.each([
    { name: "Enter", key: "{Enter}" },
    { name: "Space", key: " " },
  ])("Clear works with $name from the keyboard", async ({ key }) => {
    const { user, onCommit } = setup("milk");

    clearButton().focus();
    await user.keyboard(key);

    expect(onCommit).toHaveBeenCalledWith("");
    expect(box()).toHaveValue("");
  });

  it("Clear before anything was committed cancels the timer and commits nothing", async () => {
    const { user, onCommit } = setup();

    await user.type(box(), "milk");
    await user.click(clearButton());
    wait(1000);

    expect(onCommit).not.toHaveBeenCalled();
    expect(box()).toHaveValue("");
  });

  it("shows a new committed value (for example after Back) without committing it again", () => {
    const { rerender, onCommit } = setup();

    rerender(<SearchBox value="milk" onCommit={onCommit} maxLength={MAX} />);
    wait(1000);

    expect(box()).toHaveValue("milk");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("keeps the spaces the user typed when the committed value is their trimmed text", async () => {
    const { user, rerender, onCommit } = setup();

    await user.type(box(), "buy ");
    wait(300);
    rerender(<SearchBox value="buy" onCommit={onCommit} maxLength={MAX} />);

    expect(box()).toHaveValue("buy ");
  });

  it.each([
    { name: "unchanged text", typed: "{Enter}" },
    { name: "the same text with extra spaces", typed: "  {Enter}" },
  ])("commits nothing for $name when it equals the committed search", async ({ typed }) => {
    const { user, onCommit } = setup("milk");

    await user.type(box(), typed);
    wait(1000);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits nothing when the text goes back to the committed value", async () => {
    const { user, onCommit } = setup("milk");

    await user.type(box(), "x{Backspace}");
    wait(1000);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("cancels the timer when it unmounts", async () => {
    const { user, onCommit, unmount } = setup();

    await user.type(box(), "milk");
    unmount();
    wait(1000);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("has a visible focus ring on the box and on Clear", () => {
    setup("milk");

    expect(box().className).toContain("focus-visible:outline");
    expect(clearButton().className).toContain("focus-visible:outline");
  });

  it("puts the box first and Clear second in the tab order", async () => {
    const { user } = setup("milk");

    await user.tab();
    expect(box()).toHaveFocus();

    await user.tab();
    expect(clearButton()).toHaveFocus();
  });
});

describe("SearchBox accessibility", () => {
  const cases: { name: string; prepare: () => Promise<void>; value: string }[] = [
    { name: "empty", value: "", prepare: async () => undefined },
    { name: "with text", value: "milk", prepare: async () => undefined },
    {
      name: "with an error",
      value: "",
      prepare: async () => {
        await userEvent.type(screen.getByRole("searchbox"), "   {Enter}");
      },
    },
  ];

  it.each(cases)("$name has no axe violations", async ({ value, prepare }) => {
    const { container } = render(<SearchBox value={value} onCommit={vi.fn()} maxLength={MAX} />);
    await prepare();

    const results = await axe.run(container, {
      rules: { region: { enabled: false }, "color-contrast": { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });
});
