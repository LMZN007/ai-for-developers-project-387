import type { components } from "@calls-booking/contract";
import { Button, Card, Stack, Table, Title } from "@mantine/core";
import { browserTimeZone, intervalLabel } from "../../browserTime.ts";

type Booking = components["schemas"]["Booking"];

export default function BookingConfirmation({
  booking,
  onBookAgain,
}: {
  booking: Booking;
  onBookAgain: () => void;
}) {
  const rows = [
    ["Что", `${booking.eventType.title}, ${booking.eventType.durationMinutes} мин`],
    ["Когда", `${intervalLabel(booking, true)} (${browserTimeZone()})`],
    ["Кто", `Владелец и ${booking.guestName} (${booking.guestEmail})`],
  ];

  return (
    <Card withBorder padding="lg" mt="xl" maw={560} component="section" aria-labelledby="booked">
      <Stack>
        <Title order={2} id="booked" c="teal">
          ✓ Встреча запланирована
        </Title>
        <Table variant="vertical" withRowBorders={false}>
          <Table.Tbody>
            {rows.map(([label, value]) => (
              <Table.Tr key={label}>
                <Table.Th w={80}>{label}</Table.Th>
                <Table.Td>{value}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <div>
          <Button variant="light" onClick={onBookAgain}>
            Записаться ещё
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
