FROM python:3.12
WORKDIR /app

# Unbuffered stdout so runserver's startup banner ("Starting development
# server at ...") streams to the container logs immediately instead of being
# block-buffered — otherwise the log appears to hang after "Watching for file
# changes with StatReloader" even though the server is up.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]