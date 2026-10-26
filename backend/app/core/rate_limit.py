import threading
import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    """
    Giới hạn số lần gọi theo key (ví dụ IP) trong một cửa sổ thời gian trượt.

    Lưu trong bộ nhớ của tiến trình: đủ cho một server duy nhất. Khi chạy nhiều instance
    cần chuyển sang kho dùng chung (ví dụ Redis) — ghi trong phần giới hạn của README.
    """

    def __init__(self, limit: int, window_seconds: float):
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> bool:
        """Ghi nhận một lần gọi. Trả về False nếu đã vượt giới hạn."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= self.window_seconds:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
