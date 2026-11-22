import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyServerOptions } from "fastify";
import openapiGlue from "fastify-openapi-glue";
import { registerErrorHandlers } from "./errors.ts";
import { createHandlers } from "./handlers.ts";
import { createMemoryStore, type Store } from "./store.ts";

const specification = fileURLToPath(import.meta.resolve("@calls-booking/contract/openapi.yaml"));

/** The contract's paths live under this prefix; the web app calls `/api/*` in dev and production. */
export const API_PREFIX = "/api";

export interface AppOptions {
  /** Where data lives; an empty in-memory store by default. */
  store?: Store;
  /** Current moment; the real clock by default, tests pass a fixed one. */
  now?: () => Date;
  /**
   * Directory of the built web app (`vite build`). When set, the same server serves its pages
   * next to the API, as in the Docker image; in dev Vite serves them instead.
   */
  webRoot?: string;
  fastify?: FastifyServerOptions;
}

export function buildApp({
  store = createMemoryStore(),
  now = () => new Date(),
  webRoot,
  fastify = {},
}: AppOptions = {}) {
  // allErrors: report every invalid field at once, so a form can mark all of them.
  // coerceTypes off: a value of the wrong JSON type ("30" for a number) is an error, as the
  // contract says, not something to convert. Path parameters are strings, so nothing needs it.
  const app = Fastify({
    ajv: { customOptions: { allErrors: true, coerceTypes: false } },
    ...fastify,
  });
  // The contract only describes JSON bodies, and the schema only validates parsed JSON: a plain-text
  // body would reach a handler unchecked. Without this parser such a request is rejected up front.
  app.removeContentTypeParser("text/plain");
  // Set before the routes are registered so the plugins inherit the handlers.
  registerErrorHandlers(app, { pagesFallback: webRoot !== undefined });
  app.register(openapiGlue, {
    specification,
    serviceHandlers: createHandlers({ store, now }),
    prefix: API_PREFIX,
  });
  if (webRoot !== undefined) {
    app.register(fastifyStatic, { root: webRoot });
  }
  return app;
}
