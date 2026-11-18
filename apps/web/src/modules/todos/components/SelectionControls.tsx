import { useId, type Ref } from "react";
import {
  CLEAR_LABEL,
  ENTER_LABEL,
  EXIT_LABEL,
  GROUP_LABEL,
  SELECTION_HELP_TEXT,
} from "@/modules/todos/flows/selectionLabels";
import { focusRing as ring } from "@/modules/todos/components/focusRing";

export type SelectionUpdateControls = {
  completeLabel: string;
  activeLabel: string;
  disabled: boolean;
  pending: boolean;
  failureText: string | null;
  helpText: string;
  completeRef?: Ref<HTMLButtonElement>;
  activeRef?: Ref<HTMLButtonElement>;
  onComplete: () => void;
  onActive: () => void;
};

//The delete button, its two-step confirmation, the pending state and the failure alert.
export type SelectionDeleteControls = {
  label: string;
  disabled: boolean;
  pending: boolean;
  confirming: boolean;
  questionText: string;
  confirmLabel: string;
  cancelLabel: string;
  helpText: string;
  failureText: string | null;
  deleteRef?: Ref<HTMLButtonElement>;
  confirmRef?: Ref<HTMLButtonElement>;
  onDelete: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

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
  //The two update buttons, the pending state and the failure alert. Absent means none are drawn.
  update?: SelectionUpdateControls;
  //The delete button, the confirmation and the failure alert. Absent means none are drawn.
  remove?: SelectionDeleteControls;
};

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
  update,
  remove,
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

  const busy = update?.pending === true || remove?.pending === true;

  return (
    <div
      role="group"
      aria-label={GROUP_LABEL}
      aria-describedby={helpId}
      aria-busy={busy ? true : undefined}
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
      {update !== undefined && <p className="text-xs text-slate-500">{update.helpText}</p>}
      {remove !== undefined && <p className="text-xs text-slate-500">{remove.helpText}</p>}
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
        {update !== undefined && (
          <>
            <button
              ref={update.completeRef}
              type="button"
              disabled={update.disabled}
              className={`${button} ${ring}`}
              onClick={() => update.onComplete()}
            >
              {update.completeLabel}
            </button>
            <button
              ref={update.activeRef}
              type="button"
              disabled={update.disabled}
              className={`${button} ${ring}`}
              onClick={() => update.onActive()}
            >
              {update.activeLabel}
            </button>
          </>
        )}
        {remove !== undefined && (
          <button
            ref={remove.deleteRef}
            type="button"
            disabled={remove.disabled}
            className={`${button} ${ring}`}
            onClick={() => remove.onDelete()}
          >
            {remove.label}
          </button>
        )}
        <button type="button" className={`${button} ${ring}`} onClick={() => onExit()}>
          {EXIT_LABEL}
        </button>
      </div>
      {remove?.confirming === true && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-800">{remove.questionText}</p>
          <div className="flex flex-wrap gap-2">
            <button
              ref={remove.confirmRef}
              type="button"
              disabled={remove.pending}
              className={`${button} ${ring}`}
              onClick={() => remove.onConfirm()}
            >
              {remove.confirmLabel}
            </button>
            <button
              type="button"
              disabled={remove.pending}
              className={`${button} ${ring}`}
              onClick={() => remove.onCancel()}
            >
              {remove.cancelLabel}
            </button>
          </div>
        </div>
      )}
      {update?.failureText != null && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {update.failureText}
        </p>
      )}
      {remove?.failureText != null && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {remove.failureText}
        </p>
      )}
    </div>
  );
}
