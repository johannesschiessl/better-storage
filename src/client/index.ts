import {
  httpActionGeneric,
  internalMutationGeneric,
  type FunctionReference,
  type HttpRouter,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import type { Doc, Id } from "../component/_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "../component/_generated/server.js";
import { v } from "convex/values";

type NormalizedFormData = Record<string, string | string[]>;
type StorageIdAndUrl = { id: Id<"_storage">; url: string };

/**
 * Configuration for a single upload route.
 * @template Metadata - The type returned by checkUpload and passed to onUploaded
 * @template Result - The type returned by onUploaded
 */
export type UploadRouteConfig<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
  Result = unknown,
> = {
  /** Allowed MIME types (supports wildcards like "image/*") */
  fileTypes: string[];
  /** Maximum file size in bytes */
  maxFileSize: number;
  /** Maximum number of files per upload */
  maxFileCount?: number;
  /**
   * Called before upload to validate and prepare metadata.
   * Return value is passed to onUploaded as `metadata`.
   */
  checkUpload?: (
    ctx: MutationCtx,
    request: NormalizedFormData,
  ) => Promise<Metadata> | Metadata;
  /**
   * Called after files are successfully uploaded.
   * Return value is sent back to the client.
   */
  onUploaded?: (
    ctx: MutationCtx,
    args: {
      request: NormalizedFormData;
      storageIdsAndUrls: StorageIdAndUrl[];
      metadata: Metadata;
    },
  ) => Promise<Result> | Result;
};

/** A collection of named upload routes */
export type UploadRoutes = Record<string, UploadRouteConfig<any, any>>;

type UploadCheckArgs = {
  route: string;
  request: NormalizedFormData;
};

type UploadOnUploadedArgs = UploadCheckArgs & {
  storageIdsAndUrls: StorageIdAndUrl[];
  metadata: Record<string, unknown>;
};

type StorageFunctions = {
  checkUpload: FunctionReference<
    "mutation",
    "internal",
    UploadCheckArgs,
    Record<string, unknown>
  >;
  onUploaded: FunctionReference<
    "mutation",
    "internal",
    UploadOnUploadedArgs,
    unknown
  >;
};



function getAllowedOrigin(request: Request): string {
  return request.headers.get("Origin") ?? process.env.SITE_URL ?? "*";
}

function buildCorsHeaders(request: Request): Record<string, string> {
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

function isFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    "type" in value &&
    "arrayBuffer" in value
  );
}

function normalizeFormData(formData: FormData): NormalizedFormData {
  const result: NormalizedFormData = {};

  for (const [key, value] of formData.entries()) {
    if (isFile(value)) continue;

    const existing = result[key];
    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[key] = [existing, value];
    }
  }

  return result;
}

function isMimeTypeAllowed(fileType: string, allowedTypes: string[]): boolean {
  return allowedTypes.some((allowedType) => {
    if (allowedType.endsWith("/*")) {
      const prefix = allowedType.slice(0, -1);
      return fileType.startsWith(prefix);
    }
    return allowedType === fileType;
  });
}

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function errorResponse(
  error: string,
  status: number,
  corsHeaders?: Record<string, string>,
): Response {
  return jsonResponse({ error }, status, corsHeaders);
}



/**
 * Helper function to define a route with full type inference.
 * The return type of `checkUpload` automatically becomes the type of
 * `metadata` in `onUploaded`.
 *
 * @example
 * ```ts
 * const routes = {
 *   images: route({
 *     fileTypes: ["image/*"],
 *     maxFileSize: 5 * 1024 * 1024,
 *     maxFileCount: 10,
 *     checkUpload: async (ctx, request) => {
 *       return { userId: "123" };
 *     },
 *     onUploaded: async (ctx, { metadata }) => {
 *       // metadata is typed as { userId: string }
 *       console.log(metadata.userId);
 *     },
 *   }),
 * };
 * ```
 */
export function route<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
  Result = unknown,
>(
  config: UploadRouteConfig<Metadata, Result>,
): UploadRouteConfig<Metadata, Result> {
  return config;
}



/**
 * Creates internal mutations for handling upload validation and post-upload processing.
 * These mutations must be exported from your storage file.
 */
export function createStorageMutations<const Routes extends UploadRoutes>(
  routes: Routes,
) {
  const routeMap = new Map(Object.entries(routes));

  return {
    checkUpload: internalMutationGeneric({
      args: {
        route: v.string(),
        request: v.record(v.string(), v.union(v.string(), v.array(v.string()))),
      },
      handler: async (ctx, args): Promise<Record<string, unknown>> => {
        const route = routeMap.get(args.route);
        if (!route) {
          throw new Error(`Unknown upload route: "${args.route}"`);
        }
        if (!route.checkUpload) {
          return {};
        }
        return await route.checkUpload(ctx as MutationCtx, args.request);
      },
    }),

    onUploaded: internalMutationGeneric({
      args: {
        route: v.string(),
        request: v.record(v.string(), v.union(v.string(), v.array(v.string()))),
        storageIdsAndUrls: v.array(
          v.object({ id: v.id("_storage"), url: v.string() }),
        ),
        metadata: v.any(),
      },
      handler: async (ctx, args): Promise<unknown> => {
        const route = routeMap.get(args.route);
        if (!route) {
          throw new Error(`Unknown upload route: "${args.route}"`);
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
    }),
  };
}



function registerHttpRoutes<const Routes extends UploadRoutes>(
  http: HttpRouter,
  options: {
    component: ComponentApi;
    storageFunctions: StorageFunctions;
    routes: Routes;
    pathPrefix: string;
  },
): void {
  const { component, storageFunctions, routes, pathPrefix } = options;

  for (const routeName of Object.keys(routes)) {
    const route = routes[routeName];
    const uploadPath = `${pathPrefix}/${routeName}/upload`;

    // POST handler for file uploads
    http.route({
      path: uploadPath,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const corsHeaders = buildCorsHeaders(request);

        try {
          const formData = await request.formData();
          const files = formData
            .getAll("files")
            .filter((value): value is File => isFile(value) && value.size > 0);

          // Validate file count
          if (files.length === 0) {
            return errorResponse("No files uploaded", 400, corsHeaders);
          }
          // If the number of uploaded files exceeds the route's maximum (or 1 if not specified), return an error
          if (files.length > (route.maxFileCount ?? 1)) {
            return errorResponse(
              `Too many files. Maximum allowed: ${route.maxFileCount}`,
              400,
              corsHeaders,
            );
          }

          // Validate each file
          for (const file of files) {
            if (!isMimeTypeAllowed(file.type, route.fileTypes)) {
              return errorResponse(
                `Invalid file type: ${file.type}. Allowed: ${route.fileTypes.join(", ")}`,
                400,
                corsHeaders,
              );
            }
            if (file.size > route.maxFileSize) {
              return errorResponse(
                `File "${file.name}" exceeds maximum size of ${route.maxFileSize} bytes`,
                400,
                corsHeaders,
              );
            }
          }

          const normalizedRequest = normalizeFormData(formData);

          // Run pre-upload validation
          const metadata: Record<string, unknown> = route.checkUpload
            ? await ctx.runMutation(storageFunctions.checkUpload, {
                route: routeName,
                request: normalizedRequest,
              })
            : {};

          // Store files
          const storageIdsAndUrls = await Promise.all(
            files.map(async (file) => {
              const storageId = await ctx.storage.store(file);
              const url = await ctx.storage.getUrl(storageId);
              if (!url) {
                throw new Error(
                  `Failed to get URL for uploaded file: ${file.name}`,
                );
              }
              return { id: storageId, url };
            }),
          );

          // Create metadata records in component
          await ctx.runMutation(component.lib.createFilesMetadata, {
            storageIdsAndUrls,
            metadata,
            bucket: routeName,
          });

          // Run post-upload handler
          const result = route.onUploaded
            ? await ctx.runMutation(storageFunctions.onUploaded, {
                route: routeName,
                request: normalizedRequest,
                storageIdsAndUrls,
                metadata,
              })
            : null;

          return jsonResponse(
            result ?? { success: true, filesCount: storageIdsAndUrls.length },
            200,
            corsHeaders,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Upload failed";
          return errorResponse(message, 500, corsHeaders);
        }
      }),
    });

    // OPTIONS handler for CORS preflight
    http.route({
      path: uploadPath,
      method: "OPTIONS",
      handler: httpActionGeneric(async (_, request) => {
        const headers = request.headers;
        const isPreflightRequest =
          headers.get("Origin") !== null &&
          headers.get("Access-Control-Request-Method") !== null &&
          headers.get("Access-Control-Request-Headers") !== null;

        if (isPreflightRequest) {
          return new Response(null, {
            headers: new Headers(buildCorsHeaders(request)),
          });
        }
        return new Response();
      }),
    });
  }
}

/**
 * Creates a storage client for managing file uploads.
 *
 * @example
 * ```ts
 * // storage.ts
 * const routes = {
 *   images: route({ ... }),
 *   pdfs: route({ ... }),
 * };
 *
 * export const { checkUpload, onUploaded } = createStorageMutations(routes);
 *
 * export const storage = createClient(components.storage, { routes });
 *
 * // http.ts
 * import { storage } from "./storage";
 * storage.registerRoutes(http, { storageFunctions: internal.storage });
 * ```
 */
export function createClient<const Routes extends UploadRoutes>(
  component: ComponentApi,
  options: {
    routes: Routes;
    pathPrefix?: string;
  },
) {
  const { routes, pathPrefix = "/storage" } = options;

  return {
    /**
     * Register HTTP routes for file uploads.
     * Call this in your http.ts file.
     */
    registerRoutes(
      http: HttpRouter,
      opts: { storageFunctions: StorageFunctions },
    ): void {
      registerHttpRoutes(http, {
        component,
        storageFunctions: opts.storageFunctions,
        routes,
        pathPrefix,
      });
    },

    /**
     * Get a single file by ID.
     */
    async getFile(
      ctx: QueryCtx,
      fileId: Id<"files">,
    ): Promise<Doc<"files"> | null> {
      const files = await ctx.runQuery(component.lib.getFilesMetadata, {
        fileIds: [fileId],
      });
      return files[0] ?? null;
    },

    /**
     * Get multiple files by their IDs.
     */
    async listFiles(
      ctx: QueryCtx,
      fileIds: Id<"files">[],
    ): Promise<(Doc<"files"> | undefined)[]> {
      return await ctx.runQuery(component.lib.getFilesMetadata, { fileIds });
    },

    /**
     * Delete a single file and its storage.
     */
    async deleteFile(ctx: MutationCtx, fileId: Id<"files">): Promise<void> {
      const files = await ctx.runQuery(component.lib.getFilesMetadata, {
        fileIds: [fileId],
      });
      const file = files[0];
      if (file) {
        await ctx.storage.delete(file.storageId as Id<"_storage">);
        await ctx.runMutation(component.lib.deleteFilesMetadata, {
          fileIds: [fileId],
        });
      }
    },

    /**
     * Delete multiple files and their storage.
     */
    async deleteFiles(ctx: MutationCtx, fileIds: Id<"files">[]): Promise<void> {
      if (fileIds.length === 0) return;

      const files = await ctx.runQuery(component.lib.getFilesMetadata, {
        fileIds,
      });

      await Promise.all(
        files
          .filter(
            (file: Doc<"files"> | undefined): file is Doc<"files"> =>
              file !== undefined,
          )
          .map((file: Doc<"files">) =>
            ctx.storage.delete(file.storageId as Id<"_storage">),
          ),
      );

      await ctx.runMutation(component.lib.deleteFilesMetadata, { fileIds });
    },
  };
}

// Re-export types for convenience
export type { NormalizedFormData, StorageIdAndUrl };
