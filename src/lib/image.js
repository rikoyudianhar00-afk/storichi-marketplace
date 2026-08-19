export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export function validateImageFile(file) {
  if (!file) return "Pilih foto terlebih dahulu.";
  if (!file.type?.startsWith("image/")) return "File yang dipilih harus berupa foto.";
  if (file.size > MAX_IMAGE_SIZE_BYTES) return "Ukuran foto maksimal 5 MB.";
  return "";
}

export function formatFileSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
