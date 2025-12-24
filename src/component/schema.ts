import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  files: defineTable({
    bucket: v.string(),
    storageId: v.string(),
    publicUrl: v.string(),
    metadata: v.record(v.string(), v.any()),
  }).index("by_bucket", ["bucket"]),
});
