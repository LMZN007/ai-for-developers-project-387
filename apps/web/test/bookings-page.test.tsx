import { renderAt, stubApi } from "../test-utils/app.tsx";
import { screen, userEvent, waitFor, within } from "../test-utils/index.ts";

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
  ).toEqual(["Дата и время", "Тип встречи", "Имя", "Email", "Комментарий", "Действия"]);

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
    "Отменить запись",
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
    "Отменить запись",
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

function stubCancel(status: number, bookings: unknown[] = [deepDive]) {
  const calls: string[] = [];
  stubApi({
    "GET /bookings": () => Response.json(calls.length > 0 ? bookings : [consultation, deepDive]),
    "DELETE /bookings/b1": () => {
      calls.push("b1");
      return status === 204
        ? new Response(null, { status })
        : Response.json({ code: "not_found", message: "Ошибка" }, { status });
    },
  });
  return calls;
}

test("отмена записи: диалог называет гостя и время, «Не отменять» ничего не меняет", async () => {
  const calls = stubCancel(204);
  renderAt("/admin/bookings");

  const row = (await screen.findByRole("cell", { name: "Иван Петров" })).closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: "Отменить запись" }));

  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByText("Отменить запись гостя Иван Петров на Среда, 25 ноября, 11:30–12:00?"),
  ).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: "Не отменять" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(calls).toEqual([]);
  expect(screen.getByRole("cell", { name: "Иван Петров" })).toBeInTheDocument();
});

test("отмена записи: после подтверждения строка пропадает и показано «Запись отменена»", async () => {
  const calls = stubCancel(204);
  renderAt("/admin/bookings");

  const row = (await screen.findByRole("cell", { name: "Иван Петров" })).closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: "Отменить запись" }));
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Отменить запись" }),
  );

  expect(await screen.findByText("Запись отменена")).toBeInTheDocument();
  expect(screen.queryByRole("cell", { name: "Иван Петров" })).not.toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Анна Смирнова" })).toBeInTheDocument();
  expect(calls).toEqual(["b1"]);
});

test.each([
  [404, "Этой записи уже нет. Список обновлён."],
  [409, "Встреча уже началась или прошла, отменить запись нельзя. Список обновлён."],
  [500, "Не удалось отменить запись. Попробуйте ещё раз."],
])(
  "отмена записи: ответ %i — сообщение об ошибке и список перечитывается",
  async (status, text) => {
    stubCancel(status);
    renderAt("/admin/bookings");

    const row = (await screen.findByRole("cell", { name: "Иван Петров" })).closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Отменить запись" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Отменить запись" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    // Список перечитан: заглушка после первой отмены отдаёт уже обновлённые данные.
    await waitFor(() =>
      expect(screen.queryByRole("cell", { name: "Иван Петров" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("cell", { name: "Анна Смирнова" })).toBeInTheDocument();
  },
);

test("отмена записи: сетевая ошибка — сообщение об ошибке и список перечитывается", async () => {
  let cancelled = false;
  stubApi({
    "GET /bookings": () => Response.json(cancelled ? [deepDive] : [consultation, deepDive]),
    "DELETE /bookings/b1": () => {
      cancelled = true;
      throw new TypeError("Failed to fetch");
    },
  });
  renderAt("/admin/bookings");

  const row = (await screen.findByRole("cell", { name: "Иван Петров" })).closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: "Отменить запись" }));
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Отменить запись" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Не удалось отменить запись. Попробуйте ещё раз.",
  );
  // Список перечитан: после сбоя заглушка отдаёт уже обновлённые данные.
  await waitFor(() =>
    expect(screen.queryByRole("cell", { name: "Иван Петров" })).not.toBeInTheDocument(),
  );
});

test("на телефоне запись отменяется из карточки", async () => {
  stubPhoneScreen();
  const calls = stubCancel(204);
  renderAt("/admin/bookings");

  const [first] = within(
    await screen.findByRole("list", { name: "Предстоящие записи" }),
  ).getAllByRole("listitem");
  await userEvent.click(within(first!).getByRole("button", { name: "Отменить запись" }));
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Отменить запись" }),
  );

  expect(await screen.findByText("Запись отменена")).toBeInTheDocument();
  expect(screen.queryByText("Имя: Иван Петров")).not.toBeInTheDocument();
  expect(calls).toEqual(["b1"]);
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
