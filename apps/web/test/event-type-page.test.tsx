import { renderAt, stubApi } from "../test-utils/app.tsx";
import { screen, userEvent, within } from "../test-utils/index.ts";

const consultation = {
  slug: "consultation",
  title: "Консультация",
  description: "Разбор вашего вопроса",
  durationMinutes: 30,
};

// The browser zone in tests is Asia/Yekaterinburg (UTC+5), see vitest.setup.mjs.
const at1100 = { startsAt: "2026-11-25T06:00:00Z", endsAt: "2026-11-25T06:30:00Z" }; // ср 11:00
const at1130 = { startsAt: "2026-11-25T06:30:00Z", endsAt: "2026-11-25T07:00:00Z" }; // ср 11:30
const slots = [
  at1100,
  at1130,
  { startsAt: "2026-11-25T19:30:00Z", endsAt: "2026-11-25T20:00:00Z" }, // чт 00:30 по местному
  { startsAt: "2026-11-26T06:00:00Z", endsAt: "2026-11-26T06:30:00Z" }, // чт 11:00
];

const booking = {
  id: "b1",
  eventType: { slug: "consultation", title: "Консультация", durationMinutes: 30 },
  ...at1130,
  guestName: "Иван Петров",
  guestEmail: "ivan@example.com",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

type Route = (request: Request) => Response | Promise<Response>;

function serve(options: { eventType?: unknown; slots?: () => unknown; book?: Route } = {}) {
  return stubApi({
    "GET /event-types/consultation": () => Response.json(options.eventType ?? consultation),
    "GET /event-types/consultation/slots": () => Response.json(options.slots?.() ?? slots),
    ...(options.book ? { "POST /event-types/consultation/bookings": options.book } : {}),
  });
}

function slotTimes() {
  return within(screen.getByRole("group", { name: "Свободное время" }))
    .getAllByRole("button")
    .map((button) => button.textContent);
}

async function pickSlot(time: string) {
  const group = await screen.findByRole("group", { name: "Свободное время" });
  await userEvent.click(within(group).getByRole("button", { name: time }));
}

async function fillGuest(name: string, email: string, comment = "") {
  await userEvent.type(screen.getByRole("textbox", { name: /Имя/ }), name);
  await userEvent.type(screen.getByRole("textbox", { name: /Email/ }), email);
  if (comment) {
    await userEvent.type(screen.getByRole("textbox", { name: /Комментарий/ }), comment);
  }
}

const confirm = () => userEvent.click(screen.getByRole("button", { name: "Подтвердить" }));

describe("выбор времени", () => {
  test("показывает тип встречи, пояс браузера и слоты первого дня со свободным временем", async () => {
    serve();
    renderAt("/book/consultation");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Консультация" }),
    ).toBeInTheDocument();
    expect(screen.getByText("30 мин")).toBeInTheDocument();
    expect(screen.getByText("Разбор вашего вопроса")).toBeInTheDocument();
    expect(screen.getByText("Время указано в поясе: Asia/Yekaterinburg")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Среда, 25 ноября" })).toBeInTheDocument();
    expect(slotTimes()).toEqual(["11:00", "11:30"]);
  });

  test("группирует слоты по дате в поясе гостя и переключает день в календаре", async () => {
    serve();
    renderAt("/book/consultation");

    await userEvent.click(await screen.findByRole("button", { name: "Четверг, 26 ноября" }));

    expect(
      screen.getByRole("heading", { level: 2, name: "Четверг, 26 ноября" }),
    ).toBeInTheDocument();
    expect(slotTimes()).toEqual(["00:30", "11:00"]);
  });

  test("дни без свободных слотов выбрать нельзя", async () => {
    serve();
    renderAt("/book/consultation");

    expect(await screen.findByRole("button", { name: "Пятница, 27 ноября" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Среда, 25 ноября" })).toBeEnabled();
  });

  test("без свободного времени сообщает об этом", async () => {
    serve({ slots: () => [] });
    renderAt("/book/consultation");

    expect(
      await screen.findByText("Свободного времени в ближайшие 14 дней нет"),
    ).toBeInTheDocument();
  });

  test("неизвестный тип встречи: сообщение и ссылка ко всем типам", async () => {
    stubApi({});
    renderAt("/book/consultation");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Такой тип встречи не найден" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ко всем типам встреч" })).toHaveAttribute(
      "href",
      "/book",
    );
  });

  test("при ошибке загрузки предлагает повторить", async () => {
    stubApi({
      "GET /event-types/consultation": () =>
        Response.json({ code: "internal_error", message: "Ошибка" }, { status: 500 }),
      "GET /event-types/consultation/slots": () => Response.json(slots),
    });
    renderAt("/book/consultation");

    expect(await screen.findByText("Не удалось загрузить данные")).toBeInTheDocument();

    serve();
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Консультация" }),
    ).toBeInTheDocument();
    expect(slotTimes()).toEqual(["11:00", "11:30"]);
  });
});

describe("запись", () => {
  test("после выбора слота показывает форму с выбранным временем и поясом", async () => {
    serve();
    renderAt("/book/consultation");

    await pickSlot("11:30");

    expect(
      screen.getByText("Среда, 25 ноября, 11:30–12:00 (Asia/Yekaterinburg)"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Имя/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Email/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Комментарий/ })).toBeInTheDocument();
  });

  test("«Изменить время» возвращает к выбору слота", async () => {
    serve();
    renderAt("/book/consultation");
    await pickSlot("11:30");

    await userEvent.click(screen.getByRole("button", { name: "Изменить время" }));

    expect(slotTimes()).toEqual(["11:00", "11:30"]);
  });

  test("не отправляет форму без имени и с некорректным email", async () => {
    const requests = serve();
    renderAt("/book/consultation");
    await pickSlot("11:30");

    await userEvent.type(screen.getByRole("textbox", { name: /Email/ }), "ivan@");
    await confirm();

    expect(screen.getByRole("textbox", { name: /Имя/ })).toHaveAccessibleDescription(
      /Обязательное поле/,
    );
    expect(screen.getByRole("textbox", { name: /Email/ })).toHaveAccessibleDescription(
      /Некорректный email/,
    );
    expect(requests.filter((request) => request.method === "POST")).toEqual([]);
  });

  test("записывает гостя и показывает «Встреча запланирована»", async () => {
    let booked = false;
    const requests = serve({
      slots: () => (booked ? slots.filter((slot) => slot !== at1130) : slots),
      book: () => {
        booked = true;
        return Response.json(booking, { status: 201 });
      },
    });
    renderAt("/book/consultation");
    await pickSlot("11:30");

    await fillGuest(" Иван Петров ", "ivan@example.com", "Хочу обсудить проект");
    await confirm();

    const confirmation = await screen.findByRole("region", { name: "✓ Встреча запланирована" });
    expect(within(confirmation).getByText("Консультация, 30 мин")).toBeInTheDocument();
    expect(
      within(confirmation).getByText("Среда, 25 ноября 2026, 11:30–12:00 (Asia/Yekaterinburg)"),
    ).toBeInTheDocument();
    expect(
      within(confirmation).getByText("Владелец и Иван Петров (ivan@example.com)"),
    ).toBeInTheDocument();

    const post = requests.find((request) => request.method === "POST");
    expect(await post?.json()).toEqual({
      startsAt: "2026-11-25T06:30:00Z",
      guestName: "Иван Петров",
      guestEmail: "ivan@example.com",
      comment: "Хочу обсудить проект",
    });

    await userEvent.click(screen.getByRole("button", { name: "Записаться ещё" }));
    expect(slotTimes()).toEqual(["11:00"]);
  });

  test("при конфликте сообщает, что время заняли, обновляет слоты и сохраняет введённое", async () => {
    let taken = false;
    serve({
      slots: () => (taken ? slots.filter((slot) => slot !== at1130) : slots),
      book: () => {
        taken = true;
        return Response.json(
          { code: "time_conflict", message: "Это время уже заняли. Выберите другое время." },
          { status: 409 },
        );
      },
    });
    renderAt("/book/consultation");
    await pickSlot("11:30");
    await fillGuest("Иван Петров", "ivan@example.com");

    await confirm();

    expect(
      await screen.findByText("Это время уже заняли. Выберите другое время."),
    ).toBeInTheDocument();
    await vi.waitFor(() => expect(slotTimes()).toEqual(["11:00"]));

    await pickSlot("11:00");
    expect(screen.getByRole("textbox", { name: /Имя/ })).toHaveValue("Иван Петров");
    expect(screen.getByRole("textbox", { name: /Email/ })).toHaveValue("ivan@example.com");
  });

  test("показывает ошибки сервера у полей", async () => {
    serve({
      book: () =>
        Response.json(
          {
            code: "validation_error",
            message: "Проверьте поля запроса",
            fields: [{ field: "guestEmail", message: "Некорректный email" }],
          },
          { status: 400 },
        ),
    });
    renderAt("/book/consultation");
    await pickSlot("11:30");
    await fillGuest("Иван Петров", "ivan@example.com");

    await confirm();

    expect(await screen.findByText("Некорректный email")).toBeInTheDocument();
  });
});
