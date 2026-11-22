import { Card, Group, Loader, SimpleGrid, Text, Title } from "@mantine/core";
import { Link } from "react-router";
import LoadFailed from "../LoadFailed.tsx";
import { useEventTypes } from "../useEventTypes.ts";

export default function BookPage() {
  const { state, retry } = useEventTypes();

  return (
    <>
      <Title order={1}>Запись на встречу</Title>
      <Text mt="sm">Выберите тип встречи, чтобы увидеть свободное время.</Text>

      {state.status === "loading" && <Loader mt="xl" aria-label="Загрузка" />}
      {state.status === "failed" && <LoadFailed onRetry={retry} />}
      {state.status === "loaded" && state.data.length === 0 && (
        <Text mt="xl" c="dimmed">
          Пока нет типов встреч
        </Text>
      )}
      {state.status === "loaded" && state.data.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} mt="xl">
          {state.data.map((eventType) => (
            <Card
              key={eventType.slug}
              component={Link}
              to={`/book/${eventType.slug}`}
              withBorder
              padding="lg"
            >
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Text fw={600}>{eventType.title}</Text>
                <Text c="dimmed" style={{ whiteSpace: "nowrap" }}>
                  {eventType.durationMinutes} мин
                </Text>
              </Group>
              {eventType.description && (
                <Text size="sm" c="dimmed" mt="xs">
                  {eventType.description}
                </Text>
              )}
            </Card>
          ))}
        </SimpleGrid>
      )}
    </>
  );
}
