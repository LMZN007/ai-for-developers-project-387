import { useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Card,
  CopyButton,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Link, useLocation } from "react-router";
import LoadFailed from "../../LoadFailed.tsx";
import { useEventTypes, type EventType } from "../../useEventTypes.ts";

/** Navigation state the creation form passes after a successful save. */
export interface CreatedState {
  createdTitle: string;
}

export default function EventTypesPage() {
  const { state, retry } = useEventTypes();
  const location = useLocation();
  const createdTitle = (location.state as CreatedState | null)?.createdTitle;
  const [noticeClosed, setNoticeClosed] = useState(false);

  return (
    <>
      <Group justify="space-between" align="center">
        <Title order={1}>Типы встреч</Title>
        <Button component={Link} to="/admin/event-types/new">
          Создать
        </Button>
      </Group>
      <Text c="dimmed" mt="xs">
        Доступность: пн–пт, 09:00–18:00 (Europe/Moscow)
      </Text>

      {createdTitle && !noticeClosed && (
        <Alert
          color="green"
          mt="lg"
          title="Тип встречи создан"
          withCloseButton
          closeButtonLabel="Закрыть"
          onClose={() => setNoticeClosed(true)}
        >
          «{createdTitle}» уже доступен гостям.
        </Alert>
      )}

      {state.status === "loading" && <Loader mt="xl" aria-label="Загрузка" />}
      {state.status === "failed" && <LoadFailed onRetry={retry} />}
      {state.status === "loaded" && state.data.length === 0 && (
        <Stack mt="xl" align="flex-start">
          <Text c="dimmed">Типов встреч пока нет</Text>
          <Button component={Link} to="/admin/event-types/new" variant="light">
            Создать
          </Button>
        </Stack>
      )}
      {state.status === "loaded" && state.data.length > 0 && (
        <Stack mt="xl">
          {state.data.map((eventType) => (
            <EventTypeRow key={eventType.slug} eventType={eventType} />
          ))}
        </Stack>
      )}
    </>
  );
}

function EventTypeRow({ eventType }: { eventType: EventType }) {
  const path = `/book/${eventType.slug}`;

  return (
    <Card withBorder padding="md" component="article" aria-label={eventType.title}>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <div>
          <Text fw={600}>
            {eventType.title}{" "}
            <Text span c="dimmed" fw={400}>
              · {eventType.durationMinutes} мин
            </Text>
          </Text>
          <Anchor component={Link} to={path} size="sm">
            {path}
          </Anchor>
        </div>
        <CopyButton value={`${window.location.origin}${path}`}>
          {({ copied, copy }) => (
            <Button variant="default" size="xs" onClick={copy} color={copied ? "teal" : undefined}>
              {copied ? "Скопировано" : "Скопировать ссылку"}
            </Button>
          )}
        </CopyButton>
      </Group>
    </Card>
  );
}
