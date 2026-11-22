import type { components } from "@calls-booking/contract";
import { overlaps } from "./intervals.ts";

export type EventType = components["schemas"]["EventType"];
export type Booking = components["schemas"]["Booking"];

// The only place that knows where data lives. Data is kept in memory and is lost on restart;
// swapping in a file-backed store must touch this module only.
//
// The server runs as a single process, and every method here is synchronous: a check and the
// write that depends on it happen in one step, so simultaneous requests cannot interleave.
export interface Store {
  /** Event types in the order they were created. */
  listEventTypes(): EventType[];
  getEventType(slug: string): EventType | undefined;
  /** Adds the event type unless its slug is already used; check and insert are one step. */
  addEventType(eventType: EventType): "added" | "slug_taken";
  /** Bookings of every event type, in no particular order. */
  listBookings(): Booking[];
  /**
   * Adds the booking unless its time overlaps any existing booking of any event type;
   * check and insert are one step, which is what keeps bookings from overlapping.
   */
  addBookingIfFree(booking: Booking): "added" | "time_conflict";
  /**
   * Deletes the booking unless it has started by `now`; the lookup, the check and the delete are
   * one step, so a booking cannot start or be cancelled twice in between.
   */
  cancelBooking(id: string, now: Date): "cancelled" | "not_found" | "started";
}

export interface StoreContents {
  eventTypes?: EventType[];
  bookings?: Booking[];
}

export function createMemoryStore(initial: StoreContents = {}): Store {
  const eventTypes = [...(initial.eventTypes ?? [])];
  const bookings = [...(initial.bookings ?? [])];

  return {
    listEventTypes: () => eventTypes.map((eventType) => ({ ...eventType })),

    getEventType(slug) {
      const found = eventTypes.find((eventType) => eventType.slug === slug);
      return found && { ...found };
    },

    addEventType(eventType) {
      if (eventTypes.some((existing) => existing.slug === eventType.slug)) {
        return "slug_taken";
      }
      eventTypes.push({ ...eventType });
      return "added";
    },

    listBookings: () => bookings.map((booking) => structuredClone(booking)),

    addBookingIfFree(booking) {
      if (bookings.some((existing) => overlaps(existing, booking))) {
        return "time_conflict";
      }
      bookings.push(structuredClone(booking));
      return "added";
    },

    cancelBooking(id, now) {
      const index = bookings.findIndex((booking) => booking.id === id);
      if (index === -1) {
        return "not_found";
      }
      if (Date.parse(bookings[index]!.startsAt) <= now.getTime()) {
        return "started";
      }
      bookings.splice(index, 1);
      return "cancelled";
    },
  };
}
