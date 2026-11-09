"""Mặc định không dùng màn hình bếp: thu ngân in phiếu bếp đưa cho bếp, đơn không dồn thành phiếu chờ."""

import pytest

from tests.integration.test_kitchen import cashier, cook, menu, sell, tickets  # noqa: F401 — fixture dùng chung

pytestmark = pytest.mark.usefixtures("open_shift")


def test_without_kitchen_screen_orders_do_not_pile_up(client, cashier, cook, menu):  # noqa: F811
    order = sell(client, cashier, [(menu["pho"], 1, "không hành")]).json()

    assert order["queue_number"] == 1  # vẫn có số thứ tự in trên phiếu bếp / hóa đơn
    assert order["items"][0]["kitchen_status"] == "SERVED"
    assert tickets(client, cook) == []
    settings = client.get("/api/v1/settings", headers=cashier).json()
    assert (settings["kitchen_screen_enabled"], settings["auto_print_kitchen_ticket"]) == (False, True)
