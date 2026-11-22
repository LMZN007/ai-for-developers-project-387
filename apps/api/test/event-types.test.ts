import { afterEach, expect, test } from "vitest";
import { createMemoryStore, type EventType } from "../src/store.ts";
import { startServer } from "./start-server.ts";

const intro: EventType = {
  slug: "intro",
  title: "Знакомство",
  description: "Короткий созвон",
  durationMinutes: 15,
};
const consultation: EventType = {
  slug: "consultation",
  title: "Консультация",
  durationMinutes: 30,
};

let server: Awaited<ReturnType<typeof startServer>> | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

test("GET /event-types отдаёт типы встреч в порядке создания", async () => {
  server = await startServer({ store: createMemoryStore({ eventTypes: [intro, consultation] }) });

  const { data, response } = await server.client.GET("/event-types");

  expect(response.status).toBe(200);
  expect(data).toEqual([intro, consultation]);
});

test("GET /event-types с пустым хранилищем отдаёт пустой список", async () => {
  server = await startServer();

  const { data, response } = await server.client.GET("/event-types");

  expect(response.status).toBe(200);
  expect(data).toEqual([]);
});

test("неизвестный адрес отвечает 404 в едином формате ошибки", async () => {
  server = await startServer();

  const response = await fetch(`${server.baseUrl}/no-such-resource`);

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ code: "not_found", message: "Ресурс не найден" });
});

// Sends a raw body, including shapes the typed SDK would not allow.
async function postEventType(body: unknown) {
  const response = await fetch(`${server?.baseUrl}/event-types`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const validNewEventType = {
  slug: "intro-call-30",
  title: "  Знакомство  ",
  description: "Короткий созвон",
  durationMinutes: 45,
};

test("POST /event-types создаёт тип встречи, и он появляется в списке", async () => {
  server = await startServer({ store: createMemoryStore({ eventTypes: [consultation] }) });

  const { data, response } = await server.client.POST("/event-types", {
    body: validNewEventType,
  });

  expect(response.status).toBe(201);
  const created = {
    slug: "intro-call-30",
    title: "Знакомство",
    description: "Короткий созвон",
    durationMinutes: 45,
  };
  expect(data).toEqual(created);
  expect((await server.client.GET("/event-types")).data).toEqual([consultation, created]);
});

test("POST /event-types без описания создаёт тип без описания", async () => {
  server = await startServer();

  const { data } = await server.client.POST("/event-types", {
    body: { slug: "intro", title: "Знакомство", description: "   ", durationMinutes: 15 },
  });

  expect(data).toEqual({ slug: "intro", title: "Знакомство", durationMinutes: 15 });
});

test.each([
  ["slug с заглавными буквами", { slug: "Intro" }, "slug"],
  ["slug с дефисом на краю", { slug: "intro-" }, "slug"],
  ["slug с двойным дефисом", { slug: "intro--call" }, "slug"],
  ["slug длиннее 50 символов", { slug: "a".repeat(51) }, "slug"],
  ["пустой slug", { slug: "" }, "slug"],
  ["название длиннее 100 символов", { title: "Я".repeat(101) }, "title"],
  ["описание длиннее 500 символов", { description: "Я".repeat(501) }, "description"],
  ["длительность меньше 15 минут", { durationMinutes: 10 }, "durationMinutes"],
  ["длительность больше 240 минут", { durationMinutes: 255 }, "durationMinutes"],
  ["длительность не целая", { durationMinutes: 22.5 }, "durationMinutes"],
])("POST /event-types отклоняет %s с ошибкой у поля", async (_case, change, field) => {
  server = await startServer();

  const { status, body } = await postEventType({ ...validNewEventType, ...change });

  expect(status).toBe(400);
  expect(body).toMatchObject({ code: "validation_error", message: expect.any(String) });
  expect(body.fields).toEqual([{ field, message: expect.any(String) }]);
});

test("POST /event-types отклоняет название из одних пробелов", async () => {
  server = await startServer();

  const { status, body } = await postEventType({ ...validNewEventType, title: "   " });

  expect(status).toBe(400);
  expect(body.fields).toEqual([{ field: "title", message: "Обязательное поле" }]);
});

test("POST /event-types отклоняет длительность, не кратную 15 минутам", async () => {
  server = await startServer();

  const { status, body } = await postEventType({ ...validNewEventType, durationMinutes: 20 });

  expect(status).toBe(400);
  expect(body.fields).toEqual([
    { field: "durationMinutes", message: "Длительность должна быть кратна 15 минутам" },
  ]);
  expect((await server.client.GET("/event-types")).data).toEqual([]);
});

test("POST /event-types перечисляет все неверные и пропущенные поля сразу", async () => {
  server = await startServer();

  const { status, body } = await postEventType({ slug: "Bad Slug", durationMinutes: 5 });

  expect(status).toBe(400);
  expect(body.fields).toEqual(
    expect.arrayContaining([
      { field: "title", message: "Обязательное поле" },
      { field: "slug", message: "Недопустимый формат" },
      { field: "durationMinutes", message: "Не меньше 15" },
    ]),
  );
});

test("POST /event-types с занятым slug отвечает 409 slug_taken и не меняет список", async () => {
  server = await startServer({ store: createMemoryStore({ eventTypes: [intro] }) });

  const { status, body } = await postEventType({ ...validNewEventType, slug: "intro" });

  expect(status).toBe(409);
  expect(body).toEqual({ code: "slug_taken", message: "Эта ссылка уже занята" });
  expect((await server.client.GET("/event-types")).data).toEqual([intro]);
});

test.each([
  ["text/plain", "slug=intro"],
  ["application/x-www-form-urlencoded", "slug=intro&title=X&durationMinutes=30"],
])(
  "POST /event-types с телом %s отвечает 400 validation_error, а не 500",
  async (contentType, body) => {
    server = await startServer();

    const response = await fetch(`${server.baseUrl}/event-types`, {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "validation_error",
      message: "Тело запроса должно быть в формате JSON",
    });
    expect((await server.client.GET("/event-types")).data).toEqual([]);
  },
);

test("POST /event-types с битым JSON отвечает 400 validation_error", async () => {
  server = await startServer();

  const response = await fetch(`${server.baseUrl}/event-types`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ не json",
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "validation_error" });
});

test("длина названия считается после обрезки пробелов: 100 символов с пробелами по краям принимаются", async () => {
  server = await startServer();
  const title = "Я".repeat(100);

  const { status, body } = await postEventType({ ...validNewEventType, title: `  ${title}  ` });

  expect(status).toBe(201);
  expect(body.title).toBe(title);
});

test("название длиннее 100 символов после обрезки отклоняется с понятным текстом", async () => {
  server = await startServer();

  const { status, body } = await postEventType({ ...validNewEventType, title: "Я".repeat(101) });

  expect(status).toBe(400);
  expect(body.fields).toEqual([{ field: "title", message: "Не длиннее 100 символов" }]);
});

test("длительность строкой («30») не приводится к числу и отклоняется", async () => {
  server = await startServer();

  const { status, body } = await postEventType({ ...validNewEventType, durationMinutes: "30" });

  expect(status).toBe(400);
  expect(body.fields).toEqual([{ field: "durationMinutes", message: "Некорректное значение" }]);
});
