export const SUPABASE_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const LARGE_FILE_MAX_BYTES = 1024 * 1024 * 1024;

export function usesR2Storage(size: number): boolean {
  return Number.isFinite(size) && size > SUPABASE_MAX_FILE_BYTES;
}

export function validateLargeAttachment(
  size: number,
  fileName: string,
  contentType: string,
): string | null {
  if (!Number.isSafeInteger(size) || size <= SUPABASE_MAX_FILE_BYTES)
    return "Only files larger than 50 MB use large-file storage.";
  if (size > LARGE_FILE_MAX_BYTES) return "Files must be 1 GB or smaller.";
  if (!fileName || fileName.length > 255 || fileName.includes("/") || fileName.includes("\\") || /[\u0000-\u001f]/.test(fileName))
    return "Choose a file with a valid name.";
  const normalizedType = contentType.toLowerCase();
  const allowed = new Set([
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/octet-stream",
    "text/plain",
    "text/csv",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
  ]);
  if (!allowed.has(normalizedType))
    return "This large file type is not supported. Choose a video, image, PDF, Office document, text file, or ZIP.";
  const ext = fileName.split(".").pop()?.toLowerCase();
  const validExtensions: Record<string, string[]> = {
    "application/pdf": ["pdf"],
    "application/zip": ["zip"],
    "application/x-zip-compressed": ["zip"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
    "application/msword": ["doc"],
    "application/vnd.ms-excel": ["xls"],
    "application/vnd.ms-powerpoint": ["ppt"],
    "application/octet-stream": [
      "bin", "dat", "psd", "ai", "sketch", "fig", "xd", "blend", "fbx", "obj", "stl", "glb", "gltf",
      "7z", "rar", "tar", "gz", "bz2", "mp3", "wav", "m4a", "aac", "flac", "ogg", "sql", "json", "xml", "yaml", "yml",
    ],
    "text/plain": ["txt", "log", "md"],
    "text/csv": ["csv"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/gif": ["gif"],
    "image/webp": ["webp"],
    "video/mp4": ["mp4", "m4v"],
    "video/webm": ["webm"],
    "video/quicktime": ["mov"],
    "audio/mpeg": ["mp3"],
    "audio/mp4": ["m4a", "mp4"],
    "audio/wav": ["wav"],
    "audio/x-wav": ["wav"],
    "audio/ogg": ["ogg"],
  };
  if (!ext || !validExtensions[normalizedType]?.includes(ext))
    return "The file extension does not match its file type.";
  return null;
}
