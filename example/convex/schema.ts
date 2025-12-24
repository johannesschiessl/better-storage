import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  posts: defineTable({
    imageId: v.string(),
    text: v.string(),
  }),
});
