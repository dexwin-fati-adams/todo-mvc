import { useEffect, useRef, useState } from "react";
import { match } from "ts-pattern";
import type { Result } from "neverthrow";
import { ReplaceTodoRequestSchema, type ReplaceTodoRequest, type Todo } from "contracts";
import type { ClientError } from "@/api/todos/todo.api";
import type { TodoEditing } from "@/modules/todos/components/TodoItem";
import type { TodoEditStatus } from "@/modules/todos/components/TodoEditForm";
import { useReplaceTodo } from "@/modules/todos/hooks/useReplaceTodo";

const VALIDATION_MESSAGE = "Enter a title for your todo.";
const STALE_MESSAGE = "This todo no longer exists. Cancel to refresh the list.";
const FAILED_MESSAGE = "Could not save this todo. Please try again.";

//Only these safe texts are ever shown. Raw errors, status codes, and server messages never reach the user.
type SaveOutcome =
  | { kind: "saved" }
  | { kind: "invalid"; message: string }
  | { kind: "stale"; message: string }
  | { kind: "failed"; message: string };

function toOutcome(result: Result<Todo, ClientError>): SaveOutcome {
  return result.match<SaveOutcome>(
    () => ({ kind: "saved" }),
    (error) =>
      match<ClientError, SaveOutcome>(error)
        .with({ type: "API_ERROR", status: 400 }, () => ({
          kind: "invalid",
          message: VALIDATION_MESSAGE,
        }))
        .with({ type: "API_ERROR", status: 404 }, () => ({ kind: "stale", message: STALE_MESSAGE }))
        .with({ type: "API_ERROR" }, { type: "NETWORK_ERROR" }, { type: "PARSE_ERROR" }, () => ({
          kind: "failed",
          message: FAILED_MESSAGE,
        }))
        .exhaustive(),
  );
}

//What the draft means before any request is made.
type DraftCheck =
  { kind: "empty" } | { kind: "unchanged" } | { kind: "ready"; body: ReplaceTodoRequest };

//The draft is trimmed first, because the shared schema does not trim.
//The body always carries the todo's current completed value, because PUT replaces the whole representation.
function checkDraft(draft: string, current: Todo): DraftCheck {
  const title = draft.trim();
  if (title === "") {
    return { kind: "empty" };
  }
  if (title === current.title) {
    return { kind: "unchanged" };
  }
  const parsed = ReplaceTodoRequestSchema.safeParse({ title, completed: current.completed });
  return parsed.success ? { kind: "ready", body: parsed.data } : { kind: "empty" };
}

type UseTodoEditFlowParams = {
  todos: Todo[];
};

export function useTodoEditFlow({ todos }: UseTodoEditFlowParams): TodoEditing {
  const { replace, refresh } = useReplaceTodo();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<TodoEditStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const savingRef = useRef(false);
  const staleRef = useRef(false);
  const editedRef = useRef<Todo | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonsRef = useRef(new Map<string, HTMLButtonElement>());
  //the id of the row whose Edit button should get focus once the editor has closed
  const focusButtonOfRef = useRef<string | null>(null);

  const setEditButton = (id: string) => (element: HTMLButtonElement | null) => {
    if (element === null) {
      buttonsRef.current.delete(id);
      return;
    }
    buttonsRef.current.set(id, element);
  };

  //Opening: focus goes into the field with the cursor at the end of the title.
  //Closing: focus goes back to the row's Edit button.
  useEffect(() => {
    if (activeId !== null) {
      const input = inputRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
      return;
    }
    const buttonOf = focusButtonOfRef.current;
    focusButtonOfRef.current = null;
    if (buttonOf !== null) {
      buttonsRef.current.get(buttonOf)?.focus();
    }
  }, [activeId]);

  //After a validation or save failure the field keeps the draft and takes focus.
  useEffect(() => {
    match(status)
      .with("invalid", "failed", () => inputRef.current?.focus())
      .with("idle", "pending", () => undefined)
      .exhaustive();
  }, [status]);

  const close = (id: string) => {
    staleRef.current = false;
    editedRef.current = null;
    focusButtonOfRef.current = id;
    setActiveId(null);
    setDraft("");
    setStatus("idle");
    setMessage(null);
  };

  const onStart = (todo: Todo) => {
    if (savingRef.current || (activeId !== null && activeId !== todo.id)) {
      return;
    }
    staleRef.current = false;
    editedRef.current = todo;
    setActiveId(todo.id);
    setDraft(todo.title);
    setStatus("idle");
    setMessage(null);
  };

  const onDraftChange = (next: string) => {
    if (savingRef.current) {
      return;
    }
    setDraft(next);
    setStatus("idle");
    setMessage(null);
  };

  const save = (id: string, body: ReplaceTodoRequest) => {
    savingRef.current = true;
    setStatus("pending");
    setMessage(null);

    void replace(id, body).then((result) => {
      savingRef.current = false;
      match(toOutcome(result))
        .with({ kind: "saved" }, () => close(id))
        .with({ kind: "invalid" }, ({ message: text }) => {
          setStatus("invalid");
          setMessage(text);
        })
        .with({ kind: "failed" }, ({ message: text }) => {
          setStatus("failed");
          setMessage(text);
        })
        .with({ kind: "stale" }, ({ message: text }) => {
          staleRef.current = true;
          setStatus("failed");
          setMessage(text);
        })
        .exhaustive();
    });
  };

  const onSave = () => {
    if (savingRef.current || activeId === null) {
      return;
    }
    const current = todos.find((todo) => todo.id === activeId) ?? editedRef.current;
    if (current === null) {
      return;
    }
    match(checkDraft(draft, current))
      .with({ kind: "empty" }, () => {
        setStatus("invalid");
        setMessage(VALIDATION_MESSAGE);
      })
      .with({ kind: "unchanged" }, () => close(current.id))
      .with({ kind: "ready" }, ({ body }) => save(current.id, body))
      .exhaustive();
  };

  const onCancel = () => {
    if (savingRef.current || activeId === null) {
      return;
    }
    //A 404 left the editor open on a todo that no longer exists. Cancelling refreshes the list now.
    if (staleRef.current) {
      void refresh();
    }
    close(activeId);
  };

  return {
    activeId,
    draft,
    status,
    message,
    inputRef,
    setEditButton,
    onStart,
    onDraftChange,
    onSave,
    onCancel,
  };
}
