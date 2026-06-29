# Discord Clone Project



پروژه تیمی درس تحلیل و طراحی سیستم‌ها



## ایده اصلی



این پروژه یک **monorepo** است: backend با Django و frontend با React/Vite در یک مخزن Git.  

برای دیتابیس، Redis و backend از Docker Compose استفاده می‌شود تا همه‌ی اعضای تیم محیط یکسان داشته باشند.  

برای توسعه‌ی frontend، معمولاً **pnpm** را مستقیم روی سیستم خودتان اجرا می‌کنید (سریع‌تر و HMR بهتر).



---



## فناوری‌ها



### Backend

- Django

- Django REST Framework

- Django Channels

- PostgreSQL

- Redis

- Celery



### Frontend

- React

- Vite

- TypeScript

- pnpm (workspace)



### Infrastructure

- Docker

- Docker Compose



---



## پیش‌نیازها



| ابزار | نسخه پیشنهادی | برای چه کاری |

|--------|----------------|--------------|

| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | آخرین نسخه پایدار | db، redis، backend |

| [Node.js](https://nodejs.org/) | 22+ | frontend |

| [pnpm](https://pnpm.io/installation) | 10+ | frontend |

| [Python](https://www.python.org/) | 3.12+ | فقط اگر backend را خارج از Docker اجرا کنید |



---



## راه‌اندازی سریع (پیشنهادی برای توسعه)



### ۱) گرفتن پروژه

```bash

git clone <repo-url>

cd Discord_Project

```



### ۲) ساخت فایل env

```bash

cp .env.example .env

```



### ۳) بالا آوردن سرویس‌های backend (اولین بار)

```bash

docker compose build

docker compose up db redis backend

```



در ترمینال دیگر:



### ۴) نصب وابستگی‌های frontend

```bash

pnpm install

```



### ۵) اجرای frontend

```bash

pnpm run dev

```



- Frontend: http://localhost:5173  

- Backend API: http://localhost:8000  

- Admin: http://localhost:8000/admin  



### ۶) migration و superuser (فقط بار اول)

```bash

docker compose exec backend python manage.py migrate

docker compose exec backend python manage.py createsuperuser

```



---



## دو روش توسعه



### روش A — Hybrid (پیشنهادی)



| بخش | نحوه اجرا | Hot reload |

|-----|-----------|------------|

| db + redis + backend | `docker compose up db redis backend` | ✅ تغییرات Python بلافاصله اعمال می‌شود |

| frontend | `pnpm run dev` از ریشه پروژه | ✅ Vite HMR |



**مزایا:** frontend سریع‌تر است، مصرف اینترنت کمتر (نیازی به rebuild image برای تغییر کد نیست).



### روش B — همه چیز داخل Docker



```bash

docker compose up

```



frontend هم داخل کانتینر بالا می‌آید. برای تغییر کد Python یا React **نیازی به rebuild image نیست** — volume mount و autoreload فعال است.  

فقط وقتی `requirements.txt` یا `package.json` عوض شد، rebuild لازم است:



```bash

docker compose build backend   # بعد از تغییر pip packages

docker compose build frontend  # بعد از تغییر npm packages

```



---



## دستورات رایج



### Frontend (از ریشه monorepo)

```bash

pnpm install          # نصب وابستگی‌ها

pnpm run dev          # dev server (بدون نیاز به --host)

pnpm run build        # build production

pnpm run lint         # eslint

```



### Docker / Backend

```bash

docker compose up db redis backend    # فقط سرویس‌های لازم backend

docker compose up                     # کل stack

docker compose down                   # خاموش کردن

docker compose logs -f backend        # لاگ backend

```



### Django

```bash

docker compose exec backend python manage.py makemigrations

docker compose exec backend python manage.py migrate

docker compose exec backend python manage.py createsuperuser

docker compose exec backend python manage.py test

docker compose exec backend bash

```



### Shell سرویس‌ها

```bash

docker compose exec db psql -U app -d app

docker compose exec redis redis-cli

```



### Makefile (اختیاری)

```bash

make setup

make build

make up

make migrate

```



---



## چه زمانی rebuild لازم است؟



| تغییر | rebuild لازم؟ |

|-------|----------------|

| فایل‌های `.py` در backend | ❌ خیر — autoreload |

| فایل‌های `.tsx` / `.ts` در frontend | ❌ خیر — HMR |

| `backend/requirements.txt` | ✅ `docker compose build backend` |

| `frontend/package.json` | ✅ `pnpm install` + در صورت Docker: `docker compose build frontend` |

| `docker-compose.yml` یا Dockerfile | ✅ `docker compose build` |



---



## اصل مهم هماهنگی تیم



این فایل‌ها باید در Git commit شوند:



- `backend/requirements.txt`

- `frontend/package.json`

- `frontend/pnpm-lock.yaml`

- `package.json` و `pnpm-workspace.yaml` (ریشه monorepo)

- migrationهای Django

- `docker-compose.yml`

- `backend/Dockerfile` و `frontend/Dockerfile`

- `.env.example`



این‌ها commit **نشوند**:



- `.env`

- `node_modules/`

- `__pycache__/`

- دیتای محلی



---



## تنظیمات محیط (`.env`)



فایل `.env.example` را کپی کنید. backend مقادیر را از محیط می‌خواند.



برای **Hybrid dev** (backend در Docker، db روی localhost):

```env

POSTGRES_HOST=db

REDIS_HOST=redis

```



اگر backend را **خارج از Docker** اجرا می‌کنید ولی db/redis در Docker هستند:

```env

POSTGRES_HOST=localhost

REDIS_HOST=localhost

```



---



## روال کار تیمی



### Backend

```bash

docker compose exec backend python manage.py startapp accounts

docker compose exec backend python manage.py makemigrations

docker compose exec backend python manage.py migrate

```



هر پکیج Python جدید → `requirements.txt` → commit → `docker compose build backend`



### Frontend

```bash

pnpm add axios --filter frontend

pnpm run build

```



`package.json` و `pnpm-lock.yaml` را commit کنید.



### Database

Schema فقط از طریق Django migration — هرگز دستی در PostgreSQL.



---



## ساختار پروژه



```text

Discord_Project/

├── backend/

│   ├── config/

│   ├── requirements.txt

│   └── Dockerfile

├── frontend/

│   ├── src/

│   ├── package.json

│   ├── pnpm-lock.yaml

│   └── Dockerfile

├── package.json              # اسکریپت‌های monorepo

├── pnpm-workspace.yaml

├── .env.example

├── docker-compose.yml

├── Makefile

└── README.md

```



---



## عیب‌یابی



### `pnpm run dev` کار نمی‌کند

```bash

pnpm install

```

مطمئن شوید Node 22+ و pnpm نصب است.



### تغییرات backend در Docker دیده نمی‌شود

- مطمئن شوید `docker compose up` در حال اجراست (نه فقط build یک‌باره)

- در Windows، `WATCHFILES_FORCE_POLLING=true` در `docker-compose.yml` تنظیم شده است

- rebuild فقط برای تغییر dependency لازم است، نه برای تغییر `.py`



### frontend از Docker در دسترس نیست

`host: true` در `frontend/vite.config.ts` تنظیم شده — دیگر نیازی به `--host` در خط فرمان نیست.



---



## قانون طلایی تیم



**کد، dependency، migration و configuration در Git؛ کانتینر فقط محیط اجراست. برای تغییر کد، rebuild نکنید — فقط up کنید.**

