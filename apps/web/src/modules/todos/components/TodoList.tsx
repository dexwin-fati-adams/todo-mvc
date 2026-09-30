import type { Todo } from "contracts";
import { TodoItem } from "@/modules/todos/components/TodoItem";

export function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul className="m-0 list-none p-0" aria-label="Todo list">
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
