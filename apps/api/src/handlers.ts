import { randomUUID } from "node:crypto";
import type { components } from "@calls-booking/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiProblem, validationProblem } from "./errors.ts";
import {
  endOf,
  formatInstant,
  freeSlots,
  HORIZON_DAYS,
  isScheduledStart,
  SLOT_STEP_MINUTES,
  type Slot,
} from "./schedule.ts";
import type { Booking, EventType, Store } from "./store.ts";

type HealthStatus = components["schemas"]["HealthStatus"];
type NewEventType = components["schemas"]["NewEventType"];
type NewBooking = components["schemas"]["NewBooking"];
type FieldError = components["schemas"]["FieldError"];

const DURATION_STEP_MINUTES = 15;
/** Limit for a title or a guest name, counted after trimming spaces at both ends. */
const MAX_NAME_LENGTH = 100;

export interface HandlerDependencies {
  store: Store;
  /** Current moment; tests pass a fixed clock. */
  now: () => Date;
}

// Method names must match operationId values in the OpenAPI contract.
// Request shapes are already checked against the OpenAPI schema; handlers add the remaining rules.
export function createHandlers({ store, now }: HandlerDependencies) {
  const findEventType = (slug: string): EventType => {
    const eventType = store.getEventType(slug);
    if (!eventType) {
      throw new ApiProblem(404, { code: "not_found", message: "Такой тип встречи не найден" });
    }
    return eventType;
  };

  return {
    async Health_check(): Promise<HealthStatus> {
      return { status: "ok" };
    },

    async EventTypes_list(): Promise<EventType[]> {
      return store.listEventTypes();
    },

    async EventTypes_create(
      request: FastifyRequest<{ Body: NewEventType }>,
      reply: FastifyReply,
    ): Promise<EventType> {
      const eventType = validatedEventType(request.body);

      if (store.addEventType(eventType) === "slug_taken") {
        throw new ApiProblem(409, { code: "slug_taken", message: "Эта ссылка уже занята" });
      }

      reply.code(201);
      return eventType;
    },

    async EventTypes_get(
      request: FastifyRequest<{ Params: { slug: string } }>,
    ): Promise<EventType> {
      return findEventType(request.params.slug);
    },

    async EventTypes_listSlots(
      request: FastifyRequest<{ Params: { slug: string } }>,
    ): Promise<Slot[]> {
      const { durationMinutes } = findEventType(request.params.slug);
      return freeSlots({ now: now(), durationMinutes, busy: store.listBookings() });
    },

    async Bookings_list(): Promise<Booking[]> {
      const moment = now().getTime();
      return store
        .listBookings()
        .filter((booking) => Date.parse(booking.endsAt) > moment)
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    },

    // No `await` from here to the store call: the time check and the insert must not interleave
    // with another request (see Store#addBookingIfFree).
    async EventTypes_createBooking(
      request: FastifyRequest<{ Params: { slug: string }; Body: NewBooking }>,
      reply: FastifyReply,
    ): Promise<Booking> {
      const eventType = findEventType(request.params.slug);
      const booking = validatedBooking(eventType, request.body, now());

      if (store.addBookingIfFree(booking) === "time_conflict") {
        throw new ApiProblem(409, {
          code: "time_conflict",
          message: "Это время уже заняли. Выберите другое время.",
        });
      }

      reply.code(201);
      return booking;
    },
  };
}

/** The booking a request asks for, after the time and field rules; throws a 400 problem otherwise. */
function validatedBooking(eventType: EventType, input: NewBooking, now: Date): Booking {
  const { slug, title, durationMinutes } = eventType;
  const startsAt = new Date(input.startsAt);
  const guestName = input.guestName.trim();
  const comment = input.comment?.trim();

  const fields: FieldError[] = [];
  if (!isScheduledStart(now, durationMinutes, startsAt)) {
    fields.push({
      field: "startsAt",
      message: `Это время недоступно: запись возможна в рабочие часы на ближайшие ${HORIZON_DAYS} дней с шагом ${SLOT_STEP_MINUTES} минут`,
    });
  }
  const guestNameError = requiredTextError(guestName);
  if (guestNameError) {
    fields.push({ field: "guestName", message: guestNameError });
  }
  if (fields.length > 0) {
    throw validationProblem(fields);
  }

  return {
    id: randomUUID(),
    eventType: { slug, title, durationMinutes },
    startsAt: formatInstant(startsAt),
    endsAt: formatInstant(endOf(startsAt, durationMinutes)),
    guestName,
    guestEmail: input.guestEmail,
    ...(comment ? { comment } : {}),
  };
}

/** The event type a request asks for, trimmed and checked; throws a 400 problem otherwise. */
function validatedEventType(input: NewEventType): EventType {
  const title = input.title.trim();
  const description = input.description?.trim();

  const fields: FieldError[] = [];
  const titleError = requiredTextError(title);
  if (titleError) {
    fields.push({ field: "title", message: titleError });
  }
  if (input.durationMinutes % DURATION_STEP_MINUTES !== 0) {
    fields.push({
      field: "durationMinutes",
      message: `Длительность должна быть кратна ${DURATION_STEP_MINUTES} минутам`,
    });
  }
  if (fields.length > 0) {
    throw validationProblem(fields);
  }

  return {
    slug: input.slug,
    title,
    ...(description ? { description } : {}),
    durationMinutes: input.durationMinutes,
  };
}

/** The rule for a trimmed title or guest name: not empty and at most MAX_NAME_LENGTH characters. */
function requiredTextError(trimmed: string): string | undefined {
  if (trimmed === "") {
    return "Обязательное поле";
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return `Не длиннее ${MAX_NAME_LENGTH} символов`;
  }
  return undefined;
}
