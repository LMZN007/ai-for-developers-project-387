import { afterEach, expect, test } from "vitest";
import { createMemoryStore, type EventType } from "../src/store.ts";
import { startServer } from "./start-server.ts";

const short: EventType = { slug: "short", title: "Знакомство", durationMinutes: 30 };
const hour: EventType = { slug: "hour", title: "Консультация", durationMinutes: 60 };

// Wednesday, 25 November 2026, 08:00 in Moscow (UTC+3). 10:00 MSK is 07:00Z.
const NOW = "2026-11-25T05:00:00Z";
const AT_10_00 = "2026-11-25T07:00:00Z";
const AT_10_30 = "2026-11-25T07:30:00Z";
const AT_11_00 = "2026-11-25T08:00:00Z";

const guest = { guestName: "Иван Петров", guestEmail: "ivan@example.com" };

let server: Awaited<ReturnType<typeof startServer>> | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function start() {
  server = await startServer({
    store: createMemoryStore({ eventTypes: [short, hour] }),
    now: () => new Date(NOW),
  });
  return server;
}

// Sends a raw body, including shapes the typed SDK would not allow.
async function book(slug: string, body: unknown) {
  const response = await fetch(`${server?.baseUrl}/event-types/${slug}/bookings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function slotStarts(slug: string) {
  const { data } = await server!.client.GET("/event-types/{slug}/slots", {
    params: { path: { slug } },
  });
  return (data ?? []).map((slot) => slot.startsAt);
}

test("POST /event-types/{slug}/bookings создаёт запись и считает её конец по длительности типа", async () => {
  const { client } = await start();

  const { data, response } = await client.POST("/event-types/{slug}/bookings", {
    params: { path: { slug: "hour" } },
    body: { startsAt: AT_10_00, ...guest, comment: "  Хочу обсудить проект  " },
  });

  expect(response.status).toBe(201);
  expect(data).toEqual({
    id: expect.any(String),
    eventType: { slug: "hour", title: "Консультация", durationMinutes: 60 },
    startsAt: AT_10_00,
    endsAt: AT_11_00,
    guestName: "Иван Петров",
    guestEmail: "ivan@example.com",
    comment: "Хочу обсудить проект",
  });
});

test("время начала можно передать с любым смещением пояса", async () => {
  await start();

  const { status, body } = await book("short", { startsAt: "2026-11-25T10:00:00+03:00", ...guest });

  expect(status).toBe(201);
  expect(body.startsAt).toBe(AT_10_00);
});

test("занятое время пропадает из слотов всех типов встреч", async () => {
  await start();

  await book("hour", { startsAt: AT_10_00, ...guest }); // 10:00–11:00 по Москве

  const shortStarts = await slotStarts("short");
  expect(shortStarts).not.toContain(AT_10_00);
  expect(shortStarts).not.toContain(AT_10_30);
  expect(shortStarts).toContain(AT_11_00);
  expect(shortStarts).toContain("2026-11-25T06:30:00Z"); // 09:30–10:00 примыкает к записи

  const hourStarts = await slotStarts("hour");
  expect(hourStarts).not.toContain("2026-11-25T06:30:00Z"); // 09:30–10:30 пересекается
  expect(hourStarts).toContain("2026-11-25T06:00:00Z"); // 09:00–10:00 примыкает
});

test("POST /event-types/{slug}/bookings отклоняет пересекающуюся запись другого типа встречи с 409", async () => {
  await start();
  await book("hour", { startsAt: AT_10_00, ...guest }); // 10:00–11:00

  const { status, body } = await book("short", { startsAt: AT_10_30, ...guest }); // 10:30–11:00

  expect(status).toBe(409);
  expect(body).toEqual({
    code: "time_conflict",
    message: "Это время уже заняли. Выберите другое время.",
  });
});

test("запись того же типа на то же время отклоняется с 409", async () => {
  await start();
  await book("short", { startsAt: AT_10_00, ...guest });

  const { status, body } = await book("short", { startsAt: AT_10_00, ...guest });

  expect(status).toBe(409);
  expect(body.code).toBe("time_conflict");
});

test("запись, начинающаяся ровно в конце другой, разрешена (11:00 после 10:00–11:00)", async () => {
  await start();
  await book("hour", { startsAt: AT_10_00, ...guest });

  const { status } = await book("short", { startsAt: AT_11_00, ...guest });

  expect(status).toBe(201);
});

test("из 10 одновременных запросов на одно время успешен ровно один, остальные получают 409", async () => {
  await start();

  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      book(index % 2 === 0 ? "short" : "hour", {
        startsAt: AT_10_00,
        guestName: `Гость ${index}`,
        guestEmail: `guest${index}@example.com`,
      }),
    ),
  );

  const statuses = results.map((result) => result.status).sort();
  expect(statuses).toEqual([201, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
});

test.each([
  ["не на сетке 30 минут", "2026-11-25T07:15:00Z"],
  ["до начала рабочего дня", "2026-11-25T05:30:00Z"], // 08:30 по Москве
  ["после конца рабочего дня", "2026-11-25T15:00:00Z"], // 18:00
  ["в выходной", "2026-11-28T07:00:00Z"], // суббота
  ["за пределами горизонта в 14 дней", "2026-12-09T07:00:00Z"],
  ["в прошлом", "2026-11-24T07:00:00Z"],
  ["в уже начавшийся слот", "2026-11-25T04:30:00Z"], // 07:30 по Москве, раньше now
])("запись %s отклоняется с ошибкой у поля startsAt", async (_case, startsAt) => {
  await start();

  const { status, body } = await book("short", { startsAt, ...guest });

  expect(status).toBe(400);
  expect(body).toMatchObject({ code: "validation_error" });
  expect(body.fields).toEqual([{ field: "startsAt", message: expect.any(String) }]);
});

test("60-минутная запись, которая не помещается в рабочий день, отклоняется", async () => {
  await start();

  const { status, body } = await book("hour", { startsAt: "2026-11-25T14:30:00Z", ...guest }); // 17:30–18:30

  expect(status).toBe(400);
  expect(body.fields).toEqual([{ field: "startsAt", message: expect.any(String) }]);
});

test.each([
  ["некорректный email", { guestEmail: "not-an-email" }, "guestEmail", "Некорректный email"],
  ["пустое имя", { guestName: "" }, "guestName", "Обязательное поле"],
  ["имя из одних пробелов", { guestName: "   " }, "guestName", "Обязательное поле"],
  ["слишком длинный комментарий", { comment: "Я".repeat(1001) }, "comment", expect.any(String)],
  ["некорректное время", { startsAt: "завтра в 10" }, "startsAt", expect.any(String)],
])("запись: %s — ошибка у поля", async (_case, change, field, message) => {
  await start();

  const { status, body } = await book("short", { startsAt: AT_10_00, ...guest, ...change });

  expect(status).toBe(400);
  expect(body.fields).toEqual([{ field, message }]);
});

test("запись без обязательных полей перечисляет их все", async () => {
  await start();

  const { status, body } = await book("short", {});

  expect(status).toBe(400);
  expect(body.fields.map((field: { field: string }) => field.field).sort()).toEqual([
    "guestEmail",
    "guestName",
    "startsAt",
  ]);
});

test("запись на неизвестный тип встречи отвечает 404", async () => {
  await start();

  const { status, body } = await book("missing", { startsAt: AT_10_00, ...guest });

  expect(status).toBe(404);
  expect(body.code).toBe("not_found");
});

test("отклонённая запись не занимает время", async () => {
  await start();

  await book("short", { startsAt: AT_10_00, guestName: "   ", guestEmail: "a@b.c" });

  expect(await slotStarts("short")).toContain(AT_10_00);
});

test("запись с телом не в JSON отвечает 400 validation_error, а не 500", async () => {
  await start();

  const response = await fetch(`${server?.baseUrl}/event-types/short/bookings`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: `startsAt=${AT_10_00}`,
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    code: "validation_error",
    message: "Тело запроса должно быть в формате JSON",
  });
  expect(await slotStarts("short")).toContain(AT_10_00);
});

test("длина имени гостя считается после обрезки пробелов", async () => {
  await start();
  const name = "Я".repeat(100);

  const accepted = await book("short", { ...guest, startsAt: AT_10_00, guestName: ` ${name} ` });
  const rejected = await book("short", { ...guest, startsAt: AT_11_00, guestName: `${name}Я` });

  expect(accepted.status).toBe(201);
  expect(accepted.body.guestName).toBe(name);
  expect(rejected.status).toBe(400);
  expect(rejected.body.fields).toEqual([
    { field: "guestName", message: "Не длиннее 100 символов" },
  ]);
});

test("имя гостя числом не приводится к строке и отклоняется", async () => {
  await start();

  const { status, body } = await book("short", { ...guest, startsAt: AT_10_00, guestName: 42 });

  expect(status).toBe(400);
  expect(body.fields).toEqual([{ field: "guestName", message: "Некорректное значение" }]);
});
