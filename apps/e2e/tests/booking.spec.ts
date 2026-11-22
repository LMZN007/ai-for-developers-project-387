import { expect, test } from "@playwright/test";

// The whole path from README: the owner creates an event type → a guest books a slot →
// the owner sees the booking → the slot is no longer offered. Real server, real browser,
// real clock: the guest takes the first free slot, which always exists within 14 days.
// Names are unique per run, so the scenario can also run again against a deployed service
// whose data survives between runs (E2E_BASE_URL).
test("владелец создаёт тип встречи, гость записывается, владелец видит запись", async ({
  page,
}) => {
  const runId = Date.now().toString(36);
  const title = `Созвон из браузерного теста ${runId}`;
  const slug = `e2e-${runId}`;

  await test.step("владелец создаёт тип встречи", async () => {
    await page.goto("/");
    await page.getByRole("banner").getByRole("link", { name: "Для владельца" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Типы встреч" })).toBeVisible();

    await page.getByRole("link", { name: "Создать" }).first().click();
    await page.getByRole("textbox", { name: /Название/ }).fill(title);
    await page.getByRole("textbox", { name: /Ссылка/ }).fill(slug);
    await page.getByRole("textbox", { name: /Описание/ }).fill("Проверка всего пути записи");
    await page.getByRole("textbox", { name: /Длительность/ }).fill("30");
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(page.getByText("Тип встречи создан")).toBeVisible();
    await expect(page.getByRole("article", { name: title })).toContainText(`/book/${slug}`);
  });

  const guest = {
    name: "Иван Петров",
    email: `ivan.${runId}@example.com`,
    comment: "Обсудим проект",
  };
  let day = "";
  let time = "";

  await test.step("гость выбирает тип, день и первый свободный слот и записывается", async () => {
    await page.goto("/book");
    await page.getByRole("link", { name: new RegExp(title) }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Время указано в поясе: Asia/Yekaterinburg")).toBeVisible();

    day = (await page.getByRole("heading", { level: 2 }).textContent()) ?? "";
    const firstSlot = page
      .getByRole("group", { name: "Свободное время" })
      .getByRole("button")
      .first();
    time = (await firstSlot.textContent()) ?? "";
    await firstSlot.click();

    await page.getByRole("textbox", { name: /Имя/ }).fill(guest.name);
    await page.getByRole("textbox", { name: /Email/ }).fill(guest.email);
    await page.getByRole("textbox", { name: /Комментарий/ }).fill(guest.comment);
    await page.getByRole("button", { name: "Подтвердить" }).click();

    const confirmation = page.getByRole("region", { name: "✓ Встреча запланирована" });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(`${title}, 30 мин`);
    await expect(confirmation).toContainText(`${time}–`);
    await expect(confirmation).toContainText(`Владелец и ${guest.name} (${guest.email})`);
  });

  await test.step("владелец видит запись в «Записях»", async () => {
    await page.getByRole("banner").getByRole("link", { name: "Для владельца" }).click();
    await page.getByRole("tab", { name: "Записи" }).click();

    const row = page.getByRole("row").filter({ hasText: guest.email });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${day}, ${time}–`);
    await expect(row).toContainText(title);
    await expect(row).toContainText(guest.name);
    await expect(row).toContainText(guest.comment);
  });

  await test.step("занятый слот больше не предлагается", async () => {
    await page.goto(`/book/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    // The booked day either has fewer slots now or, if that was its last one, is not bookable.
    const bookedDay = page.getByRole("button", { name: day, exact: true });
    if (await bookedDay.isEnabled()) {
      await bookedDay.click();
      await expect(page.getByRole("heading", { level: 2, name: day })).toBeVisible();
      await expect(
        page.getByRole("group", { name: "Свободное время" }).getByRole("button", {
          name: time,
          exact: true,
        }),
      ).toHaveCount(0);
    } else {
      await expect(bookedDay).toBeDisabled();
    }
  });

  await test.step("повторная запись на то же время напрямую через API отклоняется", async () => {
    // Any client, not only this page: the rule lives on the server.
    const bookings = await page.request.get("/api/bookings");
    const booked = ((await bookings.json()) as { startsAt: string; guestEmail: string }[]).find(
      (booking) => booking.guestEmail === guest.email,
    );
    expect(booked).toBeDefined();

    const again = await page.request.post(`/api/event-types/${slug}/bookings`, {
      data: { startsAt: booked?.startsAt, guestName: "Анна", guestEmail: "anna@example.com" },
    });

    expect(again.status()).toBe(409);
    expect(await again.json()).toEqual({
      code: "time_conflict",
      message: "Это время уже заняли. Выберите другое время.",
    });
  });
});

// Cancellation: the owner removes an upcoming booking, its time is offered again, and another
// guest books exactly that time. The event type is created through the API: the form is covered
// by the scenario above.
test("владелец отменяет запись, и другой гость записывается на освободившееся время", async ({
  page,
}) => {
  const runId = Date.now().toString(36);
  const title = `Отмена из браузерного теста ${runId}`;
  const slug = `e2e-cancel-${runId}`;
  const created = await page.request.post("/api/event-types", {
    data: { title, slug, durationMinutes: 30 },
  });
  expect(created.status()).toBe(201);

  const firstGuest = { name: "Иван Петров", email: `cancel.first.${runId}@example.com` };
  const secondGuest = { name: "Анна Смирнова", email: `cancel.second.${runId}@example.com` };
  let time = "";

  const bookFirstFreeSlot = async (guest: { name: string; email: string }) => {
    await page.goto(`/book/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    const firstSlot = page
      .getByRole("group", { name: "Свободное время" })
      .getByRole("button")
      .first();
    const slotTime = (await firstSlot.textContent()) ?? "";
    await firstSlot.click();
    await page.getByRole("textbox", { name: /Имя/ }).fill(guest.name);
    await page.getByRole("textbox", { name: /Email/ }).fill(guest.email);
    await page.getByRole("button", { name: "Подтвердить" }).click();
    await expect(page.getByRole("region", { name: "✓ Встреча запланирована" })).toBeVisible();
    return slotTime;
  };

  const openBookings = async () => {
    await page.getByRole("banner").getByRole("link", { name: "Для владельца" }).click();
    await page.getByRole("tab", { name: "Записи" }).click();
  };

  await test.step("гость записывается на первый свободный слот", async () => {
    time = await bookFirstFreeSlot(firstGuest);
  });

  await test.step("владелец отменяет запись: диалог, затем запись пропадает из «Предстоящих»", async () => {
    await openBookings();
    const row = page.getByRole("row").filter({ hasText: firstGuest.email });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "Отменить запись" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`Отменить запись гостя ${firstGuest.name} на`);
    await dialog.getByRole("button", { name: "Отменить запись" }).click();

    await expect(page.getByText("Запись отменена")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: firstGuest.email })).toHaveCount(0);
  });

  await test.step("другой гость записывается на то же время", async () => {
    // The cancelled time is the first free slot again.
    expect(await bookFirstFreeSlot(secondGuest)).toBe(time);

    await openBookings();
    await expect(page.getByRole("row").filter({ hasText: secondGuest.email })).toHaveCount(1);
    await expect(page.getByRole("row").filter({ hasText: firstGuest.email })).toHaveCount(0);
  });
});
