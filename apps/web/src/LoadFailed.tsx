import { Alert, Button } from "@mantine/core";

export default function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert color="red" mt="xl" title="Не удалось загрузить данные">
      <Button variant="light" color="red" mt="xs" onClick={onRetry}>
        Повторить
      </Button>
    </Alert>
  );
}
