import { afterEach, expect, test } from "vitest";
import { createMemoryStore, type EventType } from "../src/store.ts";
import { startServer } from "./start-server.ts";

const short: EventType = { slug: "short", title: "Знакомство", durationMinutes: 30 };
const hour: EventType = { slug: "hour", title: "Консультация", durationMinutes: 60 };
const long: EventType = { slug: "long", title: "Воркшоп", durationMinutes: 240 };

// Wednesday, 25 November 2026, 08:00 in Moscow (UTC+3): the horizon runs to Tuesday, 8 December.
const WEDNESDAY_8AM_MSK = "2026-11-25T05:00:00Z";

let server: Awaited<ReturnType<typeof startServer>> | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function slotsAt(nowIso: string, slug: string) {
  server = await startServer({
    store: createMemoryStore({ eventTypes: [short, hour, long] }),
    now: () => new Date(nowIso),
  });
  const { data, response } = await server.client.GET("/event-types/{slug}/slots", {
    params: { path: { slug } },
  });
  expect(response.status).toBe(200);
  return data ?? [];
}

/** Moscow wall clock of an instant: "2026-11-25 09:00" and the weekday "Wed". */
function moscow(iso: string) {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", ...options }).format(
      new Date(iso),
    );
  return {
    date: format({ year: "numeric", month: "2-digit", day: "2-digit" }),
    time: format({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    weekday: format({ weekday: "short" }),
  };
}

function datesOf(slots: { startsAt: string }[]) {
  return [...new Set(slots.map((slot) => moscow(slot.startsAt).date))];
}

test("GET /event-types/{slug} отдаёт тип встречи", async () => {
  server = await startServer({ store: createMemoryStore({ eventTypes: [short] }) });

  const { data, response } = await server.client.GET("/event-types/{slug}", {
    params: { path: { slug: "short" } },
  });

  expect(response.status).toBe(200);
  expect(data).toEqual(short);
});

test.each(["/event-types/missing", "/event-types/missing/slots"])(
  "%s для неизвестного slug отвечает 404 в едином формате",
  async (path) => {
    server = await startServer();

    const response = await fetch(`${server.baseUrl}${path}`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: "not_found",
      message: "Такой тип встречи не найден",
    });
  },
);

test("слоты идут по рабочим дням горизонта в 14 дней с сегодняшнего по поясу владельца", async () => {
  const slots = await slotsAt(WEDNESDAY_8AM_MSK, "short");

  expect(datesOf(slots)).toEqual([
    "2026-11-25",
    "2026-11-26",
    "2026-11-27",
    "2026-11-30",
    "2026-12-01",
    "2026-12-02",
    "2026-12-03",
    "2026-12-04",
    "2026-12-07",
    "2026-12-08",
  ]);
  expect(slots.every((slot) => !["Sat", "Sun"].includes(moscow(slot.startsAt).weekday))).toBe(true);
});

test("30-минутные слоты идут с 09:00 до 17:30 по Москве с шагом 30 минут, время в UTC", async () => {
  const slots = await slotsAt(WEDNESDAY_8AM_MSK, "short");
  const firstDay = slots.filter((slot) => moscow(slot.startsAt).date === "2026-11-25");

  expect(firstDay.map((slot) => moscow(slot.startsAt).time)).toEqual([
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "11:30",
    "12:00",
    "12:30",
    "13:00",
    "13:30",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
    "16:30",
    "17:00",
    "17:30",
  ]);
  expect(slots[0]).toEqual({ startsAt: "2026-11-25T06:00:00Z", endsAt: "2026-11-25T06:30:00Z" });
  expect(slots.at(-1)).toEqual({
    startsAt: "2026-12-08T14:30:00Z",
    endsAt: "2026-12-08T15:00:00Z",
  });
  expect(slots).toHaveLength(10 * 18);
});

test("слот целиком лежит в рабочих часах: последний старт 60-минутной встречи — 17:00", async () => {
  const slots = await slotsAt(WEDNESDAY_8AM_MSK, "hour");
  const firstDay = slots.filter((slot) => moscow(slot.startsAt).date === "2026-11-25");

  expect(firstDay).toHaveLength(17);
  expect(firstDay.at(-1)).toEqual({
    startsAt: "2026-11-25T14:00:00Z",
    endsAt: "2026-11-25T15:00:00Z",
  });
});

test("последний старт 4-часовой встречи — 14:00", async () => {
  const slots = await slotsAt(WEDNESDAY_8AM_MSK, "long");
  const firstDay = slots.filter((slot) => moscow(slot.startsAt).date === "2026-11-25");

  expect(firstDay.map((slot) => moscow(slot.startsAt).time).at(-1)).toBe("14:00");
  expect(firstDay).toHaveLength(11);
});

test("слоты, которые уже начались, не предлагаются", async () => {
  const slots = await slotsAt("2026-11-25T07:15:00Z", "short"); // 10:15 по Москве

  expect(slots[0]?.startsAt).toBe("2026-11-25T07:30:00Z"); // 10:30
});

test("слот, начинающийся ровно сейчас, уже не предлагается", async () => {
  const slots = await slotsAt("2026-11-25T07:30:00Z", "short"); // ровно 10:30 по Москве

  expect(slots[0]?.startsAt).toBe("2026-11-25T08:00:00Z"); // 11:00
});

test("после конца рабочего дня в пятницу первый слот — в понедельник в 09:00", async () => {
  const slots = await slotsAt("2026-11-27T16:00:00Z", "short"); // пятница, 19:00 по Москве

  expect(slots[0]?.startsAt).toBe("2026-11-30T06:00:00Z");
});

test("горизонт отсчитывается от даты по Москве, а не по UTC", async () => {
  // 23:30 UTC во вторник — это уже среда, 02:30 по Москве: горизонт начинается со среды.
  const slots = await slotsAt("2026-11-24T23:30:00Z", "short");

  expect(datesOf(slots)[0]).toBe("2026-11-25");
  expect(datesOf(slots).at(-1)).toBe("2026-12-08");
});

test("слоты отсортированы по возрастанию времени начала", async () => {
  const slots = await slotsAt(WEDNESDAY_8AM_MSK, "hour");
  const starts = slots.map((slot) => slot.startsAt);

  expect(starts).toEqual([...starts].sort());
});
