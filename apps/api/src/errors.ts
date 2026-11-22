import type { components } from "@calls-booking/contract";
import type { FastifyError, FastifyInstance, FastifySchemaValidationError } from "fastify";

export type ApiError = components["schemas"]["ApiError"];
type FieldError = components["schemas"]["FieldError"];

/** A failure a handler reports on purpose; the error handler sends its body as is. */
export class ApiProblem extends Error {
  readonly statusCode: number;
  readonly body: ApiError;

  constructor(statusCode: number, body: ApiError) {
    super(body.message);
    this.statusCode = statusCode;
    this.body = body;
  }
}

export function validationProblem(fields: FieldError[]) {
  return new ApiProblem(400, {
    code: "validation_error",
    message: "Проверьте поля запроса",
    fields,
  });
}

// Every error leaves the server in the single contract format `{ code, message, fields? }`.
// With `pagesFallback` (the server also serves the built web app), an unknown page address such as
// `/book/consultation` gets index.html, and React Router shows the page or its own «не найдено».
export function registerErrorHandlers(
  app: FastifyInstance,
  { pagesFallback = false }: { pagesFallback?: boolean } = {},
) {
  app.setNotFoundHandler((request, reply) => {
    if (pagesFallback && isPageAddress(request.method, request.url)) {
      return reply.type("text/html").sendFile("index.html");
    }
    const body: ApiError = { code: "not_found", message: "Ресурс не найден" };
    return reply.code(404).send(body);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiProblem) {
      return reply.code(error.statusCode).send(error.body);
    }

    if (error.validation) {
      const problem = validationProblem(firstPerField(error.validation.map(toFieldError)));
      return reply.code(problem.statusCode).send(problem.body);
    }

    if (error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      const body: ApiError = {
        code: "validation_error",
        message: "Тело запроса должно быть в формате JSON",
      };
      return reply.code(400).send(body);
    }

    if (error.statusCode !== undefined && error.statusCode < 500) {
      const body: ApiError = { code: "validation_error", message: "Некорректный запрос" };
      return reply.code(400).send(body);
    }

    request.log.error(error);
    const body: ApiError = { code: "internal_error", message: "Внутренняя ошибка сервера" };
    return reply.code(500).send(body);
  });
}

// One value can break several schema rules (an empty slug fails both length and pattern);
// a form shows one message per field, so keep the first.
function firstPerField(fields: FieldError[]): FieldError[] {
  return fields.filter(
    (field, index) => fields.findIndex((other) => other.field === field.field) === index,
  );
}

function toFieldError(issue: FastifySchemaValidationError): FieldError {
  return { field: fieldName(issue), message: russianMessage(issue) };
}

// Ajv reports the field either in the path (`/guestEmail`) or, for a missing one, in params.
function fieldName(issue: FastifySchemaValidationError): string {
  const missing = issue.params["missingProperty"];
  if (typeof missing === "string") {
    return missing;
  }
  return issue.instancePath.replace(/^\//, "").replaceAll("/", ".");
}

function russianMessage(issue: FastifySchemaValidationError): string {
  const limit = issue.params["limit"];
  switch (issue.keyword) {
    case "required":
      return "Обязательное поле";
    case "minLength":
      return limit === 1 ? "Обязательное поле" : `Не короче ${String(limit)} символов`;
    case "maxLength":
      return `Не длиннее ${String(limit)} символов`;
    case "minimum":
      return `Не меньше ${String(limit)}`;
    case "maximum":
      return `Не больше ${String(limit)}`;
    case "pattern":
      return "Недопустимый формат";
    case "format":
      return issue.params["format"] === "email" ? "Некорректный email" : "Недопустимый формат";
    default:
      return "Некорректное значение";
  }
}

/** A browser navigation to a page: a GET outside the API that does not ask for a file (`.js`). */
function isPageAddress(method: string, url: string): boolean {
  const path = url.split("?")[0] ?? "";
  const lastSegment = path.split("/").at(-1) ?? "";
  return (
    method === "GET" && path !== "/api" && !path.startsWith("/api/") && !lastSegment.includes(".")
  );
}
