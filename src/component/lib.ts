import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getFilesMetadata = query({
  args: {
    fileIds: v.array(v.id("files")),
  },
  handler: async (ctx, args) => {
    return await Promise.all(
      args.fileIds.map(async (fileId) => {
        const file = await ctx.db.get("files", fileId);
        if (file) {
          return file;
        }
      }),
    );
  },
});

export const createFilesMetadata = mutation({
  args: {
    storageIdsAndUrls: v.array(v.object({ id: v.string(), url: v.string() })),
    metadata: v.record(v.string(), v.any()),
    bucket: v.string(),
  },
  handler: async (ctx, args) => {
    await Promise.all(
      args.storageIdsAndUrls.map(async (storageIdAndUrl) => {
        await ctx.db.insert("files", {
          bucket: args.bucket,
          storageId: storageIdAndUrl.id,
          publicUrl: storageIdAndUrl.url,
          metadata: args.metadata,
        });
      }),
    );
  },
});

export const deleteFilesMetadata = mutation({
  args: {
    fileIds: v.array(v.id("files")),
  },
  handler: async (ctx, args) => {
    await Promise.all(
      args.fileIds.map(async (fileId) => {
        await ctx.db.delete("files", fileId);
      }),
    );
  },
});
