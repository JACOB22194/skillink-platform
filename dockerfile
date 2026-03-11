# Use the official Python base image
FROM python:3.11-slim

# Set the working directory
WORKDIR /app

# Install system dependencies required for ML libraries (gcc, g++)
RUN apt-get update && \
    apt-get install -y gcc g++ libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the AI code
COPY . .

# Expose port 8000 (Your docker-compose maps this to 8001 externally)
EXPOSE 8000

# Command to run the AI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]