import type { RefObject } from "react";

export type TodoFormStatus = "idle" | "invalid" | "pending" | "failed";

export type TodoFormViewProps = {
  title: string;
  status: TodoFormStatus;
  message: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onTitleChange: (title: string) => void;
  onSubmit: () => void;
};

//This is only a placeholder for now. It renders nothing, so the tests fail because the real form is missing,
// and not because an import is broken. The next step replaces it.
export function TodoFormView(props: TodoFormViewProps) {
  void props;
  return null;
}
