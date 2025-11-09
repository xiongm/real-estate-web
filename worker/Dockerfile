
FROM python:3.11-slim
WORKDIR /worker
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY worker.py ./worker.py
COPY stamping.py ./stamping.py
COPY certificate.py ./certificate.py
CMD ["python", "worker.py"]
