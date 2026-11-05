import { test, expect, type APIRequestContext, type Page, type Route } from "@playwright/test";
import { createDb, type Db } from "@/lib/db.js";
import { config } from "@/lib/config.js";
import { sql } from "drizzle-orm";
import type {
  Todo,
  TodoListResponse,
  ErrorResponse,
  SetAllCompletedResponse,
  DeleteCompletedResponse,
} from "contracts";

const db: Db = createDb(config);

test.describe.configure({ mode: "serial" });

const NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000";

async function clearAllTodos(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE todos RESTART IDENTITY CASCADE`);
}

async function createTodo(request: APIRequestContext, title = "Buy milk"): Promise<Todo> {
  const res = await request.post("/todos", { data: { title } });
  return res.json() as Promise<Todo>;
}

test.beforeEach(async () => {
  await clearAllTodos();
});

test.describe("POST /todos", () => {
  test("creates a todo with a title", async ({ request }) => {
    const res = await request.post("/todos", { data: { title: "Buy milk" } });
    expect(res.status()).toBe(201);

    const body = (await res.json()) as Todo;
    expect(body.title).toBe("Buy milk");
    expect(body.completed).toBe(false);
    expect(body.id).toBeDefined();
  });

  test("rejects a missing title", async ({ request }) => {
    const res = await request.post("/todos", { data: {} });
    expect(res.status()).toBe(400);

    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toContain("title");
  });

  test("rejects an empty title", async ({ request }) => {
    const res = await request.post("/todos", { data: { title: "" } });
    expect(res.status()).toBe(400);
  });
});

test.describe("GET /todos", () => {
  test("returns an empty list with counts at 0", async ({ request }) => {
    const res = await request.get("/todos");
    expect(res.status()).toBe(200);

    const body = (await res.json()) as TodoListResponse;
    expect(body.todos).toEqual([]);
    expect(body.totalItems).toBe(0);
    expect(body.activeCount).toBe(0);
    expect(body.completedCount).toBe(0);
  });

  test("returns created todos", async ({ request }) => {
    await createTodo(request, "Buy milk");
    await createTodo(request, "Walk dog");

    const res = await request.get("/todos");
    const body = (await res.json()) as TodoListResponse;

    expect(body.todos).toHaveLength(2);
    expect(body.totalItems).toBe(2);
    expect(body.activeCount).toBe(2);
    expect(body.completedCount).toBe(0);
  });

  test("filters by status", async ({ request }) => {
    const a = await createTodo(request, "Buy milk");
    await createTodo(request, "Walk dog");
    await request.put(`/todos/${a.id}`, { data: { title: a.title, completed: true } });

    const activeRes = await request.get("/todos?status=active");
    const activeBody = (await activeRes.json()) as TodoListResponse;
    expect(activeBody.todos).toHaveLength(1);
    expect(activeBody.todos[0].title).toBe("Walk dog");

    const completedRes = await request.get("/todos?status=completed");
    const completedBody = (await completedRes.json()) as TodoListResponse;
    expect(completedBody.todos).toHaveLength(1);
    expect(completedBody.todos[0].title).toBe("Buy milk");
  });

  test("filters by search term", async ({ request }) => {
    await createTodo(request, "Buy milk");
    await createTodo(request, "Walk dog");

    const res = await request.get("/todos?search=milk");
    const body = (await res.json()) as TodoListResponse;
    expect(body.todos).toHaveLength(1);
    expect(body.todos[0].title).toBe("Buy milk");
  });

  test("rejects a blank search string", async ({ request }) => {
    // search is trimmed then .min(1) — a whitespace-only value fails validation
    const res = await request.get("/todos?search=%20%20");
    expect(res.status()).toBe(400);
  });

  test("paginates results", async ({ request }) => {
    for (let i = 0; i < 25; i++) {
      await createTodo(request, `Todo ${i}`);
    }

    const res = await request.get("/todos?page=2&pageSize=20");
    const body = (await res.json()) as TodoListResponse;

    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(20);
    expect(body.totalItems).toBe(25);
    expect(body.totalPages).toBe(2);
    expect(body.todos).toHaveLength(5);
  });

  // The browser recovery flow (tests 73 to 88) depends on this: a page past the end is not an
  // error. It is an empty list that still carries the real totals, so the UI can jump to the last page.
  test("returns an empty page with the real totals when the page is past the end", async ({
    request,
  }) => {
    for (let i = 0; i < 25; i++) {
      await createTodo(request, `Todo ${i}`);
    }

    const res = await request.get("/todos?page=9&pageSize=20");
    expect(res.status()).toBe(200);

    const body = (await res.json()) as TodoListResponse;
    expect(body.todos).toEqual([]);
    expect(body.totalItems).toBe(25);
    expect(body.totalPages).toBe(2);
  });

  test("rejects an invalid status value", async ({ request }) => {
    const res = await request.get("/todos?status=bogus");
    expect(res.status()).toBe(400);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  test("rejects unknown query params (strict schema)", async ({ request }) => {
    const res = await request.get("/todos?sortBy=title");
    expect(res.status()).toBe(400);
  });
});

test.describe("GET /todos/:id", () => {
  test("returns a single todo", async ({ request }) => {
    const created = await createTodo(request);

    const res = await request.get(`/todos/${created.id}`);
    expect(res.status()).toBe(200);

    const body = (await res.json()) as Todo;
    expect(body.id).toBe(created.id);
    expect(body.title).toBe("Buy milk");
  });

  test("returns 404 for a nonexistent id", async ({ request }) => {
    const res = await request.get(`/todos/${NONEXISTENT_ID}`);
    expect(res.status()).toBe(404);
  });

  test("returns 400 for a malformed (non-UUID) id", async ({ request }) => {
    const res = await request.get(`/todos/not-a-valid-id`);
    expect(res.status()).toBe(400);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
  });
});

// PATCH /todos (no id) is the bulk endpoint — it sets the completed status
// for every todo at once and reports how many rows it touched. For a single
// todo, use either PATCH /todos/:id (partial update) or PUT /todos/:id
// (full replace) — see the describe blocks for those below.
test.describe("PATCH /todos", () => {
  test("marks every todo as completed and reports how many were updated", async ({ request }) => {
    await createTodo(request, "Buy milk");
    await createTodo(request, "Walk dog");

    const res = await request.patch("/todos", { data: { completed: true } });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as SetAllCompletedResponse;
    expect(body.updatedCount).toBe(2);

    const list = (await (await request.get("/todos")).json()) as TodoListResponse;
    expect(list.todos.every((t) => t.completed)).toBe(true);
  });

  test("marks every todo as active", async ({ request }) => {
    const created = await createTodo(request);
    await request.put(`/todos/${created.id}`, {
      data: { title: created.title, completed: true },
    });

    const res = await request.patch("/todos", { data: { completed: false } });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as SetAllCompletedResponse;
    expect(body.updatedCount).toBe(1);

    const getRes = await request.get(`/todos/${created.id}`);
    expect(((await getRes.json()) as Todo).completed).toBe(false);
  });

  test("reports zero updated when there are no todos", async ({ request }) => {
    const res = await request.patch("/todos", { data: { completed: true } });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as SetAllCompletedResponse;
    expect(body.updatedCount).toBe(0);
  });

  test("rejects an empty body (completed is required)", async ({ request }) => {
    const res = await request.patch("/todos", { data: {} });
    expect(res.status()).toBe(400);

    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  test("rejects extra keys (strict schema)", async ({ request }) => {
    const res = await request.patch("/todos", {
      data: { completed: true, id: NONEXISTENT_ID },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects a non-boolean completed value", async ({ request }) => {
    const res = await request.patch("/todos", { data: { completed: "yes" } });
    expect(res.status()).toBe(400);
  });
});

test.describe("PATCH /todos/:id", () => {
  test("updates only the title when just title is sent", async ({ request }) => {
    const created = await createTodo(request, "Buy milk");

    const res = await request.patch(`/todos/${created.id}`, { data: { title: "Buy eggs" } });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as Todo;
    expect(body.id).toBe(created.id);
    expect(body.title).toBe("Buy eggs");
    expect(body.completed).toBe(false);
  });

  test("updates only completed when just completed is sent", async ({ request }) => {
    const created = await createTodo(request, "Buy milk");

    const res = await request.patch(`/todos/${created.id}`, { data: { completed: true } });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as Todo;
    expect(body.title).toBe("Buy milk");
    expect(body.completed).toBe(true);
  });

  test("updates both title and completed when both are sent", async ({ request }) => {
    const created = await createTodo(request, "Buy milk");

    const res = await request.patch(`/todos/${created.id}`, {
      data: { title: "Buy eggs", completed: true },
    });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as Todo;
    expect(body.title).toBe("Buy eggs");
    expect(body.completed).toBe(true);
  });

  test("persists the update — a follow-up GET reflects it", async ({ request }) => {
    const created = await createTodo(request, "Buy milk");
    await request.patch(`/todos/${created.id}`, { data: { completed: true } });

    const getRes = await request.get(`/todos/${created.id}`);
    expect(((await getRes.json()) as Todo).completed).toBe(true);
  });

  test("rejects an empty body (at least one field required)", async ({ request }) => {
    const created = await createTodo(request);

    const res = await request.patch(`/todos/${created.id}`, { data: {} });
    expect(res.status()).toBe(400);

    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  test("rejects an empty title", async ({ request }) => {
    const created = await createTodo(request);

    const res = await request.patch(`/todos/${created.id}`, { data: { title: "" } });
    expect(res.status()).toBe(400);
  });

  test("rejects extra keys (strict schema)", async ({ request }) => {
    const created = await createTodo(request);

    const res = await request.patch(`/todos/${created.id}`, {
      data: { title: "Buy eggs", archived: true },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 404 for a nonexistent id, and does not create it", async ({ request }) => {
    const res = await request.patch(`/todos/${NONEXISTENT_ID}`, { data: { title: "Ghost" } });
    expect(res.status()).toBe(404);

    const getRes = await request.get(`/todos/${NONEXISTENT_ID}`);
    expect(getRes.status()).toBe(404);
  });

  test("returns 400 for a malformed (non-UUID) id", async ({ request }) => {
    const res = await request.patch(`/todos/not-a-valid-id`, { data: { title: "x" } });
    expect(res.status()).toBe(400);
  });

  test("accepts a partial body that PUT would reject for the same todo", async ({ request }) => {
    const created = await createTodo(request, "Buy milk");

    const patchRes = await request.patch(`/todos/${created.id}`, {
      data: { title: "Only title" },
    });
    expect(patchRes.status()).toBe(200);

    const putRes = await request.put(`/todos/${created.id}`, {
      data: { title: "Only title" },
    });
    expect(putRes.status()).toBe(400);
  });
});

test.describe("PUT /todos/:id", () => {
  test("replaces title and completed", async ({ request }) => {
    const created = await createTodo(request);

    const res = await request.put(`/todos/${created.id}`, {
      data: { title: "Buy oat milk", completed: true },
    });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as Todo;
    expect(body.title).toBe("Buy oat milk");
    expect(body.completed).toBe(true);
  });

  test("rejects a partial body (missing completed)", async ({ request }) => {
    const created = await createTodo(request);

    const res = await request.put(`/todos/${created.id}`, {
      data: { title: "Buy oat milk" },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  test("rejects extra keys like id or createdAt (strict schema)", async ({ request }) => {
    const created = await createTodo(request);

    const res = await request.put(`/todos/${created.id}`, {
      data: {
        title: "Buy oat milk",
        completed: true,
        id: NONEXISTENT_ID,
        createdAt: new Date().toISOString(),
      },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 404 for a nonexistent id", async ({ request }) => {
    const res = await request.put(`/todos/${NONEXISTENT_ID}`, {
      data: { title: "nope", completed: false },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("DELETE /todos?status=completed", () => {
  test("deletes only completed todos and reports the deleted count", async ({ request }) => {
    const milk = await createTodo(request, "Buy milk");
    const dog = await createTodo(request, "Walk dog");
    await request.put(`/todos/${milk.id}`, { data: { title: milk.title, completed: true } });

    const res = await request.delete("/todos?status=completed");
    expect(res.status()).toBe(200);

    const body = (await res.json()) as DeleteCompletedResponse;
    expect(body.deletedCount).toBe(1);

    expect((await request.get(`/todos/${milk.id}`)).status()).toBe(404);
    expect((await request.get(`/todos/${dog.id}`)).status()).toBe(200);
  });

  test("reports deletedCount 0 and deletes nothing when no todos are completed", async ({
    request,
  }) => {
    await createTodo(request, "Buy milk");

    const res = await request.delete("/todos?status=completed");
    expect(res.status()).toBe(200);

    const body = (await res.json()) as DeleteCompletedResponse;
    expect(body.deletedCount).toBe(0);

    const list = (await (await request.get("/todos")).json()) as TodoListResponse;
    expect(list.totalItems).toBe(1);
  });

  test("rejects the request when status is missing", async ({ request }) => {
    const res = await request.delete("/todos");
    expect(res.status()).toBe(400);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  test("rejects a status value other than completed", async ({ request }) => {
    const res = await request.delete("/todos?status=active");
    expect(res.status()).toBe(400);
  });

  test("rejects duplicate status query params", async ({ request }) => {
    const res = await request.delete("/todos?status=completed&status=completed");
    expect(res.status()).toBe(400);
  });

  test("rejects unknown query params (strict schema)", async ({ request }) => {
    const res = await request.delete("/todos?status=completed&page=2");
    expect(res.status()).toBe(400);
  });
});

test.describe("POST /todos/toggle-all", () => {
  test("marks all todos as completed", async ({ request }) => {
    await createTodo(request, "Buy milk");
    await createTodo(request, "Walk dog");

    const res = await request.post("/todos/toggle-all");
    expect(res.status()).toBe(204);

    const list = (await (await request.get("/todos")).json()) as TodoListResponse;
    expect(list.todos.every((t) => t.completed)).toBe(true);
    expect(list.completedCount).toBe(2);
  });

  test("toggling all again un-completes them (if it's a true toggle)", async ({ request }) => {
    await createTodo(request, "Buy milk");
    await request.post("/todos/toggle-all"); // all completed
    await request.post("/todos/toggle-all"); // toggled back?

    const list = (await (await request.get("/todos")).json()) as TodoListResponse;
    // Verify against your actual todo.service.ts implementation —
    // if toggle-all always forces completed:true rather than flipping,
    // this assertion (and test name) needs to change.
    expect(list.activeCount).toBe(1);
  });
});

test.describe("Todo list page (browser)", () => {
  const WEB_URL = "http://localhost:4000";
  const CORS = { "access-control-allow-origin": "*" };
  const isTodosList = (url: URL) => url.port === "4001" && url.pathname === "/todos";
  const unavailable = { error: "SERVICE_UNAVAILABLE", message: "internal-db-detail-xyz" };
  const triggerRefetch = () =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));

  test("shows the todos from the API and marks completed ones", async ({ page, request }) => {
    await createTodo(request, "Buy milk");
    const dog = await createTodo(request, "Walk dog");
    await request.put(`/todos/${dog.id}`, { data: { title: dog.title, completed: true } });

    await page.goto(WEB_URL);

    const items = page.getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(page.getByRole("checkbox", { name: "Buy milk" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Walk dog" })).toBeChecked();
  });

  test("shows the empty message when there are no todos", async ({ page }) => {
    await page.goto(WEB_URL);

    await expect(page.getByText("No todos yet.")).toBeVisible();
    await expect(page.getByRole("list")).toHaveCount(0);
  });

  test("shows a safe error with Retry when the first load fails, then recovers", async ({
    page,
    request,
  }) => {
    await createTodo(request, "Buy milk");
    await page.route(isTodosList, (route) =>
      route.fulfill({ status: 503, headers: CORS, json: unavailable }),
    );

    await page.goto(WEB_URL);

    const alert = page.getByRole("alert").filter({ hasText: /\S/ });
    await expect(alert).toBeVisible();
    await expect(page.getByRole("list")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("internal-db-detail-xyz");
    await expect(page.locator("body")).not.toContainText("SERVICE_UNAVAILABLE");

    await page.unroute(isTodosList);
    await alert.getByRole("button", { name: "Retry" }).click();

    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  });

  test("keeps the todos and shows Refreshing while a refetch is in flight", async ({
    page,
    request,
  }) => {
    await createTodo(request, "Buy milk");
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(1);

    await page.route(isTodosList, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.evaluate(triggerRefetch);

    await expect(page.getByRole("status").filter({ hasText: "Refreshing" })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveCount(0);
  });

  test("keeps the todos and shows a safe error when a refetch fails", async ({ page, request }) => {
    await createTodo(request, "Buy milk");
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(1);

    await page.route(isTodosList, (route) =>
      route.fulfill({ status: 503, headers: CORS, json: unavailable }),
    );
    await page.evaluate(triggerRefetch);

    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText("internal-db-detail-xyz");
  });
});

test.describe("Create todo form (browser)", () => {
  const WEB_URL = "http://localhost:4000";
  const LABEL = "What needs to be done?";
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };
  const isTodosCollection = (url: URL) => url.port === "4001" && url.pathname === "/todos";
  const unavailable = { error: "SERVICE_UNAVAILABLE", message: "internal-db-detail-xyz" };

  test("adds a todo, shows it in the list, clears the field and keeps focus in the field", async ({
    page,
    request,
  }) => {
    await page.goto(WEB_URL);
    await expect(page.getByText("No todos yet.")).toBeVisible();

    const field = page.getByLabel(LABEL);
    await field.fill("Buy milk");
    await page.getByRole("button", { name: "Add todo" }).click();

    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("listitem")).toContainText("Buy milk");
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();

    const list = (await (await request.get("/todos")).json()) as TodoListResponse;
    expect(list.todos.map((t) => t.title)).toEqual(["Buy milk"]);
  });

  test("shows the message and sends no request for an empty or whitespace-only title", async ({
    page,
  }) => {
    const posts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST") posts.push(req.url());
    });
    await page.goto(WEB_URL);

    const field = page.getByLabel(LABEL);
    await page.getByRole("button", { name: "Add todo" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(
      "Enter a title for your todo.",
    );
    await expect(field).toBeFocused();

    await field.fill("     ");
    await page.getByRole("button", { name: "Add todo" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(
      "Enter a title for your todo.",
    );

    expect(posts).toEqual([]);
  });

  test("creates only one todo when the user submits twice", async ({ page, request }) => {
    await page.route(isTodosCollection, async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await route.continue();
    });
    await page.goto(WEB_URL);

    const field = page.getByLabel(LABEL);
    await field.fill("Buy milk");
    await page.getByRole("button", { name: "Add todo" }).click();

    await expect(page.getByRole("button", { name: "Adding…" })).toBeVisible();
    await page.getByRole("button", { name: "Adding…" }).click({ force: true });
    await field.press("Enter");

    await expect(page.getByRole("listitem")).toHaveCount(1);
    const list = (await (await request.get("/todos")).json()) as TodoListResponse;
    expect(list.totalItems).toBe(1);
  });

  test("shows a safe message for a 503, keeps the title, and a retry adds the todo", async ({
    page,
  }) => {
    const failPosts = (route: Route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 503, headers: CORS, json: unavailable })
        : route.continue();
    await page.route(isTodosCollection, failPosts);
    await page.goto(WEB_URL);

    const field = page.getByLabel(LABEL);
    await field.fill("Buy milk");
    await page.getByRole("button", { name: "Add todo" }).click();

    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(
      "We couldn't add your todo. Please try again.",
    );
    await expect(page.locator("body")).not.toContainText("internal-db-detail-xyz");
    await expect(page.locator("body")).not.toContainText("SERVICE_UNAVAILABLE");
    await expect(field).toHaveValue("Buy milk");
    await expect(field).toBeFocused();

    await page.unroute(isTodosCollection, failPosts);
    await page.getByRole("button", { name: "Add todo" }).click();

    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  });
});

test.describe("Toggle todo checkbox (browser)", () => {
  const WEB_URL = "http://localhost:4000";
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };
  const isTodoItem = (url: URL) => url.port === "4001" && /^\/todos\/[^/]+$/.test(url.pathname);
  const unavailable = { error: "SERVICE_UNAVAILABLE", message: "internal-db-detail-xyz" };

  async function getTodo(request: APIRequestContext, id: string): Promise<Todo> {
    return (await (await request.get(`/todos/${id}`)).json()) as Todo;
  }

  test("completes a todo from its checkbox, and the API returns completed: true", async ({
    page,
    request,
  }) => {
    const milk = await createTodo(request, "Buy milk");
    await page.goto(WEB_URL);

    const checkbox = page.getByRole("checkbox", { name: "Buy milk" });
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();

    await expect(checkbox).toBeChecked();
    await expect(page.locator("li span", { hasText: "Buy milk" })).toHaveClass(/line-through/);
    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    expect((await getTodo(request, milk.id)).completed).toBe(true);

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Buy milk" })).toBeChecked();
  });

  test("makes a completed todo active again from its checkbox", async ({ page, request }) => {
    const dog = await createTodo(request, "Walk dog");
    await request.patch(`/todos/${dog.id}`, { data: { completed: true } });
    await page.goto(WEB_URL);

    const checkbox = page.getByRole("checkbox", { name: "Walk dog" });
    await expect(checkbox).toBeChecked();
    await checkbox.click();

    await expect(checkbox).not.toBeChecked();
    await expect(page.locator("li span", { hasText: "Walk dog" })).not.toHaveClass(/line-through/);
    expect((await getTodo(request, dog.id)).completed).toBe(false);
  });

  test("sends only one PATCH request when the user changes a pending row again", async ({
    page,
    request,
  }) => {
    const milk = await createTodo(request, "Buy milk");
    const patches: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "PATCH") patches.push(req.url());
    });
    await page.route(isTodoItem, async (route) => {
      if (route.request().method() === "PATCH") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await route.continue();
    });
    await page.goto(WEB_URL);

    const checkbox = page.getByRole("checkbox", { name: "Buy milk" });
    await checkbox.click();

    await expect(page.getByRole("status").filter({ hasText: "Updating…" })).toHaveText("Updating…");
    await expect(checkbox).toHaveAttribute("aria-disabled", "true");
    await checkbox.click({ force: true });
    await checkbox.press("Space");

    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveCount(0);
    expect(patches).toHaveLength(1);
    expect((await getTodo(request, milk.id)).completed).toBe(true);
  });

  test("keeps the old state and shows a safe message for a 503, and a retry works", async ({
    page,
    request,
  }) => {
    const milk = await createTodo(request, "Buy milk");
    const failPatches = (route: Route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 503, headers: CORS, json: unavailable })
        : route.continue();
    await page.route(isTodoItem, failPatches);
    await page.goto(WEB_URL);

    const checkbox = page.getByRole("checkbox", { name: "Buy milk" });
    await checkbox.click();

    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(
      "Could not update this todo. Please try again.",
    );
    await expect(checkbox).not.toBeChecked();
    await expect(checkbox).toBeFocused();
    await expect(page.locator("body")).not.toContainText("internal-db-detail-xyz");
    await expect(page.locator("body")).not.toContainText("SERVICE_UNAVAILABLE");
    expect((await getTodo(request, milk.id)).completed).toBe(false);

    await page.unroute(isTodoItem, failPatches);
    await checkbox.click();

    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    expect((await getTodo(request, milk.id)).completed).toBe(true);
  });

  test("finds the checkbox by the todo title, and the Space key toggles it", async ({
    page,
    request,
  }) => {
    const milk = await createTodo(request, "Buy milk");
    const dog = await createTodo(request, "Walk dog");
    await page.goto(WEB_URL);

    const checkbox = page.getByRole("checkbox", { name: "Buy milk" });
    await checkbox.focus();
    await page.keyboard.press("Space");

    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeFocused();
    expect((await getTodo(request, milk.id)).completed).toBe(true);
    expect((await getTodo(request, dog.id)).completed).toBe(false);
  });

  test("shows the stale-data message and refreshes the list when the todo was deleted elsewhere", async ({
    page,
    request,
  }) => {
    const milk = await createTodo(request, "Buy milk");
    await page.goto(WEB_URL);
    await expect(page.getByRole("checkbox", { name: "Buy milk" })).toBeVisible();

    await db.execute(sql`DELETE FROM todos WHERE id = ${milk.id}`);
    await page.getByRole("checkbox", { name: "Buy milk" }).click();

    await expect(page.getByText("No todos yet.")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Buy milk" })).toHaveCount(0);
  });
});

test.describe("Delete todo button (browser)", () => {
  const WEB_URL = "http://localhost:4000";
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };
  const isTodoItem = (url: URL) => url.port === "4001" && /^\/todos\/[^/]+$/.test(url.pathname);
  const unavailable = { error: "SERVICE_UNAVAILABLE", message: "internal-db-detail-xyz" };
  const ALREADY_DELETED = "That todo was already deleted. The list has been refreshed.";

  const deleteButton = (page: Page, title: string) =>
    page.getByRole("button", { name: `Delete “${title}”` });

  async function statusOf(request: APIRequestContext, id: string): Promise<number> {
    return (await request.get(`/todos/${id}`)).status();
  }

  test("deletes a todo from its Delete button, and the API no longer has it", async ({
    page,
    request,
  }) => {
    const milk = await createTodo(request, "Buy milk");
    const dog = await createTodo(request, "Walk dog");
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(2);

    await deleteButton(page, "Buy milk").click();

    await expect(page.getByRole("checkbox", { name: "Buy milk" })).toHaveCount(0);
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByText("Deleted “Buy milk”.")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    expect(await statusOf(request, milk.id)).toBe(404);
    expect(await statusOf(request, dog.id)).toBe(200);

    await page.reload();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("checkbox", { name: "Walk dog" })).toBeVisible();
  });

  test("deletes with the keyboard only, and focus moves to the next Delete button", async ({
    page,
    request,
  }) => {
    const first = await createTodo(request, "Buy milk");
    await createTodo(request, "Walk dog");
    await page.goto(WEB_URL);
    const rows = page.getByRole("listitem");
    await expect(rows).toHaveCount(2);

    // Order-agnostic: whichever row is first in the page is deleted, the second row is the neighbour.
    const firstDelete = rows.first().getByRole("button", { name: /^Delete/ });
    const neighbourLabel = await rows
      .nth(1)
      .getByRole("button", { name: /^Delete/ })
      .getAttribute("aria-label");
    expect(neighbourLabel).not.toBeNull();

    await rows.first().getByRole("checkbox").focus();
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press("Tab");
      if (await firstDelete.evaluate((element) => element === document.activeElement)) {
        break;
      }
    }
    await expect(firstDelete).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("button", { name: neighbourLabel ?? "" })).toBeFocused();
    expect([404, 200]).toContain(await statusOf(request, first.id));
  });

  test("sends only one DELETE request when the user clicks again while it is pending", async ({
    page,
    request,
  }) => {
    const milk = await createTodo(request, "Buy milk");
    const deletes: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "DELETE") deletes.push(req.url());
    });
    await page.route(isTodoItem, async (route) => {
      if (route.request().method() === "DELETE") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await route.continue();
    });
    await page.goto(WEB_URL);

    const button = deleteButton(page, "Buy milk");
    await button.click();

    await expect(page.getByRole("status").filter({ hasText: "Deleting…" })).toBeVisible();
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await button.click({ force: true });
    await button.press("Enter");

    await expect(page.getByText("No todos yet.")).toBeVisible();
    expect(deletes).toHaveLength(1);
    expect(await statusOf(request, milk.id)).toBe(404);
  });

  test("shows the notice and removes the row when the todo was deleted elsewhere", async ({
    page,
    request,
  }) => {
    const milk = await createTodo(request, "Buy milk");
    await page.goto(WEB_URL);
    await expect(deleteButton(page, "Buy milk")).toBeVisible();

    const gone = await request.delete(`/todos/${milk.id}`);
    expect(gone.ok()).toBe(true);
    await deleteButton(page, "Buy milk").click();

    await expect(page.getByText(ALREADY_DELETED)).toBeVisible();
    await expect(page.getByText("No todos yet.")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Buy milk" })).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  });

  test("keeps the row and shows a safe message for a 503, and a retry deletes it", async ({
    page,
    request,
  }) => {
    const milk = await createTodo(request, "Buy milk");
    const failDeletes = (route: Route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({ status: 503, headers: CORS, json: unavailable })
        : route.continue();
    await page.route(isTodoItem, failDeletes);
    await page.goto(WEB_URL);

    const button = deleteButton(page, "Buy milk");
    await button.click();

    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(
      "Could not delete this todo. Please try again.",
    );
    await expect(page.getByRole("checkbox", { name: "Buy milk" })).toBeVisible();
    await expect(button).toBeFocused();
    await expect(button).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("body")).not.toContainText("internal-db-detail-xyz");
    await expect(page.locator("body")).not.toContainText("SERVICE_UNAVAILABLE");
    expect(await statusOf(request, milk.id)).toBe(200);

    await page.unroute(isTodoItem, failDeletes);
    await button.click();

    await expect(page.getByText("No todos yet.")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    expect(await statusOf(request, milk.id)).toBe(404);
  });

  test("shows the empty message and moves focus to it after the last todo is deleted", async ({
    page,
    request,
  }) => {
    const milk = await createTodo(request, "Buy milk");
    await page.goto(WEB_URL);

    await deleteButton(page, "Buy milk").click();

    const empty = page.getByText("No todos yet.");
    await expect(empty).toBeVisible();
    await expect(empty).toBeFocused();
    await expect(page.getByText("Deleted “Buy milk”.")).toBeVisible();
    expect(await statusOf(request, milk.id)).toBe(404);
  });

  test("shows a visible focus outline when Tab reaches the Delete button", async ({
    page,
    request,
  }) => {
    await createTodo(request, "Buy milk");
    await page.goto(WEB_URL);

    const button = deleteButton(page, "Buy milk");
    await page.getByRole("checkbox", { name: "Buy milk" }).focus();
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press("Tab");
      if (await button.evaluate((element) => element === document.activeElement)) {
        break;
      }
    }

    await expect(button).toBeFocused();
    // A computed outline-width of 2px means the outline style is not "none", so the ring is really drawn.
    await expect(button).toHaveCSS("outline-width", "2px");
  });
});

// M38 browser tests 34 to 44: the All, Active and Completed filter controls.
// Each test runs against the real API and the real test database.
test.describe("Status filter controls (browser)", () => {
  const WEB_URL = "http://localhost:4000";
  const isTodosList = (url: URL) => url.port === "4001" && url.pathname === "/todos";
  const requestedStatus = (url: string) => new URL(url).searchParams.get("status");

  // Two active todos and one completed todo, so every filter has something different to show.
  async function seedMixed(request: APIRequestContext) {
    const milk = await createTodo(request, "Buy milk");
    const report = await createTodo(request, "Write report");
    const dog = await createTodo(request, "Walk dog");
    await request.patch(`/todos/${dog.id}`, { data: { completed: true } });
    return { milk, report, dog };
  }

  // The filter links live in a labelled nav. The name starts with the label, because a count may follow it, e.g. "Active (2)".
  const filterLink = (page: Page, label: "All" | "Active" | "Completed") =>
    page
      .getByRole("navigation", { name: "Filter todos" })
      .getByRole("link", { name: new RegExp(`^${label}`) });

  const rowCheckbox = (page: Page, title: string) => page.getByRole("checkbox", { name: title });

  // 34
  test("clicking Active requests status=active and shows only the active todos", async ({
    page,
    request,
  }) => {
    await seedMixed(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(3);

    const activeRequest = page.waitForRequest(
      (req) => isTodosList(new URL(req.url())) && requestedStatus(req.url()) === "active",
    );
    await filterLink(page, "Active").click();
    await activeRequest;

    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(rowCheckbox(page, "Buy milk")).toBeVisible();
    await expect(rowCheckbox(page, "Write report")).toBeVisible();
    await expect(rowCheckbox(page, "Walk dog")).toHaveCount(0);
  });

  // 35
  test("clicking Completed and then All shows the correct rows each time", async ({
    page,
    request,
  }) => {
    await seedMixed(request);
    await page.goto(WEB_URL);

    await filterLink(page, "Completed").click();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Walk dog")).toBeChecked();
    await expect(rowCheckbox(page, "Buy milk")).toHaveCount(0);

    await filterLink(page, "All").click();
    await expect(page.getByRole("listitem")).toHaveCount(3);
    await expect(rowCheckbox(page, "Buy milk")).toBeVisible();
    await expect(rowCheckbox(page, "Walk dog")).toBeVisible();
  });

  // 36
  test("marks only the selected link with aria-current and a different computed style", async ({
    page,
    request,
  }) => {
    await seedMixed(request);
    await page.goto(WEB_URL);

    await filterLink(page, "Active").click();

    await expect(filterLink(page, "Active")).toHaveAttribute("aria-current", "page");
    await expect(filterLink(page, "All")).not.toHaveAttribute("aria-current", /.*/);
    await expect(filterLink(page, "Completed")).not.toHaveAttribute("aria-current", /.*/);

    // The style must differ without relying on colour, so the font weight is compared.
    const weightOf = (label: "All" | "Active" | "Completed") =>
      filterLink(page, label).evaluate((element) => getComputedStyle(element).fontWeight);
    const selectedWeight = await weightOf("Active");
    expect(await weightOf("All")).not.toBe(selectedWeight);
    expect(await weightOf("Completed")).not.toBe(selectedWeight);
  });

  // 37
  test("keeps Completed selected and shows only completed todos after a reload", async ({
    page,
    request,
  }) => {
    await seedMixed(request);
    await page.goto(`${WEB_URL}/?status=completed`);

    await expect(filterLink(page, "Completed")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Walk dog")).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/status=completed/);
    await expect(filterLink(page, "Completed")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Buy milk")).toHaveCount(0);
  });

  // 38
  test("the Back button returns to the previous filter and its list", async ({ page, request }) => {
    await seedMixed(request);
    await page.goto(WEB_URL);

    await filterLink(page, "Active").click();
    await expect(page).toHaveURL(/status=active/);
    await filterLink(page, "Completed").click();
    await expect(page).toHaveURL(/status=completed/);

    await page.goBack();

    await expect(page).toHaveURL(/status=active/);
    await expect(filterLink(page, "Active")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(rowCheckbox(page, "Walk dog")).toHaveCount(0);

    await page.goBack();

    await expect(page).not.toHaveURL(/status=/);
    await expect(filterLink(page, "All")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("listitem")).toHaveCount(3);
  });

  // 39
  test("shows All for ?status=bogus, cleans the address, and never sends bogus to the API", async ({
    page,
    request,
  }) => {
    await seedMixed(request);
    const requestedStatuses: (string | null)[] = [];
    page.on("request", (req) => {
      if (isTodosList(new URL(req.url()))) requestedStatuses.push(requestedStatus(req.url()));
    });

    await page.goto(`${WEB_URL}/?status=bogus`);

    await expect(filterLink(page, "All")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("listitem")).toHaveCount(3);
    await expect(page).not.toHaveURL(/status=/);
    expect(requestedStatuses.length).toBeGreaterThan(0);
    expect(requestedStatuses).not.toContain("bogus");
  });

  // 40
  test("hides the previous rows while Completed is held, shows loading, and still lets the user switch", async ({
    page,
    request,
  }) => {
    await seedMixed(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(3);

    // Holds only the Completed list response, so the first load of that filter stays pending.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(isTodosList, async (route) => {
      if (requestedStatus(route.request().url()) === "completed") {
        await held;
      }
      await route.continue();
    });

    await filterLink(page, "Completed").click();

    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toContainText(
      /loading todos/i,
    );
    await expect(page.getByRole("listitem")).toHaveCount(0);
    await expect(rowCheckbox(page, "Buy milk")).toHaveCount(0);
    await expect(rowCheckbox(page, "Walk dog")).toHaveCount(0);
    await expect(filterLink(page, "Completed")).toHaveAttribute("aria-current", "page");

    // The filter control stays usable while the request is pending.
    await filterLink(page, "Active").click();
    await expect(filterLink(page, "Active")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("listitem")).toHaveCount(2);

    release();
  });

  // 41
  test("works with the keyboard only: Tab to Active, press Enter, and focus stays on Active", async ({
    page,
    request,
  }) => {
    await seedMixed(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(3);

    await filterLink(page, "All").focus();
    await page.keyboard.press("Tab");
    await expect(filterLink(page, "Active")).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(rowCheckbox(page, "Walk dog")).toHaveCount(0);
    await expect(filterLink(page, "Active")).toHaveAttribute("aria-current", "page");
    await expect(filterLink(page, "Active")).toBeFocused();
  });

  // 42
  test("shows counts that match the API, and they change after a todo is toggled", async ({
    page,
    request,
  }) => {
    await seedMixed(request);
    const before = (await (await request.get("/todos")).json()) as TodoListResponse;
    expect(before.activeCount).toBe(2);
    expect(before.completedCount).toBe(1);

    await page.goto(WEB_URL);

    await expect(filterLink(page, "All")).toHaveText(
      `All (${before.activeCount + before.completedCount})`,
    );
    await expect(filterLink(page, "Active")).toHaveText(`Active (${before.activeCount})`);
    await expect(filterLink(page, "Completed")).toHaveText(`Completed (${before.completedCount})`);

    // The counts describe all todos, so they stay the same when another filter is selected.
    await filterLink(page, "Completed").click();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(filterLink(page, "Active")).toHaveText(`Active (${before.activeCount})`);

    await filterLink(page, "All").click();
    await rowCheckbox(page, "Buy milk").click();

    await expect(filterLink(page, "Active")).toHaveText(`Active (${before.activeCount - 1})`);
    await expect(filterLink(page, "Completed")).toHaveText(
      `Completed (${before.completedCount + 1})`,
    );
    const after = (await (await request.get("/todos")).json()) as TodoListResponse;
    expect(after.activeCount).toBe(before.activeCount - 1);
    expect(after.completedCount).toBe(before.completedCount + 1);
  });

  // 43
  test("shows No completed todos. when the Completed filter has no todos", async ({
    page,
    request,
  }) => {
    await createTodo(request, "Buy milk");

    await page.goto(`${WEB_URL}/?status=completed`);

    await expect(page.getByText("No completed todos.")).toBeVisible();
    await expect(page.getByText("No todos yet.")).toHaveCount(0);
    await expect(filterLink(page, "Completed")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("list")).toHaveCount(0);
  });

  // 44
  test("shows a visible focus outline when Tab reaches a filter link", async ({
    page,
    request,
  }) => {
    await seedMixed(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(3);

    const link = filterLink(page, "All");
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      if (await link.evaluate((element) => element === document.activeElement)) {
        break;
      }
    }

    await expect(link).toBeFocused();
    // A computed outline-width of 2px means the outline style is not "none", so the ring is really drawn.
    await expect(link).toHaveCSS("outline-width", "2px");
  });
});

// M39 browser tests 57 to 72: the search box, together with the All, Active and Completed filter controls.
// Each test runs against the real API and the real test database.
test.describe("Search todos (browser)", () => {
  const WEB_URL = "http://localhost:4000";
  const CORS = { "access-control-allow-origin": "*" };
  const MAX_LENGTH = 100;
  const isTodosList = (url: URL) => url.port === "4001" && url.pathname === "/todos";
  const requestedSearch = (url: string) => new URL(url).searchParams.get("search");
  const requestedStatus = (url: string) => new URL(url).searchParams.get("status");
  const unavailable = { error: "SERVICE_UNAVAILABLE", message: "internal-db-detail-xyz" };

  async function seedSearchable(request: APIRequestContext) {
    await createTodo(request, "Buy milk");
    await createTodo(request, "Write report");
    const dog = await createTodo(request, "Walk dog");
    const bottles = await createTodo(request, "Return milk bottles");
    await request.patch(`/todos/${dog.id}`, { data: { completed: true } });
    await request.patch(`/todos/${bottles.id}`, { data: { completed: true } });
  }

  const searchBox = (page: Page) => page.getByRole("searchbox", { name: "Search todos" });
  const clearButton = (page: Page) => page.getByRole("button", { name: "Clear search" });
  const rowCheckbox = (page: Page, title: string) => page.getByRole("checkbox", { name: title });

  // The filter links live in a labelled nav. The name starts with the label, because a count may follow it, e.g. "Active (2)".
  const filterLink = (page: Page, label: "All" | "Active" | "Completed") =>
    page
      .getByRole("navigation", { name: "Filter todos" })
      .getByRole("link", { name: new RegExp(`^${label}`) });

  // 57
  test("typing milk sends GET /todos with search=milk and shows only the matching todos", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(4);

    const searchRequest = page.waitForRequest(
      (req) => isTodosList(new URL(req.url())) && requestedSearch(req.url()) === "milk",
    );
    await searchBox(page).fill("milk");
    await searchRequest;

    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(rowCheckbox(page, "Buy milk")).toBeVisible();
    await expect(rowCheckbox(page, "Return milk bottles")).toBeVisible();
    await expect(rowCheckbox(page, "Write report")).toHaveCount(0);
    await expect(page).toHaveURL(/search=milk/);
  });

  // 58
  test("search with Active, and with Completed, shows only that status's matches and sends both params", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);

    await page.goto(`${WEB_URL}/?status=active`);
    await expect(page.getByRole("listitem")).toHaveCount(2);
    const activeRequest = page.waitForRequest((req) => {
      const url = req.url();
      return (
        isTodosList(new URL(url)) &&
        requestedSearch(url) === "milk" &&
        requestedStatus(url) === "active"
      );
    });
    await searchBox(page).fill("milk");
    await activeRequest;
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Buy milk")).toBeVisible();
    await expect(rowCheckbox(page, "Return milk bottles")).toHaveCount(0);

    await page.goto(`${WEB_URL}/?status=completed`);
    await expect(page.getByRole("listitem")).toHaveCount(2);
    const completedRequest = page.waitForRequest((req) => {
      const url = req.url();
      return (
        isTodosList(new URL(url)) &&
        requestedSearch(url) === "milk" &&
        requestedStatus(url) === "completed"
      );
    });
    await searchBox(page).fill("milk");
    await completedRequest;
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Return milk bottles")).toBeVisible();
    await expect(rowCheckbox(page, "Buy milk")).toHaveCount(0);
  });

  // 59
  test("choosing a status keeps the search, and clearing the search keeps the status", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(`${WEB_URL}/?search=milk`);
    await expect(page.getByRole("listitem")).toHaveCount(2);

    await filterLink(page, "Active").click();

    await expect(page).toHaveURL(/status=active/);
    await expect(page).toHaveURL(/search=milk/);
    await expect(searchBox(page)).toHaveValue("milk");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Buy milk")).toBeVisible();

    await clearButton(page).click();

    await expect(page).toHaveURL(/status=active/);
    await expect(page).not.toHaveURL(/search=/);
    await expect(filterLink(page, "Active")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(rowCheckbox(page, "Write report")).toBeVisible();
  });

  // 60
  test("with ?page=2 in the URL, a new search sends no page and the URL drops page", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(`${WEB_URL}/?page=2`);

    const searchRequests: string[] = [];
    page.on("request", (req) => {
      if (isTodosList(new URL(req.url())) && requestedSearch(req.url()) !== null) {
        searchRequests.push(req.url());
      }
    });
    const searchRequest = page.waitForRequest(
      (req) => isTodosList(new URL(req.url())) && requestedSearch(req.url()) === "milk",
    );
    await searchBox(page).fill("milk");
    await searchRequest;

    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(page).toHaveURL(/search=milk/);
    await expect(page).not.toHaveURL(/page=/);
    expect(searchRequests.length).toBeGreaterThan(0);
    for (const url of searchRequests) {
      expect(new URL(url).searchParams.has("page")).toBe(false);
    }
  });

  // 61
  test("a search with no matches shows the empty message, and Clear brings the list back", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(4);

    await searchBox(page).fill("zzz");

    await expect(page.getByText("No todos match “zzz”.")).toBeVisible();
    await expect(page.getByText("No todos yet.")).toHaveCount(0);
    await expect(page.getByRole("list")).toHaveCount(0);

    await clearButton(page).click();

    await expect(page.getByRole("listitem")).toHaveCount(4);
    await expect(page.getByText("No todos match “zzz”.")).toHaveCount(0);
  });

  // 62
  test("spaces only, then Enter, sends no search request and shows the message; a too long value does the same", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(4);
    const searchRequests: string[] = [];
    page.on("request", (req) => {
      if (isTodosList(new URL(req.url())) && requestedSearch(req.url()) !== null) {
        searchRequests.push(req.url());
      }
    });

    await searchBox(page).fill("     ");
    await searchBox(page).press("Enter");

    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(
      "Enter a search term, or clear the box to see all todos.",
    );
    await expect(searchBox(page)).toHaveAttribute("aria-invalid", "true");

    await searchBox(page).fill("a".repeat(MAX_LENGTH + 1));
    await searchBox(page).press("Enter");

    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(
      `Search can be at most ${MAX_LENGTH} characters.`,
    );
    await page.waitForTimeout(600);

    expect(searchRequests).toEqual([]);
    await expect(page).not.toHaveURL(/search=/);
    await expect(page.getByRole("listitem")).toHaveCount(4);
  });

  // 63
  test("Clear removes search from the URL, shows all todos of the status, and sends a request with no search", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(`${WEB_URL}/?search=milk`);
    await expect(page.getByRole("listitem")).toHaveCount(2);

    const clearedRequest = page.waitForRequest(
      (req) => isTodosList(new URL(req.url())) && requestedSearch(req.url()) === null,
    );
    await clearButton(page).click();
    await clearedRequest;

    await expect(page).not.toHaveURL(/search=/);
    await expect(searchBox(page)).toHaveValue("");
    await expect(page.getByRole("listitem")).toHaveCount(4);
    await expect(clearButton(page)).toHaveCount(0);
  });

  // 64
  test("typing milk quickly sends one request with search=milk, and none for m, mi, or mil", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(4);
    const searches: (string | null)[] = [];
    page.on("request", (req) => {
      if (isTodosList(new URL(req.url())) && requestedSearch(req.url()) !== null) {
        searches.push(requestedSearch(req.url()));
      }
    });

    await searchBox(page).pressSequentially("milk", { delay: 50 });

    await expect(page.getByRole("listitem")).toHaveCount(2);
    expect(searches).toEqual(["milk"]);
  });

  // 65
  test("a slow response for an old search never replaces the list for the current search", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(4);

    let releaseOld!: () => void;
    const oldHeld = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    let markOldSent!: () => void;
    const oldSent = new Promise<void>((resolve) => {
      markOldSent = resolve;
    });
    await page.route(isTodosList, async (route) => {
      if (requestedSearch(route.request().url()) === "w") {
        markOldSent();
        await oldHeld;
      }
      await route.continue();
    });

    await searchBox(page).fill("w");
    await oldSent;
    await searchBox(page).fill("wa");

    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Walk dog")).toBeVisible();

    const lateResponse = page.waitForResponse(
      (res) => isTodosList(new URL(res.url())) && requestedSearch(res.url()) === "w",
    );
    releaseOld();
    await lateResponse;

    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Walk dog")).toBeVisible();
    await expect(rowCheckbox(page, "Write report")).toHaveCount(0);
    await expect(searchBox(page)).toHaveValue("wa");
  });

  // 66
  test("with the search response held, the old rows are hidden, loading shows, and the box and status links stay usable", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(4);

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(isTodosList, async (route) => {
      if (requestedSearch(route.request().url()) === "milk") {
        await held;
      }
      await route.continue();
    });

    await searchBox(page).fill("milk");

    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toContainText(
      /loading todos/i,
    );
    await expect(page.getByRole("listitem")).toHaveCount(0);
    await expect(rowCheckbox(page, "Write report")).toHaveCount(0);
    await expect(searchBox(page)).toHaveValue("milk");
    await expect(searchBox(page)).toBeEditable();

    await filterLink(page, "Active").click();
    await expect(filterLink(page, "Active")).toHaveAttribute("aria-current", "page");
    await expect(searchBox(page)).toHaveValue("milk");

    release();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Buy milk")).toBeVisible();
  });

  // 67
  test("a 503 for a search shows the safe message with Retry, keeps the typed text, and Retry shows the rows", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(4);

    const failSearch = (route: Route) =>
      requestedSearch(route.request().url()) === "milk"
        ? route.fulfill({ status: 503, headers: CORS, json: unavailable })
        : route.continue();
    await page.route(isTodosList, failSearch);

    await searchBox(page).fill("milk");

    const alert = page.getByRole("alert").filter({ hasText: /\S/ });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(searchBox(page)).toHaveValue("milk");
    await expect(page.getByRole("listitem")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("internal-db-detail-xyz");
    await expect(page.locator("body")).not.toContainText("SERVICE_UNAVAILABLE");
    await expect(filterLink(page, "All")).toBeVisible();

    await page.unroute(isTodosList, failSearch);
    await alert.getByRole("button", { name: "Retry" }).click();

    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    await expect(searchBox(page)).toHaveValue("milk");
  });

  // 68
  test("reloading with status and search in the URL restores the box, the status, and the rows, and Back returns to the previous state", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(`${WEB_URL}/?status=active&search=milk`);

    await expect(searchBox(page)).toHaveValue("milk");
    await expect(filterLink(page, "Active")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Buy milk")).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/status=active/);
    await expect(page).toHaveURL(/search=milk/);
    await expect(searchBox(page)).toHaveValue("milk");
    await expect(page.getByRole("listitem")).toHaveCount(1);

    await filterLink(page, "Completed").click();
    await expect(page).toHaveURL(/status=completed/);
    await expect(rowCheckbox(page, "Return milk bottles")).toBeVisible();

    await page.goBack();

    await expect(page).toHaveURL(/status=active/);
    await expect(page).toHaveURL(/search=milk/);
    await expect(filterLink(page, "Active")).toHaveAttribute("aria-current", "page");
    await expect(searchBox(page)).toHaveValue("milk");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Buy milk")).toBeVisible();
  });

  // 69
  test("works with the keyboard only: type, Enter, Tab to Clear, Enter, and focus returns to the box", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(4);

    await searchBox(page).focus();
    await page.keyboard.type("milk");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(page).toHaveURL(/search=milk/);

    await page.keyboard.press("Tab");
    await expect(clearButton(page)).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("listitem")).toHaveCount(4);
    await expect(page).not.toHaveURL(/search=/);
    await expect(searchBox(page)).toHaveValue("");
    await expect(searchBox(page)).toBeFocused();
  });

  // 70
  test("with a search active the status controls show no counts, and after Clear they match the API", async ({
    page,
    request,
  }) => {
    await seedSearchable(request);
    const all = (await (await request.get("/todos")).json()) as TodoListResponse;
    await page.goto(`${WEB_URL}/?search=milk`);
    await expect(page.getByRole("listitem")).toHaveCount(2);

    await expect(filterLink(page, "All")).toHaveText("All");
    await expect(filterLink(page, "Active")).toHaveText("Active");
    await expect(filterLink(page, "Completed")).toHaveText("Completed");

    await clearButton(page).click();

    await expect(filterLink(page, "All")).toHaveText(
      `All (${all.activeCount + all.completedCount})`,
    );
    await expect(filterLink(page, "Active")).toHaveText(`Active (${all.activeCount})`);
    await expect(filterLink(page, "Completed")).toHaveText(`Completed (${all.completedCount})`);
  });

  test("records that the server counts describe all todos and ignore the search", async ({
    request,
  }) => {
    await seedSearchable(request);
    const all = (await (await request.get("/todos")).json()) as TodoListResponse;
    const searched = (await (await request.get("/todos?search=milk")).json()) as TodoListResponse;

    expect(searched.todos).toHaveLength(2);
    expect(searched.activeCount).toBe(all.activeCount);
    expect(searched.completedCount).toBe(all.completedCount);
  });

  // 71
  test("the search box and Clear show a visible focus outline", async ({ page, request }) => {
    await seedSearchable(request);
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(4);

    const box = searchBox(page);
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press("Tab");
      if (await box.evaluate((element) => element === document.activeElement)) {
        break;
      }
    }
    await expect(box).toBeFocused();
    // A computed outline-width of 2px means the outline style is not "none", so the ring is really drawn.
    await expect(box).toHaveCSS("outline-width", "2px");

    await page.keyboard.type("milk");
    await page.keyboard.press("Tab");

    await expect(clearButton(page)).toBeFocused();
    await expect(clearButton(page)).toHaveCSS("outline-width", "2px");
  });

  // 72
  test("%, _, &, and # are matched as plain characters, and % alone does not match every todo", async ({
    page,
    request,
  }) => {
    await createTodo(request, "Save 50% now");
    await createTodo(request, "Pay a&b invoice");
    await createTodo(request, "Item #1");
    await createTodo(request, "my_var");
    await createTodo(request, "myXvar");
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(5);

    await searchBox(page).fill("50%");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Save 50% now")).toBeVisible();

    await searchBox(page).fill("a&b");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Pay a&b invoice")).toBeVisible();

    await searchBox(page).fill("#1");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Item #1")).toBeVisible();

    await searchBox(page).fill("%");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "Save 50% now")).toBeVisible();

    await searchBox(page).fill("_");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(rowCheckbox(page, "my_var")).toBeVisible();
    await expect(rowCheckbox(page, "myXvar")).toHaveCount(0);
  });
});

// M40 browser tests 73 to 88: the page bar (Previous, Next, page size) and the recovery from a page past the end.
// Each test runs against the real API and the real test database.
// The default page size is 20, so 45 todos make 3 pages (20 + 20 + 5) and 21 todos make 2 pages (20 + 1).
// The row order is not asserted, only how many rows are on a page and which page the bar says it is.
test.describe("Pagination (browser)", () => {
  const WEB_URL = "http://localhost:4000";
  const CORS = { "access-control-allow-origin": "*" };
  const isTodosList = (url: URL) => url.port === "4001" && url.pathname === "/todos";
  const requestedPage = (url: string) => new URL(url).searchParams.get("page");
  const requestedPageSize = (url: string) => new URL(url).searchParams.get("pageSize");
  const requestedSearch = (url: string) => new URL(url).searchParams.get("search");
  const unavailable = { error: "SERVICE_UNAVAILABLE", message: "internal-db-detail-xyz" };

  async function seedMany(request: APIRequestContext, count: number): Promise<void> {
    for (let i = 1; i <= count; i += 1) {
      await createTodo(request, `Todo ${i}`);
    }
  }

  const pageBar = (page: Page) => page.getByRole("navigation", { name: "Pagination" });
  const previousButton = (page: Page) => page.getByRole("button", { name: "Previous page" });
  const nextButton = (page: Page) => page.getByRole("button", { name: "Next page" });
  const sizeSelect = (page: Page) => page.getByRole("combobox", { name: "Todos per page" });
  const rows = (page: Page) => page.getByRole("listitem");

  // The filter links live in a labelled nav. The name starts with the label, because a count may follow it, e.g. "Active (2)".
  const filterLink = (page: Page, label: "All" | "Active" | "Completed") =>
    page
      .getByRole("navigation", { name: "Filter todos" })
      .getByRole("link", { name: new RegExp(`^${label}`) });

  const searchBox = (page: Page) => page.getByRole("searchbox", { name: "Search todos" });

  // 73
  test("shows page 1 of 3 with 20 rows for 45 todos, Previous disabled and Next enabled", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    await page.goto(WEB_URL);

    await expect(rows(page)).toHaveCount(20);
    await expect(pageBar(page)).toBeVisible();
    await expect(page.getByText("Page 1 of 3")).toBeVisible();
    await expect(previousButton(page)).toBeDisabled();
    await expect(nextButton(page)).toBeEnabled();
    await expect(sizeSelect(page)).toHaveValue("20");
  });

  // 74
  test("Next requests page=2, updates the URL, and the last page shows 5 rows with Next disabled", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(20);

    const pageTwo = page.waitForRequest(
      (req) => isTodosList(new URL(req.url())) && requestedPage(req.url()) === "2",
    );
    await nextButton(page).click();
    await pageTwo;

    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("Page 2 of 3")).toBeVisible();
    await expect(rows(page)).toHaveCount(20);

    await nextButton(page).click();

    await expect(page).toHaveURL(/page=3/);
    await expect(page.getByText("Page 3 of 3")).toBeVisible();
    await expect(rows(page)).toHaveCount(5);
    await expect(nextButton(page)).toBeDisabled();
    await expect(previousButton(page)).toBeEnabled();
  });

  // 75
  test("Previous goes back one page, and page 1 removes page from the URL and the request", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    await page.goto(`${WEB_URL}/?page=3`);
    await expect(page.getByText("Page 3 of 3")).toBeVisible();
    await expect(rows(page)).toHaveCount(5);

    await previousButton(page).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("Page 2 of 3")).toBeVisible();
    await expect(rows(page)).toHaveCount(20);

    const pageOneRequests: string[] = [];
    page.on("request", (req) => {
      if (isTodosList(new URL(req.url())) && requestedPage(req.url()) === null) {
        pageOneRequests.push(req.url());
      }
    });
    await previousButton(page).click();

    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByText("Page 1 of 3")).toBeVisible();
    await expect(rows(page)).toHaveCount(20);
    await expect(previousButton(page)).toBeDisabled();
    // Page 1 is the default, so it is left out of the request, the same way pageSize=20 is.
    expect(pageOneRequests.length).toBeGreaterThan(0);
  });

  // 76
  test("changing the page size from page 3 goes back to page 1, sends pageSize=10, and shows 10 rows", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    await page.goto(`${WEB_URL}/?page=3`);
    await expect(page.getByText("Page 3 of 3")).toBeVisible();

    const sizeRequest = page.waitForRequest(
      (req) =>
        isTodosList(new URL(req.url())) &&
        requestedPageSize(req.url()) === "10" &&
        requestedPage(req.url()) === null,
    );
    await sizeSelect(page).selectOption("10");
    await sizeRequest;

    await expect(page).toHaveURL(/pageSize=10/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(sizeSelect(page)).toHaveValue("10");
    await expect(page.getByText("Page 1 of 5")).toBeVisible();
    await expect(rows(page)).toHaveCount(10);
  });

  // 77
  test("reloading with page and pageSize in the URL restores them, and Back returns to the previous page", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    await page.goto(`${WEB_URL}/?page=2&pageSize=10`);

    await expect(page.getByText("Page 2 of 5")).toBeVisible();
    await expect(sizeSelect(page)).toHaveValue("10");
    await expect(rows(page)).toHaveCount(10);

    await page.reload();

    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(/pageSize=10/);
    await expect(page.getByText("Page 2 of 5")).toBeVisible();
    await expect(sizeSelect(page)).toHaveValue("10");

    await nextButton(page).click();
    await expect(page).toHaveURL(/page=3/);
    await expect(page.getByText("Page 3 of 5")).toBeVisible();

    await page.goBack();

    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(/pageSize=10/);
    await expect(page.getByText("Page 2 of 5")).toBeVisible();
    await expect(rows(page)).toHaveCount(10);
  });

  // 78
  test("choosing a status drops the page and keeps the page size", async ({ page, request }) => {
    await seedMany(request, 45);
    await page.goto(`${WEB_URL}/?page=3&pageSize=10`);
    await expect(page.getByText("Page 3 of 5")).toBeVisible();

    const activeRequest = page.waitForRequest(
      (req) =>
        isTodosList(new URL(req.url())) &&
        new URL(req.url()).searchParams.get("status") === "active" &&
        requestedPageSize(req.url()) === "10" &&
        requestedPage(req.url()) === null,
    );
    await filterLink(page, "Active").click();
    await activeRequest;

    await expect(page).toHaveURL(/status=active/);
    await expect(page).toHaveURL(/pageSize=10/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByText("Page 1 of 5")).toBeVisible();
    await expect(rows(page)).toHaveCount(10);
  });

  // 79
  test("a new search and Clear both drop the page and keep the page size", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    await page.goto(`${WEB_URL}/?page=3&pageSize=10`);
    await expect(page.getByText("Page 3 of 5")).toBeVisible();

    const searchRequest = page.waitForRequest(
      (req) =>
        isTodosList(new URL(req.url())) &&
        requestedSearch(req.url()) === "Todo 1" &&
        requestedPageSize(req.url()) === "10" &&
        requestedPage(req.url()) === null,
    );
    await searchBox(page).fill("Todo 1");
    await searchRequest;

    await expect(page).toHaveURL(/search=Todo(\+|%20)1/);
    await expect(page).toHaveURL(/pageSize=10/);
    await expect(page).not.toHaveURL(/page=/);
    // "Todo 1" matches Todo 1, Todo 10 to 19: 11 todos, which is 2 pages of 10.
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await expect(rows(page)).toHaveCount(10);

    await nextButton(page).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(rows(page)).toHaveCount(1);

    await page.getByRole("button", { name: "Clear search" }).click();

    await expect(page).not.toHaveURL(/search=/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page).toHaveURL(/pageSize=10/);
    await expect(page.getByText("Page 1 of 5")).toBeVisible();
    await expect(rows(page)).toHaveCount(10);
  });

  // 80
  test("a page past the end recovers to the last page, says so, and keeps status, search, and page size", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    const pageNineRequests: string[] = [];
    page.on("request", (req) => {
      if (isTodosList(new URL(req.url())) && requestedPage(req.url()) === "9") {
        pageNineRequests.push(req.url());
      }
    });

    await page.goto(`${WEB_URL}/?page=9`);

    const notice = page.getByRole("status").filter({ hasText: "Page 9 does not exist." });
    await expect(notice).toHaveText("Page 9 does not exist. Showing page 3.");
    await expect(page).toHaveURL(/page=3/);
    await expect(page).not.toHaveURL(/page=9/);
    await expect(page.getByText("Page 3 of 3")).toBeVisible();
    await expect(rows(page)).toHaveCount(5);
    // The recovery runs once: the bad page is asked for once, then the last page is shown, with no loop.
    expect(pageNineRequests).toHaveLength(1);

    // Status, search, and page size survive the recovery.
    await page.goto(`${WEB_URL}/?search=Todo&pageSize=10&page=9`);

    await expect(
      page.getByRole("status").filter({ hasText: "Page 9 does not exist. Showing page 5." }),
    ).toBeVisible();
    await expect(page).toHaveURL(/search=Todo/);
    await expect(page).toHaveURL(/pageSize=10/);
    await expect(page).toHaveURL(/page=5/);
    await expect(rows(page)).toHaveCount(5);
  });

  // 81
  test("recovery uses replaceState, so Back does not return to the page that does not exist", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(20);

    await page.goto(`${WEB_URL}/?page=9`);
    await expect(page.getByText("Page 9 does not exist. Showing page 3.")).toBeVisible();
    await expect(page).toHaveURL(/page=3/);

    await page.goBack();

    await expect(page).not.toHaveURL(/page=9/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByText("Page 1 of 3")).toBeVisible();
    await expect(rows(page)).toHaveCount(20);
  });

  // 82
  test("with no todos, a page past the end resets to page 1, shows the normal empty message, and disables both buttons", async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/?page=4`);

    await expect(page.getByText("Page 4 does not exist. Showing page 1.")).toBeVisible();
    await expect(page.getByText("No todos yet.")).toBeVisible();
    await expect(page).not.toHaveURL(/page=/);
    await expect(previousButton(page)).toBeDisabled();
    await expect(nextButton(page)).toBeDisabled();
    await expect(rows(page)).toHaveCount(0);
  });

  // 83
  test("the recovery message goes away when the user changes the page, the page size, the status, or the search", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    const notice = page.getByText("Page 9 does not exist. Showing page 3.");

    await page.goto(`${WEB_URL}/?page=9`);
    await expect(notice).toBeVisible();
    await previousButton(page).click();
    await expect(notice).toHaveCount(0);

    await page.goto(`${WEB_URL}/?page=9`);
    await expect(notice).toBeVisible();
    await sizeSelect(page).selectOption("10");
    await expect(notice).toHaveCount(0);

    await page.goto(`${WEB_URL}/?page=9`);
    await expect(notice).toBeVisible();
    await filterLink(page, "Active").click();
    await expect(notice).toHaveCount(0);

    await page.goto(`${WEB_URL}/?page=9`);
    await expect(notice).toBeVisible();
    await searchBox(page).fill("Todo");
    await expect(notice).toHaveCount(0);
  });

  // 84
  test("deleting the only row on the last page recovers to the last valid page, and focus is not lost", async ({
    page,
    request,
  }) => {
    await seedMany(request, 21);
    await page.goto(`${WEB_URL}/?page=2`);
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await expect(rows(page)).toHaveCount(1);

    await rows(page)
      .first()
      .getByRole("button", { name: /^Delete/ })
      .click();

    const notice = page.getByText("Page 2 does not exist. Showing page 1.");
    await expect(notice).toBeVisible();
    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByText("Page 1 of 1")).toBeVisible();
    await expect(rows(page)).toHaveCount(20);
    await expect(notice).toBeFocused();

    const list = (await (await request.get("/todos")).json()) as TodoListResponse;
    expect(list.totalItems).toBe(20);
  });

  // 85
  test("invalid page and pageSize values in the URL are never sent to the API, and the URL is cleaned", async ({
    page,
    request,
  }) => {
    await seedMany(request, 25);
    const sent: { page: string | null; pageSize: string | null }[] = [];
    page.on("request", (req) => {
      if (isTodosList(new URL(req.url()))) {
        sent.push({ page: requestedPage(req.url()), pageSize: requestedPageSize(req.url()) });
      }
    });

    await page.goto(`${WEB_URL}/?page=0&pageSize=7`);

    await expect(rows(page)).toHaveCount(20);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await expect(sizeSelect(page)).toHaveValue("20");
    await expect(page).not.toHaveURL(/page=/);
    await expect(page).not.toHaveURL(/pageSize=/);
    expect(sent.length).toBeGreaterThan(0);
    for (const query of sent) {
      expect(query.page).not.toBe("0");
      expect(query.pageSize).not.toBe("7");
    }
  });

  // 86
  test("a 503 on page 2 shows the safe message with Retry, keeps the page bar usable, and Retry shows the rows", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(20);

    const failPageTwo = (route: Route) =>
      requestedPage(route.request().url()) === "2"
        ? route.fulfill({ status: 503, headers: CORS, json: unavailable })
        : route.continue();
    await page.route(isTodosList, failPageTwo);

    await nextButton(page).click();

    const alert = page.getByRole("alert").filter({ hasText: /\S/ });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("internal-db-detail-xyz");
    await expect(page.locator("body")).not.toContainText("SERVICE_UNAVAILABLE");
    await expect(page).toHaveURL(/page=2/);
    await expect(previousButton(page)).toBeEnabled();
    await expect(sizeSelect(page)).toBeEnabled();

    await page.unroute(isTodosList, failPageTwo);
    await alert.getByRole("button", { name: "Retry" }).click();

    await expect(rows(page)).toHaveCount(20);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    await expect(page.getByText("Page 2 of 3")).toBeVisible();
  });

  // 87
  test("while the next page loads the old rows are hidden, loading shows, and Next stays enabled and focused using the last known page count", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(20);

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(isTodosList, async (route) => {
      if (requestedPage(route.request().url()) === "2") {
        await held;
      }
      await route.continue();
    });

    await nextButton(page).click();

    await expect(page.getByRole("status").filter({ hasText: /\S/ })).toContainText(
      /loading todos/i,
    );
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByText("Page 2 of 3")).toBeVisible();
    await expect(nextButton(page)).toBeEnabled();
    await expect(nextButton(page)).toBeFocused();

    release();

    await expect(rows(page)).toHaveCount(20);
    await expect(page.getByText("Page 2 of 3")).toBeVisible();
  });

  // 88
  test("works with the keyboard only, and the page bar controls show a visible focus outline", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(20);

    const next = nextButton(page);
    for (let i = 0; i < 120; i += 1) {
      await page.keyboard.press("Tab");
      if (await next.evaluate((element) => element === document.activeElement)) {
        break;
      }
    }
    await expect(next).toBeFocused();
    // A computed outline-width of 2px means the outline style is not "none", so the ring is really drawn.
    await expect(next).toHaveCSS("outline-width", "2px");

    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("Page 2 of 3")).toBeVisible();
    await expect(rows(page)).toHaveCount(20);
    await expect(next).toBeFocused();

    const select = sizeSelect(page);
    await select.focus();
    await expect(select).toHaveCSS("outline-width", "2px");
  });
});

// M44 browser tests 50 to 62: the toggle-all checkbox, together with the list, the counts and the page bar.
// Each test runs against the real API and the real test database.
// The checkbox always means EVERY todo, so the tests check the whole collection through the API and not only the rows on screen.
// The tests use the checkbox label, its role and the API. They do not depend on the exact wording of the messages.
test.describe("Toggle all todos (browser)", () => {
  const WEB_URL = "http://localhost:4000";
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };
  const isTodosCollection = (url: URL) => url.port === "4001" && url.pathname === "/todos";
  const unavailable = { error: "SERVICE_UNAVAILABLE", message: "internal-db-detail-xyz" };

  // Makes `active` active todos and `completed` completed todos through the real API.
  async function seedMixed(
    request: APIRequestContext,
    active: number,
    completed: number,
  ): Promise<void> {
    for (let i = 1; i <= active; i += 1) {
      await createTodo(request, `Active todo ${i}`);
    }
    for (let i = 1; i <= completed; i += 1) {
      const title = `Done todo ${i}`;
      const created = await createTodo(request, title);
      await request.put(`/todos/${created.id}`, { data: { title, completed: true } });
    }
  }

  // The label names the action and the whole collection's total, never the page size.
  const toggleAll = (page: Page, total: number, state: "complete" | "active") =>
    page.getByRole("checkbox", {
      name: total === 1 ? `Mark the 1 todo as ${state}` : `Mark all ${total} todos as ${state}`,
    });
  const anyToggleAll = (page: Page) =>
    page.getByRole("checkbox", { name: /^Mark (all \d+ todos|the 1 todo) as (complete|active)$/ });
  const rows = (page: Page) => page.getByRole("listitem");
  const filterLink = (page: Page, label: "All" | "Active" | "Completed") =>
    page
      .getByRole("navigation", { name: "Filter todos" })
      .getByRole("link", { name: new RegExp(`^${label}`) });

  async function listOf(request: APIRequestContext, query = ""): Promise<TodoListResponse> {
    return (await (await request.get(`/todos?pageSize=100${query}`)).json()) as TodoListResponse;
  }

  // Presses Tab until the element has focus, the way a keyboard user would.
  async function tabTo(page: Page, target: ReturnType<Page["getByRole"]>): Promise<void> {
    for (let i = 0; i < 120; i += 1) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((element) => element === document.activeElement)) {
        return;
      }
    }
  }

  // 50
  test("the label's total is the whole list for All, Active, Completed and a search", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 25, 20);
    const whole = await listOf(request);
    expect(whole.activeCount + whole.completedCount).toBe(45);

    for (const url of ["/", "/?status=active", "/?status=completed", "/?search=Active"]) {
      await page.goto(`${WEB_URL}${url}`);
      await expect(toggleAll(page, 45, "complete")).toBeVisible();
    }
    // If this fails, the counts follow the search, and that is backend work to record, not to hide in the client.
    const searched = await listOf(request, "&search=Active");
    expect(searched.activeCount + searched.completedCount).toBe(45);
  });

  // 51
  test("with a mix of todos the label offers to mark all complete, and the checkbox is unchecked", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 25, 20);
    await page.goto(WEB_URL);

    await expect(rows(page)).toHaveCount(20);
    await expect(toggleAll(page, 45, "complete")).toBeVisible();
    await expect(toggleAll(page, 45, "complete")).not.toBeChecked();
    await expect(toggleAll(page, 45, "complete")).toBeEnabled();
  });

  // 52
  test("clicking sends exactly one PATCH to /todos with the body {completed: true} and nothing else", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    const patches: { url: string; body: string | null }[] = [];
    page.on("request", (req) => {
      if (req.method() === "PATCH" && isTodosCollection(new URL(req.url()))) {
        patches.push({ url: req.url(), body: req.postData() });
      }
    });
    await page.goto(WEB_URL);

    await toggleAll(page, 5, "complete").click();

    await expect(toggleAll(page, 5, "active")).toBeChecked();
    expect(patches).toHaveLength(1);
    expect(new URL(patches[0]!.url).search).toBe("");
    expect(patches[0]!.body).toBe(JSON.stringify({ completed: true }));
  });

  // 53
  test("from page 2 of a filtered search it completes every todo, including other pages and todos outside the search", async ({
    page,
    request,
  }) => {
    // 24 active "Active todo" + 1 active "Zebra" (does not match the search "todo") + 20 completed = 45 todos.
    for (let i = 1; i <= 24; i += 1) {
      await createTodo(request, `Active todo ${i}`);
    }
    await createTodo(request, "Zebra");
    for (let i = 1; i <= 20; i += 1) {
      const title = `Done todo ${i}`;
      const created = await createTodo(request, title);
      await request.put(`/todos/${created.id}`, { data: { title, completed: true } });
    }
    await page.goto(`${WEB_URL}/?status=active&search=todo&page=2`);
    await expect(toggleAll(page, 45, "complete")).toBeVisible();

    await toggleAll(page, 45, "complete").click();

    await expect.poll(async () => (await listOf(request)).activeCount).toBe(0);
    const all = await listOf(request);
    expect(all.totalItems).toBe(45);
    expect(all.todos.every((todo) => todo.completed)).toBe(true);
    expect(all.todos.some((todo) => todo.title === "Zebra" && todo.completed)).toBe(true);
  });

  // 54
  test("after success the rows, the counts and the label refresh with no reload", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);
    // A marker on the window is lost if the page reloads, so it proves there was no reload.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__noReload = true;
    });

    await toggleAll(page, 5, "complete").click();

    await expect(toggleAll(page, 5, "active")).toBeChecked();
    await expect(filterLink(page, "Active")).toHaveText(/Active\s*\(0\)/);
    await expect(filterLink(page, "Completed")).toHaveText(/Completed\s*\(5\)/);
    for (const title of ["Active todo 1", "Active todo 2", "Active todo 3", "Done todo 1"]) {
      await expect(page.getByRole("checkbox", { name: title })).toBeChecked();
    }
    expect(
      await page.evaluate(() => (window as unknown as Record<string, unknown>).__noReload),
    ).toBe(true);
  });

  // 55
  test("clicking again sends {completed: false} and every todo is active again", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    const bodies: (string | null)[] = [];
    page.on("request", (req) => {
      if (req.method() === "PATCH" && isTodosCollection(new URL(req.url()))) {
        bodies.push(req.postData());
      }
    });
    await page.goto(WEB_URL);
    await toggleAll(page, 5, "complete").click();
    await expect(toggleAll(page, 5, "active")).toBeChecked();

    await toggleAll(page, 5, "active").click();

    await expect(toggleAll(page, 5, "complete")).not.toBeChecked();
    expect(bodies).toEqual([
      JSON.stringify({ completed: true }),
      JSON.stringify({ completed: false }),
    ]);
    const all = await listOf(request);
    expect(all.completedCount).toBe(0);
    expect(all.activeCount).toBe(5);
  });

  // 56
  test("while the request is held the checkbox is disabled, and a second click sends no second request", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    const patches: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "PATCH" && isTodosCollection(new URL(req.url()))) {
        patches.push(req.url());
      }
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(isTodosCollection, async (route) => {
      if (route.request().method() === "PATCH") {
        await held;
      }
      await route.continue();
    });
    await page.goto(WEB_URL);

    const checkbox = toggleAll(page, 5, "complete");
    await checkbox.click();

    await expect(checkbox).toBeDisabled();
    await checkbox.click({ force: true });
    await page.keyboard.press("Space");

    release();

    await expect(toggleAll(page, 5, "active")).toBeEnabled();
    expect(patches).toHaveLength(1);
    expect((await listOf(request)).activeCount).toBe(0);
  });

  // 57
  test("a 503 shows a safe message, leaves the list as it was, and a retry works", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    const failPatches = (route: Route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({ status: 503, headers: CORS, json: unavailable })
        : route.continue();
    await page.route(isTodosCollection, failPatches);
    await page.goto(WEB_URL);

    const checkbox = toggleAll(page, 5, "complete");
    await checkbox.click();

    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toBeVisible();
    await expect(checkbox).toBeEnabled();
    await expect(checkbox).not.toBeChecked();
    await expect(page.locator("body")).not.toContainText("internal-db-detail-xyz");
    await expect(page.locator("body")).not.toContainText("SERVICE_UNAVAILABLE");
    expect((await listOf(request)).activeCount).toBe(3);

    await page.unroute(isTodosCollection, failPatches);
    await checkbox.click();

    await expect(toggleAll(page, 5, "active")).toBeChecked();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    expect((await listOf(request)).activeCount).toBe(0);
  });

  // 58
  test("on page 3 of the Active filter, marking all complete recovers to a valid page and shows the empty message", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 45, 0);
    await page.goto(`${WEB_URL}/?status=active&page=3`);
    await expect(rows(page)).toHaveCount(5);

    await toggleAll(page, 45, "complete").click();

    await expect(page.getByText("No todos yet.")).toBeVisible();
    await expect(page).not.toHaveURL(/page=3/);
    await expect(page).toHaveURL(/status=active/);
    await expect(rows(page)).toHaveCount(0);
  });

  // 59
  test("with no todos there is no toggle-all checkbox on the page", async ({ page }) => {
    await page.goto(WEB_URL);

    await expect(page.getByText("No todos yet.")).toBeVisible();
    await expect(anyToggleAll(page)).toHaveCount(0);
  });

  // 60
  test("keyboard: Space on the checkbox marks everything complete, and focus stays on the checkbox", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);

    await tabTo(page, toggleAll(page, 5, "complete"));
    await expect(toggleAll(page, 5, "complete")).toBeFocused();

    await page.keyboard.press("Space");

    await expect(toggleAll(page, 5, "active")).toBeChecked();
    await expect(toggleAll(page, 5, "active")).toBeFocused();
    expect((await listOf(request)).activeCount).toBe(0);
  });

  // 61
  test("the checkbox shows a visible focus outline and is described by the help text", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);

    const checkbox = toggleAll(page, 5, "complete");
    await tabTo(page, checkbox);
    await expect(checkbox).toBeFocused();
    // A computed outline-width of 2px means the outline style is not "none", so the ring is really drawn.
    await expect(checkbox).toHaveCSS("outline-width", "2px");

    const describedBy = await checkbox.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`[id="${describedBy}"]`)).toContainText(/every todo/i);
  });

  // 62
  test("after success a reload shows the same state from the server", async ({ page, request }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await toggleAll(page, 5, "complete").click();
    await expect(toggleAll(page, 5, "active")).toBeChecked();

    await page.reload();

    await expect(toggleAll(page, 5, "active")).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Active todo 1" })).toBeChecked();
  });
});

// M46 browser tests 55 to 68: the clear-completed button, together with the list, the counts and the page bar.
// Each test runs against the real API and the real test database.
// The button always means EVERY completed todo, so the tests check the whole collection through the API and not only the rows on screen.
// The default page size is 20, so 25 active + 20 completed todos make 45 todos on 3 pages.
test.describe("Clear completed todos (browser)", () => {
  const WEB_URL = "http://localhost:4000";
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };
  const isTodosCollection = (url: URL) => url.port === "4001" && url.pathname === "/todos";
  const unavailable = { error: "SERVICE_UNAVAILABLE", message: "internal-db-detail-xyz" };
  const HELP =
    "This deletes every completed todo, including other pages and filters. It cannot be undone.";
  const FAILED = "Could not clear completed todos. Please try again.";

  // Makes `active` active todos and `completed` completed todos through the real API, plus any extra completed titles.
  async function seedMixed(
    request: APIRequestContext,
    active: number,
    completed: number,
    extraCompleted: string[] = [],
  ): Promise<void> {
    for (let i = 1; i <= active; i += 1) {
      await createTodo(request, `Active todo ${i}`);
    }
    const doneTitles = [
      ...Array.from({ length: completed - extraCompleted.length }, (_, i) => `Done todo ${i + 1}`),
      ...extraCompleted,
    ];
    for (const title of doneTitles) {
      const created = await createTodo(request, title);
      await request.put(`/todos/${created.id}`, { data: { title, completed: true } });
    }
  }

  // The button text is the full-collection label, so the number in it is the number of completed todos in the whole list.
  const clearButton = (page: Page, count: number) =>
    page.getByRole("button", {
      name: count === 1 ? "Clear the 1 completed todo" : `Clear all ${count} completed todos`,
    });
  const anyClearButton = (page: Page) =>
    page.getByRole("button", { name: /^Clear (all \d+ completed todos|the 1 completed todo)$/ });
  const rows = (page: Page) => page.getByRole("listitem");
  const pageBar = (page: Page) => page.getByRole("navigation", { name: "Pagination" });
  const filterLink = (page: Page, label: "All" | "Active" | "Completed") =>
    page
      .getByRole("navigation", { name: "Filter todos" })
      .getByRole("link", { name: new RegExp(`^${label}`) });

  async function completedCountOf(request: APIRequestContext, query = ""): Promise<number> {
    const list = (await (await request.get(`/todos${query}`)).json()) as TodoListResponse;
    return list.completedCount;
  }

  // Presses Tab until the element has focus, the way a keyboard user would.
  async function tabTo(page: Page, target: ReturnType<Page["getByRole"]>): Promise<void> {
    for (let i = 0; i < 120; i += 1) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((element) => element === document.activeElement)) {
        return;
      }
    }
  }

  // 55
  test("shows a full-collection label and the help text for 20 completed todos on 3 pages", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 25, 20);
    await page.goto(WEB_URL);

    await expect(rows(page)).toHaveCount(20);
    await expect(clearButton(page, 20)).toBeVisible();
    await expect(clearButton(page, 20)).toBeEnabled();
    await expect(page.getByText(HELP)).toBeVisible();
  });

  // 56
  test("the number in the label is the completedCount of the whole list for All, Active, Completed and a search", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 25, 20);
    const whole = await completedCountOf(request);
    expect(whole).toBe(20);

    for (const url of ["/", "/?status=active", "/?status=completed", "/?search=Active"]) {
      await page.goto(`${WEB_URL}${url}`);
      await expect(clearButton(page, whole)).toBeVisible();
    }
    // The search says "Active", so only active todos match it. The API still reports every completed todo in the list.
    // If this fails, the counts follow the search, and that is backend work to record, not to hide in the client.
    expect(await completedCountOf(request, "?search=Active")).toBe(whole);
  });

  // 57
  test("there is no button when no todo is completed", async ({ page, request }) => {
    await seedMixed(request, 3, 0);
    await page.goto(WEB_URL);

    await expect(rows(page)).toHaveCount(3);
    await expect(anyClearButton(page)).toHaveCount(0);
  });

  // 58
  test("clicking sends exactly one DELETE to /todos?status=completed, with no body", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 25, 20);
    const deletes: { url: string; body: string | null }[] = [];
    page.on("request", (req) => {
      if (req.method() === "DELETE") deletes.push({ url: req.url(), body: req.postData() });
    });
    await page.goto(WEB_URL);

    await clearButton(page, 20).click();

    await expect(page.getByText("Deleted 20 completed todos.")).toBeVisible();
    expect(deletes).toHaveLength(1);
    const sent = new URL(deletes[0]!.url);
    expect(sent.port).toBe("4001");
    expect(sent.pathname).toBe("/todos");
    expect(sent.search).toBe("?status=completed");
    expect(deletes[0]!.body).toBeNull();
  });

  // 59
  test("from page 2 of a search it deletes every completed todo, including those on other pages and outside the search", async ({
    page,
    request,
  }) => {
    // 25 active + 19 "Done todo" + 1 "Zebra" = 20 completed. "Zebra" does not match the search "todo".
    await seedMixed(request, 25, 20, ["Zebra"]);
    await page.goto(`${WEB_URL}/?search=todo&page=2`);
    await expect(clearButton(page, 20)).toBeVisible();

    await clearButton(page, 20).click();

    await expect(page.getByText("Deleted 20 completed todos.")).toBeVisible();
    const all = (await (await request.get("/todos?pageSize=100")).json()) as TodoListResponse;
    expect(all.totalItems).toBe(25);
    expect(all.completedCount).toBe(0);
    expect(all.todos.every((todo) => !todo.completed)).toBe(true);
    expect(all.todos.some((todo) => todo.title === "Zebra")).toBe(false);
  });

  // 60
  test("after success the rows, the counts and the page bar refresh with no reload, and the button is gone", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 25, 20);
    await page.goto(WEB_URL);
    await expect(page.getByText("Page 1 of 3")).toBeVisible();
    // A marker on the window is lost if the page reloads, so it proves there was no reload.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__noReload = true;
    });

    await clearButton(page, 20).click();

    await expect(page.getByText("Deleted 20 completed todos.")).toBeVisible();
    await expect(anyClearButton(page)).toHaveCount(0);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await expect(rows(page)).toHaveCount(20);
    await expect(filterLink(page, "All")).toContainText("25");
    await expect(filterLink(page, "Completed")).toHaveText(/Completed\s*\(0\)/);
    await expect(pageBar(page)).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as Record<string, unknown>).__noReload),
    ).toBe(true);
  });

  // 61
  test("every active todo is still there afterwards, with the same titles", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);

    await clearButton(page, 2).click();

    await expect(page.getByText("Deleted 2 completed todos.")).toBeVisible();
    await expect(rows(page)).toHaveCount(3);
    for (const title of ["Active todo 1", "Active todo 2", "Active todo 3"]) {
      await expect(page.getByRole("checkbox", { name: title })).toBeVisible();
    }
    await expect(page.getByRole("checkbox", { name: /^Done todo/ })).toHaveCount(0);
  });

  // 62
  test("on page 2 of the Completed filter, clearing recovers to a valid page and shows the normal empty message", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 20, 25);
    await page.goto(`${WEB_URL}/?status=completed&page=2`);
    await expect(rows(page)).toHaveCount(5);

    await clearButton(page, 25).click();

    await expect(page.getByText("No completed todos.")).toBeVisible();
    await expect(page).not.toHaveURL(/page=/);
    await expect(page).toHaveURL(/status=completed/);
    await expect(rows(page)).toHaveCount(0);
  });

  // 63
  test("while the request is held the button is disabled and says it is clearing, and a second click sends no second request", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    const deletes: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "DELETE") deletes.push(req.url());
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(isTodosCollection, async (route) => {
      if (route.request().method() === "DELETE") {
        await held;
      }
      await route.continue();
    });
    await page.goto(WEB_URL);

    const button = clearButton(page, 2);
    await button.click();

    await expect(
      page.getByRole("status").filter({ hasText: "Clearing completed todos…" }),
    ).toBeVisible();
    await expect(button).toBeDisabled();
    await button.click({ force: true });
    await page.keyboard.press("Enter");

    release();

    await expect(page.getByText("Deleted 2 completed todos.")).toBeVisible();
    expect(deletes).toHaveLength(1);
    expect(await completedCountOf(request)).toBe(0);
  });

  // 64
  test("a 503 shows a safe message, keeps the list as it was, and a retry clears the completed todos", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    const failDeletes = (route: Route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({ status: 503, headers: CORS, json: unavailable })
        : route.continue();
    await page.route(isTodosCollection, failDeletes);
    await page.goto(WEB_URL);

    const button = clearButton(page, 2);
    await button.click();

    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(FAILED);
    await expect(rows(page)).toHaveCount(5);
    await expect(button).toBeEnabled();
    await expect(page.locator("body")).not.toContainText("internal-db-detail-xyz");
    await expect(page.locator("body")).not.toContainText("SERVICE_UNAVAILABLE");
    expect(await completedCountOf(request)).toBe(2);

    await page.unroute(isTodosCollection, failDeletes);
    await button.click();

    await expect(page.getByText("Deleted 2 completed todos.")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    expect(await completedCountOf(request)).toBe(0);
  });

  // 65
  test("keyboard: Enter on the button clears, and focus moves to the success message", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);

    const button = clearButton(page, 2);
    await tabTo(page, button);
    await expect(button).toBeFocused();

    await page.keyboard.press("Enter");

    const message = page.getByText("Deleted 2 completed todos.");
    await expect(message).toBeVisible();
    await expect(message).toBeFocused();
    await expect(anyClearButton(page)).toHaveCount(0);
  });

  test("keyboard: after a failed clear, focus goes back to the button", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.route(isTodosCollection, (route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({ status: 503, headers: CORS, json: unavailable })
        : route.continue(),
    );
    await page.goto(WEB_URL);

    const button = clearButton(page, 2);
    await tabTo(page, button);
    await page.keyboard.press("Enter");

    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(FAILED);
    await expect(button).toBeFocused();
  });

  // 66
  test("the button shows a visible focus outline, and its name and description are the full-collection label and help text", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);

    const button = clearButton(page, 2);
    await tabTo(page, button);
    await expect(button).toBeFocused();
    // A computed outline-width of 2px means the outline style is not "none", so the ring is really drawn.
    await expect(button).toHaveCSS("outline-width", "2px");

    const describedBy = await button.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(HELP);
  });

  // 67
  test("if the completed todos were already cleared elsewhere, it says there was nothing to delete and refreshes the list", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);

    const cleared = await request.delete("/todos?status=completed");
    expect(cleared.ok()).toBe(true);
    await clearButton(page, 2).click();

    await expect(page.getByText("There were no completed todos to delete.")).toBeVisible();
    await expect(rows(page)).toHaveCount(3);
    await expect(anyClearButton(page)).toHaveCount(0);
  });

  // 68
  test("after success a reload shows the same state from the server, and with everything completed first, clearing leaves no todos", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await clearButton(page, 2).click();
    await expect(page.getByText("Deleted 2 completed todos.")).toBeVisible();

    await page.reload();

    await expect(rows(page)).toHaveCount(3);
    await expect(anyClearButton(page)).toHaveCount(0);
    await expect(page.getByText("Deleted 2 completed todos.")).toHaveCount(0);

    // Everything completed through the bulk endpoint first, then cleared from the page.
    const marked = await request.patch("/todos", { data: { completed: true } });
    expect(marked.ok()).toBe(true);
    await page.reload();
    await clearButton(page, 3).click();

    await expect(page.getByText("No todos yet.")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^Mark (all|the)/ })).toHaveCount(0);
    await expect(anyClearButton(page)).toHaveCount(0);
    expect(await completedCountOf(request)).toBe(0);
  });
});

// M48 browser tests 84 to 103: selection mode, together with the list, the filters, the search and the page bar.
// Each test runs against the real API and the real test database.
// Selection lives only in the browser, so these tests also record every request to the API to prove that selecting sends none.
test.describe("Selection mode (browser)", () => {
  const WEB_URL = "http://localhost:4000";
  const LIMIT_TEXT = "100 of 100 selected. Limit reached.";
  const SCOPE_NOTICE = "Selection cleared because the status or search changed.";

  // Makes `active` active todos and `completed` completed todos through the real API.
  async function seedMixed(
    request: APIRequestContext,
    active: number,
    completed: number,
  ): Promise<void> {
    for (let i = 1; i <= active; i += 1) {
      await createTodo(request, `Active todo ${i}`);
    }
    for (let i = 1; i <= completed; i += 1) {
      const title = `Done todo ${i}`;
      const created = await createTodo(request, title);
      await request.put(`/todos/${created.id}`, { data: { title, completed: true } });
    }
  }

  async function seedMany(request: APIRequestContext, count: number): Promise<void> {
    for (let i = 1; i <= count; i += 1) {
      await createTodo(request, `Todo ${String(i).padStart(3, "0")}`);
    }
  }

  const entryButton = (page: Page) => page.getByRole("button", { name: "Select todos" });
  const doneButton = (page: Page) => page.getByRole("button", { name: "Done selecting" });
  const clearSelectionButton = (page: Page) =>
    page.getByRole("button", { name: "Clear selection" });
  const selectPageButton = (page: Page) =>
    page.getByRole("button", { name: /^Select (all \d+ todos|the 1 todo) on this page$/ });
  const toolbar = (page: Page) => page.getByRole("group", { name: "Selection mode" });
  const countLine = (page: Page) => page.getByRole("status").filter({ hasText: /of 100 selected/ });
  const selectBox = (page: Page, title: string) =>
    page.getByRole("checkbox", { name: `Select “${title}”`, exact: true });
  const completionBox = (page: Page, title: string) =>
    page.getByRole("checkbox", { name: title, exact: true });
  const anySelectBox = (page: Page) => page.getByRole("checkbox", { name: /^Select “/ });
  const rows = (page: Page) => page.getByRole("listitem");
  const nextButton = (page: Page) => page.getByRole("button", { name: "Next page" });
  const previousButton = (page: Page) => page.getByRole("button", { name: "Previous page" });
  const sizeSelect = (page: Page) => page.getByRole("combobox", { name: "Todos per page" });
  const searchBox = (page: Page) => page.getByRole("searchbox", { name: "Search todos" });
  const filterLink = (page: Page, label: "All" | "Active" | "Completed") =>
    page
      .getByRole("navigation", { name: "Filter todos" })
      .getByRole("link", { name: new RegExp(`^${label}`) });
  const markAllControl = (page: Page) =>
    page.getByRole("checkbox", { name: /^Mark (all \d+ todos|the 1 todo) as/ });
  const clearCompletedButton = (page: Page) =>
    page.getByRole("button", { name: /^Clear (all \d+ completed todos|the 1 completed todo)$/ });

  async function listOf(request: APIRequestContext, query = ""): Promise<TodoListResponse> {
    return (await (await request.get(`/todos?pageSize=100${query}`)).json()) as TodoListResponse;
  }

  // How many selection checkboxes are checked, and how many are enabled, on the page now.
  async function checkedCount(page: Page): Promise<number> {
    return anySelectBox(page).evaluateAll(
      (elements) => elements.filter((element) => (element as HTMLInputElement).checked).length,
    );
  }
  async function enabledCount(page: Page): Promise<number> {
    return anySelectBox(page).evaluateAll(
      (elements) => elements.filter((element) => !(element as HTMLInputElement).disabled).length,
    );
  }

  // Records every request the browser sends to the API (port 4001) from now on.
  function recordApiRequests(page: Page): { method: string; url: string }[] {
    const seen: { method: string; url: string }[] = [];
    page.on("request", (req) => {
      if (new URL(req.url()).port === "4001") {
        seen.push({ method: req.method(), url: req.url() });
      }
    });
    return seen;
  }

  // Presses Tab until the element has focus, the way a keyboard user would.
  async function tabTo(page: Page, target: ReturnType<Page["getByRole"]>): Promise<void> {
    for (let i = 0; i < 150; i += 1) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((element) => element === document.activeElement)) {
        return;
      }
    }
  }

  // 84
  test("is off by default: Select todos is visible, there are no selection checkboxes, and toggle-all shows", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);

    await expect(rows(page)).toHaveCount(5);
    await expect(entryButton(page)).toBeVisible();
    await expect(entryButton(page)).toBeEnabled();
    await expect(anySelectBox(page)).toHaveCount(0);
    await expect(toolbar(page)).toHaveCount(0);
    await expect(markAllControl(page)).toBeVisible();
    await expect(clearCompletedButton(page)).toBeVisible();
  });

  test("shows no Select todos button when there are no todos", async ({ page }) => {
    await page.goto(WEB_URL);

    await expect(page.getByText("No todos yet.")).toBeVisible();
    await expect(entryButton(page)).toHaveCount(0);
  });

  // 85
  test("after entering, the toolbar shows 0 of 100, each row has a selection checkbox, and the batch controls are gone", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);

    await entryButton(page).click();

    await expect(toolbar(page)).toBeVisible();
    await expect(countLine(page)).toHaveText("0 of 100 selected");
    await expect(entryButton(page)).toHaveCount(0);
    await expect(anySelectBox(page)).toHaveCount(5);
    for (const title of ["Active todo 1", "Active todo 2", "Active todo 3", "Done todo 1"]) {
      await expect(selectBox(page, title)).toBeVisible();
      await expect(completionBox(page, title)).toBeVisible();
    }
    await expect(markAllControl(page)).toHaveCount(0);
    await expect(clearCompletedButton(page)).toHaveCount(0);
    await expect(searchBox(page)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Filter todos" })).toBeVisible();
  });

  // 86
  test("entering, selecting, selecting a page, clearing and leaving send no request to the API", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);
    const seen = recordApiRequests(page);

    await entryButton(page).click();
    await selectBox(page, "Active todo 1").check();
    await selectPageButton(page).click();
    await expect(countLine(page)).toHaveText("5 of 100 selected");
    await selectBox(page, "Active todo 1").uncheck();
    await clearSelectionButton(page).click();
    await doneButton(page).click();
    await expect(entryButton(page)).toBeVisible();

    expect(seen).toEqual([]);
  });

  // 87
  test("completion and selection are separate: selecting does not complete, and completing does not select", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);
    const seen = recordApiRequests(page);
    await entryButton(page).click();

    await selectBox(page, "Active todo 1").check();

    await expect(countLine(page)).toHaveText("1 of 100 selected");
    await expect(completionBox(page, "Active todo 1")).not.toBeChecked();
    expect(seen.filter((entry) => entry.method !== "GET")).toEqual([]);
    expect((await listOf(request)).completedCount).toBe(2);

    // click, not check(): the completion box only flips after the server answers, and check() would fail at once.
    await completionBox(page, "Active todo 2").click();

    await expect(completionBox(page, "Active todo 2")).toBeChecked();
    await expect(selectBox(page, "Active todo 2")).not.toBeChecked();
    await expect(countLine(page)).toHaveText("1 of 100 selected");
    await expect(selectBox(page, "Active todo 1")).toBeChecked();
    const patches = seen.filter(
      (entry) => entry.method === "PATCH" && new URL(entry.url).pathname.startsWith("/todos/"),
    );
    expect(patches).toHaveLength(1);
    expect((await listOf(request)).completedCount).toBe(3);
  });

  // 88
  test("Select all on this page selects the 20 rows on screen", async ({ page, request }) => {
    await seedMany(request, 45);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(20);
    await entryButton(page).click();

    await expect(selectPageButton(page)).toHaveText("Select all 20 todos on this page");
    await selectPageButton(page).click();

    await expect(countLine(page)).toHaveText("20 of 100 selected");
    expect(await checkedCount(page)).toBe(20);
    await expect(selectPageButton(page)).toBeDisabled();
  });

  // 89
  test("keeps the selection across pages: select page 1, select two on page 2, and return", async ({
    page,
    request,
  }) => {
    await seedMany(request, 45);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(20);
    await entryButton(page).click();
    await selectPageButton(page).click();
    await expect(countLine(page)).toHaveText("20 of 100 selected");

    await nextButton(page).click();

    await expect(page).toHaveURL(/page=2/);
    await expect(rows(page)).toHaveCount(20);
    await expect(countLine(page)).toHaveText("20 of 100 selected");
    expect(await checkedCount(page)).toBe(0);
    await anySelectBox(page).nth(0).check();
    await anySelectBox(page).nth(1).check();
    await expect(countLine(page)).toHaveText("22 of 100 selected");

    await previousButton(page).click();

    await expect(page).not.toHaveURL(/page=2/);
    await expect(rows(page)).toHaveCount(20);
    await expect(countLine(page)).toHaveText("22 of 100 selected");
    expect(await checkedCount(page)).toBe(20);
  });

  // 90
  test("changing the status clears the selection, keeps the mode on, and shows the notice", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);
    await entryButton(page).click();
    await selectPageButton(page).click();
    await expect(countLine(page)).toHaveText("5 of 100 selected");

    await filterLink(page, "Active").click();

    await expect(page).toHaveURL(/status=active/);
    await expect(rows(page)).toHaveCount(3);
    await expect(countLine(page)).toHaveText(`0 of 100 selected. ${SCOPE_NOTICE}`);
    await expect(toolbar(page)).toBeVisible();
    expect(await checkedCount(page)).toBe(0);
  });

  // 91
  test("committing a search and clearing it both clear the selection", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);
    await entryButton(page).click();
    await selectBox(page, "Active todo 1").check();
    await expect(countLine(page)).toHaveText("1 of 100 selected");

    await searchBox(page).fill("Active");
    await searchBox(page).press("Enter");

    await expect(page).toHaveURL(/search=Active/);
    await expect(countLine(page)).toHaveText(`0 of 100 selected. ${SCOPE_NOTICE}`);

    await selectBox(page, "Active todo 1").check();
    await expect(countLine(page)).toHaveText("1 of 100 selected");

    await page.getByRole("button", { name: "Clear search" }).click();

    await expect(page).not.toHaveURL(/search=/);
    await expect(countLine(page)).toHaveText(`0 of 100 selected. ${SCOPE_NOTICE}`);
    await expect(toolbar(page)).toBeVisible();
  });

  // 92
  test("changing the page size keeps the selection", async ({ page, request }) => {
    await seedMany(request, 45);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(20);
    await entryButton(page).click();
    await anySelectBox(page).nth(0).check();
    await anySelectBox(page).nth(1).check();
    await expect(countLine(page)).toHaveText("2 of 100 selected");

    await sizeSelect(page).selectOption("10");

    await expect(page).toHaveURL(/pageSize=10/);
    await expect(rows(page)).toHaveCount(10);
    await expect(countLine(page)).toHaveText("2 of 100 selected");
    await expect(toolbar(page)).toBeVisible();
  });

  // 93
  test("Clear selection empties the selection, stays in the mode, and puts focus on the count line", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);
    await entryButton(page).click();
    await selectPageButton(page).click();
    await expect(clearSelectionButton(page)).toBeEnabled();

    await clearSelectionButton(page).click();

    await expect(countLine(page)).toHaveText("0 of 100 selected. Selection cleared.");
    expect(await checkedCount(page)).toBe(0);
    await expect(toolbar(page)).toBeVisible();
    await expect(clearSelectionButton(page)).toBeDisabled();
    await expect(countLine(page)).toBeFocused();
  });

  // 94
  test("the limit of 100: a full page stops more, page 2 is disabled, and unselecting one frees a place", async ({
    page,
    request,
  }) => {
    await seedMany(request, 120);
    await page.goto(`${WEB_URL}/?pageSize=100`);
    await expect(rows(page)).toHaveCount(100);
    await entryButton(page).click();

    await selectPageButton(page).click();

    await expect(countLine(page)).toHaveText(LIMIT_TEXT);
    expect(await checkedCount(page)).toBe(100);
    expect(await enabledCount(page)).toBe(100);
    await expect(selectPageButton(page)).toBeDisabled();

    await nextButton(page).click();

    await expect(page).toHaveURL(/page=2/);
    await expect(rows(page)).toHaveCount(20);
    await expect(countLine(page)).toHaveText(LIMIT_TEXT);
    expect(await enabledCount(page)).toBe(0);
    await expect(selectPageButton(page)).toBeDisabled();

    await previousButton(page).click();
    await expect(rows(page)).toHaveCount(100);
    await anySelectBox(page).nth(0).uncheck();
    await expect(countLine(page)).toHaveText("99 of 100 selected");

    await nextButton(page).click();
    await expect(rows(page)).toHaveCount(20);
    expect(await enabledCount(page)).toBe(20);
    await anySelectBox(page).nth(0).check();

    await expect(countLine(page)).toHaveText(LIMIT_TEXT);
    expect(await enabledCount(page)).toBe(1);
  });

  test("Select all near the limit adds what fits and says how many were left out", async ({
    page,
    request,
  }) => {
    await seedMany(request, 120);
    await page.goto(`${WEB_URL}/?pageSize=100`);
    await expect(rows(page)).toHaveCount(100);
    await entryButton(page).click();
    await selectPageButton(page).click();
    for (let i = 0; i < 5; i += 1) {
      await anySelectBox(page).nth(i).uncheck();
    }
    await expect(countLine(page)).toHaveText("95 of 100 selected");
    await nextButton(page).click();
    await expect(rows(page)).toHaveCount(20);

    await selectPageButton(page).click();

    await expect(countLine(page)).toHaveText(
      `${LIMIT_TEXT} You can select up to 100 todos. 15 todos were not selected.`,
    );
    expect(await checkedCount(page)).toBe(5);
  });

  // 95
  test("Done selecting removes the checkboxes, brings the batch controls back, and re-entering starts at 0", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);
    await entryButton(page).click();
    await selectPageButton(page).click();

    await doneButton(page).click();

    await expect(toolbar(page)).toHaveCount(0);
    await expect(anySelectBox(page)).toHaveCount(0);
    await expect(markAllControl(page)).toBeVisible();
    await expect(clearCompletedButton(page)).toBeVisible();
    await expect(entryButton(page)).toBeFocused();

    await entryButton(page).click();

    await expect(countLine(page)).toHaveText("0 of 100 selected");
    expect(await checkedCount(page)).toBe(0);
  });

  // 96
  test("reloading the page leaves selection mode with nothing selected", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);
    await entryButton(page).click();
    await selectPageButton(page).click();
    await expect(countLine(page)).toHaveText("5 of 100 selected");

    await page.reload();

    await expect(rows(page)).toHaveCount(5);
    await expect(toolbar(page)).toHaveCount(0);
    await expect(anySelectBox(page)).toHaveCount(0);
    await expect(entryButton(page)).toBeVisible();
  });

  // 97
  test("keyboard: Enter on Select todos moves focus to the count line, Space selects a row and keeps focus, and Done selecting returns focus", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);

    await tabTo(page, entryButton(page));
    await expect(entryButton(page)).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(toolbar(page)).toBeVisible();
    await expect(countLine(page)).toBeFocused();

    const firstBox = anySelectBox(page).first();
    await tabTo(page, firstBox);
    await expect(firstBox).toBeFocused();
    await page.keyboard.press("Space");

    await expect(countLine(page)).toHaveText("1 of 100 selected");
    await expect(firstBox).toBeChecked();
    await expect(firstBox).toBeFocused();

    await doneButton(page).focus();
    await page.keyboard.press("Enter");

    await expect(toolbar(page)).toHaveCount(0);
    await expect(entryButton(page)).toBeFocused();
  });

  // 98
  test("the entry button, the toolbar buttons and a selection checkbox show a visible focus outline", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);

    // A computed outline-width of 2px means the outline style is not "none", so the ring is really drawn.
    await tabTo(page, entryButton(page));
    await expect(entryButton(page)).toHaveCSS("outline-width", "2px");
    await page.keyboard.press("Enter");
    await expect(toolbar(page)).toBeVisible();

    await tabTo(page, selectPageButton(page));
    await expect(selectPageButton(page)).toHaveCSS("outline-width", "2px");

    await tabTo(page, doneButton(page));
    await expect(doneButton(page)).toHaveCSS("outline-width", "2px");

    const firstBox = anySelectBox(page).first();
    await tabTo(page, firstBox);
    await expect(firstBox).toHaveCSS("outline-width", "2px");
  });

  // 99
  test("names and description: the group is described by the help text, each row has two differently named checkboxes, and the count is a status", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);
    await entryButton(page).click();

    await expect(toolbar(page)).toHaveAccessibleDescription(
      "Selecting a todo does not change whether it is complete.",
    );
    await expect(countLine(page)).toBeVisible();
    for (const title of ["Active todo 1", "Active todo 2", "Active todo 3", "Done todo 1"]) {
      const row = rows(page).filter({ hasText: title });
      await expect(row.getByRole("checkbox")).toHaveCount(2);
      await expect(
        row.getByRole("checkbox", { name: `Select “${title}”`, exact: true }),
      ).toHaveCount(1);
      await expect(row.getByRole("checkbox", { name: title, exact: true })).toHaveCount(1);
    }
  });

  // 100
  test("deleting a selected row lowers the count by one", async ({ page, request }) => {
    await seedMixed(request, 3, 0);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(3);
    await entryButton(page).click();
    await selectPageButton(page).click();
    await expect(countLine(page)).toHaveText("3 of 100 selected");

    await page.getByRole("button", { name: "Delete “Active todo 1”" }).click();

    await expect(rows(page)).toHaveCount(2);
    await expect(countLine(page)).toHaveText("2 of 100 selected");
    await expect(toolbar(page)).toBeVisible();
    expect((await listOf(request)).totalItems).toBe(2);
  });

  // 101
  test("with no matching rows the toolbar stays, Select all is disabled, and Done selecting works", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 0);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(3);
    await entryButton(page).click();
    await selectBox(page, "Active todo 1").check();

    await searchBox(page).fill("zzz-no-match");
    await searchBox(page).press("Enter");

    await expect(rows(page)).toHaveCount(0);
    await expect(toolbar(page)).toBeVisible();
    await expect(countLine(page)).toHaveText(`0 of 100 selected. ${SCOPE_NOTICE}`);
    await expect(selectPageButton(page)).toBeDisabled();
    await expect(clearSelectionButton(page)).toBeDisabled();

    await doneButton(page).click();

    await expect(toolbar(page)).toHaveCount(0);
  });

  // 102
  test("the existing keyboard tests still reach their targets with the new Select todos tab stop", async ({
    page,
    request,
  }) => {
    await seedMixed(request, 3, 2);
    await page.goto(WEB_URL);
    await expect(rows(page)).toHaveCount(5);

    // The new button sits after the filter links and before toggle-all and the list.
    const link = filterLink(page, "Completed");
    await link.focus();
    await page.keyboard.press("Tab");

    await expect(entryButton(page)).toBeFocused();

    await page.keyboard.press("Tab");

    await expect(markAllControl(page)).toBeFocused();
  });
});

let closed = false;
test.afterAll(async () => {
  if (closed) return;
  closed = true;
  await db.$client.end();
});
