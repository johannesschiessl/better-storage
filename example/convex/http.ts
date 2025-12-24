import { httpRouter } from "convex/server";
import { registerRoutes } from "@example/sample-component";
import { components, internal } from "./_generated/api";
import { storageRoutes } from "./storage";

const http = httpRouter();

registerRoutes(http, components.storage, {
  routes: storageRoutes,
  uploads: internal.storage,
});

export default http;
