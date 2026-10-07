import type { Todo } from "contracts";
import { TodoItem, type TodoEditing } from "@/modules/todos/components/TodoItem";

type TodoListProps = {
  todos: Todo[];
  onToggle: (todo: Todo) => void;
  pendingIds: ReadonlySet<string>;
  rowMessages: Readonly<Record<string, string>>;
  editing?: TodoEditing;
};

export function TodoList({ todos, onToggle, pendingIds, rowMessages, editing }: TodoListProps) {
  return (
    <ul className="m-0 list-none p-0" aria-label="Todo list">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          isPending={pendingIds.has(todo.id)}
          message={rowMessages[todo.id] ?? null}
          editing={editing}
        />
      ))}
    </ul>
  );
}
