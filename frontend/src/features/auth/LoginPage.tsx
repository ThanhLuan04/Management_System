import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate, type Location } from "react-router";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Input";
import { toApiError } from "@/services/apiError";
import { formatDateTime } from "@/utils/format";

import { useAuth } from "./AuthProvider";

const schema = z.object({
  username: z.string().trim().min(3, "Tên đăng nhập tối thiểu 3 ký tự").max(50, "Tối đa 50 ký tự"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu").max(128, "Tối đa 128 ký tự"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { username: "", password: "" } });

  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? "/";
  if (status === "authenticated") return <Navigate to={from} replace />;

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      await login(values.username, values.password);
      navigate(from, { replace: true });
    } catch (error) {
      const apiError = toApiError(error);
      const lockedUntil = (apiError.details as { locked_until?: string } | undefined)?.locked_until;
      setFormError(
        apiError.code === "ACCOUNT_LOCKED" && lockedUntil
          ? `${apiError.message}. Thử lại sau ${formatDateTime(lockedUntil)}.`
          : apiError.message,
      );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
            <Boxes className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold">SmartStore</h1>
          <p className="text-sm text-muted">Đăng nhập để quản lý cửa hàng</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
        >
          {formError && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <FormField label="Tên đăng nhập" htmlFor="username" required error={errors.username?.message}>
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              invalid={!!errors.username}
              aria-describedby={errors.username ? "username-error" : undefined}
              {...register("username")}
            />
          </FormField>
          <FormField label="Mật khẩu" htmlFor="password" required error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
          </FormField>
          <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
            Đăng nhập
          </Button>
        </form>
      </div>
    </div>
  );
}
