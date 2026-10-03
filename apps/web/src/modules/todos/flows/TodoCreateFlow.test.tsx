import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { err, ok } from "neverthrow";
import type { Todo } from "contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientError } from "@/api/todo.api";
import { useCreateTodo } from "@/modules/todos/hooks/useCreateTodo";
import { TodoCreateFlow } from "@/modules/todos/flows/TodoCreateFlow";

vi.mock("@/modules/todos/hooks/useCreateTodo");

type Submit = ReturnType<typeof useCreateTodo>["submit"];

const LABEL = "What needs to be done?";
const EMPTY_MESSAGE = "Enter a title for your todo.";
const NETWORK_MESSAGE = "We can't reach the server. Check your connection and try again.";
const GENERIC_MESSAGE = "We couldn't add your todo. Please try again.";

const todo: Todo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Buy milk",
  completed: false,
  createdAt: "2026-09-29T10:00:00.000Z",
};

const submit = vi.fn<Submit>();

function fail(error: ClientError) {
  submit.mockResolvedValue(err<Todo, ClientError>(error));
}

function field() {
  return screen.getByLabelText(LABEL);
}

function addButton() {
  return screen.getByRole("button", { name: /^(Add todo|Adding…)$/ });
}

beforeEach(() => {
  submit.mockReset();
  submit.mockResolvedValue(ok<Todo, ClientError>(todo));
  vi.mocked(useCreateTodo).mockReturnValue({
    submit,
    isPending: false,
    error: null,
    reset: vi.fn(),
  });
});

describe("TodoCreateFlow", () => {
  it("renders the labelled field and the Add todo button", () => {
    render(<TodoCreateFlow />);

    expect(field()).toHaveValue("");
    expect(addButton()).toHaveTextContent("Add todo");
  });
});

describe("TodoCreateFlow validation", () => {
  it("shows the validation message and makes no request for an empty title", async () => {
    render(<TodoCreateFlow />);

    await userEvent.click(addButton());

    expect(screen.getByRole("alert")).toHaveTextContent(EMPTY_MESSAGE);
    expect(field()).toBeInvalid();
    expect(submit).not.toHaveBeenCalled();
  });

  it("moves focus to the field for an empty title", async () => {
    render(<TodoCreateFlow />);

    await userEvent.click(addButton());

    expect(field()).toHaveFocus();
  });

  it("shows the validation message and makes no request for a whitespace-only title", async () => {
    render(<TodoCreateFlow />);

    await userEvent.type(field(), "     ");
    await userEvent.click(addButton());

    expect(screen.getByRole("alert")).toHaveTextContent(EMPTY_MESSAGE);
    expect(submit).not.toHaveBeenCalled();
  });

  it("trims the title before it is sent", async () => {
    render(<TodoCreateFlow />);

    await userEvent.type(field(), "   Buy milk   ");
    await userEvent.click(addButton());

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({ title: "Buy milk" });
  });
});

describe("TodoCreateFlow pending", () => {
  it("shows the pending state and ignores a second click", async () => {
    submit.mockReturnValue(new Promise(() => {}));
    render(<TodoCreateFlow />);

    await userEvent.type(field(), "Buy milk");
    await userEvent.click(addButton());

    expect(screen.getByRole("status")).toHaveTextContent("Adding todo…");
    expect(addButton()).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(addButton());

    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("ignores the Enter key while pending", async () => {
    submit.mockReturnValue(new Promise(() => {}));
    render(<TodoCreateFlow />);

    await userEvent.type(field(), "Buy milk{Enter}");
    await userEvent.type(field(), "{Enter}");

    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe("TodoCreateFlow success", () => {
  it("clears the field, shows no message, and restores focus to the field", async () => {
    render(<TodoCreateFlow />);

    await userEvent.type(field(), "Buy milk");
    await userEvent.click(addButton());

    await waitFor(() => expect(field()).toHaveValue(""));
    expect(field()).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(addButton()).toHaveTextContent("Add todo");
  });
});

describe("TodoCreateFlow failure", () => {
  it("shows the validation message for a 400 and keeps the title", async () => {
    fail({ type: "API_ERROR", status: 400, message: "raw-server-detail" });
    render(<TodoCreateFlow />);

    await userEvent.type(field(), "Buy milk");
    await userEvent.click(addButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(EMPTY_MESSAGE);
    expect(screen.queryByText(/raw-server-detail/)).not.toBeInTheDocument();
    expect(field()).toHaveValue("Buy milk");
    expect(field()).toHaveFocus();
  });

  it("shows the network message for a network error and keeps the title", async () => {
    fail({ type: "NETWORK_ERROR", message: "raw-network-detail" });
    render(<TodoCreateFlow />);

    await userEvent.type(field(), "Buy milk");
    await userEvent.click(addButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(NETWORK_MESSAGE);
    expect(screen.queryByText(/raw-network-detail/)).not.toBeInTheDocument();
    expect(field()).toHaveValue("Buy milk");
    expect(field()).toHaveFocus();
  });

  it("shows the generic message for a 503 and never shows raw details", async () => {
    fail({ type: "API_ERROR", status: 503, message: "raw-db-detail" });
    render(<TodoCreateFlow />);

    await userEvent.type(field(), "Buy milk");
    await userEvent.click(addButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC_MESSAGE);
    expect(screen.queryByText(/raw-db-detail/)).not.toBeInTheDocument();
    expect(screen.queryByText(/503/)).not.toBeInTheDocument();
    expect(field()).toHaveValue("Buy milk");
  });

  it("shows the generic message for an invalid response", async () => {
    fail({ type: "PARSE_ERROR", message: "raw-parse-detail" });
    render(<TodoCreateFlow />);

    await userEvent.type(field(), "Buy milk");
    await userEvent.click(addButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(GENERIC_MESSAGE);
    expect(screen.queryByText(/raw-parse-detail/)).not.toBeInTheDocument();
  });

  it("clears the message when the user types again", async () => {
    fail({ type: "API_ERROR", status: 503, message: "Down" });
    render(<TodoCreateFlow />);
    await userEvent.type(field(), "Buy milk");
    await userEvent.click(addButton());
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await userEvent.type(field(), "!");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lets the user retry after a failure", async () => {
    fail({ type: "API_ERROR", status: 503, message: "Down" });
    render(<TodoCreateFlow />);
    await userEvent.type(field(), "Buy milk");
    await userEvent.click(addButton());
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    submit.mockResolvedValue(ok<Todo, ClientError>(todo));
    await userEvent.click(addButton());

    await waitFor(() => expect(field()).toHaveValue(""));
    expect(submit).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
