import type { Todo } from "contracts";
import { TodoItem } from "@/modules/todos/components/TodoItem";

export function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul className="todo-list" aria-label="Todo list">
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
