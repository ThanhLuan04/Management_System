# Import mọi model ở đây để Alembic (autogenerate) và SQLAlchemy nhìn thấy đầy đủ metadata
from app.models.catalog import Brand, Category, Inventory, Product
from app.models.partner import Customer, Supplier
from app.models.system import AuditLog, CodeSequence, Setting
from app.models.user import RefreshToken, Role, User

__all__ = [
    "AuditLog",
    "Brand",
    "Category",
    "CodeSequence",
    "Customer",
    "Inventory",
    "Product",
    "RefreshToken",
    "Role",
    "Setting",
    "Supplier",
    "User",
]
