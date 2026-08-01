import { getSupabase } from "@/lib/supabase";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

export function guessContentType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

// Upload a file to project-files bucket, path = {projectId}/{timestamp}-{filename}

export async function uploadProjectFile(
  projectId: string,
  file: File,
): Promise<string> {
  const sb = getSupabase();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${projectId}/${Date.now()}-${safeName}`;
  const { error } = await sb.storage.from("project-files").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || guessContentType(file.name),
  });
  if (error) throw error;
  return path;
}

export async function getProjectFileUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from("project-files")
    .createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}

export async function removeProjectFile(path: string): Promise<void> {
  const sb = getSupabase();
  await sb.storage.from("project-files").remove([path]);
}

export async function getProjectFileUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return {};
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from("project-files")
    .createSignedUrls(clean, 60 * 30);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  data.forEach((d) => {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}
