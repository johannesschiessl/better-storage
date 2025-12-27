import type { GenericActionCtx } from "convex/server";
import { HttpError } from "./errors";

export function getAllowedOrigin(request: Request): string {
  return request.headers.get("Origin") ?? process.env.SITE_URL ?? "*";
}

export function buildCorsHeaders(request: Request): Record<string, string> {
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

export function isFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    "type" in value &&
    "arrayBuffer" in value
  );
}

export function isMimeTypeAllowed(
  fileType: string,
  allowedTypes: string[],
): boolean {
  return allowedTypes.some((allowedType) => {
    if (allowedType.endsWith("/*")) {
      const prefix = allowedType.slice(0, -1);
      return fileType.startsWith(prefix);
    }
    return allowedType === fileType;
  });
}

export function jsonResponse(
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

export function errorResponse(
  error: string,
  status: number,
  corsHeaders?: Record<string, string>,
): Response {
  return jsonResponse({ error }, status, corsHeaders);
}

export async function checkAuth(ctx: GenericActionCtx<any>) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new HttpError("Unauthorized", 401);
  }

  return identity;
}
