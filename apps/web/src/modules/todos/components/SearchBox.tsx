import { useCallback, useEffect, useId, useRef, useState } from "react";
import { match, P } from "ts-pattern";
import { parseSearch } from "@/modules/todos/flows/parseSearch";

const DEBOUNCE_MS = 300;
const BLANK_MESSAGE = "Enter a search term, or clear the box to see all todos.";

type SearchBoxProps = {
  value: string;
  onCommit: (value: string) => void;
  maxLength: number;
};

export function SearchBox({ value, onCommit, maxLength }: SearchBoxProps) {
  const inputId = useId();
  const messageId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const [text, setText] = useState(value);
  const [message, setMessage] = useState<string | null>(null);
  const [seenValue, setSeenValue] = useState(value);

  if (seenValue !== value) {
    setSeenValue(value);
    setText((current) => (current.trim() === value ? current : value));
    setMessage(null);
  }

  const cancelTimer = useCallback(() => {
    match(timerRef.current)
      .with(null, () => undefined)
      .with(P.not(null), (timer) => clearTimeout(timer))
      .exhaustive();
    timerRef.current = null;
  }, []);

  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  useEffect(() => {
    committedRef.current = value;
    cancelTimer();
  }, [value, cancelTimer]);

  useEffect(() => cancelTimer, [cancelTimer]);

  const commit = (raw: string) => {
    cancelTimer();
    match(parseSearch(raw))
      .with({ kind: "empty" }, () => {
        setMessage(null);
        match(committedRef.current === "")
          .with(true, () => undefined)
          .with(false, () => onCommitRef.current(""))
          .exhaustive();
      })
      .with({ kind: "valid" }, ({ value: next }) => {
        setMessage(null);
        match(next === committedRef.current)
          .with(true, () => undefined)
          .with(false, () => onCommitRef.current(next))
          .exhaustive();
      })
      .with({ kind: "invalid", reason: "blank" }, () => setMessage(BLANK_MESSAGE))
      .with({ kind: "invalid", reason: "too-long" }, () =>
        setMessage(`Search can be at most ${maxLength} characters.`),
      )
      .exhaustive();
  };

  const handleChange = (next: string) => {
    setText(next);
    setMessage(null);
    cancelTimer();
    timerRef.current = setTimeout(() => commit(next), DEBOUNCE_MS);
  };

  const handleClear = () => {
    setText("");
    commit("");
    inputRef.current?.focus();
  };

  return (
    <form
      role="search"
      className="flex flex-col gap-1 border-b border-slate-200 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        commit(text);
      }}
    >
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        Search todos
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          value={text}
          aria-invalid={message !== null}
          aria-describedby={message !== null ? messageId : undefined}
          onChange={(event) => handleChange(event.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        />
        {match(text)
          .with("", () => null)
          .otherwise(() => (
            <button
              type="button"
              aria-label="Clear search"
              onClick={handleClear}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Clear
            </button>
          ))}
      </div>
      {match(message)
        .with(null, () => null)
        .with(P.string, (text) => (
          <p id={messageId} role="alert" className="m-0 text-sm text-red-700">
            {text}
          </p>
        ))
        .exhaustive()}
    </form>
  );
}
