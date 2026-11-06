import { afterEach, describe, expect, it } from "vitest";
import { focusIsLost } from "@/modules/todos/flows/focusIsLost";

describe("focusIsLost", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is true when focus is on the page body", () => {
    expect(focusIsLost()).toBe(true);
  });

  it("is true when focus is still on the control you own", () => {
    document.body.innerHTML = "<button>Mine</button>";
    const mine = document.querySelector("button");
    mine?.focus();

    expect(focusIsLost(mine)).toBe(true);
  });

  it("is false when focus is on something else, so it is left alone", () => {
    document.body.innerHTML = "<button>Mine</button><input aria-label='Other' />";
    document.querySelector("input")?.focus();

    expect(focusIsLost(document.querySelector("button"))).toBe(false);
  });

  it("is false when focus is on a control and you pass nothing", () => {
    document.body.innerHTML = "<input aria-label='Other' />";
    document.querySelector("input")?.focus();

    expect(focusIsLost()).toBe(false);
  });
});
