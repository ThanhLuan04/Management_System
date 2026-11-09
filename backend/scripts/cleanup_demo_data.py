"""
Dọn dữ liệu demo sau khi đã thiết lập quán (scripts.setup_food_store). XÓA VĨNH VIỄN — hãy sao lưu trước:

    cd backend
    .\\.venv\\Scripts\\python.exe -m scripts.cleanup_demo_data            # chạy thử: chỉ đếm, không xóa
    .\\.venv\\Scripts\\python.exe -m scripts.cleanup_demo_data --apply    # xóa thật

Xóa: toàn bộ lịch sử bán hàng (đơn, thanh toán, phiếu trả, ca két), phiếu nhập / điều chỉnh kho / sổ kho
(trừ phiếu nhập đầu kỳ của quán), sản phẩm và danh mục đã ngừng, khách hàng, nhà cung cấp và thương hiệu
không còn dùng, nhật ký thao tác cũ. Tồn kho tính lại theo sổ kho còn lại: hàng không còn chứng từ
(đồ uống demo) về 0, nguyên liệu bị đơn bán thử trừ được hoàn lại đúng số của phiếu nhập đầu kỳ.
Giữ: thực đơn, nguyên liệu, tùy chọn món, đồ uống đang bán, tài khoản, chấm công, cài đặt.
Chạy trong MỘT transaction: lỗi ở bất kỳ bước nào thì không có gì bị xóa.
"""

import argparse
import sys
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models import PurchaseOrder, User
from app.services import audit_service
from scripts.setup_food_store import OPENING_NOTE

# Bộ đếm mã chứng từ đánh lại từ đầu (chứng từ cũ đã xóa hết). PN, NCC giữ nguyên vì còn chứng từ / NCC đang dùng.
_RESET_SEQUENCES = ("HD", "TH", "CA", "QUEUE", "DC", "KH")

# (nhãn, câu lệnh) theo thứ tự khóa ngoại: bảng con trước, bảng cha sau
_STEPS = [
    ("thanh toán / hoàn tiền", "DELETE FROM payments"),
    ("dòng phiếu trả", "DELETE FROM sales_return_items"),
    ("phiếu trả hàng", "DELETE FROM sales_returns"),
    ("lựa chọn trên dòng đơn", "DELETE FROM sales_order_item_options"),
    ("nguyên liệu đã trừ theo dòng đơn", "DELETE FROM sales_order_item_components"),
    ("dòng đơn", "DELETE FROM sales_order_items"),
    ("đơn hàng", "DELETE FROM sales_orders"),
    ("ca két", "DELETE FROM cash_shifts"),
    (
        "dòng phiếu nhập cũ",
        "DELETE FROM purchase_order_items WHERE purchase_order_id <> ALL(:keep_purchases)",
    ),
    ("phiếu nhập cũ", "DELETE FROM purchase_orders WHERE id <> ALL(:keep_purchases)"),
    ("dòng phiếu điều chỉnh", "DELETE FROM stock_adjustment_items"),
    ("phiếu điều chỉnh kho", "DELETE FROM stock_adjustments"),
    (
        "dòng sổ kho cũ",
        "DELETE FROM inventory_transactions WHERE NOT (reference_type = 'purchase_order' "
        "AND reference_id = ANY(:keep_purchases))",
    ),
    # Tồn kho = đúng những gì các chứng từ CÒN LẠI giải thích: tổng thay đổi trong sổ kho, giá vốn theo dòng sổ
    # cuối cùng. Hàng không còn chứng từ (đồ uống demo) về 0; nguyên liệu bị đơn thử trừ được hoàn lại.
    (
        "tồn kho tính lại theo sổ kho",
        """
        UPDATE inventory i SET quantity = x.quantity, avg_cost = x.avg_cost
        FROM (
            SELECT inv.product_id,
                   COALESCE((SELECT SUM(t.quantity_change) FROM inventory_transactions t
                             WHERE t.product_id = inv.product_id), 0) AS quantity,
                   COALESCE((SELECT t.avg_cost_after FROM inventory_transactions t
                             WHERE t.product_id = inv.product_id ORDER BY t.id DESC LIMIT 1), 0) AS avg_cost
            FROM inventory inv
        ) x
        WHERE i.product_id = x.product_id AND (i.quantity <> x.quantity OR i.avg_cost <> x.avg_cost)
        """,
    ),
    (
        "tồn kho của hàng đã ngừng",
        "DELETE FROM inventory WHERE product_id IN (SELECT id FROM products WHERE NOT is_active)",
    ),
    ("sản phẩm đã ngừng", "DELETE FROM products WHERE NOT is_active"),
    (
        "danh mục đã ẩn",
        "DELETE FROM categories c WHERE NOT c.is_active "
        "AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id)",
    ),
    (
        "thương hiệu không dùng",
        "DELETE FROM brands b WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.brand_id = b.id)",
    ),
    ("khách hàng", "DELETE FROM customers"),
    (
        "nhà cung cấp không dùng",
        "DELETE FROM suppliers s WHERE NOT EXISTS (SELECT 1 FROM purchase_orders o WHERE o.supplier_id = s.id)",
    ),
    ("nhật ký thao tác cũ", "DELETE FROM audit_logs"),
    ("bộ đếm mã chứng từ", "DELETE FROM code_sequences WHERE prefix = ANY(:reset_sequences)"),
]


def cleanup(db: Session, actor: User, *, apply: bool) -> list[tuple[str, int]]:
    """Trả về [(nhãn, số dòng)]. apply=False: chạy rồi rollback để biết trước sẽ xóa bao nhiêu."""
    keep_purchases = list(db.scalars(select(PurchaseOrder.id).where(PurchaseOrder.note == OPENING_NOTE)))
    images = list(
        db.scalars(text("SELECT image_path FROM products WHERE NOT is_active AND image_path IS NOT NULL"))
    )
    params = {"keep_purchases": keep_purchases or [0], "reset_sequences": list(_RESET_SEQUENCES)}

    counts = [(label, db.execute(text(sql), params).rowcount) for label, sql in _STEPS]
    if not apply:
        db.rollback()
        return counts

    audit_service.record(
        db,
        action="DEMO_DATA_CLEANUP",
        user_id=actor.id,
        entity_type="system",
        new_values={label: n for label, n in counts if n},
        ip_address=None,
    )
    db.commit()
    # Ảnh của sản phẩm đã xóa: chỉ xóa file nằm trong thư mục upload
    upload_dir = Path(get_settings().upload_dir).resolve()
    for relative in images:
        path = (upload_dir / relative).resolve()
        if path.is_relative_to(upload_dir) and path.is_file():
            path.unlink()
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--apply", action="store_true", help="Xóa thật (mặc định chỉ chạy thử)")
    parser.add_argument("--admin", default="admin", help="Tài khoản ghi vào nhật ký thao tác")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    with SessionLocal() as db:
        actor = db.scalar(select(User).where(User.username == args.admin))
        if actor is None:
            print(f"Không tìm thấy tài khoản {args.admin!r}")
            return 1
        counts = cleanup(db, actor, apply=args.apply)
    print("ĐÃ XÓA:" if args.apply else "CHẠY THỬ — chưa xóa gì. Thêm --apply để xóa thật:")
    for label, n in counts:
        if n:
            print(f"  {label:<36} {n:>6}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
