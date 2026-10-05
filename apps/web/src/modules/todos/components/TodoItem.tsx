import { match } from "ts-pattern";
import type { Todo } from "contracts";

type TodoItemProps = {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  isPending: boolean;
  message: string | null;
};

//TodoItem shows one todo row: a labelled checkbox, the title, and the row's own pending or error message.
//The checkbox is a controlled input, so it only ever shows todo.completed from the list data.
// A click never changes what it shows. Only new data from the server does.
//While the row is pending the checkbox uses aria-disabled and not disabled, so it stays in the tab order and keeps focus.
export function TodoItem({ todo, onToggle, isPending, message }: TodoItemProps) {
  return (
    <li className="border-b border-slate-200 px-4 py-3 last:border-b-0">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          checked={todo.completed}
          aria-disabled={isPending}
          onChange={() =>
            match(isPending)
              .with(true, () => undefined)
              .with(false, () => onToggle(todo))
              .exhaustive()
          }
        />
        <span className={todo.completed ? "text-slate-500 line-through" : "text-slate-900"}>
          {todo.title}
        </span>
      </label>
      {isPending ? (
        <p role="status" className="m-0 mt-1 pl-7 text-sm text-slate-600">
          Updating…
        </p>
      ) : null}
      {message !== null ? (
        <p role="alert" className="m-0 mt-1 pl-7 text-sm text-red-700">
          {message}
        </p>
      ) : null}
    </li>
  );
}
