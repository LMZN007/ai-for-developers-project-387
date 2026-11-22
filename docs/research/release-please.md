# Исследование: как подключить release-please в нашем монорепо

Тикет: [#10](https://github.com/LMZN007/ai-for-developers-project-386/issues/10) (карта [#1](https://github.com/LMZN007/ai-for-developers-project-386/issues/1)).
Дата проверки источников: 2026-11-17.

> Снимок исследования до принятия решений. Принятые решения — в тикете [release-please: токен, версия, CHANGELOG и момент подключения](https://github.com/LMZN007/ai-for-developers-project-386/issues/11), действующие настройки — в `release-please-config.json`. Уточнение после подключения: без тега `v0.0.0` release-please игнорирует версию из манифеста и берёт `1.0.0`, поэтому первую версию задаёт `initial-version`.

Это фактура для будущей спецификации. Рекомендация в конце — предложение, а не принятое решение.

## Коротко

- Актуальная мажорная версия action — **v5** (`googleapis/release-please-action@v5.0.0`, 2026-04-22, коммит `45996ed1f6d02564a971a2fa1b5860e934307cf7`). Единственное ломающее изменение v5 — переход на рантайм `node24`. README action до сих пор показывает примеры с `@v4`. [1][2]
- Для нашего репозитория подходит **один релиз на весь репозиторий** (пакет `"."`) через manifest-конфиг: `release-please-config.json` и `.release-please-manifest.json`. [3]
- С `GITHUB_TOKEN` release-please работает, но **CI (`ci.yml`, `on: push`) на release-PR не запустится**: события от `GITHUB_TOKEN` не создают новых запусков workflow. Обход — PAT или токен GitHub App. [2][5]
- В репозитории сейчас **выключена** настройка «Allow GitHub Actions to create and approve pull requests» (`can_approve_pull_request_reviews: false`), а права токена по умолчанию — только чтение. С `GITHUB_TOKEN` release-please не сможет открыть PR, пока настройку не включить. [2][6]
- Наши Conventional Commits из `hk` совместимы: `feat` → minor, `fix` → patch, `!`/`BREAKING CHANGE` → major; scope (`api`, `web`, `contract`) попадает в CHANGELOG. `hexlet-check.yml` менять не нужно. [4][8]
- Найден подводный камень: `hk` прогоняет `oxfmt` по `**/*.md` и `**/*.json`, значит сгенерированный `CHANGELOG.md` может не пройти `mise run check` в CI. [9]

## 1. Как устроен release-please (в двух словах)

release-please читает историю коммитов основной ветки, ищет Conventional Commits и держит открытым **Release PR** — запрос на слияние, где обновлены `CHANGELOG.md` и номер версии. Пока в main приходят новые коммиты, PR обновляется. Когда PR сливают, release-please ставит git-тег и создаёт GitHub Release. Публикацией в npm и т. п. он не занимается. [4]

Статус Release PR отображается метками: `autorelease: pending` (ждёт слияния), `autorelease: tagged` (слит, тег поставлен). [4]

Release PR создаётся только если с прошлого релиза есть «releasable units» — коммиты `feat`, `fix` или `deps`. Коммиты `chore`, `docs`, `test`, `refactor` сами по себе релиз не вызывают. [4]

## 2. Конфигурация для pnpm-монорепо

### Что есть в репозитории сейчас

- Корневой `package.json`: `"name": "calls-booking"`, `"private": true`, **поля `version` нет**.
- `apps/api`, `apps/web`, `packages/contract`: все `private: true`, без `version`. В npm ничего не публикуется.
- Сервис разворачивается как одно целое (API + web + контракт), пакеты отдельно не используются.

### Два варианта

|                      | Один релиз на репозиторий                        | Релиз по пакетам                                                                      |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `packages` в конфиге | `"."`                                            | `"apps/api"`, `"apps/web"`, `"packages/contract"`                                     |
| Теги                 | `v1.2.0` (при `include-component-in-tag: false`) | `api-v1.2.0`, `web-v0.3.0`, …                                                         |
| CHANGELOG            | один `CHANGELOG.md` в корне                      | по одному в каждом пакете                                                             |
| Версия считается     | по всем коммитам                                 | только по коммитам, менявшим файлы пакета [7]                                         |
| Плагины              | не нужны                                         | `node-workspace` (обновляет ссылки между пакетами), при желании `linked-versions` [3] |
| Когда оправдан       | приложение релизится целиком                     | пакеты публикуются/деплоятся независимо                                               |

Механизм manifest-конфига и создан для монорепо (один общий Release PR на все пакеты), но так же поддерживает один артефакт. [3]

Важно: при варианте «по пакетам» привязка коммита к пакету идёт **по путям изменённых файлов**, а не по scope в сообщении. [7] То есть `feat(api): …`, который поменял только `packages/contract/main.tsp`, попадёт в релиз контракта.

### Файлы (вариант «один релиз»)

`release-please-config.json` — настройки, должен лежать в вершине целевой ветки: [3]

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "include-component-in-tag": false,
  "packages": {
    ".": {}
  }
}
```

- `release-type: node` — стратегия для репозитория с `package.json` и `CHANGELOG.md`; она пропишет `version` в корневой `package.json` (обновляет также `package-lock.json`/`npm-shrinkwrap.json`, если они есть; `pnpm-lock.yaml` не трогает — версия корневого пакета в нём не хранится). [4][10]
- Альтернатива — `release-type: simple` (версия в `version.txt` + `CHANGELOG.md`), если не хочется трогать `package.json`. [4]
- `include-component-in-tag: false` — теги вида `v1.0.0` вместо `calls-booking-v1.0.0`; по умолчанию release-please ищет теги `<component>-v<version>`. [3]

`.release-please-manifest.json` — текущие версии, его ведёт сам release-please. Может быть пустым `{}` при первом запуске, но файл должен существовать. Вручную править — только при старте. [3]

```json
{ ".": "0.0.0" }
```

## 3. Права GitHub Actions и токен

### Права в workflow

Из README action: [2]

```yaml
permissions:
  contents: write # ветка release-please, коммиты, теги, релизы
  issues: write # метки autorelease: * (метки PR — это API issues)
  pull-requests: write # создание и обновление Release PR
```

Плюс настройка репозитория **Settings → Actions → General → «Allow GitHub Actions to create and approve pull requests»**. [2] В личных репозиториях по умолчанию она выключена, а права `GITHUB_TOKEN` по умолчанию — только чтение `contents` и `packages`. [6]

Проверено через API для нашего репозитория:

```
gh api repos/LMZN007/ai-for-developers-project-386/actions/permissions/workflow
{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}
```

`default_workflow_permissions: read` не мешает — права выдаются явно блоком `permissions:` в самом workflow (так уже сделано в `ci.yml`). А вот `can_approve_pull_request_reviews: false` для варианта с `GITHUB_TOKEN` придётся включить вручную в настройках.

### Запустится ли CI на Release PR

**С `GITHUB_TOKEN` — нет.** Документация GitHub: события, вызванные `GITHUB_TOKEN`, «will not create a new workflow run». Исключения: `workflow_dispatch` и `repository_dispatch` запускаются всегда; события `pull_request` с типами `opened`/`synchronize`/`reopened` создают запуски, но они **ждут ручного одобрения** человеком с правами записи. [5] README action прямо предупреждает: ресурсы, созданные release-please с `GITHUB_TOKEN` (тег, Release PR), не запускают другие workflow, и нужен PAT, если хочется CI на Release PR. [2]

Для нас конкретно:

- `ci.yml` срабатывает на `push` в любую ветку. Пуш release-please в ветку `release-please--branches--main` [11] сделан от `GITHUB_TOKEN` → `ci.yml` **не запустится**. Исключение для `pull_request` нас не касается — такого триггера в `ci.yml` нет.
- `hexlet-check.yml` срабатывает на `push` веток и тегов — по той же причине не запустится ни на ветке release-please, ни на теге релиза.
- После того как человек сольёт Release PR в main через интерфейс GitHub, пуш в main сделан от его имени → `ci.yml` и `hexlet-check.yml` запустятся как обычно.

### Варианты обхода

1. **Принять, что на Release PR нет CI.** Release PR меняет только `CHANGELOG.md`, `package.json` (версия) и манифест; полный `mise run check` всё равно пройдёт на main после слияния. Минус: ошибка формата в сгенерированном файле обнаружится уже в main (см. раздел 5).
2. **Fine-grained PAT** в секрете (например, `RELEASE_PLEASE_TOKEN`) и `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`. Права: Contents RW, Pull requests RW, Issues RW, только на этот репозиторий. Тогда пуши и теги вызовут `ci.yml` и `hexlet-check.yml`. Минус: токен привязан к личному аккаунту и истекает. [2][5]
3. **Токен GitHub App** через `actions/create-github-app-token` (актуальная мажорная — v3, последняя v3.3.0). Токен живёт 1 час и не привязан к личному аккаунту. Минус: нужно создать и установить App, хранить его ключ в секретах. [5][12]
4. **Ручной запуск CI из workflow release-please**: добавить в `ci.yml` триггер `workflow_dispatch` и после шага release-please вызывать `gh workflow run ci.yml --ref release-please--branches--main` (нужно `actions: write`). `workflow_dispatch` от `GITHUB_TOKEN` запускается всегда. [5] Минусы: правка `ci.yml` и больше логики; результат проверки привязан к коммиту ветки, но не к событию PR.

Если выбрать вариант 2 или 3, настройку «Allow GitHub Actions to create and approve pull requests» включать не обязательно: PR создаёт уже не `GITHUB_TOKEN`.

## 4. Совместимость с Conventional Commits и workflow Хекслета

### Conventional Commits из hk

- `hk.pkl` использует `Builtins.check_conventional_commit` без `allowed_scopes`, то есть разрешён любой scope. [8]
- Правила версий release-please: `fix:` → patch, `feat:` → minor, `feat!:`/`fix!:`/`refactor!:` и футер `BREAKING CHANGE` → major. [4]
- Пока версия `< 1.0.0`, можно смягчить: `bump-minor-pre-major: true` (breaking → minor), `bump-patch-for-minor-pre-major: true` (feat → patch). [3]
- Scope в CHANGELOG выводится жирным перед текстом: `* **api:** add booking endpoint`. Секции по умолчанию: видимы Features, Bug Fixes, Performance Improvements, Reverts; `docs`, `style`, `chore`, `refactor`, `test`, `build`, `ci` скрыты. Меняется через `changelog-sections`. [10][13]
- Заголовок Release PR по умолчанию — `chore(main): release 1.2.3` [7]. Scope `main` не из нашего списка (`api`, `web`, `contract`), но hk scope не ограничивает. Кроме того, release-please коммитит через API GitHub, локальные хуки hk на эти коммиты не действуют.
- Ссылки `closes #N` в CHANGELOG release-please заменяет на `refs #N`, чтобы слияние Release PR не закрывало issues. [10]
- README release-please настоятельно советует **squash-merge**: тогда одно сообщение PR = одна запись в CHANGELOG, и работает `BEGIN_COMMIT_OVERRIDE` для исправления заметок. В репозитории сейчас разрешены все три способа слияния (merge, squash, rebase). [4]
- Сменить версию вручную — коммит с футером `Release-As: x.y.z` в теле. [4]

### Workflow Хекслета

- `hexlet-check.yml` и `.github/workflows/README.md` трогать не нужно: release-please — это отдельный новый файл, например `.github/workflows/release-please.yml`.
- `hexlet-check.yml` реагирует и на теги (`tags: '**'`). С `GITHUB_TOKEN` теги релизов его не запустят; с PAT/App — запустят ещё одну проверку Хекслета на теге. Вреда в этом нет, просто лишний запуск.
- Новый workflow будет проверять `jactionlint` из `hk` (исключены только файлы Хекслета). В `ci.yml` действия закреплены по SHA с комментарием-версией — так же стоит закрепить и release-please-action: `googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7 # v5.0.0`. [1]

## 5. Подводный камень: oxfmt и сгенерированные файлы

Шаг `oxfmt` в `hk` проверяет `**/*.md`, `**/*.json` и другие форматы, а исключены только `pnpm-lock.yaml`, файлы Хекслета и вендорные скиллы. [9] `mise run check` (и CI) выполняет `hk check --all`, то есть проверит и `CHANGELOG.md`, и `.release-please-manifest.json`, и `release-please-config.json`.

release-please пишет `CHANGELOG.md` своим шаблоном (списки через `*`, свои отступы). oxfmt совместим с Prettier и, вероятно, захочет переписать такие списки на `-`. Если так, `mise run check` упадёт на main сразу после слияния первого Release PR. **Не проверено на практике** — это надо проверить на первом же Release PR (или прогнать `oxfmt --check` на примере CHANGELOG из любого репозитория с release-please).

Возможные решения:

- узкое исключение в `hk.pkl` — `CHANGELOG.md` из шага `oxfmt` с комментарием-причиной «файл генерирует release-please» (правила AGENTS.md такое допускают: путь + правило + причина);
- либо доп. шаг в workflow release-please, который форматирует ветку Release PR (сложнее, и с `GITHUB_TOKEN` всё равно без CI).

Манифест release-please записывает как JSON с отступом 2 пробела — скорее всего, совпадёт с oxfmt, но тоже стоит проверить.

## 6. Начальная версия и CHANGELOG

- Если в манифесте нет версии, release-please предложит **1.0.0** — это значение по умолчанию в базовой стратегии (`initialReleaseVersion()`), стратегия `node` его не переопределяет. [10] В документации manifest-releaser ещё написано «0.1.0 для node» — это устаревшая фраза, код говорит 1.0.0. [3][10]
- Явно задать первую версию: опция `initial-version` в конфиге или запись в манифесте. С записью `{".": "0.0.0"}` первый `feat` даст `0.1.0`, первый `fix` — `0.0.1`. [3]
- Первый Release PR соберёт в CHANGELOG **все** коммиты истории ветки. Ограничить: `bootstrap-sha` — полный SHA коммита, на котором остановиться (он сам в CHANGELOG не войдёт); после первого слитого Release PR опция игнорируется, её можно удалить. [3]
- Тегов и GitHub Releases в репозитории сейчас нет — конфликтов с существующими тегами не будет.
- Можно заранее положить пустой `CHANGELOG.md` или не класть — release-please создаст файл сам. [4]

## Рекомендация для этого репозитория (на обсуждение)

1. Один релиз на весь репозиторий: `packages: {".": {}}`, `release-type: node`, `include-component-in-tag: false` — теги `v0.1.0`. Пакеты private, публикуются вместе, релиз по пакетам сейчас ничего не даёт.
2. Стартовая версия `0.x`: манифест `{".": "0.0.0"}` и `bump-minor-pre-major: true`, чтобы случайный `!` не сделал `1.0.0` до готовности сервиса. `bootstrap-sha` — на текущую вершину main, если не нужен CHANGELOG за всю историю.
3. Отдельный `.github/workflows/release-please.yml`: триггер `push` в `main`, права `contents/issues/pull-requests: write`, action v5 закреплён по SHA.
4. Токен: для учебного проекта проще всего `GITHUB_TOKEN` + включить «Allow GitHub Actions to create and approve pull requests» и принять, что на Release PR нет CI (вариант 1). Если CI на Release PR обязателен — fine-grained PAT (вариант 2).
5. До первого релиза решить вопрос с `oxfmt` и `CHANGELOG.md` (раздел 5), иначе CI на main может покраснеть после слияния Release PR.
6. Сливать PR через squash-merge (можно оставить только его в настройках).

## Открытые вопросы для спецификации

- Нужен ли CI на Release PR (выбор между вариантами 1–4)?
- С какой версии стартуем и включаем ли историю до сегодняшнего дня в первый CHANGELOG?
- Переходим ли только на squash-merge?
- Что делать с форматированием `CHANGELOG.md` — исключение в `hk.pkl` или иное?

## Источники

1. Релиз [googleapis/release-please-action v5.0.0](https://github.com/googleapis/release-please-action/releases/tag/v5.0.0) и [`action.yml`](https://github.com/googleapis/release-please-action/blob/v5.0.0/action.yml) (`using: 'node24'`); SHA тега получен через `gh api repos/googleapis/release-please-action/commits/v5.0.0`.
2. [README googleapis/release-please-action](https://github.com/googleapis/release-please-action#readme) — разделы «GitHub Credentials», «Other Actions on Release Please PRs», «Workflow Permissions», «Action Inputs».
3. [docs/manifest-releaser.md](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md) — manifest-конфиг, bootstrap, `bootstrap-sha`, начальная версия, теги, плагины.
4. [README googleapis/release-please](https://github.com/googleapis/release-please#readme) — Release PR, метки, Conventional Commits, squash-merge, `Release-As`, releasable units, типы релизов.
5. GitHub Docs: [GITHUB_TOKEN → When GITHUB_TOKEN triggers workflow runs](https://docs.github.com/en/actions/concepts/security/github_token).
6. GitHub Docs: [Managing GitHub Actions settings for a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository) — «Allow GitHub Actions to create and approve pull requests», права `GITHUB_TOKEN` по умолчанию.
7. [docs/customizing.md](https://github.com/googleapis/release-please/blob/main/docs/customizing.md) — пути пакетов (учитываются коммиты, затронувшие путь), шаблон заголовка Release PR.
8. `hk.pkl` в этом репозитории и [hk v2.12.0: check_conventional_commit.pkl](https://github.com/jdx/hk/blob/v2.12.0/pkl/builtins/check_conventional_commit.pkl) (`allowed_scopes` по умолчанию `null` — любой scope).
9. [hk v2.12.0: oxfmt.pkl](https://github.com/jdx/hk/blob/v2.12.0/pkl/builtins/oxfmt.pkl) — список проверяемых расширений, включая `**/*.md` и `**/*.json`.
10. Исходники release-please: [src/strategies/base.ts](https://github.com/googleapis/release-please/blob/main/src/strategies/base.ts) (`initialReleaseVersion()` → `1.0.0`), [src/strategies/node.ts](https://github.com/googleapis/release-please/blob/main/src/strategies/node.ts) (обновляемые файлы), [src/changelog-notes/default.ts](https://github.com/googleapis/release-please/blob/main/src/changelog-notes/default.ts) (scope, `closes` → `refs`).
11. [src/util/branch-name.ts](https://github.com/googleapis/release-please/blob/main/src/util/branch-name.ts) — имя ветки `release-please--branches--<target>[--components--<component>]`.
12. [actions/create-github-app-token](https://github.com/actions/create-github-app-token) — README и релиз v3.3.0.
13. [conventional-changelog-conventionalcommits: constants.js](https://github.com/conventional-changelog/conventional-changelog/blob/master/packages/conventional-changelog-conventionalcommits/src/constants.js) — какие типы видимы/скрыты по умолчанию (release-please зависит от `^6.0.0` этого пресета).
