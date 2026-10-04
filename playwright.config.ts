import { defineConfig } from "@playwright/test";

process.env.DATABASE_URL =
  "postgres://todo_test_user:todo_test_password@localhost:5435/todo_test_db";
process.env.PORT = "4001";
process.env.HOST = "127.0.0.1";
process.env.CORS_ORIGIN = "http://localhost:4000";

export default defineConfig({
  testDir: "./apps/api/src/modules/todos",
  testMatch: "**/*.api.spec.ts",

  /* API tests share one Postgres DB (truncated in beforeEach), so they
   * can't run concurrently with each other — force one worker, one file
   * at a time, no retries masking flaky isolation bugs. */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",

  use: {
    baseURL: "http://localhost:4001",
    trace: "on-first-retry",
  },

  /* A single default project avoids running the same spec file 3x. The API
   * tests use the `request` fixture and the browser tests use the `page`
   * fixture, so both run in this one project. */
  projects: [{ name: "api" }],

  webServer: [
    {
      command: "pnpm --filter api dev",
      url: "http://localhost:4001/todos",
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATABASE_URL: "postgres://todo_test_user:todo_test_password@localhost:5435/todo_test_db",
        PORT: "4001",
        HOST: "127.0.0.1",
        CORS_ORIGIN: "http://localhost:4000",
      },
    },
    {
      command: "pnpm --filter web dev --host 127.0.0.1",
      url: "http://127.0.0.1:4000",
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
