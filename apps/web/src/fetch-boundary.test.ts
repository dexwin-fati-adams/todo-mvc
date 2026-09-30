import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>("./**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("fetch boundary", () => {
  it("finds the source files", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(5);
  });

  it("only todo.api.ts calls fetch", () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !/\.test\.tsx?$/.test(path))
      .filter(([path]) => !path.endsWith("/todo.api.ts"))
      .filter(([, source]) => /\bfetch\s*\(/.test(source))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });
});
