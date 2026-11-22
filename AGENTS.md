# AGENTS.md

Сервис записи на встречи (аналог Cal.com). Сценарий — в README.md.

## Команды

Инструменты и версии — в `mise.toml`. Запускать через mise, не глобальные `node`/`pnpm`.

- `mise install` — поставить инструменты; хук `postinstall` сам выполнит `mise run setup` (pnpm install и git-хуки hk).
- `mise run dev` — API (:3000) и web (:5173) в фоне как daemons; `mise daemons ls | logs api | stop`.
- `mise run start` — как в продакшене: сборка web и один сервер на `PORT` для API и страниц.
- `mise run check` — все проверки (oxfmt, oxlint, jactionlint, gen, typecheck, test, e2e). CI вызывает ту же команду. Запускать перед завершением задачи. Хук `pre-push` делает то же, но без e2e.
- `mise run e2e` — браузерный сценарий (Playwright, Chromium) с настоящим продакшен-сервером на порту 3100 (пустое хранилище); `E2E_BASE_URL=<адрес>` — тот же сценарий против уже запущенного сервиса. Chromium ставит `mise run setup`.
- `mise run lint`, `mise run format`, `mise run typecheck`, `mise run test` — по отдельности.
- `mise run gen` — пересобрать OpenAPI и SDK из контракта.
- Один тест: `pnpm --filter @calls-booking/api exec vitest run -t "<имя теста>"`.
- Агент в GitHub (Claude Code): комментарий `/oc <задача>` в issue или PR от владельца или участника с правом записи; воркфлоу — `.github/workflows/claude.yml`.

## Устройство

pnpm-монорепо, contract-first:

```
packages/contract/main.tsp ─tsp─▶ generated/openapi.yaml ─openapi-typescript─▶ generated/schema.d.ts
                                        │                                            │
apps/api: fastify-openapi-glue строит   ┘          apps/web: SDK createApiClient() ◀─┘
маршруты и валидацию из openapi.yaml
```

- API меняется только через `main.tsp`, затем `mise run gen`.
- Обработчики — `apps/api/src/handlers.ts`; имя метода = `operationId` из OpenAPI (например, `Health_check`).
- API отвечает по префиксу `/api` (пути контракта — без него). Web ходит в API только через SDK по `/api/*`; в dev Vite проксирует `/api` на :3000, в продакшене (`mise run start`, Docker) тот же сервер отдаёт и API, и собранные страницы (`WEB_ROOT`), порт — из `PORT`.
- Дымовой тест `apps/api/test/smoke.test.ts` поднимает сервер и вызывает его через SDK.
- Термины `GLOSSARY.md` в коде и контракте называются по-английски: Тип встречи — `EventType`, Слот — `Slot`, Запись — `Booking`, Гость — поля `guest*`, Конфликт — ответ 409 `time_conflict`; Доступность и Горизонт записи — константы в `apps/api/src/schedule.ts`. Это имена кода, а не синонимы из списков _Avoid_: в текстах интерфейса и в обсуждении — только русские термины глоссария.

## Правила

- Коммиты — Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`; scope — `api`, `web`, `contract`). Проверяется хуком `commit-msg`.
- Коммит, который выполняет тикет, ссылается на него номером в конце заголовка: `feat(api): запись на свободный слот (#14)`. GitHub превращает номер в ссылку, и по истории видно, какой коммит какую задачу делал.
- `packages/contract/generated/` не редактировать и не коммитить — он генерируется.
- `.github/workflows/hexlet-check.yml` и `.github/workflows/README.md` принадлежат Хекслету: не менять, не переименовывать репозиторий.
- Этот репозиторий на Render не подключён. Публичный сервис `calls-booking-umck` (адрес — в README.md) выкатывается из исходного проекта, его `render.yaml` лежит там же. Логи и деплои этого сервиса агент смотрит через MCP Render (`.mcp.json`, ключ — из `RENDER_API_KEY`, в репозиторий не коммитить).
- Версии и `CHANGELOG.md` ведёт release-please (Release PR после `feat`/`fix` в `main`): руками не править.
- Не отключать правила линтеров; исключение — только узкое (путь + правило) и с причиной.

## Agent skills

### Issue tracker

Задачи хранятся в GitHub Issues репозитория LMZN007/ai-for-developers-project-387 (через `gh`). См. `docs/agents/issue-tracker.md`.

### Triage labels

Стандартные метки: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. См. `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` в корне, решения в `docs/adr/`. См. `docs/agents/domain.md`.

## Исходный проект

Приложение перенесено из LMZN007/ai-for-developers-project-386; там остались спецификация и обсуждения решений, и новые задачи их не заменяют:

- спецификация — https://github.com/LMZN007/ai-for-developers-project-386/issues/12;
- карта решений — https://github.com/LMZN007/ai-for-developers-project-386/issues/1, решения по темам — тикеты #2–#11 того же репозитория (`gh issue view <n> --repo LMZN007/ai-for-developers-project-386`).

Короткая ссылка `#N` в этом репозитории ведёт на его собственный тикет. На тикеты исходного проекта ссылайтесь полным адресом. `CHANGELOG.md` до 0.2.0 включительно — история исходного проекта.
