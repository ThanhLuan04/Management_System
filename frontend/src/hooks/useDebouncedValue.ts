import { useEffect, useState } from "react";

/** Trả về giá trị sau khi người dùng ngừng thay đổi `delay` ms — tránh gọi API sau mỗi phím gõ. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
