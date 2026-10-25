import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

type HealthState =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "db_error" }
  | { kind: "unreachable" };

// Trang tạm cho giai đoạn khởi tạo: kiểm tra frontend → backend → database
export default function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  const checkHealth = async () => {
    setHealth({ kind: "loading" });
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      setHealth(response.ok ? { kind: "ok" } : { kind: "db_error" });
    } catch {
      setHealth({ kind: "unreachable" });
    }
  };

  useEffect(() => {
    void checkHealth();
  }, []);

  const statusText: Record<HealthState["kind"], { label: string; className: string }> = {
    loading: { label: "Đang kiểm tra...", className: "text-slate-500" },
    ok: { label: "Backend và database hoạt động bình thường", className: "text-green-600" },
    db_error: { label: "Backend chạy nhưng không kết nối được database", className: "text-amber-600" },
    unreachable: { label: "Không kết nối được backend", className: "text-red-600" },
  };
  const status = statusText[health.kind];

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">SmartStore</h1>
        <p className="mt-1 text-sm text-slate-500">Kiểm tra kết nối hệ thống</p>
        <p className={`mt-6 font-medium ${status.className}`}>{status.label}</p>
        <button
          type="button"
          onClick={() => void checkHealth()}
          disabled={health.kind === "loading"}
          className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Kiểm tra lại
        </button>
      </div>
    </main>
  );
}
