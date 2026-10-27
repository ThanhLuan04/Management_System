import { SearchX } from "lucide-react";
import { Link } from "react-router";

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <SearchX className="h-12 w-12 text-slate-300" aria-hidden />
      <h1 className="text-lg font-semibold">Không tìm thấy trang</h1>
      <Link to="/" className="text-sm text-primary hover:underline">
        Về trang chủ
      </Link>
    </div>
  );
}
