import "@typespec/http";

using Http;

@service(#{ title: "Calls Booking API" })
namespace CallsBooking;

model HealthStatus {
  status: "ok";
}

/** A meeting template the owner publishes for guests. */
model EventType {
  /** Unique part of the public link `/book/<slug>`. */
  slug: string;

  title: string;
  description?: string;
  durationMinutes: int32;
}

/**
 * What the owner sends to create an event type. The server also trims `title`
 * and requires `durationMinutes` to be a multiple of 15.
 */
model NewEventType {
  @minLength(1)
  @maxLength(50)
  @pattern("^[a-z0-9]+(-[a-z0-9]+)*$")
  slug: string;

  /** 1–100 characters after trimming spaces at both ends; the server trims and checks the length. */
  @minLength(1)
  title: string;

  @maxLength(500)
  description?: string;

  @minValue(15)
  @maxValue(240)
  durationMinutes: int32;
}

/** A free interval a guest can book; times are UTC (ISO 8601 with `Z`). */
model Slot {
  startsAt: utcDateTime;
  endsAt: utcDateTime;
}

/** What a guest sends to book a slot; the server computes the end from the event type. */
model NewBooking {
  /** Must be the start of a free slot (see `listSlots`). */
  startsAt: utcDateTime;

  /** 1–100 characters after trimming spaces at both ends; the server trims and checks the length. */
  @minLength(1)
  guestName: string;

  @format("email")
  @maxLength(254)
  guestEmail: string;

  @maxLength(1000)
  comment?: string;
}

/** The event type a booking belongs to, as shown next to the booking. */
model BookingEventType {
  slug: string;
  title: string;
  durationMinutes: int32;
}

/** A guest's booking of a slot; it occupies `[startsAt, endsAt)`. */
model Booking {
  id: string;
  eventType: BookingEventType;
  startsAt: utcDateTime;
  endsAt: utcDateTime;
  guestName: string;
  guestEmail: string;
  comment?: string;
}

model FieldError {
  /** Name of the request field the message is about. */
  field: string;

  message: string;
}

/** The single error body every failing operation returns. */
@error
model ApiError {
  code: "validation_error" | "not_found" | "slug_taken" | "time_conflict" | "booking_started" | "internal_error";

  /** Human-readable text in Russian. */
  message: string;

  /** Present only for `validation_error`. */
  fields?: FieldError[];
}

@route("/health")
namespace Health {
  @get
  op check(): {
    @statusCode statusCode: 200;
    @body body: HealthStatus;
  };
}

@route("/event-types")
namespace EventTypes {
  /** All event types in the order they were created. */
  @get
  op list(): {
    @statusCode statusCode: 200;
    @body body: EventType[];
  };

  /** Create an event type; its slug must be unused. */
  @post
  op create(@body body: NewEventType):
    | {
        @statusCode statusCode: 201;
        @body body: EventType;
      }
    | {
        @statusCode statusCode: 400;
        @body body: ApiError;
      }
    | {
        @statusCode statusCode: 409;
        @body body: ApiError;
      };

  /** One event type by its slug. */
  @get
  @route("/{slug}")
  op get(@path slug: string):
    | {
        @statusCode statusCode: 200;
        @body body: EventType;
      }
    | {
        @statusCode statusCode: 404;
        @body body: ApiError;
      };

  /**
   * Free slots of the event type over the whole booking horizon (14 days from today
   * in the owner's time zone), starting after the current moment, in ascending order.
   */
  @get
  @route("/{slug}/slots")
  op listSlots(@path slug: string):
    | {
        @statusCode statusCode: 200;
        @body body: Slot[];
      }
    | {
        @statusCode statusCode: 404;
        @body body: ApiError;
      };

  /**
   * Book a free slot. Answers 409 `time_conflict` when the time overlaps any existing
   * booking of any event type; of simultaneous requests for the same time exactly one wins.
   */
  @post
  @route("/{slug}/bookings")
  op createBooking(@path slug: string, @body body: NewBooking):
    | {
        @statusCode statusCode: 201;
        @body body: Booking;
      }
    | {
        @statusCode statusCode: 400;
        @body body: ApiError;
      }
    | {
        @statusCode statusCode: 404;
        @body body: ApiError;
      }
    | {
        @statusCode statusCode: 409;
        @body body: ApiError;
      };
}

@route("/bookings")
namespace Bookings {
  /**
   * Upcoming bookings of every event type: those that have not ended yet
   * (end after the current moment), by start time, nearest first.
   */
  @get
  op list(): {
    @statusCode statusCode: 200;
    @body body: Booking[];
  };

  /**
   * Cancels an upcoming booking: the booking is deleted without a trace, so its time is free for
   * other guests again. A booking that has started (or ended) cannot be cancelled: 409
   * `booking_started`. An unknown or already cancelled id: 404 `not_found`.
   */
  @delete
  @route("/{id}")
  op cancel(@path id: string): {
    @statusCode statusCode: 204;
  } | {
    @statusCode statusCode: 404;
    @body body: ApiError;
  } | {
    @statusCode statusCode: 409;
    @body body: ApiError;
  };
}
