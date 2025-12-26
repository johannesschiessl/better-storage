/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

describe("component lib", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("createFilesMetadata and getFilesMetadata", async () => {
    const t = initConvexTest();

    // Create file metadata
    await t.mutation(api.lib.createFilesMetadata, {
      storageIdsAndUrls: [
        { id: "storage-id-1", url: "https://example.com/file1.jpg" },
      ],
      metadata: { category: "test" },
      bucket: "images",
    });

    // Query all files to find the created one
    const files = await t.run(async (ctx) => {
      return await ctx.db.query("files").collect();
    });

    expect(files).toHaveLength(1);
    expect(files[0].bucket).toBe("images");
    expect(files[0].storageId).toBe("storage-id-1");
    expect(files[0].publicUrl).toBe("https://example.com/file1.jpg");
    expect(files[0].metadata).toEqual({ category: "test" });
  });

  test("getFilesMetadata returns files by id", async () => {
    const t = initConvexTest();

    // Create file metadata
    await t.mutation(api.lib.createFilesMetadata, {
      storageIdsAndUrls: [
        { id: "storage-id-1", url: "https://example.com/file1.jpg" },
      ],
      metadata: { category: "test" },
      bucket: "images",
    });

    // Get the file ID
    const files = await t.run(async (ctx) => {
      return await ctx.db.query("files").collect();
    });
    const fileId = files[0]._id;

    // Query by ID
    const result = await t.query(api.lib.getFilesMetadata, {
      fileIds: [fileId],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.bucket).toBe("images");
  });

  test("deleteFilesMetadata removes files", async () => {
    const t = initConvexTest();

    // Create file metadata
    await t.mutation(api.lib.createFilesMetadata, {
      storageIdsAndUrls: [
        { id: "storage-id-1", url: "https://example.com/file1.jpg" },
      ],
      metadata: {},
      bucket: "images",
    });

    // Get the file ID
    const files = await t.run(async (ctx) => {
      return await ctx.db.query("files").collect();
    });
    const fileId = files[0]._id;

    // Delete the file
    await t.mutation(api.lib.deleteFilesMetadata, {
      fileIds: [fileId],
    });

    // Verify deletion
    const remainingFiles = await t.run(async (ctx) => {
      return await ctx.db.query("files").collect();
    });
    expect(remainingFiles).toHaveLength(0);
  });
});
