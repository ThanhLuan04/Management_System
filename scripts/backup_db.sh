#!/bin/sh
# Sao lưu database SmartStore đang chạy bằng docker compose.
#   ./scripts/backup_db.sh              → backups/smartstore-YYYYMMDD-HHMMSS.dump
# Giữ lại KEEP bản mới nhất (mặc định 14). Chạy hằng ngày bằng cron, ví dụ:
#   0 2 * * * cd /opt/smartstore && ./scripts/backup_db.sh >> backups/backup.log 2>&1
set -eu

cd "$(dirname "$0")/.."
mkdir -p backups
KEEP="${KEEP:-14}"
FILE="backups/smartstore-$(date +%Y%m%d-%H%M%S).dump"

# Định dạng custom (-Fc): nén sẵn, khôi phục chọn lọc được bằng pg_restore
docker compose exec -T db pg_dump -U smartstore -d smartstore -Fc > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
echo "Đã sao lưu: $FILE ($(du -h "$FILE" | cut -f1))"

# Xóa bản cũ, chỉ giữ KEEP bản mới nhất
ls -1t backups/smartstore-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm --
