#!/bin/sh
set -e

# Cập nhật schema database trước khi nhận request (an toàn khi chạy lại: chỉ áp dụng migration còn thiếu)
alembic upgrade head

# 1 worker: bộ đếm giới hạn đăng nhập nằm trong bộ nhớ tiến trình (docs/06-security-review.md).
# --proxy-headers: lấy IP thật của người dùng từ X-Forwarded-For do Caddy gắn. Tin mọi địa chỉ ("*") chỉ an toàn
# vì backend KHÔNG mở cổng ra ngoài — chỉ Caddy trong mạng nội bộ của Docker gọi được tới.
exec uvicorn app.main:app \
    --host 0.0.0.0 --port 8000 \
    --workers 1 \
    --proxy-headers --forwarded-allow-ips "*" \
    --no-server-header
