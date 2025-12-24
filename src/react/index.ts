"use client";

type UploadResult =
  | {
      storageId: string;
      url: string | null;
    }
  | string;

export const useUpload = (
  siteUrl: string,
  route: string,
  options?: {
    pathPrefix?: string;
    signal?: AbortSignal;
  },
) => {
  const { pathPrefix = "/storage", signal } = options ?? {};

  const endpoint = new URL(
    `${pathPrefix.replace(/\/$/, "")}/${route}/upload`,
    siteUrl,
  );

  const upload = async (files: File[]): Promise<UploadResult> => {
    if (!files.length) {
      throw new Error("No files provided for upload");
    }

    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    const res = await fetch(endpoint, {
      method: "POST",
      body: formData,
      signal,
      credentials: "omit",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `File upload failed (${res.status} ${res.statusText})${text ? `: ${text}` : ""}`,
      );
    }

    return (await res.json()) as UploadResult;
  };

  return { upload };
};
