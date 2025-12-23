import { httpActionGeneric, type FunctionReference } from "convex/server";
import type { GenericDataModel, HttpRouter } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import type { Doc, Id } from "../component/_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "../component/_generated/server.js";

function getAllowedOrigin(request: Request) {
  return request.headers.get("Origin") ?? process.env.SITE_URL ?? "*"; // TODO: make this actually secure...
}

function buildCorsHeaders(request: Request) {
  const origin = getAllowedOrigin(request);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Content-Type, Digest, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "origin",
  };
  if (origin !== "*") {
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

interface UploadRoute {
  name: string;
  allowedMimeTypes: string[];
  maxFileSize: number;
  maxFileCount: number;
  minFileCount: number;
  //checkUpload: FunctionReference<"mutation", "internal", { request: FormData }>;
  //onUploaded: FunctionReference<"mutation", "internal", { request: FormData, storageIdsAndUrls: { id: Id<"_storage">, url: string }[], metadata: Record<string, any> }>;
}
interface registerRoutesProps {
  pathPrefix?: string;
  routes: UploadRoute[];
}

export function registerRoutes(
  http: HttpRouter,
  component: ComponentApi,
  { pathPrefix = "/storage", routes }: registerRoutesProps,
) {
  for (const route of routes) {
    http.route({
      path: `${pathPrefix}/${route.name}/upload`,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const formData = await request.formData();
        const files = formData
          .getAll("files")
          .filter(
            (value): value is File => value instanceof File && value.size > 0,
          );

        if (files.length === 0) {
          return new Response(JSON.stringify({ error: "No files uploaded" }), {
            status: 400,
          });
        }

        if (files.length > route.maxFileCount) {
          return new Response(
            JSON.stringify({ error: "Too many files uploaded" }),
            { status: 400 },
          );
        }

        if (files.length < route.minFileCount) {
          return new Response(
            JSON.stringify({ error: "Too few files uploaded" }),
            { status: 400 },
          );
        }

        for (const file of files) {
          if (!route.allowedMimeTypes.includes(file.type)) {
            return new Response(
              JSON.stringify({ error: "Invalid file type" }),
              { status: 400 },
            );
          }

          if (file.size > route.maxFileSize) {
            return new Response(JSON.stringify({ error: "File too large" }), {
              status: 400,
            });
          }
        }

        const requestWithoutFiles = new FormData();
        for (const [key, value] of formData.entries()) {
          if (key !== route.name) {
            requestWithoutFiles.append(key, value);
          }
        }

        const metadata = {};

        //const metadata = await ctx.runMutation(route.checkUpload, { request: requestWithoutFiles });

        const storageIdsAndUrls = await Promise.all(
          files.map(async (file) => {
            const storageId = await ctx.storage.store(file);
            const storageUrl = await ctx.storage.getUrl(storageId);

            if (!storageUrl) {
              throw new Error("Failed to get URL for uploaded file"); // TODO: return response with error
            }

            return { id: storageId, url: storageUrl };
          }),
        );

        await ctx.runMutation(component.lib.createFilesMetadata, {
          storageIdsAndUrls,
          metadata,
          bucket: route.name,
        });

        const result = null;

        // const result = await ctx.runMutation(route.onUploaded, { request: requestWithoutFiles, storageIdsAndUrls, metadata });

        return new Response(
          result
            ? JSON.stringify(result)
            : "File(s) uploaded successfully",
          { status: 200 },
        );
      }),
    });

    http.route({
      path: `${pathPrefix}/${route.name}/upload`,
      method: "OPTIONS",
      handler: httpActionGeneric(async (_, request) => {
        const headers = request.headers;
        if (
          headers.get("Origin") !== null &&
          headers.get("Access-Control-Request-Method") !== null &&
          headers.get("Access-Control-Request-Headers") !== null
        ) {
          return new Response(null, {
            headers: new Headers(buildCorsHeaders(request)),
          });
        } else {
          return new Response();
        }
      }),
    });
  }
}

export const createClient = (component: ComponentApi) => {
  return {
    async getFile(
      ctx: QueryCtx,
      fileId: Id<"files">,
    ): Promise<Doc<"files"> | null> {
      return await ctx.runQuery(component.lib.getFilesMetadata, {
        fileIds: [fileId],
      });
    },
    async listFiles(
      ctx: QueryCtx,
      fileIds: Id<"files">[],
    ): Promise<Doc<"files">[]> {
      return await ctx.runQuery(component.lib.getFilesMetadata, { fileIds });
    },
    async deleteFile(ctx: MutationCtx, fileId: Id<"files">): Promise<void> {
      const file = await ctx.runQuery(component.lib.getFilesMetadata, {
        fileIds: [fileId],
      });
      await ctx.storage.delete(file.storageId as Id<"_storage">);
      return await ctx.runMutation(component.lib.deleteFilesMetadata, {
        fileIds: [fileId],
      });
    },
    async deleteFiles(ctx: MutationCtx, fileIds: Id<"files">[]): Promise<void> {
      const files = await ctx.runQuery(component.lib.getFilesMetadata, {
        fileIds,
      });
      await Promise.all(
        files.map(async (file: Doc<"files">) => {
          await ctx.storage.delete(file.storageId as Id<"_storage">);
        }),
      );
      return await ctx.runMutation(component.lib.deleteFilesMetadata, {
        fileIds,
      });
    },
  };
};
