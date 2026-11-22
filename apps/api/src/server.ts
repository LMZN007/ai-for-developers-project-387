import { resolve } from "node:path";
import { buildApp } from "./app.ts";
import { demoData } from "./demo-data.ts";
import { createMemoryStore } from "./store.ts";

// PORT is what hosting platforms and the Docker image set; API_PORT is the dev setting in mise.toml.
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
// 127.0.0.1 on a developer machine; the Docker image sets HOST=0.0.0.0 to accept outside traffic.
const host = process.env.HOST ?? "127.0.0.1";
// The built web app to serve next to the API (the Docker image sets it); unset in dev.
const webRoot = process.env.WEB_ROOT ? resolve(process.env.WEB_ROOT) : undefined;
// `pnpm run dev` (used by `mise run dev`) passes --demo-data; a plain start begins empty.
const withDemoData = process.argv.includes("--demo-data");

const app = buildApp({
  store: createMemoryStore(withDemoData ? demoData : {}),
  webRoot,
  fastify: { logger: true },
});

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
