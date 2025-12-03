FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all source code
COPY . .

# Expose port
EXPOSE 8080

# Start the server
CMD ["gunicorn", "-b", "0.0.0.0:8080", "server:app"]
