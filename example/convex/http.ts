import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { storageComponent } from "./storage";

const http = httpRouter();

storageComponent.registerRoutes(http, { storageFunctions: internal.storage });

export default http;
