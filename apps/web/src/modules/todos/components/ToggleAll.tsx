import { useId, type Ref } from "react";
import { match } from "ts-pattern";

//pending = the request is running. success = it worked. failure = it did not work.
export type ToggleAllMessageKind = "pending" | "success" | "failure";

export type ToggleAllProps = {
  visible: boolean;
  checked: boolean;
  disabled: boolean;
  label: string;
  helpText: string;
  message: string;
  messageKind: ToggleAllMessageKind | null;
  inputRef?: Ref<HTMLInputElement>;
  onToggle: () => void;
};

//The ring shows a blue outline around the checkbox when you use the keyboard to focus on it.
const ring =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

//ToggleAll only draws the control. It holds no rules: the flow decides the label, the checked state and the messages.
//The status and alert boxes are always on the page while the control is visible, because a screen reader only
// reads a live region that was already there before its text changed.
export function ToggleAll({
  visible,
  checked,
  disabled,
  label,
  helpText,
  message,
  messageKind,
  inputRef,
  onToggle,
}: ToggleAllProps) {
  const checkboxId = useId();
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
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id={checkboxId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={helpId}
          className={`h-4 w-4 rounded border-slate-300 disabled:cursor-not-allowed disabled:opacity-50 ${ring}`}
          onChange={() => onToggle()}
        />
        <label htmlFor={checkboxId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      </div>
      <p id={helpId} className="text-xs text-slate-500">
        {helpText}
      </p>
      <p role="status" className="text-sm text-slate-700">
        {statusText}
      </p>
      <p role="alert" className="text-sm text-red-700">
        {alertText}
      </p>
    </div>
  );
}
