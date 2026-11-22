// Mocks from https://mantine.dev/guides/vitest/: jsdom lacks these browser APIs, but Mantine uses them.
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Guests see time in their browser's zone; tests fix it so they pass on any machine.
// Asia/Yekaterinburg (UTC+5) differs from the owner's Europe/Moscow on purpose.
process.env.TZ = "Asia/Yekaterinburg";

const { getComputedStyle } = window;
window.getComputedStyle = (elt) => getComputedStyle(elt);
window.HTMLElement.prototype.scrollIntoView = () => {};

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

if (!document.fonts) {
  Object.defineProperty(document, "fonts", {
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
}

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserver;
