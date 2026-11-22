import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import App from "../src/App.tsx";
import { render } from "./render.tsx";

export function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

type Route = (request: Request) => Response | Promise<Response>;

/**
 * Replaces the network under the real SDK. Routes are keyed by "METHOD /path" as the API sees it
 * (without the `/api` prefix); an unknown route answers 404. Returns the requests made.
 */
export function stubApi(routes: Record<string, Route>) {
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      requests.push(request.clone());
      const path = new URL(request.url).pathname.replace(/^\/api/, "");
      const route = routes[`${request.method} ${path}`];
      return route
        ? route(request)
        : Response.json({ code: "not_found", message: "Ресурс не найден" }, { status: 404 });
    }),
  );
  return requests;
}
