import { http } from "./http";

/**
 * Tải file từ API (vd. CSV báo cáo). Không dùng <a href> trực tiếp vì API cần header Authorization;
 * tải qua http (có token) rồi tạo link tạm để trình duyệt lưu file.
 */
export async function downloadFile(url: string, params: Record<string, unknown>, fallbackName: string): Promise<void> {
  const response = await http.get<Blob>(url, { params, responseType: "blob" });
  const disposition = String(response.headers["content-disposition"] ?? "");
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;

  const objectUrl = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
