import { Button, List, Text, Title } from "@mantine/core";
import { Link } from "react-router";

const steps = [
  "Выберите тип встречи.",
  "Выберите день и свободный слот.",
  "Укажите имя и email и подтвердите запись.",
];

export default function HomePage() {
  return (
    <>
      <Title order={1}>Календарь звонков</Title>
      <Text size="lg" mt="sm">
        Сервис записи на встречи: выберите удобное время, и встреча появится в календаре владельца.
      </Text>

      <Title order={2} mt="xl">
        Как это работает
      </Title>
      <List type="ordered" mt="sm" spacing="xs">
        {steps.map((step) => (
          <List.Item key={step}>{step}</List.Item>
        ))}
      </List>

      <Button component={Link} to="/book" size="md" mt="xl">
        Записаться
      </Button>
    </>
  );
}
