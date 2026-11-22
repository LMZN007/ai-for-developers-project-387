import { afterEach, expect, test } from "vitest";
import { createMemoryStore, type Booking, type EventType } from "../src/store.ts";
import { startServer } from "./start-server.ts";

const short: EventType = { slug: "short", title: "Знакомство", durationMinutes: 30 };
const hour: EventType = { slug: "hour", title: "Консультация", durationMinutes: 60 };

// Wednesday, 25 November 2026, 08:00 in Moscow (UTC+3).
const NOW = "2026-11-25T05:00:00Z";
const AT_10_00 = "2026-11-25T07:00:00Z";
const AT_11_00 = "2026-11-25T08:00:00Z";
const AT_12_00 = "2026-11-25T09:00:00Z";

function bookingOf(id: string, type: EventType, startsAt: string): Booking {
  const endsAt = new Date(Date.parse(startsAt) + type.durationMinutes * 60_000)
    .toISOString()
    .replace(".000Z", "Z");
  const { slug, title, durationMinutes } = type;
  return {
    id,
    eventType: { slug, title, durationMinutes },
    startsAt,
    endsAt,
    guestName: `Гость ${id}`,
    guestEmail: `${id}@example.com`,
  };
}

const first = bookingOf("first", hour, AT_10_00);
const second = bookingOf("second", hour, AT_11_00);

let server: Awaited<ReturnType<typeof startServer>> | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function start(now = NOW, bookings: Booking[] = [first, second]) {
  server = await startServer({
    store: createMemoryStore({ eventTypes: [short, hour], bookings }),
    now: () => new Date(now),
  });
  return server;
}

async function cancel(id: string) {
  const response = await fetch(`${server?.baseUrl}/bookings/${id}`, { method: "DELETE" });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

async function slotStarts(slug: string) {
  const { data } = await server!.client.GET("/event-types/{slug}/slots", {
    params: { path: { slug } },
  });
  return (data ?? []).map((slot) => slot.startsAt);
}

const guest = { guestName: "Пётр Сидоров", guestEmail: "petr@example.com" };

// Основной сценарий.
test("DELETE /bookings/{id} отменяет предстоящую запись: 204, её нет в списке, слот снова свободен", async () => {
  await start();
  expect(await slotStarts("hour")).not.toContain(AT_10_00);

  const result = await cancel("first");

  expect(result.status).toBe(204);
  const { data } = await server!.client.GET("/bookings");
  expect(data).toEqual([second]);
  expect(await slotStarts("hour")).toContain(AT_10_00);
});

// Негативные сценарии.
test("DELETE /bookings/{id} с неизвестным id отвечает 404 not_found", async () => {
  await start();
  // Маршрут существует: отмена другой записи проходит. Без этого 404 не отличить от «маршрута нет».
  expect((await cancel("second")).status).toBe(204);

  const result = await cancel("no-such-booking");

  expect(result.status).toBe(404);
  expect(result.body).toMatchObject({ code: "not_found" });
});

test("повторная отмена той же записи отвечает 404 not_found", async () => {
  await start();
  expect((await cancel("first")).status).toBe(204);

  const result = await cancel("first");

  expect(result.status).toBe(404);
  expect(result.body).toMatchObject({ code: "not_found" });
});

test("отмена начавшейся записи отвечает 409 booking_started, запись остаётся", async () => {
  // 10:30: запись 10:00–11:00 уже идёт.
  await start("2026-11-25T07:30:00Z");

  const result = await cancel("first");

  expect(result.status).toBe(409);
  expect(result.body).toMatchObject({ code: "booking_started" });
  const { data } = await server!.client.GET("/bookings");
  expect(data).toContainEqual(first);
});

test("отмена закончившейся записи отвечает 409 booking_started", async () => {
  await start("2026-11-25T10:00:00Z");

  const result = await cancel("first");

  expect(result.status).toBe(409);
  expect(result.body).toMatchObject({ code: "booking_started" });
});

test("запись, которая начинается ровно сейчас, уже считается начавшейся", async () => {
  await start(AT_10_00);

  const result = await cancel("first");

  expect(result.status).toBe(409);
  expect(result.body).toMatchObject({ code: "booking_started" });
});

// Соседний сценарий.
test("после отмены другой гость записывается на освободившееся время, остальные записи не меняются", async () => {
  await start();
  await cancel("first");

  const { data: created, response } = await server!.client.POST("/event-types/{slug}/bookings", {
    params: { path: { slug: "hour" } },
    body: { startsAt: AT_10_00, ...guest },
  });

  expect(response.status).toBe(201);
  const { data } = await server!.client.GET("/bookings");
  expect(data).toEqual([created, second]);
});

test("после отмены время соседней записи остаётся занятым: пересечение с ней даёт time_conflict", async () => {
  await start();
  await cancel("first");

  const { response, error } = await server!.client.POST("/event-types/{slug}/bookings", {
    params: { path: { slug: "short" } },
    body: { startsAt: AT_11_00, ...guest },
  });

  expect(response.status).toBe(409);
  expect(error).toMatchObject({ code: "time_conflict" });
  expect(await slotStarts("hour")).not.toContain(AT_11_00);
  expect(await slotStarts("hour")).toContain(AT_12_00);
});
