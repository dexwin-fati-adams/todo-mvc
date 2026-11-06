export type SelectionCheckboxProps = {
  //The accessible name, for example: Select “Buy milk”. It is different from the completion checkbox name.
  label: string;
  checked: boolean;
  //At the limit the flow disables the unselected rows. A selected row stays enabled so the user can unselect it.
  disabled: boolean;
  onChange: () => void;
};

//The ring shows a blue outline around a control when you use the keyboard to focus on it.
const ring =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

//aria-disabled, not the native disabled attribute, so the box stays in the Tab order and a screen reader can still reach it.
//The other controls in a row work the same way. The click is ignored in code.
export function SelectionCheckbox({ label, checked, disabled, onChange }: SelectionCheckboxProps) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      aria-disabled={disabled}
      className={`h-4 w-4 cursor-pointer aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ${ring}`}
      onChange={() => {
        if (!disabled) {
          onChange();
        }
      }}
    />
  );
}
