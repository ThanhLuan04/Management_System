/** Kiểu dữ liệu dùng chung với backend (xem Swagger /docs để biết đầy đủ). */

export type Money = string; // backend trả tiền dạng chuỗi "32000.00"

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface Role {
  id: number;
  code: "ADMIN" | "MANAGER" | "CASHIER";
  name: string;
}

export interface UserRef {
  id: number;
  full_name: string;
}

export interface Me {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  permissions: string[];
  last_login_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: Me;
}
