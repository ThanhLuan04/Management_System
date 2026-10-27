import { z } from "zod";

/** Cùng quy tắc với backend (app/schemas/common.py): 8–128 ký tự, có cả chữ và số. */
export const passwordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự")
  .max(128, "Tối đa 128 ký tự")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Mật khẩu phải có cả chữ và số");
