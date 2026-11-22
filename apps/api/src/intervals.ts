/** A time interval `[startsAt, endsAt)`: the end belongs to the next interval, not this one. */
export interface Interval {
  startsAt: string;
  endsAt: string;
}

/**
 * Whether two half-open intervals share any moment. 10:00–11:00 overlaps 10:30–11:00
 * but not 11:00–12:00, so back-to-back bookings are allowed.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return (
    Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt)
  );
}
