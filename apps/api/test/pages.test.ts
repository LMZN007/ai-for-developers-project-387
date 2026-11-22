import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { startServer } from "./start-server.ts";

// A stand-in for `vite build` output: the production server serves it next to the API.
const INDEX_HTML = "<!doctype html><title>Календарь звонков</title><div id=root></div>";
const APP_JS = "console.log('app');";

let webRoot = "";
let server: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  webRoot = await mkdtemp(join(tmpdir(), "web-root-"));
  await mkdir(join(webRoot, "assets"));
  await writeFile(join(webRoot, "index.html"), INDEX_HTML);
  await writeFile(join(webRoot, "assets", "app.js"), APP_JS);
  server = await startServer({ webRoot });
});

afterAll(async () => {
  await server.close();
  await rm(webRoot, { recursive: true, force: true });
});

test("главная страница отдаётся как index.html собранного фронтенда", async () => {
  const response = await fetch(`${server.origin}/`);

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toMatch(/text\/html/);
  expect(await response.text()).toBe(INDEX_HTML);
});

test.each(["/book", "/book/consultation", "/admin/bookings", "/no-such-page"])(
  "адрес страницы %s при прямом открытии получает index.html, маршрут разбирает фронтенд",
  async (path) => {
    const response = await fetch(`${server.origin}${path}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(await response.text()).toBe(INDEX_HTML);
  },
);

test("файлы сборки отдаются как есть", async () => {
  const response = await fetch(`${server.origin}/assets/app.js`);

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toMatch(/javascript/);
  expect(await response.text()).toBe(APP_JS);
});

test("несуществующий файл получает 404, а не index.html", async () => {
  const response = await fetch(`${server.origin}/assets/missing.js`);

  expect(response.status).toBe(404);
});

test("API отвечает рядом со страницами по /api", async () => {
  const { data, response } = await server.client.GET("/health");

  expect(response.status).toBe(200);
  expect(data).toEqual({ status: "ok" });
});

test("неизвестный адрес под /api получает JSON 404, а не страницу", async () => {
  const response = await fetch(`${server.origin}/api/no-such-resource`);

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ code: "not_found", message: "Ресурс не найден" });
});
