import type { components } from "@calls-booking/contract";
import { api } from "./api.ts";
import { useLoad } from "./useLoad.ts";

export type EventType = components["schemas"]["EventType"];

const loadEventTypes = () => api.GET("/event-types").then(({ data }) => data);

/** Loads the event types; `retry` repeats the request after a failure. */
export function useEventTypes() {
  return useLoad(loadEventTypes);
}
