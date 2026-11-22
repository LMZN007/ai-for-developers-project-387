import type { components } from "@calls-booking/contract";
import { Card, Loader, Stack, Table, Text, Title, em } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { api } from "../../api.ts";
import { browserTimeZone, intervalLabel } from "../../browserTime.ts";
import LoadFailed from "../../LoadFailed.tsx";
import { useLoad } from "../../useLoad.ts";

type Booking = components["schemas"]["Booking"];

const loadBookings = () => api.GET("/bookings").then(({ data }) => data);

export default function BookingsPage() {
  const { state, retry } = useLoad(loadBookings);

  return (
    <>
      <Title order={1}>Записи</Title>
      <Text c="dimmed" mt="xs">
        Предстоящие встречи всех типов. Время указано в поясе: {browserTimeZone()}
      </Text>

      {state.status === "loading" && <Loader mt="xl" aria-label="Загрузка" />}
      {state.status === "failed" && <LoadFailed onRetry={retry} />}
      {state.status === "loaded" && state.data.length === 0 && (
        <Text mt="xl" c="dimmed">
          Предстоящих записей нет
        </Text>
      )}
      {state.status === "loaded" && state.data.length > 0 && <BookingsList bookings={state.data} />}
    </>
  );
}

// Mantine's "sm" breakpoint: below it the five table columns do not fit the screen.
const PHONE_QUERY = `(max-width: ${em(767)})`;

function BookingsList({ bookings }: { bookings: Booking[] }) {
  // Read on the first render, so a phone never flashes the table.
  const isPhone = useMediaQuery(PHONE_QUERY, false, { getInitialValueInEffect: false });

  return isPhone ? <BookingCards bookings={bookings} /> : <BookingsTable bookings={bookings} />;
}

// On a phone every field stays visible: a card per booking instead of a wide table.
function BookingCards({ bookings }: { bookings: Booking[] }) {
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
        </Card>
      ))}
    </Stack>
  );
}

function BookingsTable({ bookings }: { bookings: Booking[] }) {
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
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
