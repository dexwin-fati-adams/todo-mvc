import type { RefObject } from "react";
import { match, P } from "ts-pattern";

export type TodoFormStatus = "idle" | "invalid" | "pending" | "failed";

export type TodoFormViewProps = {
  title: string;
  status: TodoFormStatus;
  message: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onTitleChange: (title: string) => void;
  onSubmit: () => void;
};

const INPUT_ID = "new-todo-title";
const MESSAGE_ID = "new-todo-message";

//TodoFormView only draws the form from the props it receives. It checks nothing and sends nothing.
//While pending, the button is blocked with aria-disabled and not with the disabled attribute, so it stays in the
// tab order and keyboard focus is not lost. The flow is what stops a repeated submit.
export function TodoFormView({
  title,
  status,
  message,
  inputRef,
  onTitleChange,
  onSubmit,
}: TodoFormViewProps) {
  const isInvalid = match(status)
    .with("invalid", () => true)
    .with("idle", "pending", "failed", () => false)
    .exhaustive();

  const isPending = match(status)
    .with("pending", () => true)
    .with("idle", "invalid", "failed", () => false)
    .exhaustive();

  const describedBy = match(message)
    .with(null, () => undefined)
    .with(P.string, () => MESSAGE_ID)
    .exhaustive();

  return (
    <form
      noValidate
      className="flex flex-col gap-2 border-b border-slate-200 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={INPUT_ID} className="text-sm font-medium text-slate-700">
        What needs to be done?
      </label>
      <div className="flex gap-2">
        <input
          id={INPUT_ID}
          ref={inputRef}
          type="text"
          value={title}
          aria-invalid={isInvalid}
          aria-describedby={describedBy}
          onChange={(event) => onTitleChange(event.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        />
        <button
          type="submit"
          aria-disabled={isPending}
          className="rounded bg-blue-700 px-4 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add todo"}
        </button>
      </div>
      {match(message)
        .with(null, () => null)
        .with(P.string, (text) => (
          <p id={MESSAGE_ID} role="alert" className="m-0 text-sm text-red-900">
            {text}
          </p>
        ))
        .exhaustive()}
      {isPending ? (
        <p role="status" className="m-0 text-sm text-slate-600">
          Adding todo…
        </p>
      ) : null}
    </form>
  );
}
