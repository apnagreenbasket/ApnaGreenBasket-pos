"""
QR code generation utility — generates QR codes for table-specific menu URLs.
"""

from __future__ import annotations

import io

import qrcode
from qrcode.image.pil import PilImage


def generate_menu_qr(
    outlet_slug: str,
    table_number: str,
    base_url: str = "https://menu.app",
) -> bytes:
    """
    Generate a QR code PNG pointing to the public menu URL.
    Returns raw PNG bytes — caller handles upload to S3/R2.

    URL format: {base_url}/menu?slug={outlet_slug}&basket={table_number}
    """
    url = f"{base_url}/menu?slug={outlet_slug}&basket={table_number}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img: PilImage = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    return buffer.getvalue()
