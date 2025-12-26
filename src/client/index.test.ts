import { describe, expect, test } from "vitest";
import { createClient, createStorageMutations, route } from "./index.js";
import { components } from "./setup.test.js";

const routes = {
  images: route({
    fileTypes: ["image/jpeg", "image/png"],
    maxFileSize: 1024 * 1024 * 5,
    maxFileCount: 10,
    checkUpload: async ({ ctx: _ctx }) => {
      return { uploadedAt: Date.now() };
    },
    onUploaded: async ({
      ctx: _ctx,
      storageIdsAndUrls: _storageIdsAndUrls,
      metadata,
    }) => {
      return { success: true, uploadedAt: metadata.uploadedAt };
    },
  }),
};

const storageMutations = createStorageMutations(routes);
const storage = createClient(components.storage, { routes });

describe("client tests", () => {
  test("should create storage client with routes", () => {
    expect(storage).toBeDefined();
    expect(storage.registerRoutes).toBeInstanceOf(Function);
    expect(storage.getFile).toBeInstanceOf(Function);
    expect(storage.listFiles).toBeInstanceOf(Function);
    expect(storage.deleteFile).toBeInstanceOf(Function);
    expect(storage.deleteFiles).toBeInstanceOf(Function);
  });

  test("should create storage mutations", () => {
    expect(storageMutations).toBeDefined();
    expect(storageMutations.checkUpload).toBeDefined();
    expect(storageMutations.onUploaded).toBeDefined();
  });

  test("route should preserve config", () => {
    const config = route({
      fileTypes: ["application/pdf"],
      maxFileSize: 1024,
      maxFileCount: 5,
    });
    expect(config.fileTypes).toEqual(["application/pdf"]);
    expect(config.maxFileSize).toBe(1024);
    expect(config.maxFileCount).toBe(5);
  });
});
