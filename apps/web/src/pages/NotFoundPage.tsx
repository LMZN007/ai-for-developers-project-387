import { Anchor, Text, Title } from "@mantine/core";
import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <>
      <Title order={1}>Страница не найдена</Title>
      <Text mt="sm">Такой страницы нет. Проверьте адрес.</Text>
      <Anchor component={Link} to="/" mt="md" display="inline-block">
        На главную
      </Anchor>
    </>
  );
}
