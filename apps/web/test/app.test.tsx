import { renderAt, stubApi } from "../test-utils/app.tsx";
import { screen, userEvent, within } from "../test-utils/index.ts";

// The pages call the real SDK; only the network underneath it is replaced.
function respondWith(body: unknown, status = 200) {
  stubApi({ "GET /event-types": () => Response.json(body, { status }) });
}

beforeEach(() => {
  respondWith([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("главная рассказывает о сервисе и предлагает записаться", () => {
  renderAt("/");

  expect(screen.getByRole("heading", { level: 1, name: "Календарь звонков" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Как это работает" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Записаться" })).toHaveAttribute("href", "/book");
});

test("кнопка «Записаться» открывает страницу записи", async () => {
  renderAt("/");

  await userEvent.click(screen.getByRole("link", { name: "Записаться" }));

  expect(screen.getByRole("heading", { level: 1, name: "Запись на встречу" })).toBeInTheDocument();
});

test("страница записи показывает карточки типов встреч со ссылками на их страницы", async () => {
  respondWith([
    { slug: "intro", title: "Знакомство", description: "Короткий созвон", durationMinutes: 15 },
    { slug: "consultation", title: "Консультация", durationMinutes: 30 },
  ]);
  renderAt("/book");

  const intro = await screen.findByRole("link", { name: /Знакомство/ });
  expect(intro).toHaveAttribute("href", "/book/intro");
  expect(within(intro).getByText("15 мин")).toBeInTheDocument();
  expect(within(intro).getByText("Короткий созвон")).toBeInTheDocument();

  const consultation = screen.getByRole("link", { name: /Консультация/ });
  expect(consultation).toHaveAttribute("href", "/book/consultation");
  expect(within(consultation).getByText("30 мин")).toBeInTheDocument();
});

test("страница записи без типов встреч сообщает, что их пока нет", async () => {
  renderAt("/book");

  expect(await screen.findByText("Пока нет типов встреч")).toBeInTheDocument();
});

test("при ошибке загрузки страница записи предлагает повторить", async () => {
  respondWith({ code: "internal_error", message: "Внутренняя ошибка сервера" }, 500);
  renderAt("/book");

  expect(await screen.findByText("Не удалось загрузить данные")).toBeInTheDocument();

  respondWith([{ slug: "intro", title: "Знакомство", durationMinutes: 15 }]);
  await userEvent.click(screen.getByRole("button", { name: "Повторить" }));

  expect(await screen.findByRole("link", { name: /Знакомство/ })).toHaveAttribute(
    "href",
    "/book/intro",
  );
});

test("неизвестный адрес показывает страницу «Страница не найдена»", () => {
  renderAt("/no-such-page");

  expect(
    screen.getByRole("heading", { level: 1, name: "Страница не найдена" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "На главную" })).toHaveAttribute("href", "/");
});

test("в шапке любой страницы название сервиса ведёт на главную", () => {
  renderAt("/book");

  const header = screen.getByRole("banner");
  expect(within(header).getByRole("link", { name: "Календарь звонков" })).toHaveAttribute(
    "href",
    "/",
  );
});
