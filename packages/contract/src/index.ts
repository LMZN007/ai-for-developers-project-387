import createClient from "openapi-fetch";
import type { paths } from "../generated/schema.js";

export type { paths, components } from "../generated/schema.js";

export function createApiClient(baseUrl: string) {
  // Look `fetch` up on every request (openapi-fetch otherwise captures it once at creation),
  // so tests can stub the global `fetch` after the client module has loaded.
  return createClient<paths>({ baseUrl, fetch: (request) => globalThis.fetch(request) });
}
