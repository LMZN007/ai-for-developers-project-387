import { Tabs } from "@mantine/core";
import { Outlet, useLocation, useNavigate } from "react-router";

const sections = [
  { path: "/admin/event-types", label: "Типы встреч" },
  { path: "/admin/bookings", label: "Записи" },
];

// Owner sections are open addresses without sign-in: there is a single owner (ADR-0003).
export default function AdminLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = sections.find((section) => pathname.startsWith(section.path))?.path ?? null;

  return (
    <>
      <Tabs value={active} onChange={(path) => path && navigate(path)} mb="xl">
        <Tabs.List>
          {sections.map((section) => (
            <Tabs.Tab key={section.path} value={section.path}>
              {section.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <Outlet />
    </>
  );
}
