import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok, type Result } from "neverthrow";
import type { ReplaceTodoRequest, Todo } from "contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientError } from "@/api/todos/todo.api";
import { useTodos } from "@/modules/todos/hooks/useTodos";
import { useToggleTodo } from "@/modules/todos/hooks/useToggleTodo";
import { useDeleteTodo } from "@/modules/todos/hooks/useDeleteTodo";
import { useReplaceTodo } from "@/modules/todos/hooks/useReplaceTodo";
import { TodoFlows } from "@/modules/todos/flows/TodoFlows";

vi.mock("@/modules/todos/hooks/useTodos");
vi.mock("@/modules/todos/hooks/useToggleTodo");
vi.mock("@/modules/todos/hooks/useDeleteTodo");
vi.mock("@/modules/todos/hooks/useReplaceTodo");

type SaveOutcome = Result<Todo, ClientError>;

const todo: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

const doneTodo: Todo = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Walk the dog",
  completed: true,
  createdAt: "2026-09-29T11:00:00.000Z",
};

const replace = vi.fn<(id: string, body: ReplaceTodoRequest) => Promise<SaveOutcome>>();
const refresh = vi.fn<() => Promise<void>>();

function givenTodos(todos: Todo[]) {
  vi.mocked(useTodos).mockReturnValue({
    serverState: "ready",
    error: null,
    refetch: vi.fn(),
    todos,
    counts: null,
  } as unknown as ReturnType<typeof useTodos>);
}

//Makes the next replace() call wait until release() is called, so a test can look at the pending state.
function holdNextSave() {
  let release!: (outcome: SaveOutcome) => void;
  replace.mockReturnValueOnce(
    new Promise<SaveOutcome>((resolve) => {
      release = resolve;
    }),
  );
  return (outcome: SaveOutcome) => release(outcome);
}

const editButton = (title: string) => screen.getByRole("button", { name: `Edit “${title}”` });
const field = (title: string) => screen.getByRole("textbox", { name: `Edit title of “${title}”` });

async function openEditor(title = "Buy milk") {
  await userEvent.dblClick(screen.getByText(title));
  return field(title);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.mocked(useTodos).mockReset();
  replace.mockReset();
  refresh.mockReset();
  replace.mockResolvedValue(ok(todo));
  refresh.mockResolvedValue(undefined);
  vi.mocked(useReplaceTodo).mockReturnValue({ replace, refresh });
  vi.mocked(useToggleTodo).mockReturnValue({ toggle: vi.fn().mockResolvedValue(ok(todo)) });
  vi.mocked(useDeleteTodo).mockReturnValue({ remove: vi.fn().mockResolvedValue(ok(undefined)) });
});

describe("TodoFlows editing: entering", () => {
  it("shows an Edit button on every row", () => {
    givenTodos([todo, doneTodo]);
    render(<TodoFlows />);

    expect(editButton("Buy milk")).toBeInTheDocument();
    expect(editButton("Walk the dog")).toBeInTheDocument();
  });

  it("opens the editor with the current title and focus in the field when the title is double-clicked", async () => {
    givenTodos([todo]);
    render(<TodoFlows />);

    const input = await openEditor();

    expect(input).toHaveValue("Buy milk");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Edit “Buy milk”" })).not.toBeInTheDocument();
  });

  it("opens the editor when Enter is pressed on the Edit button", async () => {
    givenTodos([todo]);
    render(<TodoFlows />);
    editButton("Buy milk").focus();

    await userEvent.keyboard("{Enter}");

    expect(field("Buy milk")).toHaveFocus();
  });

  it("puts the cursor at the end of the title", async () => {
    givenTodos([todo]);
    render(<TodoFlows />);

    const input = (await openEditor()) as HTMLInputElement;

    expect(input.selectionStart).toBe("Buy milk".length);
    expect(input.selectionEnd).toBe("Buy milk".length);
  });

  it("lets only one row be edited at a time", async () => {
    givenTodos([todo, doneTodo]);
    render(<TodoFlows />);
    await openEditor("Buy milk");

    await userEvent.click(editButton("Walk the dog"));
    await userEvent.dblClick(screen.getByText("Walk the dog"));

    expect(editButton("Walk the dog")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(field("Buy milk")).toBeInTheDocument();
  });
});

describe("TodoFlows editing: validation", () => {
  it.each(["", "   "])("shows the message and sends nothing for the title %j", async (text) => {
    givenTodos([todo]);
    render(<TodoFlows />);
    const input = await openEditor();

    await userEvent.clear(input);
    if (text !== "") {
      await userEvent.type(input, text);
    }
    await userEvent.keyboard("{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a title for your todo.");
    expect(field("Buy milk")).toHaveAttribute("aria-invalid", "true");
    expect(field("Buy milk")).toHaveFocus();
    expect(replace).not.toHaveBeenCalled();
  });

  it("closes the editor and sends nothing when the trimmed title is unchanged", async () => {
    givenTodos([todo]);
    render(<TodoFlows />);
    const input = await openEditor();

    await userEvent.type(input, "  ");
    await userEvent.keyboard("{Enter}");

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(editButton("Buy milk")).toHaveFocus();
  });
});

describe("TodoFlows editing: saving", () => {
  it("sends the trimmed title and completed false for an active todo", async () => {
    givenTodos([todo]);
    render(<TodoFlows />);
    const input = await openEditor();

    await userEvent.clear(input);
    await userEvent.type(input, "  Buy oat milk  {Enter}");

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(todo.id, { title: "Buy oat milk", completed: false });
  });

  it("sends completed true for a completed todo", async () => {
    givenTodos([doneTodo]);
    render(<TodoFlows />);
    const input = await openEditor("Walk the dog");

    await userEvent.clear(input);
    await userEvent.type(input, "Walk the cat{Enter}");

    expect(replace).toHaveBeenCalledWith(doneTodo.id, { title: "Walk the cat", completed: true });
  });

  it("saves with the Save button too", async () => {
    givenTodos([todo]);
    render(<TodoFlows />);
    const input = await openEditor();

    await userEvent.type(input, "!");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(replace).toHaveBeenCalledWith(todo.id, { title: "Buy milk!", completed: false });
  });

  it("closes the editor and returns focus to the Edit button after a success", async () => {
    givenTodos([todo]);
    render(<TodoFlows />);
    const input = await openEditor();

    await userEvent.type(input, "!{Enter}");

    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    expect(editButton("Buy milk")).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocks a second save while the first is pending", async () => {
    givenTodos([todo]);
    holdNextSave();
    render(<TodoFlows />);
    const input = await openEditor();

    await userEvent.type(input, "!{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Saving…" }));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
  });

  it("ignores Escape and Cancel while the save is pending", async () => {
    givenTodos([todo]);
    holdNextSave();
    render(<TodoFlows />);
    const input = await openEditor();
    await userEvent.type(input, "!{Enter}");

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("textbox")).toHaveValue("Buy milk!");
  });

  it("blocks the row's checkbox while the save is pending", async () => {
    givenTodos([todo]);
    holdNextSave();
    render(<TodoFlows />);
    const input = await openEditor();

    await userEvent.type(input, "!{Enter}");

    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true");
  });
});

describe("TodoFlows editing: cancelling", () => {
  it("cancels with Escape, shows the original title, sends nothing, and returns focus to Edit", async () => {
    givenTodos([todo]);
    render(<TodoFlows />);
    const input = await openEditor();
    await userEvent.type(input, " changed");

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(editButton("Buy milk")).toHaveFocus();
  });

  it("cancels with the Cancel button and returns focus to Edit", async () => {
    givenTodos([todo]);
    render(<TodoFlows />);
    await openEditor();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(editButton("Buy milk")).toHaveFocus();
  });

  it("shows the original title again when the editor is opened a second time", async () => {
    givenTodos([todo]);
    render(<TodoFlows />);
    const input = await openEditor();
    await userEvent.type(input, " changed");
    await userEvent.keyboard("{Escape}");

    expect(await openEditor()).toHaveValue("Buy milk");
  });
});

describe("TodoFlows editing: failures", () => {
  it("shows the validation message and keeps the draft for a 400", async () => {
    givenTodos([todo]);
    replace.mockResolvedValue(err({ type: "API_ERROR", status: 400, message: "bad" }));
    render(<TodoFlows />);
    const input = await openEditor();

    await userEvent.type(input, "!{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a title for your todo.");
    expect(field("Buy milk")).toHaveValue("Buy milk!");
  });

  it.each<{ name: string; error: ClientError }>([
    { name: "503", error: { type: "API_ERROR", status: 503, message: "secret-internal-detail" } },
    { name: "network", error: { type: "NETWORK_ERROR", message: "secret-internal-detail" } },
    { name: "parse", error: { type: "PARSE_ERROR", message: "secret-internal-detail" } },
  ])(
    "shows a safe message, keeps the draft, and keeps focus in the field for a $name error",
    async ({ error }) => {
      givenTodos([todo]);
      replace.mockResolvedValue(err(error));
      render(<TodoFlows />);
      const input = await openEditor();

      await userEvent.type(input, "!{Enter}");

      expect(await screen.findByRole("alert")).toHaveTextContent(/could not save this todo/i);
      expect(screen.queryByText(/secret-internal-detail/)).not.toBeInTheDocument();
      expect(screen.queryByText(/503/)).not.toBeInTheDocument();
      expect(field("Buy milk")).toHaveValue("Buy milk!");
      expect(field("Buy milk")).toHaveFocus();
    },
  );

  it("shows the stale-data message for a 404, keeps the draft, and refreshes the list on cancel", async () => {
    givenTodos([todo]);
    replace.mockResolvedValue(err({ type: "API_ERROR", status: 404, message: "Todo not found" }));
    render(<TodoFlows />);
    const input = await openEditor();

    await userEvent.type(input, "!{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/i);
    expect(field("Buy milk")).toHaveValue("Buy milk!");
    expect(refresh).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("clears the message when the user types, and lets the user save again", async () => {
    givenTodos([todo]);
    replace.mockResolvedValueOnce(err({ type: "NETWORK_ERROR", message: "Offline" }));
    render(<TodoFlows />);
    const input = await openEditor();
    await userEvent.type(input, "!{Enter}");
    await screen.findByRole("alert");

    await userEvent.type(field("Buy milk"), "?");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.keyboard("{Enter}");

    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenLastCalledWith(todo.id, { title: "Buy milk!?", completed: false });
  });
});
