import type { components } from "@calls-booking/contract";
import { overlaps, type Interval } from "./intervals.ts";

export type Slot = components["schemas"]["Slot"];

// The owner's availability is fixed by the spec, not configurable.
export const OWNER_TIME_ZONE = "Europe/Moscow";
const WORKING_WEEKDAYS = new Set([1, 2, 3, 4, 5]); // Monday–Friday, as Date#getUTCDay numbers
const WORKDAY_START_MINUTES = 9 * 60;
const WORKDAY_END_MINUTES = 18 * 60;
/** Slots start on a shared grid (:00 and :30) for every event type. */
export const SLOT_STEP_MINUTES = 30;
/** Booking horizon: today and the next 13 calendar days in the owner's time zone. */
export const HORIZON_DAYS = 14;

const MINUTE_MS = 60_000;

interface CalendarDate {
  year: number;
  month: number; // 1–12
  day: number;
}

interface SlotQuery {
  now: Date;
  durationMinutes: number;
  /** Bookings of every event type; slots overlapping them are not free. */
  busy?: Interval[];
}

/**
 * Free slots of an event type: on working days within the booking horizon, fully inside
 * working hours, on the start grid, starting after `now` and not overlapping `busy`;
 * in ascending order.
 */
export function freeSlots({ now, durationMinutes, busy = [] }: SlotQuery): Slot[] {
  return scheduledSlots(now, durationMinutes).filter(
    (slot) => !busy.some((booking) => overlaps(slot, booking)),
  );
}

/**
 * Whether `startsAt` is the start of a slot by the time rules alone (grid, hours, horizon,
 * not started); whether it is still free is the store's decision.
 */
export function isScheduledStart(now: Date, durationMinutes: number, startsAt: Date): boolean {
  const start = formatInstant(startsAt);
  return scheduledSlots(now, durationMinutes).some((slot) => slot.startsAt === start);
}

function scheduledSlots(now: Date, durationMinutes: number): Slot[] {
  const today = calendarDateIn(now, OWNER_TIME_ZONE);
  const slots: Slot[] = [];

  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    const day = addDays(today, offset);
    if (!WORKING_WEEKDAYS.has(weekday(day))) {
      continue;
    }

    for (
      let start = WORKDAY_START_MINUTES;
      start + durationMinutes <= WORKDAY_END_MINUTES;
      start += SLOT_STEP_MINUTES
    ) {
      const startsAt = instantAt(day, start, OWNER_TIME_ZONE);
      if (startsAt.getTime() > now.getTime()) {
        slots.push({
          startsAt: formatInstant(startsAt),
          endsAt: formatInstant(endOf(startsAt, durationMinutes)),
        });
      }
    }
  }

  return slots;
}

/** When a meeting of `durationMinutes` that starts at `startsAt` ends. */
export function endOf(startsAt: Date, durationMinutes: number): Date {
  return new Date(startsAt.getTime() + durationMinutes * MINUTE_MS);
}

/** ISO 8601 in UTC without milliseconds: `2026-11-23T06:00:00Z`. */
export function formatInstant(instant: Date): string {
  return instant.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function calendarDateIn(instant: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

// Calendar arithmetic in UTC, where every day has 24 hours.
function addDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function weekday(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/** The instant when the wall clock in `timeZone` shows `minutes` past midnight of `date`. */
function instantAt(date: CalendarDate, minutes: number, timeZone: string): Date {
  const wallClockAsUtc = Date.UTC(date.year, date.month - 1, date.day, 0, minutes);
  // One correction step is exact for zones without daylight saving time, such as Europe/Moscow.
  const offset = offsetMinutes(new Date(wallClockAsUtc), timeZone);
  return new Date(wallClockAsUtc - offset * MINUTE_MS);
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (Moscow: +180). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  if (!match) {
    return 0; // "GMT" itself
  }
  const [, sign, hours, minutes] = match;
  return (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
}
