import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthProvider";
import { P } from "@/features/auth/permissions";
import { toApiError } from "@/services/apiError";
import { formatDateTime } from "@/utils/format";

import { formatMinutes, useClock, useMyAttendance } from "./api";

/** Nút chấm công trên thanh tiêu đề: "Vào ca" hoặc "Đang làm 2 giờ 15 phút · Ra ca". */
export function ClockButton() {
  const { can } = useAuth();
  const allowed = can(P.ATTENDANCE_SELF);
  const me = useMyAttendance(allowed);
  const clock = useClock();
  if (!allowed || !me.data) return null;

  const current = me.data.current;
  const run = (action: "clock-in" | "clock-out") =>
    clock.mutate(action, {
      onSuccess: (entry) =>
        toast.success(
          action === "clock-in"
            ? `Đã vào ca lúc ${formatDateTime(entry.clock_in_at)}`
            : `Đã ra ca — làm ${formatMinutes(entry.minutes)}`,
        ),
      onError: (error) => toast.error(toApiError(error).message),
    });

  return current ? (
    <Button variant="outline" size="sm" loading={clock.isPending} onClick={() => run("clock-out")} title="Bấm khi kết thúc giờ làm">
      <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
      <span className="hidden md:inline">Đang làm {formatMinutes(current.minutes)} ·</span> Ra ca
      <LogOut className="h-4 w-4" aria-hidden />
    </Button>
  ) : (
    <Button size="sm" loading={clock.isPending} onClick={() => run("clock-in")}>
      <LogIn className="h-4 w-4" aria-hidden /> Vào ca
    </Button>
  );
}
