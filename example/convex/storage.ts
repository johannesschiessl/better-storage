import { createUploadMutations } from "@example/sample-component";
import type { UploadRoutes } from "@example/sample-component";

export const storageRoutes = {
  images: {
    fileTypes: ["image/jpeg", "image/png", "image/gif"],
    maxFileSize: 1024 * 1024 * 5, // 5MB
    maxFileCount: 10,
    checkUpload: async (_ctx, _request) => {
      console.log("checkUpload");
      return {
        test: "test",
      };
    },
    onUploaded: async (_ctx, { request, storageIdsAndUrls, metadata }) => {
      console.log(request);
      console.log(storageIdsAndUrls);
      console.log(metadata);
      console.log("onUploaded");
      return {
        makes: "to client response",
      };
    },
  },
  pdfs: {
    fileTypes: ["application/pdf"],
    maxFileSize: 1024 * 1024 * 10, // 10MB
    maxFileCount: 10,
    checkUpload: async (_ctx, _request) => {
      console.log("checkUpload");
      return {
        test: "test",
      };
    },
    onUploaded: async (_ctx, { request, storageIdsAndUrls, metadata }) => {
      console.log(request);
      console.log(storageIdsAndUrls);
      console.log(metadata);
      console.log("onUploaded");
      return {
        makes: "to client response",
      };
    },
  },
} satisfies UploadRoutes;

export const { checkUpload, onUploaded } = createUploadMutations(storageRoutes);
