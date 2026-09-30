import type { Todo } from "contracts";

export function TodoItem({ todo }: { todo: Todo }) {
  return (
    <li className="border-b border-slate-200 px-4 py-3 last:border-b-0">
      {todo.completed ? <span className="sr-only">Completed: </span> : null}
      <span className={todo.completed ? "text-slate-500 line-through" : "text-slate-900"}>
        {todo.title}
      </span>
    </li>
  );
}
