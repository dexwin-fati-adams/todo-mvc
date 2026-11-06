import { useId, type Ref } from "react";
import { match } from "ts-pattern";
import { focusRing as ring } from "@/modules/todos/components/focusRing";

//pending = the request is running. success = it worked. failure = it did not work.
export type ClearCompletedMessageKind = "pending" | "success" | "failure";

export type ClearCompletedProps = {
  visible: boolean;
  buttonVisible: boolean;
  disabled: boolean;
  label: string;
  helpText: string;
  message: string;
  messageKind: ClearCompletedMessageKind | null;
  buttonRef?: Ref<HTMLButtonElement>;
  messageRef?: Ref<HTMLParagraphElement>;
  onClear: () => void;
};

// Same look as the page buttons and the Delete button: slate border, small text.
const clearButton =
  "rounded border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 " +
  "hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white";

export function ClearCompleted({
  visible,
  buttonVisible,
  disabled,
  label,
  helpText,
  message,
  messageKind,
  buttonRef,
  messageRef,
  onClear,
}: ClearCompletedProps) {
  const helpId = useId();

  if (!visible) return null;

  const statusText = match(messageKind)
    .with("pending", "success", () => message)
    .with("failure", null, () => "")
    .exhaustive();
  const alertText = match(messageKind)
    .with("failure", () => message)
    .with("pending", "success", null, () => "")
    .exhaustive();

  return (
    <div aria-busy={messageKind === "pending"} className="flex flex-col gap-1 px-4 py-2">
      {buttonVisible && (
        <>
          <div>
            <button
              ref={buttonRef}
              type="button"
              disabled={disabled}
              aria-describedby={helpId}
              className={`${clearButton} ${ring}`}
              onClick={() => onClear()}
            >
              {label}
            </button>
          </div>
          <p id={helpId} className="text-xs text-slate-500">
            {helpText}
          </p>
        </>
      )}
      <p
        ref={messageRef}
        role="status"
        tabIndex={-1}
        className={`rounded text-sm text-slate-700 ${ring}`}
      >
        {statusText}
      </p>
      <p role="alert" className="text-sm text-red-700">
        {alertText}
      </p>
    </div>
  );
}
