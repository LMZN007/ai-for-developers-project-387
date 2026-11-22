// The same rules the server enforces for a booking (see the spec); checked before sending.

export interface GuestValues {
  guestName: string;
  guestEmail: string;
  comment: string;
}

export type GuestField = keyof GuestValues;
export type GuestErrors = Partial<Record<GuestField, string>>;

export const emptyGuest: GuestValues = { guestName: "", guestEmail: "", comment: "" };

// A light check; the server's email format check is the authority.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateGuest(values: GuestValues): GuestErrors {
  const errors: GuestErrors = {};
  const name = values.guestName.trim();
  const email = values.guestEmail.trim();

  if (name === "") {
    errors.guestName = "Обязательное поле";
  } else if (name.length > 100) {
    errors.guestName = "Не длиннее 100 символов";
  }

  if (email === "") {
    errors.guestEmail = "Обязательное поле";
  } else if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.guestEmail = "Некорректный email";
  }

  if (values.comment.trim().length > 1000) {
    errors.comment = "Не длиннее 1000 символов";
  }

  return errors;
}

export function isGuestField(field: string): field is GuestField {
  return ["guestName", "guestEmail", "comment"].includes(field);
}
