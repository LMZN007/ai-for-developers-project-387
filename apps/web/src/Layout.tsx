import { Anchor, Box, Container, Group } from "@mantine/core";
import { Link, Outlet } from "react-router";

export default function Layout() {
  return (
    <>
      <Box
        component="header"
        py="sm"
        style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
      >
        <Container size="sm">
          <Group justify="space-between">
            <Anchor component={Link} to="/" fw={700} underline="never">
              Календарь звонков
            </Anchor>
            <Anchor component={Link} to="/admin" size="sm">
              Для владельца
            </Anchor>
          </Group>
        </Container>
      </Box>
      <Container component="main" size="sm" py="xl">
        <Outlet />
      </Container>
    </>
  );
}
