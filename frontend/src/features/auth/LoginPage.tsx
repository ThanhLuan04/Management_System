import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate, type Location } from "react-router";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Input";
import { toApiError } from "@/services/apiError";
import { formatDateTime } from "@/utils/format";

import { AuthLayout, FormAlert } from "./AuthLayout";
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
    <AuthLayout title="Đăng nhập SmartStore" description="Dùng tài khoản được quản trị viên cấp.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-card">
        {formError && <FormAlert>{formError}</FormAlert>}
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
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-primary hover:underline">
            Quên mật khẩu?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
