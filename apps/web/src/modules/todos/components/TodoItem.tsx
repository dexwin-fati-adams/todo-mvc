import type { Todo } from "contracts";

export function TodoItem({ todo }: { todo: Todo }) {
  return (
    <li className={todo.completed ? "todo-item completed" : "todo-item"}>
      {todo.completed ? <span className="visually-hidden">Completed: </span> : null}
      <span className="todo-title">{todo.title}</span>
    </li>
  );
}
