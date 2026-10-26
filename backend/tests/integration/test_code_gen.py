from concurrent.futures import ThreadPoolExecutor
from datetime import date

from app.db.session import SessionLocal
from app.services import code_gen


def test_master_and_document_codes_are_sequential(db):
    assert code_gen.master_code(db, "KH", 6) == "KH000001"
    assert code_gen.master_code(db, "KH", 6) == "KH000002"
    assert code_gen.master_code(db, "NCC", 4) == "NCC0001"  # mỗi prefix có bộ đếm riêng

    assert code_gen.document_code(db, "HD", date(2026, 10, 25)) == "HD20261025-0001"
    assert code_gen.document_code(db, "HD", date(2026, 10, 25)) == "HD20261025-0002"
    assert code_gen.document_code(db, "HD", date(2026, 10, 26)) == "HD20261026-0001"  # sang ngày mới đếm lại
    db.commit()


def test_rolled_back_transaction_does_not_burn_a_number(db):
    code_gen.master_code(db, "KH", 6)
    db.rollback()

    assert code_gen.master_code(db, "KH", 6) == "KH000001"
    db.rollback()


def test_concurrent_requests_never_get_the_same_code():
    def take_code(_):
        with SessionLocal() as session:
            code = code_gen.master_code(session, "KH", 6)
            session.commit()
            return code

    with ThreadPoolExecutor(max_workers=10) as pool:
        codes = list(pool.map(take_code, range(20)))

    assert len(set(codes)) == 20
    assert sorted(codes) == [f"KH{i:06d}" for i in range(1, 21)]
