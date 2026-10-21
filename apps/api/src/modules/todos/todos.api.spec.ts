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

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(page.getByRole("list")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("internal-db-detail-xyz");
    await expect(page.locator("body")).not.toContainText("SERVICE_UNAVAILABLE");

    await page.unroute(isTodosList);
    await alert.getByRole("button", { name: "Retry" }).click();

    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
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

    await expect(page.getByRole("status")).toContainText("Refreshing");
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("keeps the todos and shows a safe error when a refetch fails", async ({ page, request }) => {
    await createTodo(request, "Buy milk");
    await page.goto(WEB_URL);
    await expect(page.getByRole("listitem")).toHaveCount(1);

    await page.route(isTodosList, (route) =>
      route.fulfill({ status: 503, headers: CORS, json: unavailable }),
    );
    await page.evaluate(triggerRefetch);

    await expect(page.getByRole("alert")).toBeVisible();
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
    await expect(page.getByRole("alert")).toHaveText("Enter a title for your todo.");
    await expect(field).toBeFocused();

    await field.fill("     ");
    await page.getByRole("button", { name: "Add todo" }).click();
    await expect(page.getByRole("alert")).toHaveText("Enter a title for your todo.");

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

    await expect(page.getByRole("alert")).toHaveText(
      "We couldn't add your todo. Please try again.",
    );
    await expect(page.locator("body")).not.toContainText("internal-db-detail-xyz");
    await expect(page.locator("body")).not.toContainText("SERVICE_UNAVAILABLE");
    await expect(field).toHaveValue("Buy milk");
    await expect(field).toBeFocused();

    await page.unroute(isTodosCollection, failPosts);
    await page.getByRole("button", { name: "Add todo" }).click();

    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
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
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
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

    await expect(page.getByRole("status")).toHaveText("Updating…");
    await expect(checkbox).toHaveAttribute("aria-disabled", "true");
    await checkbox.click({ force: true });
    await checkbox.press("Space");

    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("status")).toHaveCount(0);
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

    await expect(page.getByRole("alert")).toHaveText(
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
    await expect(page.getByRole("alert")).toHaveCount(0);
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
    await expect(page.getByRole("alert")).toHaveCount(0);
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
    await expect(page.getByRole("alert")).toHaveCount(0);
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

    await expect(page.getByRole("alert")).toHaveText(
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
    await expect(page.getByRole("alert")).toHaveCount(0);
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

    await expect(page.getByRole("status")).toContainText(/loading todos/i);
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

    await expect(page.getByRole("alert")).toHaveText(
      "Enter a search term, or clear the box to see all todos.",
    );
    await expect(searchBox(page)).toHaveAttribute("aria-invalid", "true");

    await searchBox(page).fill("a".repeat(MAX_LENGTH + 1));
    await searchBox(page).press("Enter");

    await expect(page.getByRole("alert")).toHaveText(
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

    await expect(page.getByRole("status")).toContainText(/loading todos/i);
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

    const alert = page.getByRole("alert");
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
    await expect(page.getByRole("alert")).toHaveCount(0);
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

let closed = false;
test.afterAll(async () => {
  if (closed) return;
  closed = true;
  await db.$client.end();
});
