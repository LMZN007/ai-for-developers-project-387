// The same rules the server enforces (see the spec); checked in the browser before sending.

export interface EventTypeFormValues {
  title: string;
  slug: string;
  description: string;
  durationMinutes: number | string;
}

export type EventTypeField = keyof EventTypeFormValues;
export type FieldErrors = Partial<Record<EventTypeField, string>>;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateEventType(values: EventTypeFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const title = values.title.trim();
  const duration = values.durationMinutes;

  if (title === "") {
    errors.title = "Обязательное поле";
  } else if (title.length > 100) {
    errors.title = "Не длиннее 100 символов";
  }

  if (values.slug === "") {
    errors.slug = "Обязательное поле";
  } else if (values.slug.length > 50) {
    errors.slug = "Не длиннее 50 символов";
  } else if (!SLUG_PATTERN.test(values.slug)) {
    errors.slug = "Только строчные латинские буквы, цифры и дефисы между ними";
  }

  if (values.description.trim().length > 500) {
    errors.description = "Не длиннее 500 символов";
  }

  if (typeof duration !== "number") {
    errors.durationMinutes = "Обязательное поле";
  } else if (
    !Number.isInteger(duration) ||
    duration < 15 ||
    duration > 240 ||
    duration % 15 !== 0
  ) {
    errors.durationMinutes = "От 15 до 240 минут, кратно 15";
  }

  return errors;
}

export function isEventTypeField(field: string): field is EventTypeField {
  return ["title", "slug", "description", "durationMinutes"].includes(field);
}
