import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { TodoFormView, type TodoFormViewProps } from "@/modules/todos/view/TodoFormView";

const LABEL = "What needs to be done?";

function renderForm(props: Partial<TodoFormViewProps> = {}) {
  const onTitleChange = vi.fn();
  const onSubmit = vi.fn();
  const inputRef = createRef<HTMLInputElement>();
  const utils = render(
    <TodoFormView
      title=""
      status="idle"
      message={null}
      inputRef={inputRef}
      onTitleChange={onTitleChange}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { ...utils, onTitleChange, onSubmit, inputRef };
}

describe("TodoFormView", () => {
  it("renders a labelled field and an Add todo button", () => {
    renderForm();

    expect(screen.getByLabelText(LABEL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add todo" })).toBeInTheDocument();
  });

  it("shows the title it is given in the field", () => {
    renderForm({ title: "Buy milk" });

    expect(screen.getByLabelText(LABEL)).toHaveValue("Buy milk");
  });

  it("calls onTitleChange when the user types", async () => {
    const { onTitleChange } = renderForm();

    await userEvent.type(screen.getByLabelText(LABEL), "a");

    expect(onTitleChange).toHaveBeenCalledWith("a");
  });

  it("calls onSubmit once when the button is clicked", async () => {
    const { onSubmit } = renderForm({ title: "Buy milk" });

    await userEvent.click(screen.getByRole("button", { name: "Add todo" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("calls onSubmit once when Enter is pressed in the field", async () => {
    const { onSubmit } = renderForm({ title: "Buy milk" });

    await userEvent.type(screen.getByLabelText(LABEL), "{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("gives the field to the ref it receives", () => {
    const { inputRef } = renderForm();

    expect(inputRef.current).toBe(screen.getByLabelText(LABEL));
  });

  it("idle shows no message and a valid field", () => {
    renderForm();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText(LABEL)).toBeValid();
  });

  it("invalid shows the message as an alert and marks the field invalid", () => {
    renderForm({ status: "invalid", message: "Enter a title for your todo." });

    const alert = screen.getByRole("alert");
    const field = screen.getByLabelText(LABEL);
    expect(alert).toHaveTextContent("Enter a title for your todo.");
    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription("Enter a title for your todo.");
  });

  it("failed shows the message as an alert and keeps the field valid", () => {
    renderForm({
      status: "failed",
      message: "We couldn't add your todo. Please try again.",
      title: "Buy milk",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't add your todo. Please try again.",
    );
    expect(screen.getByLabelText(LABEL)).toBeValid();
    expect(screen.getByLabelText(LABEL)).toHaveValue("Buy milk");
  });

  it("pending shows Adding todo… and blocks the button without removing it from the tab order", () => {
    renderForm({ status: "pending", title: "Buy milk" });

    const button = screen.getByRole("button", { name: "Adding…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Adding todo…");
  });
});

describe("TodoFormView accessibility", () => {
  const cases: { name: string; props: Partial<TodoFormViewProps> }[] = [
    { name: "idle", props: {} },
    { name: "invalid", props: { status: "invalid", message: "Enter a title for your todo." } },
    { name: "pending", props: { status: "pending", title: "Buy milk" } },
    {
      name: "failed",
      props: { status: "failed", message: "We couldn't add your todo. Please try again." },
    },
  ];

  it.each(cases)("$name has no axe violations", async ({ props }) => {
    const { container } = renderForm(props);
    expect(container.querySelector("form")).not.toBeNull();

    const results = await axe.run(container, {
      rules: { region: { enabled: false }, "color-contrast": { enabled: false } },
    });

    expect(results.violations).toEqual([]);
  });
});
