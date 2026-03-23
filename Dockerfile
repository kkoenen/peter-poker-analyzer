FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (layer caching)
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy application
COPY config.yaml .
COPY backend/ ./backend/
COPY frontend/ ./frontend/

EXPOSE 8000

# Run from backend dir so relative imports resolve; config/frontend paths use __file__
WORKDIR /app/backend
ENV PYTHONPATH=/app/backend

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
