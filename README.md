# Discord Clone Project

پروژه تیمی درس تحلیل و طراحی سیستم‌ها

## ایده اصلی

این پروژه با Docker و Docker Compose اجرا می‌شود تا همه‌ی اعضای تیم یک محیط یکسان داشته باشند.  
هر نفر می‌تواند روی لپ‌تاپ خودش کانتینر جداگانه داشته باشد، اما **تعریف محیط اجرا** باید از روی Git یکی باشد.

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

### Infrastructure
- Docker
- Docker Compose

---

## اصل مهم هماهنگی تیم

برای یکسان ماندن پروژه، این چیزها باید همیشه در Git commit شوند:

- `backend/requirements.txt`
- `frontend/package.json`
- `frontend/package-lock.json`
- migrationهای Django
- `docker-compose.yml`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- فایل‌های کانفیگ پروژه

و این چیزها نباید commit شوند:

- `.env`
- `node_modules/`
- `__pycache__/`
- دیتای محلی و فایل‌های موقتی

---

## فایل‌های اولیه‌ای که باید مبنا قرار بگیرند

### 1) `.env.example`
نمونه‌ی تمام متغیرهای محیطی پروژه است.  
هر عضو تیم باید از روی آن `.env` بسازد:

```bash
cp .env.example .env
```

### 2) `backend/config/settings.py`
تنظیمات Django باید از `.env` بخواند، نه اینکه مقادیر مهم را hardcode کند.  
مواردی مثل این‌ها باید از محیط خوانده شوند:

- `SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- تنظیمات دیتابیس
- تنظیمات Redis و Celery

### 3) `backend/requirements.txt`
هر پکیج Python که اضافه می‌شود باید اینجا ثبت و commit شود.

### 4) `frontend/package.json` و `frontend/package-lock.json`
هر پکیج npm که اضافه می‌شود باید همراه lockfile commit شود.

### 5) Django appها و migrationها
هر feature جدید بهتر است داخل یک app جدا ساخته شود، مثلاً:

```bash
docker compose exec backend python manage.py startapp accounts
```

بعد از ساخت مدل یا تغییر schema:

```bash
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py migrate
```

### 6) یک فایل دستوری مشترک برای تیم
برای اینکه همه دقیقاً یک workflow داشته باشند، بهتر است یک `Makefile` در ریشه پروژه باشد.  
این فایل کمک می‌کند دستورهای مهم تیمی یکسان و کوتاه شوند.

---

## فایل‌های جدید پیشنهادی

### `Makefile`
برای استاندارد کردن دستورهای رایج:

- build
- up / down
- migrate
- makemigrations
- createsuperuser
- shell
- نصب پکیج‌ها

اگر `Makefile` را اضافه کردید، همه‌ی اعضا از همان دستورهای مشترک استفاده کنند.

---

## راه‌اندازی اولیه

### 1) گرفتن پروژه
```bash
git clone <repo-url>
cd Discord_Project
```

### 2) ساخت فایل env
```bash
cp .env.example .env
```

### 3) ساخت imageها
```bash
docker compose build
```

### 4) بالا آوردن پروژه
```bash
docker compose up
```

### 5) اعمال migrationها
```bash
docker compose exec backend python manage.py migrate
```

### 6) ساخت superuser
```bash
docker compose exec backend python manage.py createsuperuser
```

---

## روال درست کار تیمی

### اگر کسی بخواهد backend توسعه دهد
- یک app جدید بسازد یا روی app موجود کار کند
- مدل‌ها را تغییر دهد
- migration بسازد
- migration را commit کند

نمونه:

```bash
docker compose exec backend python manage.py startapp accounts
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py migrate
```

### اگر کسی بخواهد frontend توسعه دهد
- پکیج جدید را نصب کند
- `package.json` و `package-lock.json` را commit کند
- build را در صورت نیاز تست کند

نمونه:

```bash
docker compose exec frontend npm install axios
docker compose exec frontend npm run build
```

### اگر کسی بخواهد دیتابیس را تغییر دهد
- جدول را دستی داخل PostgreSQL نسازد
- مدل Django را تغییر دهد
- migration بسازد
- migration را commit کند

این مهم‌ترین قانون برای یکسان ماندن schema بین همه‌ی اعضاست.

---

## نکات مهم برای یکسان ماندن محیط

### Dependencyها
اگر چیزی نصب شد:
- Python: `requirements.txt`
- npm: `package.json` + `package-lock.json`

### Database
Schema باید فقط از طریق Django migration مدیریت شود.

### Superuser و داده‌های اولیه
`createsuperuser` برای هر نفر محلی است و commit نمی‌شود.  
اگر داده‌ی اولیه باید ثابت باشد، از fixture یا data migration استفاده کنید.

### Docker
کانتینر هر نفر می‌تواند جدا باشد.  
آنچه باید یکی باشد:
- Dockerfile
- docker-compose.yml
- env نمونه
- dependencyها
- migrationها

---

## دستورات رایج تیم

### باز کردن shell
```bash
docker compose exec backend bash
docker compose exec frontend sh
docker compose exec db psql -U app -d app
docker compose exec redis redis-cli
```

### تست
```bash
docker compose exec backend python manage.py test
```

### rebuild کامل
```bash
docker compose down
docker compose build --no-cache
docker compose up
```

---

## ساختار پیشنهادی پروژه

```text
project-root/
├── backend/
│   ├── config/
│   ├── accounts/            # مثال: appهای Django
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── package-lock.json
│   └── Dockerfile
├── docs/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Makefile
└── README.md
```

---

## قانون طلایی تیم

**کد، dependency، migration و configuration باید در Git باشند؛ کانتینر فقط محیط اجراست.**
