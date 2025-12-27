import type { UserIdentity } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { MutationCtx } from "../component/_generated/server";
import type { Id } from "../component/_generated/dataModel";

export type StorageIdAndUrl = { id: Id<"_storage">; url: string };

/**
 * Configuration for a single upload route.
 * @template Metadata - The type returned by checkUpload and passed to onUploaded
 * @template Result - The type returned by onUploaded
 * @template RequireAuth - Whether authentication is required
 */
export type UploadRouteConfig<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
  Result = unknown,
  RequireAuth extends boolean = false,
> = {
  /** Allowed MIME types (supports wildcards like "image/*") */
  fileTypes: string[];
  /** Maximum file size in bytes */
  maxFileSize: number;
  /** Maximum number of files per upload */
  maxFileCount?: number;
  /** Whether to require authentication for the route */
  requireAuth?: RequireAuth;
  /**
   * Called before upload to validate and prepare metadata.
   * Return value is passed to onUploaded as `metadata`.
   */
  checkUpload?: RequireAuth extends true
    ? (args: {
        ctx: MutationCtx;
        identity: UserIdentity;
      }) => Promise<Metadata> | Metadata
    : (args: { ctx: MutationCtx }) => Promise<Metadata> | Metadata;
  /**
   * Called after files are successfully uploaded.
   * Return value is sent back to the client.
   */
  onUploaded?: RequireAuth extends true
    ? (args: {
        ctx: MutationCtx;
        identity: UserIdentity;
        storageIdsAndUrls: StorageIdAndUrl[];
        metadata: Metadata;
      }) => Promise<Result> | Result
    : (args: {
        ctx: MutationCtx;
        storageIdsAndUrls: StorageIdAndUrl[];
        metadata: Metadata;
      }) => Promise<Result> | Result;
};

/** A collection of named upload routes */
export type UploadRoutes = Record<
  string,
  UploadRouteConfig<any, any, true> | UploadRouteConfig<any, any, false>
>;

export type UploadCheckArgs = {
  route: string;
  identity?: UserIdentity;
};

export type UploadOnUploadedArgs = {
  route: string;
  identity?: UserIdentity;
  storageIdsAndUrls: StorageIdAndUrl[];
  metadata: Record<string, unknown>;
};

export type StorageFunctions = {
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
