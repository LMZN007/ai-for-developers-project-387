import { useState, type FormEvent } from "react";
import type { components } from "@calls-booking/contract";
import { Alert, Button, Group, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { api } from "../../api.ts";
import { browserTimeZone, intervalLabel } from "../../browserTime.ts";
import { isGuestField, validateGuest, type GuestErrors, type GuestValues } from "./guestRules.ts";

type EventType = components["schemas"]["EventType"];
type Slot = components["schemas"]["Slot"];
type Booking = components["schemas"]["Booking"];

interface BookingFormProps {
  eventType: EventType;
  slot: Slot;
  /** Kept by the page so the guest's input survives going back to the slots. */
  values: GuestValues;
  onChange: (values: GuestValues) => void;
  onBack: () => void;
  onBooked: (booking: Booking) => void;
  /** Someone else took this time first. */
  onConflict: () => void;
}

export default function BookingForm({
  eventType,
  slot,
  values,
  onChange,
  onBack,
  onBooked,
  onConflict,
}: BookingFormProps) {
  const [errors, setErrors] = useState<GuestErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const change = (field: keyof GuestValues, value: string) => {
    onChange({ ...values, [field]: value });
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);

    const found = validateGuest(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    const comment = values.comment.trim();
    setSubmitting(true);
    try {
      const { data, error } = await api.POST("/event-types/{slug}/bookings", {
        params: { path: { slug: eventType.slug } },
        body: {
          startsAt: slot.startsAt,
          guestName: values.guestName.trim(),
          guestEmail: values.guestEmail.trim(),
          ...(comment ? { comment } : {}),
        },
      });

      if (data) {
        onBooked(data);
        return;
      }
      if (error?.code === "time_conflict") {
        onConflict();
        return;
      }
      if (error?.code === "validation_error" && error.fields?.length) {
        const fieldErrors: GuestErrors = {};
        for (const { field, message } of error.fields) {
          if (isGuestField(field)) {
            fieldErrors[field] = message;
          } else {
            setFailure(message); // startsAt: the time is no longer bookable
          }
        }
        setErrors(fieldErrors);
      } else {
        setFailure("Не удалось записаться. Попробуйте ещё раз.");
      }
    } catch {
      setFailure("Не удалось записаться. Попробуйте ещё раз.");
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={submit} noValidate>
      <Stack mt="lg" maw={480}>
        <Group justify="space-between" align="baseline" wrap="wrap" gap="xs">
          <Text fw={600}>
            {intervalLabel(slot)} ({browserTimeZone()})
          </Text>
          <Button variant="subtle" size="compact-sm" onClick={onBack}>
            Изменить время
          </Button>
        </Group>

        {failure && (
          <Alert color="red" title="Запись не создана">
            {failure}
          </Alert>
        )}

        <TextInput
          label="Имя"
          required
          autoComplete="name"
          value={values.guestName}
          onChange={(event) => change("guestName", event.currentTarget.value)}
          error={errors.guestName}
        />
        <TextInput
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={values.guestEmail}
          onChange={(event) => change("guestEmail", event.currentTarget.value)}
          error={errors.guestEmail}
        />
        <Textarea
          label="Комментарий"
          autosize
          minRows={3}
          value={values.comment}
          onChange={(event) => change("comment", event.currentTarget.value)}
          error={errors.comment}
        />
        <Group>
          <Button type="submit" loading={submitting}>
            Подтвердить
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
