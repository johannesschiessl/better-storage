import {
  httpActionGeneric,
  internalMutationGeneric,
  type HttpRouter,
  type UserIdentity,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import type { Doc, Id } from "../component/_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "../component/_generated/server.js";
import { v } from "convex/values";
import type {
  StorageFunctions,
  StorageIdAndUrl,
  UploadRouteConfig,
  UploadRoutes,
} from "./types.js";
import {
  buildCorsHeaders,
  checkAuth,
  errorResponse,
  isFile,
  isMimeTypeAllowed,
  jsonResponse,
} from "./utils.js";
import { HttpError } from "./errors.js";

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
 *     checkUpload: async ({ ctx }) => {
 *       return { userId: "123" };
 *     },
 *     onUploaded: async ({ ctx, storageIdsAndUrls, metadata }) => {
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
  RequireAuth extends boolean = false,
>(
  config: UploadRouteConfig<Metadata, Result, RequireAuth>,
): UploadRouteConfig<Metadata, Result, RequireAuth> {
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
        identity: v.optional(v.any()),
      },
      handler: async (ctx, args): Promise<Record<string, unknown>> => {
        const route = routeMap.get(args.route);
        if (!route) {
          throw new Error(`Unknown upload route: "${args.route}"`);
        }
        if (!route.checkUpload) {
          return {};
        }
        if (route.requireAuth) {
          if (!args.identity) {
            throw new Error("Identity required for authenticated route");
          }
          return await (
            route.checkUpload as (args: {
              ctx: MutationCtx;
              identity: UserIdentity;
            }) => Promise<Record<string, unknown>> | Record<string, unknown>
          )({
            ctx: ctx as MutationCtx,
            identity: args.identity as UserIdentity,
          });
        } else {
          return await (
            route.checkUpload as (args: {
              ctx: MutationCtx;
            }) => Promise<Record<string, unknown>> | Record<string, unknown>
          )({
            ctx: ctx as MutationCtx,
          });
        }
      },
    }),

    onUploaded: internalMutationGeneric({
      args: {
        route: v.string(),
        identity: v.optional(v.any()),
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
        if (route.requireAuth) {
          if (!args.identity) {
            throw new Error("Identity required for authenticated route");
          }
          return await (
            route.onUploaded as (args: {
              ctx: MutationCtx;
              identity: UserIdentity;
              storageIdsAndUrls: StorageIdAndUrl[];
              metadata: Record<string, unknown>;
            }) => Promise<unknown> | unknown
          )({
            ctx: ctx as MutationCtx,
            identity: args.identity as UserIdentity,
            storageIdsAndUrls: args.storageIdsAndUrls as StorageIdAndUrl[],
            metadata: args.metadata as Record<string, unknown>,
          });
        } else {
          return await (
            route.onUploaded as (args: {
              ctx: MutationCtx;
              storageIdsAndUrls: StorageIdAndUrl[];
              metadata: Record<string, unknown>;
            }) => Promise<unknown> | unknown
          )({
            ctx: ctx as MutationCtx,
            storageIdsAndUrls: args.storageIdsAndUrls as StorageIdAndUrl[],
            metadata: args.metadata as Record<string, unknown>,
          });
        }
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
          let identity: UserIdentity | undefined;

          if (route.requireAuth) {
            identity = await checkAuth(ctx); // TODO: figure types out...
          }

          const formData = await request.formData();
          const files = formData
            .getAll("files")
            .filter((value): value is File => isFile(value) && value.size > 0);

          // Validate file count
          if (files.length === 0) {
            return errorResponse("No files uploaded", 400, corsHeaders);
          }
          // If the number of uploaded files exceeds the route's maximum (or 1 if not specified), return an error
          const maxFileCount = route.maxFileCount ?? 1;
          if (files.length > maxFileCount) {
            return errorResponse(
              `Too many files. Maximum allowed: ${maxFileCount}`,
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

          // Run pre-upload validation
          const metadata: Record<string, unknown> = route.checkUpload
            ? await ctx.runMutation(storageFunctions.checkUpload, {
                route: routeName,
                ...(route.requireAuth ? { identity } : {}),
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
                ...(route.requireAuth ? { identity } : {}),
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

          // Check if error has a status code in the 400-403 range
          let status = 500;
          if (error instanceof HttpError) {
            status = error.status;
          } else if (
            error instanceof Error &&
            "status" in error &&
            typeof (error as { status: unknown }).status === "number"
          ) {
            const errorStatus = (error as { status: number }).status;
            if (errorStatus >= 400 && errorStatus <= 403) {
              status = errorStatus;
            }
          }

          return errorResponse(message, status, corsHeaders);
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
