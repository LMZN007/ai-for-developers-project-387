import { renderAt, stubApi } from "../test-utils/app.tsx";
import { screen, userEvent, within } from "../test-utils/index.ts";

// The browser zone in tests is Asia/Yekaterinburg (UTC+5), see vitest.setup.mjs.
const consultation = {
  id: "b1",
  eventType: { slug: "consultation", title: "Консультация", durationMinutes: 30 },
  startsAt: "2026-11-25T06:30:00Z", // ср 11:30
  endsAt: "2026-11-25T07:00:00Z",
  guestName: "Иван Петров",
  guestEmail: "ivan@example.com",
  comment: "Хочу обсудить проект",
};
const deepDive = {
  id: "b2",
  eventType: { slug: "deep-dive", title: "Глубокое погружение", durationMinutes: 60 },
  startsAt: "2026-11-26T09:00:00Z", // чт 14:00
  endsAt: "2026-11-26T10:00:00Z",
  guestName: "Анна Смирнова",
  guestEmail: "anna@example.com",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("«Записи» показывают предстоящие записи всех типов таблицей в порядке ответа API", async () => {
  stubApi({ "GET /bookings": () => Response.json([consultation, deepDive]) });
  renderAt("/admin/bookings");

  const table = await screen.findByRole("table");
  expect(screen.getByText(/Время указано в поясе: Asia\/Yekaterinburg/)).toBeInTheDocument();
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual(["Дата и время", "Тип встречи", "Имя", "Email", "Комментарий"]);

  const [, first, second] = within(table).getAllByRole("row");
  expect(
    within(first!)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual([
    "Среда, 25 ноября, 11:30–12:00",
    "Консультация",
    "Иван Петров",
    "ivan@example.com",
    "Хочу обсудить проект",
  ]);
  expect(
    within(second!)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual([
    "Четверг, 26 ноября, 14:00–15:00",
    "Глубокое погружение",
    "Анна Смирнова",
    "anna@example.com",
    "—",
  ]);
});

test("без предстоящих записей сообщает об этом", async () => {
  stubApi({ "GET /bookings": () => Response.json([]) });
  renderAt("/admin/bookings");

  expect(await screen.findByText("Предстоящих записей нет")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("при ошибке загрузки записей предлагает повторить", async () => {
  stubApi({
    "GET /bookings": () =>
      Response.json({ code: "internal_error", message: "Ошибка" }, { status: 500 }),
  });
  renderAt("/admin/bookings");

  expect(await screen.findByText("Не удалось загрузить данные")).toBeInTheDocument();

  stubApi({ "GET /bookings": () => Response.json([consultation]) });
  await userEvent.click(screen.getByRole("button", { name: "Повторить" }));

  expect(await screen.findByRole("cell", { name: "Иван Петров" })).toBeInTheDocument();
});

test("на телефоне записи показаны карточками, и все поля видны без прокрутки вбок", async () => {
  stubPhoneScreen();
  stubApi({ "GET /bookings": () => Response.json([consultation, deepDive]) });
  renderAt("/admin/bookings");

  const list = await screen.findByRole("list", { name: "Предстоящие записи" });
  expect(screen.queryByRole("table")).not.toBeInTheDocument();

  const [first, second] = within(list).getAllByRole("listitem");
  expect(
    within(first!).getByRole("heading", { name: "Среда, 25 ноября, 11:30–12:00" }),
  ).toBeInTheDocument();
  for (const text of [
    "Тип встречи: Консультация",
    "Имя: Иван Петров",
    "Email: ivan@example.com",
    "Комментарий: Хочу обсудить проект",
  ]) {
    expect(within(first!).getByText(text)).toBeInTheDocument();
  }
  expect(within(second!).getByText("Комментарий: —")).toBeInTheDocument();
});

// Mantine's useMediaQuery reads window.matchMedia; a narrow screen matches the "max-width" query.
function stubPhoneScreen() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}
