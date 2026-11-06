//Focus is "lost" when it is on the page body, or on a control that has just become disabled.
//Pass the control you own: if focus is still on it (even when it is now disabled), it counts as lost too.
//If the user has moved focus to something else, it is not lost and we leave it alone.
export function focusIsLost(own?: Element | null): boolean {
  const active = document.activeElement;
  return (
    active === null ||
    active === document.body ||
    (own !== null && own !== undefined && active === own) ||
    ((active instanceof HTMLButtonElement || active instanceof HTMLInputElement) && active.disabled)
  );
}
