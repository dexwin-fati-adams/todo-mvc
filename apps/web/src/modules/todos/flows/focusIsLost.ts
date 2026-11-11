//focusIsLost() checks whether the user's keyboard focus is missing,
// on the page body, on a specified element, or on a disabled button or input.
//focusIsLost() checks whether the user has lost the expected place to interact with the page
export function focusIsLost(own?: Element | null): boolean {
  const active = document.activeElement;
  return (
    active === null ||
    active === document.body ||
    (own !== null && own !== undefined && active === own) ||
    ((active instanceof HTMLButtonElement || active instanceof HTMLInputElement) && active.disabled)
  );
}
