import {
  httpActionGeneric,
  internalMutationGeneric,
  type FunctionReference,
} from "convex/server";
import type { HttpRouter } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import type { Doc, Id } from "../component/_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "../component/_generated/server.js";
import { v } from "convex/values";

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

type UploadRouteConfig<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
  UploadResult = unknown,
> = {
  fileTypes: string[];
  maxFileSize: number;
  maxFileCount: number;
  checkUpload?: (
    ctx: MutationCtx,
    request: NormalizedFormData,
  ) => Promise<Metadata> | Metadata;
  onUploaded?: (
    ctx: MutationCtx,
    args: {
      request: NormalizedFormData;
      storageIdsAndUrls: StorageIdAndUrl[];
      metadata: Metadata;
    },
  ) => Promise<UploadResult> | UploadResult;
};
type FormValue = FormDataEntryValue;
type NormalizedFormData = Record<string, string | string[]>;
type StorageIdAndUrl = { id: Id<"_storage">; url: string };

export type UploadRoutes<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
  UploadResult = unknown,
> = Record<string, UploadRouteConfig<Metadata, UploadResult>>;

type RouteNames<Routes extends UploadRoutes> = Extract<keyof Routes, string>;

type UploadCheckArgs<Routes extends UploadRoutes> = {
  route: RouteNames<Routes> | string;
  request: NormalizedFormData;
};

type UploadOnUploadedArgs<Routes extends UploadRoutes> =
  UploadCheckArgs<Routes> & {
    storageIdsAndUrls: StorageIdAndUrl[];
    metadata: Record<string, unknown>;
  };

type UploadMutations<Routes extends UploadRoutes> = {
  checkUpload: FunctionReference<
    "mutation",
    "internal",
    UploadCheckArgs<Routes>,
    Record<string, unknown>
  >;
  onUploaded: FunctionReference<
    "mutation",
    "internal",
    UploadOnUploadedArgs<Routes>,
    unknown
  >;
};

interface RegisterRoutesProps<Routes extends UploadRoutes> {
  pathPrefix?: string;
  routes: Routes;
  uploads?: UploadMutations<Routes>;
}

function isFile(value: FormValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    "type" in value &&
    "arrayBuffer" in value
  );
}

function normalizeFormData(formData: FormData): NormalizedFormData {
  const request: NormalizedFormData = {};

  for (const [key, value] of formData.entries()) {
    if (isFile(value)) {
      continue;
    }
    if (request[key] === undefined) {
      request[key] = value;
    } else {
      const current = request[key];
      request[key] = Array.isArray(current) ? [...current, value] : [current, value];
    }
  }

  return request;
}

function isMimeAllowed(fileType: string, allowedTypes: string[]) {
  return allowedTypes.some((type) =>
    type.endsWith("/*")
      ? fileType.startsWith(type.slice(0, -1))
      : type === fileType,
  );
}

export function createUploadMutations<
  const Routes extends UploadRoutes,
>(routes: Routes) {
  const routesByName = new Map(Object.entries(routes));

  const checkUpload = internalMutationGeneric({
    args: {
      route: v.string(),
      request: v.record(v.string(), v.union(v.string(), v.array(v.string()))),
    },
    handler: async (ctx, args) => {
      const route = routesByName.get(args.route);
      if (!route) {
        throw new Error(`Unknown route "${args.route}"`);
      }
      if (!route.checkUpload) {
        return {};
      }
      return await route.checkUpload(ctx as MutationCtx, args.request);
    },
  });

  const onUploaded = internalMutationGeneric({
    args: {
      route: v.string(),
      request: v.record(v.string(), v.union(v.string(), v.array(v.string()))),
      storageIdsAndUrls: v.array(
        v.object({ id: v.id("_storage"), url: v.string() }),
      ),
      metadata: v.any(),
    },
    handler: async (ctx, args) => {
      const route = routesByName.get(args.route);
      if (!route) {
        throw new Error(`Unknown route "${args.route}"`);
      }
      if (!route.onUploaded) {
        return null;
      }
      return await route.onUploaded(ctx as MutationCtx, {
        request: args.request,
        storageIdsAndUrls: args.storageIdsAndUrls as StorageIdAndUrl[],
        metadata: args.metadata as Record<string, unknown>,
      });
    },
  });

  return { checkUpload, onUploaded };
}

export function registerRoutes<const Routes extends UploadRoutes>(
  http: HttpRouter,
  component: ComponentApi,
  {
    pathPrefix = "/storage",
    routes,
    uploads,
  }: RegisterRoutesProps<Routes>,
) {
  for (const routeName of Object.keys(routes) as RouteNames<Routes>[]) {
    const route = routes[routeName];
    http.route({
      path: `${pathPrefix}/${routeName}/upload`,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const formData = await request.formData();
        const files = formData
          .getAll("files")
          .filter((value): value is File => isFile(value) && value.size > 0);

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

        for (const file of files) {
          if (!isMimeAllowed(file.type, route.fileTypes)) {
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

        const requestWithoutFiles = normalizeFormData(formData);

        const metadata: Record<string, unknown> =
          uploads && route.checkUpload
            ? await ctx.runMutation(uploads.checkUpload, {
                route: routeName,
                request: requestWithoutFiles,
              })
            : {};

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
          bucket: routeName,
        });

        const result =
          uploads && route.onUploaded
            ? await ctx.runMutation(uploads.onUploaded, {
                route: routeName,
                request: requestWithoutFiles,
                storageIdsAndUrls,
                metadata,
              })
            : null;

        return new Response(
          result
            ? JSON.stringify(result)
            : "File(s) uploaded successfully",
          { status: 200 },
        );
      }),
    });

    http.route({
      path: `${pathPrefix}/${routeName}/upload`,
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
