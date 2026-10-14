import type { RefObject } from "react";
import { match } from "ts-pattern";
import type { Todo } from "contracts";
import { TodoEditForm, type TodoEditStatus } from "@/modules/todos/components/TodoEditForm";

//TodoEditing is everything a row needs to support inline editing. It is optional, so a list that is not wired for
// editing still renders exactly as before, with no Edit button.
export type TodoEditing = {
  activeId: string | null;
  draft: string;
  status: TodoEditStatus;
  message: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  setEditButton: (id: string) => (element: HTMLButtonElement | null) => void;
  onStart: (todo: Todo) => void;
  onDraftChange: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
};
//This code defines the information and functions needed to manage deleting todos, including tracking which todos are being deleted, showing messages,
// setting button focus, and handling the delete action.
export type TodoDeleting = {
  activeIds: ReadonlySet<string>;
  notice: string | null;
  setDeleteButton: (id: string) => (element: HTMLButtonElement | null) => void;
  setFocusTarget: (element: HTMLElement | null) => void;
  onDelete: (todo: Todo) => void;
};

type TodoItemProps = {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  isPending: boolean;
  message: string | null;
  editing?: TodoEditing;
  deleting?: TodoDeleting;
};

//This code defines the information and functions needed to manage deleting todos, including tracking which todos are being deleted, showing messages,
//  setting button focus, and handling the delete action.
export function TodoItem({ todo, onToggle, isPending, message, editing, deleting }: TodoItemProps) {
  const titleId = `todo-title-${todo.id}`;
  const editingThisRow = editing !== undefined && editing.activeId === todo.id ? editing : null;
  const isSavingThisRow = editingThisRow !== null && editingThisRow.status === "pending";
  const isOtherRowEditing =
    editing !== undefined && editing.activeId !== null && editing.activeId !== todo.id;
  const isAnyRowEditing = editing !== undefined && editing.activeId !== null;
  const isDeletingThisRow = deleting !== undefined && deleting.activeIds.has(todo.id);
  const isEditBlocked = isPending || isOtherRowEditing || isDeletingThisRow;
  const isCheckboxBlocked = isPending || isSavingThisRow || isDeletingThisRow;
  const isDeleteBlocked = isPending || isDeletingThisRow || isAnyRowEditing;

  const startEdit = () => {
    if (editing === undefined || isEditBlocked) {
      return;
    }
    editing.onStart(todo);
  };

  const startDelete = () => {
    if (deleting === undefined || isDeleteBlocked) {
      return;
    }
    deleting.onDelete(todo);
  };

  return (
    <li className="border-b border-slate-200 px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          checked={todo.completed}
          aria-labelledby={titleId}
          aria-disabled={isCheckboxBlocked}
          onChange={() =>
            match(isCheckboxBlocked)
              .with(true, () => undefined)
              .with(false, () => onToggle(todo))
              .exhaustive()
          }
        />
        {editingThisRow !== null ? (
          <>
            <span id={titleId} className="sr-only">
              {todo.title}
            </span>
            <TodoEditForm
              title={todo.title}
              draft={editingThisRow.draft}
              status={editingThisRow.status}
              message={editingThisRow.message}
              inputRef={editingThisRow.inputRef}
              onDraftChange={editingThisRow.onDraftChange}
              onSave={editingThisRow.onSave}
              onCancel={editingThisRow.onCancel}
            />
          </>
        ) : (
          <>
            <span
              id={titleId}
              onDoubleClick={startEdit}
              className={`flex-1 ${todo.completed ? "text-slate-500 line-through" : "text-slate-900"}`}
            >
              {todo.title}
            </span>
            {editing !== undefined ? (
              <button
                type="button"
                ref={editing.setEditButton(todo.id)}
                aria-label={`Edit “${todo.title}”`}
                aria-disabled={isEditBlocked}
                onClick={startEdit}
                className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              >
                Edit
              </button>
            ) : null}
            {deleting !== undefined ? (
              <button
                type="button"
                ref={deleting.setDeleteButton(todo.id)}
                aria-label={`Delete “${todo.title}”`}
                aria-disabled={isDeleteBlocked}
                onClick={startDelete}
                className="rounded border border-red-300 px-2 py-1 text-sm text-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              >
                {isDeletingThisRow ? "Deleting…" : "Delete"}
              </button>
            ) : null}
          </>
        )}
      </div>
      {isPending ? (
        <p role="status" className="m-0 mt-1 pl-7 text-sm text-slate-600">
          Updating…
        </p>
      ) : null}
      {isDeletingThisRow ? (
        <p role="status" className="m-0 mt-1 pl-7 text-sm text-slate-600">
          Deleting…
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
