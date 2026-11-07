import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Input";
import { passwordSchema } from "@/features/users/passwordSchema";
import { toApiError } from "@/services/apiError";

import { requestPasswordReset, resetPassword } from "./api";
import { AuthLayout, FormAlert } from "./AuthLayout";

const RESEND_SECONDS = 60; // khớp PASSWORD_RESET_COOLDOWN_SECONDS phía backend

const emailSchema = z.object({ email: z.email("Email không hợp lệ") });

const resetSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/, "Mã gồm 6 chữ số"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: "Mật khẩu nhập lại không khớp", path: ["confirmPassword"] });

const cardClass = "space-y-4 rounded-xl border border-border bg-card p-6 shadow-card";

function BackToLogin() {
  return (
    <p className="text-center text-sm">
      <Link to="/login" className="text-primary hover:underline">
        Quay lại đăng nhập
      </Link>
    </p>
  );
}

function EmailStep({ onSent }: { onSent: (email: string, message: string) => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(emailSchema), defaultValues: { email: "" } });

  const onSubmit = async ({ email }: { email: string }) => {
    setFormError(null);
    try {
      onSent(email.trim(), await requestPasswordReset(email.trim()));
    } catch (error) {
      setFormError(toApiError(error).message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className={cardClass}>
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField label="Email của tài khoản" htmlFor="email" required error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" autoFocus invalid={!!errors.email} {...register("email")} />
      </FormField>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Gửi mã xác nhận
      </Button>
      <BackToLogin />
    </form>
  );
}

type ResetValues = z.infer<typeof resetSchema>;

function CodeStep({ email, message, onResend }: { email: string; message: string; onResend: (message: string) => void }) {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { code: "", newPassword: "", confirmPassword: "" } });

  // Đếm ngược trước khi cho gửi lại mã (backend cũng chặn gửi lại trong thời gian này)
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const resend = async () => {
    setResending(true);
    setFormError(null);
    try {
      onResend(await requestPasswordReset(email));
      setWait(RESEND_SECONDS);
    } catch (error) {
      setFormError(toApiError(error).message);
    } finally {
      setResending(false);
    }
  };

  const onSubmit = async (values: ResetValues) => {
    setFormError(null);
    try {
      await resetPassword(email, values.code.trim(), values.newPassword);
      toast.success("Đã đặt mật khẩu mới. Hãy đăng nhập lại.");
      navigate("/login", { replace: true });
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === "INVALID_RESET_CODE") setError("code", { message: apiError.message }, { shouldFocus: true });
      else if (apiError.fieldErrors.new_password) setError("newPassword", { message: apiError.fieldErrors.new_password });
      else setFormError(apiError.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className={cardClass}>
      <div className="flex gap-3 rounded-lg bg-info-soft p-3 text-sm text-info-strong">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p>
          {message} <span className="font-medium">({email})</span>
        </p>
      </div>
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField label="Mã xác nhận (6 số)" htmlFor="code" required error={errors.code?.message}>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          className="tabular text-center text-lg tracking-[0.4em]"
          invalid={!!errors.code}
          {...register("code")}
        />
      </FormField>
      <FormField label="Mật khẩu mới" htmlFor="newPassword" required error={errors.newPassword?.message} hint="≥ 8 ký tự, có chữ và số">
        <Input id="newPassword" type="password" autoComplete="new-password" invalid={!!errors.newPassword} {...register("newPassword")} />
      </FormField>
      <FormField label="Nhập lại mật khẩu mới" htmlFor="confirmPassword" required error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" invalid={!!errors.confirmPassword} {...register("confirmPassword")} />
      </FormField>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Đặt mật khẩu mới
      </Button>
      <p className="text-center text-sm text-muted">
        Chưa nhận được mã?{" "}
        <button type="button" className="text-primary hover:underline disabled:text-muted disabled:no-underline" disabled={wait > 0 || resending} onClick={resend}>
          {wait > 0 ? `Gửi lại sau ${wait} giây` : "Gửi lại mã"}
        </button>
      </p>
      <BackToLogin />
    </form>
  );
}

/** Quên mật khẩu: nhập email → nhận mã 6 số → nhập mã + mật khẩu mới. */
export function ForgotPasswordPage() {
  const [sent, setSent] = useState<{ email: string; message: string } | null>(null);

  return (
    <AuthLayout
      title="Quên mật khẩu"
      description={sent ? "Nhập mã trong email và đặt mật khẩu mới." : "Nhập email gắn với tài khoản để nhận mã xác nhận."}
    >
      {sent ? (
        <CodeStep email={sent.email} message={sent.message} onResend={(message) => setSent({ ...sent, message })} />
      ) : (
        <EmailStep onSent={(email, message) => setSent({ email, message })} />
      )}
    </AuthLayout>
  );
}
