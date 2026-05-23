# Use the official Python base image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies required for PostgreSQL
RUN apt-get update && apt-get install -y gcc libpq-dev

# Copy requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir google-genai

# Copy the rest of your backend code
COPY . .

# Expose port 8000 for FastAPI
EXPOSE 8000

# Command to run the server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]