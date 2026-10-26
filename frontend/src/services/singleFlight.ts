/**
 * Gộp các lời gọi đồng thời thành MỘT lần thực thi: ai gọi trong lúc đang chạy sẽ nhận chung kết quả.
 *
 * Dùng cho làm mới token: refresh token chỉ dùng được một lần (backend xoay vòng token). Nếu 5 request cùng
 * nhận 401 và mỗi request tự gọi /auth/refresh, 4 lần sau dùng token đã bị thay → backend coi là bị đánh cắp
 * và thu hồi mọi phiên. React StrictMode (dev) cũng chạy effect khởi động 2 lần liền → cùng vấn đề.
 */
export function singleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = task().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}
