import type { Todo } from "contracts";
import { TodoItem, type TodoDeleting, type TodoEditing } from "@/modules/todos/components/TodoItem";

type TodoListProps = {
  todos: Todo[];
  onToggle: (todo: Todo) => void;
  pendingIds: ReadonlySet<string>;
  rowMessages: Readonly<Record<string, string>>;
  editing?: TodoEditing;
  deleting?: TodoDeleting;
};

export function TodoList({
  todos,
  onToggle,
  pendingIds,
  rowMessages,
  editing,
  deleting,
}: TodoListProps) {
  return (
    <ul
      className="m-0 list-none p-0"
      aria-label="Todo list"
      ref={deleting?.setFocusTarget}
      tabIndex={deleting !== undefined ? -1 : undefined}
    >
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          isPending={pendingIds.has(todo.id)}
          message={rowMessages[todo.id] ?? null}
          editing={editing}
          deleting={deleting}
        />
      ))}
    </ul>
  );
}
