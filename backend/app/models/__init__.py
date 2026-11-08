# Import mọi model ở đây để Alembic (autogenerate) và SQLAlchemy nhìn thấy đầy đủ metadata
from app.models.catalog import Brand, Category, Inventory, Product
from app.models.partner import Customer, Supplier
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, PurchaseStatus
from app.models.sales import (
    ItemCondition,
    OrderStatus,
    Payment,
    PaymentMethod,
    SalesOrder,
    SalesOrderItem,
    SalesReturn,
    SalesReturnItem,
)
from app.models.shift import CashShift, ShiftStatus
from app.models.stock import (
    AdjustmentType,
    InventoryTransaction,
    StockAdjustment,
    StockAdjustmentItem,
    TransactionType,
)
from app.models.system import AuditLog, CodeSequence, Setting
from app.models.user import PasswordResetCode, RefreshToken, Role, User

__all__ = [
    "AdjustmentType",
    "AuditLog",
    "Brand",
    "CashShift",
    "Category",
    "CodeSequence",
    "Customer",
    "Inventory",
    "InventoryTransaction",
    "ItemCondition",
    "OrderStatus",
    "PasswordResetCode",
    "Payment",
    "PaymentMethod",
    "Product",
    "PurchaseOrder",
    "PurchaseOrderItem",
    "PurchaseStatus",
    "RefreshToken",
    "Role",
    "SalesOrder",
    "SalesOrderItem",
    "SalesReturn",
    "SalesReturnItem",
    "Setting",
    "ShiftStatus",
    "StockAdjustment",
    "StockAdjustmentItem",
    "Supplier",
    "TransactionType",
    "User",
]
