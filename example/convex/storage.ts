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
    onUploaded: async (ctx, { request, storageIdsAndUrls }) => {
      console.log("Request:", request);
      console.log("Files:", storageIdsAndUrls);
      return {
        success: true,
        message: "Images uploaded successfully",
      };
    },
  }),
}

export const storageComponent = createClient(components.storage, { routes });

export const { checkUpload, onUploaded } = createStorageMutations(routes);
