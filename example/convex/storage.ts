import {
  createClient,
  createStorageMutations,
  route,
} from "@example/sample-component";
import { components } from "./_generated/api";

export const routes = {
  imagePost: route({
    fileTypes: ["image/*"],
    maxFileSize: 1024 * 1024 * 5, // 5MB
    checkUpload: async (ctx, request) => {
      console.log("Request:", request);
      return { test: "test" as const };
    },
    onUploaded: async (ctx, { request, storageIdsAndUrls, metadata }) => {
      console.log("Request:", request);
      console.log("Files:", storageIdsAndUrls);
      return { success: true, test: metadata.test };
    },
  }),
};

export const storageComponent = createClient(components.storage, { routes });

export const { checkUpload, onUploaded } = createStorageMutations(routes);
