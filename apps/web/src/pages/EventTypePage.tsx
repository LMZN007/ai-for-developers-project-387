import { useCallback, useState } from "react";
import type { components } from "@calls-booking/contract";
import { Alert, Anchor, Loader, Text, Title } from "@mantine/core";
import { Link, useParams } from "react-router";
import { api } from "../api.ts";
import { browserTimeZone } from "../browserTime.ts";
import LoadFailed from "../LoadFailed.tsx";
import { useLoad } from "../useLoad.ts";
import BookingConfirmation from "./booking/BookingConfirmation.tsx";
import BookingForm from "./booking/BookingForm.tsx";
import { emptyGuest, type GuestValues } from "./booking/guestRules.ts";
import SlotPicker from "./booking/SlotPicker.tsx";

type EventType = components["schemas"]["EventType"];
type Slot = components["schemas"]["Slot"];
type Booking = components["schemas"]["Booking"];

type PageData = { found: false } | { found: true; eventType: EventType; slots: Slot[] };

// The guest's way through the page; the confirmation has no address of its own (spec).
type Step = { kind: "choose" } | { kind: "form"; slot: Slot } | { kind: "done"; booking: Booking };

export default function EventTypePage() {
  const { slug = "" } = useParams();
  const { state, retry, reloadSlots } = useEventTypeWithSlots(slug);

  if (state.status === "loading") {
    return <Loader mt="xl" aria-label="Загрузка" />;
  }
  if (state.status === "failed") {
    return <LoadFailed onRetry={retry} />;
  }
  if (!state.data.found) {
    return (
      <>
        <Title order={1}>Такой тип встречи не найден</Title>
        <Anchor component={Link} to="/book" mt="md" display="inline-block">
          Ко всем типам встреч
        </Anchor>
      </>
    );
  }

  const { eventType, slots } = state.data;
  return (
    <>
      <Title order={1}>{eventType.title}</Title>
      <Text c="dimmed" mt={4}>
        {eventType.durationMinutes} мин
      </Text>
      {eventType.description && <Text mt="sm">{eventType.description}</Text>}
      <Text size="sm" c="dimmed" mt="lg">
        Время указано в поясе: {browserTimeZone()}
      </Text>

      <BookingSteps eventType={eventType} slots={slots} reloadSlots={reloadSlots} />
    </>
  );
}

function BookingSteps({
  eventType,
  slots,
  reloadSlots,
}: {
  eventType: EventType;
  slots: Slot[];
  reloadSlots: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [date, setDate] = useState<string | null>(null);
  const [guest, setGuest] = useState<GuestValues>(emptyGuest);
  const [conflict, setConflict] = useState(false);

  if (step.kind === "done") {
    return (
      <BookingConfirmation
        booking={step.booking}
        onBookAgain={() => {
          setGuest({ ...guest, comment: "" });
          setStep({ kind: "choose" });
        }}
      />
    );
  }

  if (step.kind === "form") {
    return (
      <BookingForm
        eventType={eventType}
        slot={step.slot}
        values={guest}
        onChange={setGuest}
        onBack={() => setStep({ kind: "choose" })}
        onBooked={(booking) => {
          reloadSlots();
          setStep({ kind: "done", booking });
        }}
        onConflict={() => {
          reloadSlots();
          setConflict(true);
          setStep({ kind: "choose" });
        }}
      />
    );
  }

  return (
    <>
      {conflict && (
        <Alert color="orange" mt="lg" title="Это время уже заняли. Выберите другое время." />
      )}
      <SlotPicker
        slots={slots}
        date={date}
        onDateChange={setDate}
        onPick={(slot) => {
          setConflict(false);
          setStep({ kind: "form", slot });
        }}
      />
    </>
  );
}

function useEventTypeWithSlots(slug: string) {
  const load = useCallback(async (): Promise<PageData | undefined> => {
    const path = { params: { path: { slug } } };
    const [eventType, slots] = await Promise.all([
      api.GET("/event-types/{slug}", path),
      api.GET("/event-types/{slug}/slots", path),
    ]);
    if (eventType.response.status === 404) {
      return { found: false };
    }
    if (eventType.data && slots.data) {
      return { found: true, eventType: eventType.data, slots: slots.data };
    }
    return undefined;
  }, [slug]);
  const { state, retry, update } = useLoad(load);

  // Refreshes the slots in place, without a loading screen; on failure the old slots stay.
  const reloadSlots = useCallback(() => {
    api.GET("/event-types/{slug}/slots", { params: { path: { slug } } }).then(
      ({ data }) => {
        if (data) {
          update((current) => (current.found ? { ...current, slots: data } : current));
        }
      },
      () => {},
    );
  }, [slug, update]);

  return { state, retry, reloadSlots };
}
