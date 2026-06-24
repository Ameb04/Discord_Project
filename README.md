# Discord Clone Project

Project of Systems Analysis and Design Course

## Technologies

### Backend

* Django
* Django REST Framework
* Django Channels
* PostgreSQL
* Redis
* Celery

### Frontend

* React
* Vite
* TypeScript

### Infrastructure

* Docker
* Docker Compose

---

# First Time Setup

Clone repository:

```bash
git clone <repo-url>
cd Discord_Project
```

Create environment file:

```bash
cp .env.example .env
```

Build containers:

```bash
docker compose build
```

Start project:

```bash
docker compose up
```

Open:

Frontend:

http://localhost:5173

Backend:

http://localhost:8000

---

# Database Migration

Create migrations:

```bash
docker compose exec backend python manage.py makemigrations
```

Apply migrations:

```bash
docker compose exec backend python manage.py migrate
```

---

# Create Superuser

```bash
docker compose exec backend python manage.py createsuperuser
```

---

# Open Django Shell

```bash
docker compose exec backend python manage.py shell
```

---

# Run Tests

Run all tests:

```bash
docker compose exec backend python manage.py test
```

Run specific app tests:

```bash
docker compose exec backend python manage.py test accounts
```

---

# Install New Python Package

Example:

```bash
docker compose exec backend pip install pillow
```

Update requirements:

```bash
docker compose exec backend pip freeze > requirements.txt
```

Rebuild image:

```bash
docker compose build backend
```

---

# Install New Frontend Package

Example:

```bash
docker compose exec frontend npm install axios
```

Package.json automatically updates.

If needed:

```bash
docker compose build frontend
```

---

# Open Container Terminal

Backend:

```bash
docker compose exec backend bash
```

Frontend:

```bash
docker compose exec frontend sh
```

PostgreSQL:

```bash
docker compose exec db psql -U app
```

Redis:

```bash
docker compose exec redis redis-cli
```

---

# Stop Containers

```bash
docker compose down
```

---

# Rebuild Everything

```bash
docker compose down
docker compose build --no-cache
docker compose up
```

---

# Git Workflow

Create branch:

```bash
git checkout -b feature/user-authentication
```

Push branch:

```bash
git push origin feature/user-authentication
```

Create Pull Request on GitHub.

Do not commit directly to main branch.

---

# Project Structure

```text
project-root/
│
├── backend/
│   ├── config/
│   ├── apps/ (we make the apps/ like accounts/ or etc)
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/ (we code frontend here)
│   ├── public/
│   └── Dockerfile
│
├── docs/ (we document project in this folder)
│
├── .env.example
├── docker-compose.yml
├── README.md
└── .gitignore
```
