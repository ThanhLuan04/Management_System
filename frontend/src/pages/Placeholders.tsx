import { Construction, SearchX } from "lucide-react";
import { Link } from "react-router";

import { PageHeader } from "@/components/common/States";
import { Card } from "@/components/ui/Card";

/** Trang tạm cho các module sẽ được xây ở các bước tiếp theo của Giai đoạn 6. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="flex flex-col items-center gap-2 px-4 py-16 text-center">
        <Construction className="h-10 w-10 text-slate-300" aria-hidden />
        <p className="font-medium">Trang đang được xây dựng</p>
        <p className="text-sm text-muted">API của chức năng này đã sẵn sàng; giao diện sẽ có ở bước tiếp theo.</p>
      </Card>
    </>
  );
}

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
