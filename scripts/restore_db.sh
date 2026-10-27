#!/bin/sh
# Khôi phục database từ file sao lưu — GHI ĐÈ toàn bộ dữ liệu hiện tại.
#   ./scripts/restore_db.sh backups/smartstore-20261027-020000.dump
set -eu

cd "$(dirname "$0")/.."
FILE="${1:?Cách dùng: ./scripts/restore_db.sh <file .dump>}"
[ -f "$FILE" ] || { echo "Không thấy file: $FILE" >&2; exit 1; }

printf "Dữ liệu hiện tại sẽ bị thay bằng %s. Gõ 'khoiphuc' để tiếp tục: " "$FILE"
read -r answer
[ "$answer" = "khoiphuc" ] || { echo "Đã hủy."; exit 1; }

# Dừng backend để không có ghi dữ liệu trong lúc khôi phục
docker compose stop backend
docker compose exec -T db pg_restore -U smartstore -d smartstore --clean --if-exists --no-owner < "$FILE"
docker compose start backend
echo "Đã khôi phục từ $FILE"
