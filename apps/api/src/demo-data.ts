import type { StoreContents } from "./store.ts";

// Loaded only by `mise run dev`, so there is something to show; tests start from an empty store.
export const demoData: StoreContents = {
  eventTypes: [
    {
      slug: "intro",
      title: "Знакомство",
      description: "Короткий созвон, чтобы познакомиться и понять, чем я могу помочь.",
      durationMinutes: 15,
    },
    {
      slug: "consultation",
      title: "Консультация",
      description: "Разбор вашего вопроса с конкретными рекомендациями.",
      durationMinutes: 30,
    },
    {
      slug: "deep-dive",
      title: "Глубокое погружение",
      durationMinutes: 60,
    },
  ],
};
