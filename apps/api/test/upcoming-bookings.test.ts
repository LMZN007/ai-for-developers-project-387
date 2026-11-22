import { afterEach, expect, test } from "vitest";
import { createMemoryStore, type Booking } from "../src/store.ts";
import { startServer } from "./start-server.ts";

// Wednesday, 25 November 2026, 10:15 in Moscow (07:15Z).
const NOW = "2026-11-25T07:15:00Z";

function bookingOf(
  id: string,
  type: { slug: string; title: string; durationMinutes: number },
  startsAt: string,
): Booking {
  const endsAt = new Date(Date.parse(startsAt) + type.durationMinutes * 60_000)
    .toISOString()
    .replace(".000Z", "Z");
  return {
    id,
    eventType: type,
    startsAt,
    endsAt,
    guestName: `Гость ${id}`,
    guestEmail: `${id}@example.com`,
  };
}

const short = { slug: "short", title: "Знакомство", durationMinutes: 30 };
const hour = { slug: "hour", title: "Консультация", durationMinutes: 60 };

const ended = bookingOf("ended", short, "2026-11-25T06:00:00Z"); // 09:00–09:30, закончилась
const endsNow = bookingOf("ends-now", short, "2026-11-25T06:45:00Z"); // кончается ровно в 07:15
const ongoing = bookingOf("ongoing", hour, "2026-11-25T07:00:00Z"); // 10:00–11:00, идёт сейчас
const tomorrow = bookingOf("tomorrow", short, "2026-11-26T06:00:00Z");
const later = bookingOf("later", hour, "2026-11-25T12:00:00Z");

let server: Awaited<ReturnType<typeof startServer>> | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

test("GET /bookings отдаёт предстоящие записи всех типов по возрастанию начала", async () => {
  server = await startServer({
    store: createMemoryStore({ bookings: [tomorrow, ended, later, ongoing, endsNow] }),
    now: () => new Date(NOW),
  });

  const { data, response } = await server.client.GET("/bookings");

  expect(response.status).toBe(200);
  expect(data).toEqual([ongoing, later, tomorrow]);
});

test("GET /bookings без записей отдаёт пустой список", async () => {
  server = await startServer({ now: () => new Date(NOW) });

  const { data, response } = await server.client.GET("/bookings");

  expect(response.status).toBe(200);
  expect(data).toEqual([]);
});

test("запись, созданная гостем, появляется в предстоящих", async () => {
  server = await startServer({
    store: createMemoryStore({ eventTypes: [{ ...short }] }),
    now: () => new Date(NOW),
  });

  const { data: created } = await server.client.POST("/event-types/{slug}/bookings", {
    params: { path: { slug: "short" } },
    body: {
      startsAt: "2026-11-25T08:00:00Z",
      guestName: "Иван Петров",
      guestEmail: "ivan@example.com",
      comment: "Обсудим проект",
    },
  });

  const { data } = await server.client.GET("/bookings");
  expect(data).toEqual([created]);
});
