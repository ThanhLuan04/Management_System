# Backend SmartStore: FastAPI + uvicorn. Khi khởi động: chạy migration rồi mới nhận request.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Chạy bằng user thường, không phải root
RUN useradd --create-home --uid 1000 smartstore \
    && mkdir -p /app/uploads \
    && chown smartstore:smartstore /app/uploads

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Bỏ CRLF nếu file được checkout trên Windows (shell Linux không chạy được dòng kết thúc \r)
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

USER smartstore
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4)"

ENTRYPOINT ["docker-entrypoint.sh"]
