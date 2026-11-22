import type { components } from "@calls-booking/contract";
import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Title,
  VisuallyHidden,
  em,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useState } from "react";
import { api } from "../../api.ts";
import { browserTimeZone, intervalLabel } from "../../browserTime.ts";
import LoadFailed from "../../LoadFailed.tsx";
import { useLoad } from "../../useLoad.ts";

type Booking = components["schemas"]["Booking"];

const loadBookings = () => api.GET("/bookings").then(({ data }) => data);

type Notice = { color: "green" | "red"; text: string };

const CANCEL_FAILED = "Не удалось отменить запись. Попробуйте ещё раз.";

export default function BookingsPage() {
  const { state, retry, update } = useLoad(loadBookings);
  const [toCancel, setToCancel] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Success removes the row at once; any failure shows why and re-reads the list.
  const cancelBooking = async (booking: Booking) => {
    setCancelling(true);
    let result: Notice;
    let reload = true;
    try {
      const { response } = await api.DELETE("/bookings/{id}", {
        params: { path: { id: booking.id } },
      });
      if (response.status === 204) {
        update((bookings) => bookings.filter(({ id }) => id !== booking.id));
        result = { color: "green", text: "Запись отменена" };
        reload = false;
      } else if (response.status === 404) {
        result = { color: "red", text: "Этой записи уже нет. Список обновлён." };
      } else if (response.status === 409) {
        result = {
          color: "red",
          text: "Встреча уже началась или прошла, отменить запись нельзя. Список обновлён.",
        };
      } else {
        result = { color: "red", text: CANCEL_FAILED };
      }
    } catch {
      result = { color: "red", text: CANCEL_FAILED };
    }
    setNotice(result);
    setToCancel(null);
    setCancelling(false);
    if (reload) {
      retry();
    }
  };

  return (
    <>
      <Title order={1}>Записи</Title>
      <Text c="dimmed" mt="xs">
        Предстоящие встречи всех типов. Время указано в поясе: {browserTimeZone()}
      </Text>

      {notice && (
        <Alert
          color={notice.color}
          mt="md"
          role={notice.color === "red" ? "alert" : "status"}
          withCloseButton
          closeButtonLabel="Закрыть сообщение"
          onClose={() => setNotice(null)}
        >
          {notice.text}
        </Alert>
      )}
      {state.status === "loading" && <Loader mt="xl" aria-label="Загрузка" />}
      {state.status === "failed" && <LoadFailed onRetry={retry} />}
      {state.status === "loaded" && state.data.length === 0 && (
        <Text mt="xl" c="dimmed">
          Предстоящих записей нет
        </Text>
      )}
      {state.status === "loaded" && state.data.length > 0 && (
        <BookingsList bookings={state.data} onCancel={setToCancel} />
      )}
      <Modal
        opened={toCancel !== null}
        onClose={() => setToCancel(null)}
        title="Отмена записи"
        closeOnClickOutside={!cancelling}
        closeOnEscape={!cancelling}
      >
        {toCancel && (
          <>
            <Text>
              Отменить запись гостя {toCancel.guestName} на {intervalLabel(toCancel)}?
            </Text>
            <Group mt="lg" justify="flex-end">
              <Button variant="default" disabled={cancelling} onClick={() => setToCancel(null)}>
                Не отменять
              </Button>
              <Button color="red" loading={cancelling} onClick={() => cancelBooking(toCancel)}>
                Отменить запись
              </Button>
            </Group>
          </>
        )}
      </Modal>
    </>
  );
}

// Mantine's "sm" breakpoint: below it the five table columns do not fit the screen.
const PHONE_QUERY = `(max-width: ${em(767)})`;

type CancelProps = { onCancel: (booking: Booking) => void };

function BookingsList({ bookings, onCancel }: { bookings: Booking[] } & CancelProps) {
  // Read on the first render, so a phone never flashes the table.
  const isPhone = useMediaQuery(PHONE_QUERY, false, { getInitialValueInEffect: false });

  return isPhone ? (
    <BookingCards bookings={bookings} onCancel={onCancel} />
  ) : (
    <BookingsTable bookings={bookings} onCancel={onCancel} />
  );
}

// On a phone every field stays visible: a card per booking instead of a wide table.
function BookingCards({ bookings, onCancel }: { bookings: Booking[] } & CancelProps) {
  return (
    <Stack
      component="ul"
      aria-label="Предстоящие записи"
      mt="xl"
      p={0}
      gap="sm"
      style={{ listStyle: "none" }}
    >
      {bookings.map((booking) => (
        <Card component="li" key={booking.id} withBorder padding="md">
          <Title order={2} size="h4">
            {intervalLabel(booking)}
          </Title>
          <Text mt="xs">Тип встречи: {booking.eventType.title}</Text>
          <Text>Имя: {booking.guestName}</Text>
          <Text style={{ overflowWrap: "anywhere" }}>Email: {booking.guestEmail}</Text>
          <Text>Комментарий: {booking.comment ?? "—"}</Text>
          <Button variant="light" color="red" mt="sm" onClick={() => onCancel(booking)}>
            Отменить запись
          </Button>
        </Card>
      ))}
    </Stack>
  );
}

function BookingsTable({ bookings, onCancel }: { bookings: Booking[] } & CancelProps) {
  return (
    <Table.ScrollContainer minWidth={720} mt="xl">
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Дата и время</Table.Th>
            <Table.Th>Тип встречи</Table.Th>
            <Table.Th>Имя</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Комментарий</Table.Th>
            <Table.Th>
              <VisuallyHidden>Действия</VisuallyHidden>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {bookings.map((booking) => (
            <Table.Tr key={booking.id}>
              <Table.Td>{intervalLabel(booking)}</Table.Td>
              <Table.Td>{booking.eventType.title}</Table.Td>
              <Table.Td>{booking.guestName}</Table.Td>
              <Table.Td>{booking.guestEmail}</Table.Td>
              <Table.Td>{booking.comment ?? "—"}</Table.Td>
              <Table.Td>
                <Button variant="light" color="red" size="xs" onClick={() => onCancel(booking)}>
                  Отменить запись
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
