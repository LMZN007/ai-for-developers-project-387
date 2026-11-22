import { createApiClient } from "@calls-booking/contract";

export const api = createApiClient(`${window.location.origin}/api`);
