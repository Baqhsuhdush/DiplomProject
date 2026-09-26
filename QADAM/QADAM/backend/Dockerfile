FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .
COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY docker-worker-entrypoint.sh /docker-worker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh /docker-worker-entrypoint.sh \
    && mkdir -p /app/data/uploads

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
ENTRYPOINT ["/docker-entrypoint.sh"]
