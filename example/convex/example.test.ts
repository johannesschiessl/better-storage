import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { storageComponent } from "./storage";

describe("example", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  test("storage client is properly configured", () => {
    expect(storageComponent).toBeDefined();
    expect(storageComponent.registerRoutes).toBeInstanceOf(Function);
    expect(storageComponent.getFile).toBeInstanceOf(Function);
    expect(storageComponent.listFiles).toBeInstanceOf(Function);
    expect(storageComponent.deleteFile).toBeInstanceOf(Function);
    expect(storageComponent.deleteFiles).toBeInstanceOf(Function);
  });
});
