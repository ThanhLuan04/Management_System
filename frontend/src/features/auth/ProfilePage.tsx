import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/common/States";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { FormField, Input } from "@/components/ui/Input";
import { passwordSchema } from "@/features/users/passwordSchema";
import { toApiError } from "@/services/apiError";
import { http } from "@/services/http";
import type { Me, TokenResponse } from "@/types/api";
import { formatDateTime } from "@/utils/format";

import { useAuth } from "./AuthProvider";

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Vui lòng nhập họ tên").max(100, "Tối đa 100 ký tự"),
  email: z.string().trim().refine((v) => v === "" || z.email().safeParse(v).success, "Email không hợp lệ"),
  phone: z.string().trim().refine((v) => v === "" || /^\+?[0-9][0-9 .-]{7,18}$/.test(v), "Số điện thoại không hợp lệ"),
});
type ProfileValues = z.infer<typeof profileSchema>;

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, { message: "Mật khẩu nhập lại không khớp", path: ["confirm_password"] })
  .refine((v) => v.new_password !== v.current_password, { message: "Mật khẩu mới phải khác mật khẩu hiện tại", path: ["new_password"] });
type PasswordValues = z.infer<typeof changePasswordSchema>;

function ProfileForm({ user }: { user: Me }) {
  const { applySession } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema) });

  useEffect(() => {
    reset({ full_name: user.full_name, email: user.email ?? "", phone: user.phone ?? "" });
  }, [user, reset]);

  const onSubmit = async (values: ProfileValues) => {
    try {
      const { data } = await http.patch<Me>("/auth/me", {
        full_name: values.full_name,
        email: values.email || null,
        phone: values.phone || null,
      });
      applySession({ user: data });
      toast.success("Đã cập nhật hồ sơ");
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === "DUPLICATE_EMAIL") setError("email", { message: apiError.message });
      else toast.error(apiError.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FormField label="Họ tên" htmlFor="p-name" required error={errors.full_name?.message}>
        <Input id="p-name" invalid={!!errors.full_name} {...register("full_name")} />
      </FormField>
      <FormField label="Email" htmlFor="p-email" error={errors.email?.message}>
        <Input id="p-email" type="email" invalid={!!errors.email} {...register("email")} />
      </FormField>
      <FormField label="Số điện thoại" htmlFor="p-phone" error={errors.phone?.message}>
        <Input id="p-phone" invalid={!!errors.phone} {...register("phone")} />
      </FormField>
      <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
        Lưu thay đổi
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const { applySession } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const onSubmit = async (values: PasswordValues) => {
    try {
      const { data } = await http.post<TokenResponse>("/auth/change-password", {
        current_password: values.current_password,
        new_password: values.new_password,
      });
      // Backend đã thu hồi mọi phiên cũ và cấp phiên mới cho thiết bị này
      applySession({ user: data.user, access_token: data.access_token });
      reset();
      toast.success("Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.");
    } catch (error) {
      const apiError = toApiError(error);
      const fieldErrors = Object.entries(apiError.fieldErrors);
      if (fieldErrors.length) fieldErrors.forEach(([f, message]) => setError(f as keyof PasswordValues, { message }));
      else toast.error(apiError.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FormField label="Mật khẩu hiện tại" htmlFor="cp-current" required error={errors.current_password?.message}>
        <Input id="cp-current" type="password" autoComplete="current-password" invalid={!!errors.current_password} {...register("current_password")} />
      </FormField>
      <FormField label="Mật khẩu mới" htmlFor="cp-new" required error={errors.new_password?.message} hint="≥ 8 ký tự, có chữ và số">
        <Input id="cp-new" type="password" autoComplete="new-password" invalid={!!errors.new_password} {...register("new_password")} />
      </FormField>
      <FormField label="Nhập lại mật khẩu mới" htmlFor="cp-confirm" required error={errors.confirm_password?.message}>
        <Input id="cp-confirm" type="password" autoComplete="new-password" invalid={!!errors.confirm_password} {...register("confirm_password")} />
      </FormField>
      <Button type="submit" loading={isSubmitting}>
        Đổi mật khẩu
      </Button>
    </form>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <PageHeader title="Hồ sơ cá nhân" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={user.username}
            description={user.last_login_at ? `Đăng nhập gần nhất: ${formatDateTime(user.last_login_at)}` : undefined}
            actions={<Badge variant="info">{user.role.name}</Badge>}
          />
          <CardContent>
            <ProfileForm user={user} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Đổi mật khẩu" description="Sau khi đổi, các thiết bị khác đang đăng nhập sẽ bị đăng xuất." />
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
