// Guests see time in their browser's time zone (spec: no zone switcher).

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Calendar date of an instant in the browser's zone: "2026-11-25". */
export function localDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Wall-clock time of an instant in the browser's zone: "11:30". */
export function localTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** "Среда, 25 ноября" for a date key; the key is already local, so format it as is. */
export function dayTitle(dateKey: string): string {
  const [year = 0, month = 1, day = 1] = dateKey.split("-").map(Number);
  const text = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return capitalize(text);
}

/** A slot or a booking as "Среда, 25 ноября, 11:00–11:30" (with the year when asked) in the browser's zone. */
export function intervalLabel(
  slot: { startsAt: string; endsAt: string },
  withYear = false,
): string {
  const date = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
  })
    .format(new Date(slot.startsAt))
    .replace(/ г\.$/, "");
  return capitalize(`${date}, ${localTime(slot.startsAt)}–${localTime(slot.endsAt)}`);
}

/** Russian weekday names are lowercase; a label starts with a capital letter. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
