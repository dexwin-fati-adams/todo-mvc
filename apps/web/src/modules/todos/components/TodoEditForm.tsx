import { useId, type RefObject } from "react";
import { match, P } from "ts-pattern";

export type TodoEditStatus = "idle" | "invalid" | "pending" | "failed";

export type TodoEditFormProps = {
  title: string;
  draft: string;
  status: TodoEditStatus;
  message: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

//TodoEditForm shows a form for editing a Todo's title, lets the user save or cancel,
// and handles states like invalid input or saving.

//When saving, it disables editing and shows “Saving…”, and if something goes wrong,
// it displays an error message.
export function TodoEditForm({
  title,
  draft,
  status,
  message,
  inputRef,
  onDraftChange,
  onSave,
  onCancel,
}: TodoEditFormProps) {
  const messageId = useId();

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
    .with(P.string, () => messageId)
    .exhaustive();

  return (
    <form
      noValidate
      className="flex flex-1 flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          readOnly={isPending}
          aria-label={`Edit title of “${title}”`}
          aria-invalid={isInvalid}
          aria-describedby={describedBy}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) =>
            match(event.key)
              .with("Escape", () => {
                event.preventDefault();
                onCancel();
              })
              .otherwise(() => undefined)
          }
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        />
        <button
          type="submit"
          aria-disabled={isPending}
          className="rounded bg-blue-700 px-3 py-1 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          aria-disabled={isPending}
          onClick={onCancel}
          className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
      {match(message)
        .with(null, () => null)
        .with(P.string, (text) => (
          <p id={messageId} role="alert" className="m-0 text-sm text-red-700">
            {text}
          </p>
        ))
        .exhaustive()}
      {isPending ? (
        <p role="status" className="m-0 text-sm text-slate-600">
          Saving…
        </p>
      ) : null}
    </form>
  );
}
