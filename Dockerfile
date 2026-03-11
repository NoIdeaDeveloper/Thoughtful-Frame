FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/

RUN mkdir -p /data && adduser --disabled-password --gecos "" appuser && chown -R appuser /data

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=5 \
    CMD python -c "
import urllib.request
import sys
try:
    response = urllib.request.urlopen('http://localhost:8000/api/health', timeout=5)
    data = response.read().decode('utf-8')
    print(f'Health check successful: {data}')
    sys.exit(0)
except Exception as e:
    print(f'Health check failed: {e}')
    sys.exit(1)
" || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "debug", "--access-log", "--use-colors"]
