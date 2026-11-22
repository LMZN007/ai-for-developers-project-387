import { createApiClient } from "@calls-booking/contract";
import { API_PREFIX, buildApp, type AppOptions } from "../src/app.ts";

// Starts a real server on a random port; each call gets its own store, so tests stay independent.
export async function startServer(options: AppOptions = {}) {
  const app = buildApp(options);
  const origin = await app.listen({ port: 0, host: "127.0.0.1" });
  // The API answers under /api, as it does for the web app.
  const baseUrl = `${origin}${API_PREFIX}`;

  return {
    origin,
    baseUrl,
    client: createApiClient(baseUrl),
    close: () => app.close(),
  };
}
