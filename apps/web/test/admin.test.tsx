import { renderAt, stubApi } from "../test-utils/app.tsx";
import { screen, userEvent, within } from "../test-utils/index.ts";

const consultation = { slug: "consultation", title: "Консультация", durationMinutes: 30 };

afterEach(() => {
  vi.unstubAllGlobals();
});

function listReturns(eventTypes: unknown[]) {
  return { "GET /event-types": () => Response.json(eventTypes) };
}

test("ссылка «Для владельца» в шапке ведёт в раздел «Типы встреч»", async () => {
  stubApi(listReturns([]));
  renderAt("/");

  await userEvent.click(
    within(screen.getByRole("banner")).getByRole("link", { name: "Для владельца" }),
  );

  expect(screen.getByRole("heading", { level: 1, name: "Типы встреч" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Типы встреч" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Доступность: пн–пт, 09:00–18:00 (Europe/Moscow)")).toBeInTheDocument();
});

test("список типов встреч показывает публичную ссылку и копирует её полный адрес", async () => {
  const user = userEvent.setup();
  stubApi(listReturns([consultation]));
  renderAt("/admin/event-types");

  const row = await screen.findByRole("article", { name: "Консультация" });
  expect(within(row).getByText(/30 мин/)).toBeInTheDocument();
  expect(within(row).getByRole("link", { name: "/book/consultation" })).toHaveAttribute(
    "href",
    "/book/consultation",
  );

  await user.click(within(row).getByRole("button", { name: "Скопировать ссылку" }));

  expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/book/consultation`);
  expect(within(row).getByRole("button", { name: "Скопировано" })).toBeInTheDocument();
});

test("пустой список типов встреч предлагает создать первый", async () => {
  stubApi(listReturns([]));
  renderAt("/admin/event-types");

  expect(await screen.findByText("Типов встреч пока нет")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Создать" })[0]).toHaveAttribute(
    "href",
    "/admin/event-types/new",
  );
});

test("вкладка «Записи» открывает раздел записей", async () => {
  stubApi(listReturns([]));
  renderAt("/admin/event-types");

  await userEvent.click(screen.getByRole("tab", { name: "Записи" }));

  expect(screen.getByRole("heading", { level: 1, name: "Записи" })).toBeInTheDocument();
});

describe("форма нового типа встречи", () => {
  async function fill(fields: { title?: string; slug?: string; duration?: string }) {
    if (fields.title !== undefined) {
      await userEvent.type(screen.getByRole("textbox", { name: /Название/ }), fields.title);
    }
    if (fields.slug !== undefined) {
      await userEvent.type(screen.getByRole("textbox", { name: /Ссылка/ }), fields.slug);
    }
    if (fields.duration !== undefined) {
      const duration = screen.getByRole("textbox", { name: /Длительность/ });
      await userEvent.clear(duration);
      await userEvent.type(duration, fields.duration);
    }
  }

  const save = () => userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

  test("не отправляет пустую форму и показывает ошибки у обязательных полей", async () => {
    const requests = stubApi({});
    renderAt("/admin/event-types/new");

    await save();

    expect(screen.getByRole("textbox", { name: /Название/ })).toHaveAccessibleDescription(
      /Обязательное поле/,
    );
    expect(screen.getByRole("textbox", { name: /Ссылка/ })).toHaveAccessibleDescription(
      /Обязательное поле/,
    );
    expect(requests).toEqual([]);
  });

  test("проверяет формат ссылки и кратность длительности до отправки", async () => {
    const requests = stubApi({});
    renderAt("/admin/event-types/new");

    await fill({ title: "Консультация", slug: "Bad Slug", duration: "20" });
    await save();

    expect(
      screen.getByText("Только строчные латинские буквы, цифры и дефисы между ними"),
    ).toBeInTheDocument();
    expect(screen.getByText("От 15 до 240 минут, кратно 15")).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  test("при занятой ссылке показывает ошибку у поля и сохраняет введённое", async () => {
    stubApi({
      "POST /event-types": () =>
        Response.json({ code: "slug_taken", message: "Эта ссылка уже занята" }, { status: 409 }),
    });
    renderAt("/admin/event-types/new");

    await fill({ title: "Консультация", slug: "consultation" });
    await save();

    expect(await screen.findByText("Эта ссылка уже занята")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Название/ })).toHaveValue("Консультация");
    expect(screen.getByRole("textbox", { name: /Ссылка/ })).toHaveValue("consultation");
  });

  test("показывает ошибки сервера у соответствующих полей", async () => {
    stubApi({
      "POST /event-types": () =>
        Response.json(
          {
            code: "validation_error",
            message: "Проверьте поля запроса",
            fields: [{ field: "title", message: "Не длиннее 100 символов" }],
          },
          { status: 400 },
        ),
    });
    renderAt("/admin/event-types/new");

    await fill({ title: "Консультация", slug: "consultation" });
    await save();

    expect(await screen.findByText("Не длиннее 100 символов")).toBeInTheDocument();
  });

  test("создаёт тип встречи и возвращает к списку с уведомлением", async () => {
    let created = false;
    const requests = stubApi({
      "POST /event-types": () => {
        created = true;
        return Response.json(consultation, { status: 201 });
      },
      "GET /event-types": () => Response.json(created ? [consultation] : []),
    });
    renderAt("/admin/event-types/new");

    await fill({ title: "  Консультация ", slug: "consultation", duration: "30" });
    await save();

    expect(await screen.findByText("Тип встречи создан")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Типы встреч" })).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: "Консультация" })).toBeInTheDocument();

    const post = requests.find((request) => request.method === "POST");
    expect(await post?.json()).toEqual({
      title: "Консультация",
      slug: "consultation",
      durationMinutes: 30,
    });
  });

  test("«Отмена» возвращает к списку", async () => {
    stubApi(listReturns([]));
    renderAt("/admin/event-types/new");

    await userEvent.click(screen.getByRole("link", { name: "Отмена" }));

    expect(screen.getByRole("heading", { level: 1, name: "Типы встреч" })).toBeInTheDocument();
  });
});
