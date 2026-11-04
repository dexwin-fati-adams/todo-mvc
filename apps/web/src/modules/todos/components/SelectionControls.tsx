import { useId, type Ref } from "react";
import {
  CLEAR_LABEL,
  ENTER_LABEL,
  EXIT_LABEL,
  GROUP_LABEL,
  SELECTION_HELP_TEXT,
} from "@/modules/todos/flows/selectionLabels";

export type SelectionControlsProps = {
  visible: boolean;
  active: boolean;
  entryDisabled: boolean;
  countText: string;
  selectVisibleLabel: string;
  selectVisibleDisabled: boolean;
  clearDisabled: boolean;
  entryRef?: Ref<HTMLButtonElement>;
  countRef?: Ref<HTMLParagraphElement>;
  onEnter: () => void;
  onExit: () => void;
  onSelectVisible: () => void;
  onClear: () => void;
};

//The ring shows a blue outline around a control when you use the keyboard to focus on it.
const ring =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

// Same look as the page buttons and the Delete button: slate border, small text.
const button =
  "rounded border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 " +
  "hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white";

export function SelectionControls({
  visible,
  active,
  entryDisabled,
  countText,
  selectVisibleLabel,
  selectVisibleDisabled,
  clearDisabled,
  entryRef,
  countRef,
  onEnter,
  onExit,
  onSelectVisible,
  onClear,
}: SelectionControlsProps) {
  const helpId = useId();

  if (!visible) return null;

  if (!active) {
    return (
      <div className="px-4 py-2">
        <button
          ref={entryRef}
          type="button"
          disabled={entryDisabled}
          className={`${button} ${ring}`}
          onClick={() => onEnter()}
        >
          {ENTER_LABEL}
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={GROUP_LABEL}
      aria-describedby={helpId}
      className="flex flex-col gap-2 px-4 py-2"
    >
      <p
        ref={countRef}
        role="status"
        tabIndex={-1}
        className={`rounded text-sm font-medium text-slate-800 ${ring}`}
      >
        {countText}
      </p>
      <p id={helpId} className="text-xs text-slate-500">
        {SELECTION_HELP_TEXT}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={selectVisibleDisabled}
          className={`${button} ${ring}`}
          onClick={() => onSelectVisible()}
        >
          {selectVisibleLabel}
        </button>
        <button
          type="button"
          disabled={clearDisabled}
          className={`${button} ${ring}`}
          onClick={() => onClear()}
        >
          {CLEAR_LABEL}
        </button>
        <button type="button" className={`${button} ${ring}`} onClick={() => onExit()}>
          {EXIT_LABEL}
        </button>
      </div>
    </div>
  );
}
