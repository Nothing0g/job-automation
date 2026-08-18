import { describe, expect, it, vi } from "vitest";

const registerOAuthRoutes = vi.fn();

vi.mock("../portable/config", () => ({
  portableAuthEnabled: () => true,
}));

vi.mock("./oauth", () => ({ registerOAuthRoutes }));

describe("portable API application bootstrap", () => {
  it("does not register the managed-platform OAuth callback in portable mode", async () => {
    const { createApiApp } = await import("./app");

    await expect(createApiApp()).resolves.toBeDefined();
    expect(registerOAuthRoutes).not.toHaveBeenCalled();
  });
});
