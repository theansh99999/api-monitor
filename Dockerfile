# Use official Python runtime as a parent image
FROM python:3.11-slim

# Set working directory in container
WORKDIR /app

# Copy the entire project directory into the container
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose port 5000 for Flask
EXPOSE 5000

# Set environment variables
ENV FLASK_APP=app/app.py
ENV FLASK_ENV=production

# Run the Flask application
CMD ["python", "-m", "flask", "run", "--host=0.0.0.0"]
