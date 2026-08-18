import { describe, expect, it, vi } from "vitest";

const mockApp = vi.fn();
const createApiApp = vi.fn(() => mockApp);
const serveStatic = vi.fn();

vi.mock("../server/_core/app", () => ({ createApiApp }));
vi.mock("../server/_core/vite", () => ({ serveStatic }));

describe("Vercel API handler", () => {
  it("initializes the Express app lazily and installs static delivery after the API app", async () => {
    const { initializeApiApp } = await import("./index");

    await expect(initializeApiApp()).resolves.toBe(mockApp);
    expect(createApiApp).toHaveBeenCalledTimes(1);
    expect(serveStatic).toHaveBeenCalledWith(mockApp);
  });
});
