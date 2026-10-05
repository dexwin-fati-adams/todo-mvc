import { useRef, useState } from "react";
import { match } from "ts-pattern";
import { CreateTodoRequestSchema } from "contracts";
import type { ClientError } from "@/api/todos/todo.api";
import { useCreateTodo } from "@/modules/todos/hooks/useCreateTodo";
import { TodoFormView, type TodoFormStatus } from "@/modules/todos/view/TodoFormView";

const EMPTY_TITLE_MESSAGE = "Enter a title for your todo.";
const NETWORK_MESSAGE = "We can't reach the server. Check your connection and try again.";
const GENERIC_MESSAGE = "We couldn't add your todo. Please try again.";

type FormState = { status: TodoFormStatus; message: string | null };

const IDLE: FormState = { status: "idle", message: null };

//failureOf() turns a ClientError into the state and the plain message the user sees. A 400 is the same expected
// failure as an empty title. Raw errors, status codes and server messages are never shown.
function failureOf(error: ClientError): FormState {
  return match(error)
    .with({ type: "API_ERROR", status: 400 }, (): FormState => ({
      status: "invalid",
      message: EMPTY_TITLE_MESSAGE,
    }))
    .with({ type: "NETWORK_ERROR" }, (): FormState => ({
      status: "failed",
      message: NETWORK_MESSAGE,
    }))
    .with({ type: "API_ERROR" }, { type: "PARSE_ERROR" }, (): FormState => ({
      status: "failed",
      message: GENERIC_MESSAGE,
    }))
    .exhaustive();
}

//TodoCreateFlow owns the form: it trims and checks the title before any request, blocks a repeated submit while one is
// pending, clears the field on success, and puts focus back in the field after every outcome.
//The ref blocks a second submit in the same moment, before React has re-rendered the pending state.
export function TodoCreateFlow() {
  const { submit } = useCreateTodo();
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const [title, setTitle] = useState("");
  const [state, setState] = useState<FormState>(IDLE);

  const handleTitleChange = (next: string) => {
    setTitle(next);
    setState((current) =>
      match(current.status)
        .with("invalid", "failed", () => IDLE)
        .with("idle", "pending", () => current)
        .exhaustive(),
    );
  };

  const handleSubmit = () => {
    if (submittingRef.current) {
      return;
    }

    const parsed = CreateTodoRequestSchema.safeParse({ title: title.trim() });
    if (!parsed.success) {
      setState({ status: "invalid", message: EMPTY_TITLE_MESSAGE });
      inputRef.current?.focus();
      return;
    }

    submittingRef.current = true;
    setState({ status: "pending", message: null });

    void submit(parsed.data).then((result) => {
      submittingRef.current = false;
      result.match(
        () => {
          setTitle("");
          setState(IDLE);
        },
        (error) => setState(failureOf(error)),
      );
      inputRef.current?.focus();
    });
  };

  return (
    <TodoFormView
      title={title}
      status={state.status}
      message={state.message}
      inputRef={inputRef}
      onTitleChange={handleTitleChange}
      onSubmit={handleSubmit}
    />
  );
}
