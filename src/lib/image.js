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

export async function compressImageForChat(file, maxBytes = 100 * 1024) {
  if (!file?.type?.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;
  const maxDimension = 1280;
  if (Math.max(width, height) > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement("canvas");
  let blob = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const quality = Math.max(0.12, 0.78 - attempt * 0.07);
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) break;
    width = Math.max(160, Math.round(width * 0.78));
    height = Math.max(160, Math.round(height * 0.78));
  }
  bitmap.close?.();
  return blob || file;
}
