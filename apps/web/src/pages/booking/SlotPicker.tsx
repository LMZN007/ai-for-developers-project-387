import { useMemo } from "react";
import type { components } from "@calls-booking/contract";
import { Button, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { DatePicker, DatesProvider } from "@mantine/dates";
import "dayjs/locale/ru";
import { dayTitle, localDateKey, localTime } from "../../browserTime.ts";

type Slot = components["schemas"]["Slot"];

interface SlotPickerProps {
  slots: Slot[];
  /** The day the guest picked; when null or no longer bookable, the first day with slots. */
  date: string | null;
  onDateChange: (date: string) => void;
  onPick: (slot: Slot) => void;
}

export default function SlotPicker({ slots, date, onDateChange, onPick }: SlotPickerProps) {
  const slotsByDate = useMemo(() => groupByLocalDate(slots), [slots]);
  const dates = [...slotsByDate.keys()];
  const firstDate = dates[0] ?? null;
  const selectedDate = date && slotsByDate.has(date) ? date : firstDate;

  if (!selectedDate) {
    return <Text mt="xl">Свободного времени в ближайшие 14 дней нет</Text>;
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md" spacing="xl">
      <DatesProvider settings={{ locale: "ru", firstDayOfWeek: 1 }}>
        <DatePicker
          value={selectedDate}
          onChange={(picked) => picked && onDateChange(picked)}
          defaultDate={selectedDate}
          minDate={firstDate ?? undefined}
          maxDate={dates.at(-1)}
          excludeDate={(day) => !slotsByDate.has(day)}
          getDayProps={(day) => ({ "aria-label": dayTitle(day) })}
        />
      </DatesProvider>

      <Stack gap="sm">
        <Title order={2} size="h4">
          {dayTitle(selectedDate)}
        </Title>
        <Group gap="xs" role="group" aria-label="Свободное время">
          {(slotsByDate.get(selectedDate) ?? []).map((slot) => (
            <Button key={slot.startsAt} variant="default" onClick={() => onPick(slot)}>
              {localTime(slot.startsAt)}
            </Button>
          ))}
        </Group>
      </Stack>
    </SimpleGrid>
  );
}

/** Slots grouped by the guest's local date, both in ascending order. */
function groupByLocalDate(slots: Slot[]): Map<string, Slot[]> {
  const groups = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = localDateKey(slot.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  return groups;
}
