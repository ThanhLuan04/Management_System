import { z } from "zod";

/** Gợi ý hiển thị dưới mọi ô đặt mật khẩu mới. */
export const PASSWORD_HINT = "≥ 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt (vd. @ # !)";

// Cùng quy tắc với backend (app/schemas/common.py). \p{Lu}/\p{Ll}: chữ có dấu (Đ, ê...) vẫn tính là hoa/thường.
const RULES: [string, RegExp][] = [
  ["chữ hoa", /\p{Lu}/u],
  ["chữ thường", /\p{Ll}/u],
  ["chữ số", /\p{Nd}/u],
  ["ký tự đặc biệt", /[^\p{L}\p{N}\s]/u],
];

export const passwordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự")
  .max(128, "Tối đa 128 ký tự")
  .superRefine((value, ctx) => {
    const missing = RULES.filter(([, pattern]) => !pattern.test(value)).map(([name]) => name);
    if (missing.length) ctx.addIssue({ code: "custom", message: `Mật khẩu còn thiếu: ${missing.join(", ")}` });
  });
