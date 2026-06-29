SHELL := /bin/bash

.PHONY: help setup build up down logs restart \
        backend-shell frontend-shell db-shell redis-shell \
        makemigrations migrate createsuperuser test \
        backend-install frontend-install frontend-dev frontend-build clean

help:
	@echo "Targets:"
	@echo "  setup               Copy .env.example to .env if needed"
	@echo "  build               Build Docker images"
	@echo "  up                  Start the full stack"
	@echo "  down                Stop the full stack"
	@echo "  logs                Follow container logs"
	@echo "  restart             Rebuild and restart"
	@echo "  backend-shell       Open a shell in backend container"
	@echo "  frontend-shell      Open a shell in frontend container"
	@echo "  db-shell            Open psql in db container"
	@echo "  redis-shell         Open redis-cli in redis container"
	@echo "  makemigrations      Create Django migrations"
	@echo "  migrate             Apply Django migrations"
	@echo "  createsuperuser     Create a Django superuser"
	@echo "  test                Run Django tests"
	@echo "  backend-install PKG=package  Install a Python package in backend"
	@echo "  frontend-install PKG=package Install an npm package in frontend"
	@echo "  frontend-dev        Run frontend locally with pnpm (recommended)"
	@echo "  frontend-build      Build frontend assets"
	@echo "  clean               Remove containers, images and volumes (careful)"

setup:
	@[ -f .env ] || cp .env.example .env
	@echo ".env is ready"

build:
	docker compose build

up:
	docker compose up

down:
	docker compose down

logs:
	docker compose logs -f

restart:
	docker compose down
	docker compose build
	docker compose up

backend-shell:
	docker compose exec backend bash

frontend-shell:
	docker compose exec frontend sh

db-shell:
	docker compose exec db psql -U app -d app

redis-shell:
	docker compose exec redis redis-cli

makemigrations:
	docker compose exec backend python manage.py makemigrations

migrate:
	docker compose exec backend python manage.py migrate

createsuperuser:
	docker compose exec backend python manage.py createsuperuser

test:
	docker compose exec backend python manage.py test

backend-install:
	@if [ -z "$(PKG)" ]; then echo "Usage: make backend-install PKG=<package>"; exit 1; fi
	docker compose exec backend pip install $(PKG)
	@echo "Now commit backend/requirements.txt after updating it."

frontend-install:
	@if [ -z "$(PKG)" ]; then echo "Usage: make frontend-install PKG=<package>"; exit 1; fi
	docker compose exec frontend npm install $(PKG)
	@echo "Now commit frontend/package.json and frontend/package-lock.json."

frontend-dev:
	pnpm run dev

frontend-build:
	docker compose exec frontend npm run build

clean:
	docker compose down -v --remove-orphans
