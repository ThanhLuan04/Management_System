"""
Tạo dữ liệu demo cho môi trường phát triển: danh mục, ~30 sản phẩm, nhà cung cấp, khách hàng,
phiếu nhập và lịch sử bán hàng N ngày gần nhất (có trả hàng, hủy đơn).

Dữ liệu được tạo QUA CÁC SERVICE NGHIỆP VỤ (nhập hàng, bán hàng, trả hàng...) nên tồn kho, giá vốn bình quân
và sổ cái kho luôn nhất quán; sau đó thời điểm giao dịch được lùi về quá khứ và mã chứng từ được đánh lại theo ngày.

Chạy tại thư mục backend (cần có tài khoản Admin — tạo bằng scripts.create_admin):
    .\\.venv\\Scripts\\python.exe -m scripts.seed_demo            # chỉ chạy khi chưa có dữ liệu bán hàng
    .\\.venv\\Scripts\\python.exe -m scripts.seed_demo --reset    # XÓA dữ liệu nghiệp vụ hiện có rồi tạo lại
"""

import argparse
import random
import sys
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.permissions import RoleCode
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal
from app.models import Brand, Category, Customer, Inventory, Product, Role, SalesOrder, Supplier, User
from app.schemas.purchase import PurchaseCreate
from app.schemas.sales import OrderCreate, ReturnCreate
from app.services import purchase_service, return_service, sales_service
from app.utils.time import VN_TZ, utcnow, vn_today

DEMO_PASSWORD = "Demo@123"
DEMO_USERS = [
    ("quanly", "Phạm Thu Hà", RoleCode.MANAGER),
    ("thungan1", "Lê Văn Nam", RoleCode.CASHIER),
    ("thungan2", "Nguyễn Thị Mai", RoleCode.CASHIER),
]

# (danh mục cha, danh mục con) → [(SKU, tên, ĐVT, giá bán, giá vốn, tồn tối thiểu, thương hiệu)]
CATALOG = {
    ("Đồ uống", "Nước ngọt"): [
        ("COCA-330", "Coca-Cola lon 330ml", "lon", 10000, 7200, 48, "Coca-Cola"),
        ("PEPSI-330", "Pepsi lon 330ml", "lon", 10000, 7000, 48, "Pepsi"),
        ("7UP-330", "7Up lon 330ml", "lon", 10000, 7000, 24, "Pepsi"),
        ("STING-330", "Sting dâu chai 330ml", "chai", 12000, 8500, 24, "Pepsi"),
    ],
    ("Đồ uống", "Nước suối"): [
        ("LAVIE-500", "Nước khoáng Lavie 500ml", "chai", 6000, 3800, 48, "Lavie"),
        ("AQUA-1500", "Nước tinh khiết Aquafina 1.5L", "chai", 12000, 8000, 24, "Aquafina"),
    ],
    ("Đồ uống", "Bia"): [
        ("HEINEKEN-330", "Bia Heineken lon 330ml", "lon", 21000, 17500, 48, "Heineken"),
        ("TIGER-330", "Bia Tiger lon 330ml", "lon", 18000, 14800, 48, "Tiger"),
    ],
    ("Sữa", "Sữa tươi"): [
        ("TH-1L", "Sữa tươi TH True Milk ít đường 1L", "hộp", 36000, 29000, 12, "TH True Milk"),
        ("TH-180", "Sữa tươi TH True Milk 180ml", "hộp", 8500, 6600, 48, "TH True Milk"),
        ("VNM-1L", "Sữa tươi Vinamilk 100% không đường 1L", "hộp", 34000, 27500, 12, "Vinamilk"),
    ],
    ("Sữa", "Sữa chua"): [
        ("VNM-SC-4", "Sữa chua Vinamilk có đường (lốc 4)", "lốc", 26000, 20500, 10, "Vinamilk"),
        ("TH-SC-4", "Sữa chua TH True Yogurt (lốc 4)", "lốc", 30000, 24000, 10, "TH True Milk"),
    ],
    ("Bánh kẹo", None): [
        ("CHOCOPIE-12", "Bánh Chocopie hộp 12 cái", "hộp", 55000, 44000, 6, "Orion"),
        ("COSY-MARIE", "Bánh quy Cosy Marie 432g", "gói", 42000, 33000, 6, "Kinh Đô"),
        ("OSTAR-90", "Snack Ostar vị kim chi 90g", "gói", 15000, 11000, 12, "Orion"),
        ("KD-AFC", "Bánh AFC lúa mì 200g", "hộp", 25000, 19500, 6, "Kinh Đô"),
    ],
    ("Thực phẩm khô", "Mì gói"): [
        ("HAOHAO-TOM", "Mì Hảo Hảo tôm chua cay", "gói", 4500, 3500, 60, "Acecook"),
        ("HAOHAO-THUNG", "Mì Hảo Hảo tôm chua cay (thùng 30 gói)", "thùng", 125000, 100000, 3, "Acecook"),
        ("OMACHI-SB", "Mì Omachi sườn hầm ngũ quả", "gói", 8000, 6200, 30, "Masan"),
    ],
    ("Thực phẩm khô", "Gia vị"): [
        ("CHINSU-500", "Nước mắm Chin-su cá hồi 500ml", "chai", 38000, 30000, 6, "Masan"),
        ("NAMNGU-500", "Nước mắm Nam Ngư 500ml", "chai", 32000, 25500, 6, "Masan"),
        ("TUONGOT-250", "Tương ớt Chin-su 250g", "chai", 15000, 11500, 10, "Masan"),
    ],
    ("Hóa mỹ phẩm", "Giặt giũ"): [
        ("OMO-800", "Bột giặt OMO Matic 800g", "túi", 59000, 48000, 6, "Unilever"),
        ("COMFORT-800", "Nước xả Comfort hương ban mai 800ml", "túi", 52000, 42000, 6, "Unilever"),
    ],
    ("Hóa mỹ phẩm", "Chăm sóc cá nhân"): [
        ("CLEAR-370", "Dầu gội Clear mát lạnh 370g", "chai", 125000, 99000, 4, "Unilever"),
        ("PS-230", "Kem đánh răng P/S bảo vệ 123 230g", "tuýp", 35000, 27000, 8, "Unilever"),
        ("HS-330", "Dầu gội Head & Shoulders 330ml", "chai", 135000, 108000, 4, "P&G"),
    ],
}

SUPPLIERS = [
    ("NPP Đồ uống Minh Phát", "Anh Tuấn", "0283 812 3456", ("Đồ uống",)),
    ("Công ty TNHH Sữa An Khang", "Chị Hằng", "0283 899 1122", ("Sữa",)),
    ("NPP Thực phẩm Hòa Bình", "Anh Quang", "0283 755 6789", ("Bánh kẹo", "Thực phẩm khô")),
    ("Đại lý Hóa phẩm Thành Công", "Chị Linh", "0283 966 4455", ("Hóa mỹ phẩm",)),
]

FAMILY_NAMES = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Võ", "Đặng", "Bùi", "Đỗ", "Huỳnh"]
GIVEN_NAMES = [
    "Văn An",
    "Thị Bích",
    "Minh Khoa",
    "Thu Trang",
    "Quốc Bảo",
    "Ngọc Lan",
    "Hữu Phước",
    "Thanh Hương",
    "Đức Thịnh",
    "Mỹ Linh",
    "Gia Huy",
    "Kim Ngân",
    "Tấn Phát",
    "Hồng Nhung",
]


def _check_environment() -> None:
    if get_settings().is_production:
        sys.exit("Không chạy dữ liệu demo trên môi trường production.")


def _reset(db: Session) -> None:
    keep = {"roles", "settings", "users", "alembic_version"}
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables if t.name not in keep)
    db.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    db.commit()


def _ensure_users(db: Session) -> dict[str, User]:
    admin = db.scalar(
        select(User).join(Role).where(Role.code == RoleCode.ADMIN, User.is_active.is_(True)).order_by(User.id)
    )
    if admin is None:
        sys.exit(
            "Chưa có tài khoản Admin. Hãy chạy: python -m scripts.create_admin --username admin --full-name ..."
        )
    users = {"admin": admin}
    for username, full_name, role_code in DEMO_USERS:
        user = db.scalar(select(User).where(func.lower(User.username) == username))
        if user is None:
            role = db.scalar(select(Role).where(Role.code == role_code))
            user = User(
                username=username, full_name=full_name, role=role, password_hash=hash_password(DEMO_PASSWORD)
            )
            db.add(user)
        users[username] = user
    db.commit()
    return users


def _create_catalog(
    db: Session, admin: User
) -> tuple[list[Product], dict[str, list[Product]], dict[int, Decimal]]:
    brands: dict[str, Brand] = {}
    roots: dict[str, Category] = {}
    products: list[Product] = []
    by_root: dict[str, list[Product]] = defaultdict(list)
    costs: dict[int, Decimal] = {}
    for (root_name, child_name), rows in CATALOG.items():
        root = roots.get(root_name)
        if root is None:
            root = roots[root_name] = Category(name=root_name)
            db.add(root)
            db.flush()
        category = root
        if child_name:
            category = Category(name=child_name, parent_id=root.id)
            db.add(category)
            db.flush()
        for sku, name, unit, price, cost, min_stock, brand_name in rows:
            if brand_name not in brands:
                brands[brand_name] = Brand(name=brand_name)
                db.add(brands[brand_name])
                db.flush()
            product = Product(
                sku=sku,
                name=name,
                unit=unit,
                category_id=category.id,
                brand_id=brands[brand_name].id,
                sale_price=Decimal(price),
                min_stock=min_stock,
                created_by=admin.id,
            )
            product.inventory = Inventory(quantity=0, avg_cost=Decimal("0"))
            db.add(product)
            db.flush()
            products.append(product)
            by_root[root_name].append(product)
            costs[product.id] = Decimal(cost)
    db.commit()
    return products, by_root, costs


def _create_partners(db: Session, rng: random.Random) -> tuple[list[tuple[Supplier, tuple]], list[Customer]]:
    suppliers = []
    for index, (name, contact, phone, roots) in enumerate(SUPPLIERS, start=1):
        supplier = Supplier(code=f"NCC{index:04d}", name=name, contact_name=contact, phone=phone)
        db.add(supplier)
        suppliers.append((supplier, roots))
    customers = []
    used_phones = set()
    for index in range(1, 21):
        phone = f"09{rng.randint(10_000_000, 99_999_999)}"
        while phone in used_phones:
            phone = f"09{rng.randint(10_000_000, 99_999_999)}"
        used_phones.add(phone)
        customer = Customer(
            code=f"KH{index:06d}",
            name=f"{rng.choice(FAMILY_NAMES)} {rng.choice(GIVEN_NAMES)}",
            phone=phone,
        )
        db.add(customer)
        customers.append(customer)
    db.flush()
    db.execute(
        text(
            "INSERT INTO code_sequences (prefix, period, last_value) VALUES ('NCC', 'ALL', :s), ('KH', 'ALL', :c)"
        ),
        {"s": len(suppliers), "c": len(customers)},
    )
    db.commit()
    return suppliers, customers


def _at(day: date, hour: int, minute: int) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=VN_TZ)


def _run(db: Session, statements: list[str], params: dict) -> None:
    # psycopg 3 không cho nhiều câu lệnh có tham số trong một lần execute → chạy từng câu
    for statement in statements:
        db.execute(text(statement), params)


def _move_purchase(db: Session, purchase_id: int, moment: datetime) -> None:
    _run(
        db,
        [
            "UPDATE purchase_orders SET created_at = :t, updated_at = :t, confirmed_at = :t WHERE id = :id",
            "UPDATE inventory_transactions SET created_at = :t "
            "WHERE reference_type = 'purchase_order' AND reference_id = :id",
        ],
        {"t": moment, "id": purchase_id},
    )


def _move_order(db: Session, order_id: int, moment: datetime) -> None:
    """Lùi đơn về `moment`; nếu đơn bị hủy, thời điểm hủy/hoàn tiền/hoàn kho là 5 phút sau đó."""
    later = moment + timedelta(minutes=5)
    _run(
        db,
        [
            "UPDATE sales_orders SET created_at = :t, updated_at = :t, "
            "cancelled_at = CASE WHEN cancelled_at IS NULL THEN NULL ELSE :later END WHERE id = :id",
            "UPDATE payments SET created_at = CASE WHEN type = 'PAYMENT' THEN :t ELSE :later END "
            "WHERE sales_order_id = :id AND sales_return_id IS NULL",
            "UPDATE inventory_transactions SET created_at = CASE WHEN type = 'SALE' THEN :t ELSE :later END "
            "WHERE reference_type = 'sales_order' AND reference_id = :id",
        ],
        {"t": moment, "later": later, "id": order_id},
    )


def _move_return(db: Session, return_id: int, moment: datetime) -> None:
    _run(
        db,
        [
            "UPDATE sales_returns SET created_at = :t WHERE id = :id",
            "UPDATE payments SET created_at = :t WHERE sales_return_id = :id",
            "UPDATE inventory_transactions SET created_at = :t "
            "WHERE reference_type = 'sales_return' AND reference_id = :id",
        ],
        {"t": moment, "id": return_id},
    )


def _purchase(db, supplier, products, costs, qty_for, actor, moment, cost_factor=Decimal("1")) -> None:
    items = [
        {
            "product_id": p.id,
            "quantity": qty_for(p),
            "unit_cost": (costs[p.id] * cost_factor).quantize(Decimal("1")),
        }
        for p in products
    ]
    data = PurchaseCreate(supplier_id=supplier.id, note="Dữ liệu demo", items=items)
    purchase = purchase_service.create_purchase(db, data, actor, None)
    purchase_service.confirm_purchase(db, purchase.id, actor, None)
    _move_purchase(db, purchase.id, moment)
    db.commit()


def _renumber_documents(db: Session) -> None:
    """Đánh lại mã chứng từ theo NGÀY THẬT của giao dịch (sau khi đã lùi thời gian) và đồng bộ bộ đếm."""
    for table, prefix in (("purchase_orders", "PN"), ("sales_orders", "HD"), ("sales_returns", "TH")):
        rows = db.execute(text(f"SELECT id, created_at FROM {table} ORDER BY created_at, id")).all()
        db.execute(text(f"UPDATE {table} SET code = 'TMP-' || id"))
        per_day: dict[str, int] = defaultdict(int)
        for row_id, created_at in rows:
            period = created_at.astimezone(VN_TZ).strftime("%Y%m%d")
            per_day[period] += 1
            db.execute(
                text(f"UPDATE {table} SET code = :code WHERE id = :id"),
                {"code": f"{prefix}{period}-{per_day[period]:04d}", "id": row_id},
            )
        db.execute(text("DELETE FROM code_sequences WHERE prefix = :p"), {"p": prefix})
        for period, count in per_day.items():
            db.execute(
                text("INSERT INTO code_sequences (prefix, period, last_value) VALUES (:p, :d, :n)"),
                {"p": prefix, "d": period, "n": count},
            )
    db.commit()


def seed(days: int, reset: bool) -> None:
    _check_environment()
    rng = random.Random(2026)  # cố định → mỗi lần chạy ra cùng một bộ dữ liệu
    with SessionLocal() as db:
        if reset:
            _reset(db)
        elif db.scalar(select(func.count()).select_from(Product)) or db.scalar(
            select(func.count()).select_from(SalesOrder)
        ):
            sys.exit(
                "Database đã có dữ liệu. Chạy lại với --reset để XÓA dữ liệu nghiệp vụ và tạo dữ liệu demo."
            )

        users = _ensure_users(db)
        admin, manager = users["admin"], users["quanly"]
        cashiers = [users["thungan1"], users["thungan2"]]
        products, by_root, costs = _create_catalog(db, admin)
        suppliers, customers = _create_partners(db, rng)
        print(f"Đã tạo {len(products)} sản phẩm, {len(suppliers)} nhà cung cấp, {len(customers)} khách hàng")

        today = vn_today()
        start = today - timedelta(days=days - 1)
        # Nhập hàng đầu kỳ (đủ bán ~nửa kỳ) và giữa kỳ (giá nhập tăng 5% → thấy giá vốn bình quân thay đổi)
        for supplier, roots in suppliers:
            group = [p for root in roots for p in by_root[root]]
            _purchase(
                db,
                supplier,
                group,
                costs,
                lambda p: max(p.min_stock * 4, 40),
                manager,
                _at(start - timedelta(days=1), 8, 0),
            )
        middle = start + timedelta(days=days // 2)
        for supplier, roots in suppliers:
            group = [p for root in roots for p in by_root[root]]
            _purchase(
                db,
                supplier,
                group,
                costs,
                lambda p: max(p.min_stock * 3, 30),
                manager,
                _at(middle, 8, 0),
                Decimal("1.05"),
            )

        stats = defaultdict(int)
        now_vn = utcnow().astimezone(VN_TZ)
        popular = products[:12]  # đồ uống, sữa, bánh bán chạy hơn
        for offset in range(days):
            day = start + timedelta(days=offset)
            orders_today = rng.randint(6, 10) + (4 if day.weekday() >= 5 else 0)
            for _ in range(orders_today):
                hour, minute = rng.randint(7, 21), rng.randint(0, 59)
                moment = _at(day, hour, minute)
                if moment > now_vn:
                    continue
                picks = rng.sample(popular, rng.randint(1, 3)) + rng.sample(products, rng.randint(0, 2))
                quantities = {p.id: rng.randint(1, 4) for p in picks}
                db.expire_all()
                items = [
                    {"product_id": pid, "quantity": qty}
                    for pid, qty in quantities.items()
                    if db.get(Inventory, pid).quantity >= qty
                ]
                if not items:
                    continue
                method = rng.choices(["CASH", "BANK_TRANSFER", "CARD"], weights=[6, 3, 1])[0]
                body = {
                    "items": items,
                    "customer_id": rng.choice(customers).id if rng.random() < 0.4 else None,
                    "payment": {"method": method, "cash_received": 1_000_000}
                    if method == "CASH"
                    else {"method": method},
                }
                if rng.random() < 0.15:
                    body["discount"] = {"type": "PERCENT", "value": rng.choice([5, 10])}
                cashier = rng.choice(cashiers)
                try:
                    order, _ = sales_service.create_order(
                        db, OrderCreate(**body), uuid.uuid4(), cashier, None
                    )
                except AppError as exc:
                    db.rollback()
                    stats[f"bỏ qua ({exc.code})"] += 1
                    continue
                stats["đơn hàng"] += 1

                # Hủy / trả hàng phải làm TRƯỚC khi lùi thời gian: nghiệp vụ kiểm tra "cùng ngày" và "trong 7 ngày"
                roll = rng.random()
                sales_return = None
                if roll < 0.03:
                    sales_service.cancel_order(db, order.id, "Khách đổi ý tại quầy", manager, None)
                    stats["đơn hủy"] += 1
                elif roll < 0.09:
                    item = order.items[0]
                    data = ReturnCreate(
                        reason=rng.choice(["Sản phẩm bị móp", "Khách đổi ý", "Hết hạn sử dụng"]),
                        items=[
                            {
                                "order_item_id": item.id,
                                "quantity": rng.randint(1, item.quantity),
                                "condition": rng.choice(["RESELLABLE", "RESELLABLE", "DAMAGED"]),
                            }
                        ],
                    )
                    sales_return, _ = return_service.create_return(
                        db, order.id, data, uuid.uuid4(), cashier, None
                    )
                    stats["phiếu trả"] += 1

                _move_order(db, order.id, moment)
                if sales_return is not None:
                    return_moment = moment + timedelta(days=rng.randint(0, 3), hours=rng.randint(1, 5))
                    _move_return(db, sales_return.id, min(return_moment, now_vn))
                db.commit()

        _renumber_documents(db)
        print("Đã tạo:", ", ".join(f"{count} {name}" for name, count in stats.items()))
        print(f"Tài khoản demo (mật khẩu {DEMO_PASSWORD}):", ", ".join(u for u, _, _ in DEMO_USERS))


def main() -> int:
    parser = argparse.ArgumentParser(description="Tạo dữ liệu demo SmartStore")
    parser.add_argument("--days", type=int, default=60, help="Số ngày lịch sử bán hàng (mặc định 60)")
    parser.add_argument("--reset", action="store_true", help="XÓA toàn bộ dữ liệu nghiệp vụ trước khi tạo")
    args = parser.parse_args()
    seed(args.days, args.reset)
    return 0


if __name__ == "__main__":
    sys.exit(main())
