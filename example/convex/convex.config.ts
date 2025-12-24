import { defineApp } from "convex/server";
import betterStorage from "@example/sample-component/convex.config.js";

const app = defineApp();
app.use(betterStorage, { name: "storage" });

export default app;
