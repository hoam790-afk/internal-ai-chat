# Internal AI Chat - Duong Minh Logistics

Web chat AI noi bo dung React + Vite, Node.js + Express, SQLite va OpenRouter.

## Tinh nang chinh

- Dang nhap 1 cua so: Admin bang mat khau, Client bang email.
- Admin chon model OpenRouter, sua system instruction, quan ly Q&A database.
- Client chi thay chat, lich su chat va cau tra loi.
- Luu conversations/messages/settings vao SQLite.
- Admin co the sua cau hoi/cau tra loi va save vao database. Cau hoi tuong tu se uu tien lay cau tra loi da luu moi nhat.
- Upload PDF, Word, Excel, CSV, TXT, anh va screenshot.
- Anh/file duoc OpenRouter doc thong tin lo hang truoc, sau do AI tiep tuc tu van HS code/chinh sach.
- Giao dien mau do Duong Minh, co logo.

## Bao mat

Khong dua API key len GitHub.

File bi chan boi `.gitignore`:

- `backend/.env`
- `backend/data/`
- `data/`
- `node_modules/`
- `frontend/dist/`
- `*.sqlite`

Truoc khi deploy production, hay thu hoi key cu neu da lo va tao OpenRouter API key moi.

## Cai dat local

Yeu cau Node.js 20+.

```bash
npm install
cp backend/.env.example backend/.env
npm run dev
```

Windows PowerShell:

```powershell
npm install
Copy-Item backend/.env.example backend/.env
npm run dev
```

Mo app:

- Frontend dev: `http://localhost:5173`
- Backend API: `http://localhost:4000/api/health`

## Bien moi truong backend

Tao `backend/.env`:

```env
OPENROUTER_API_KEY=your_new_openrouter_key_here
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173
OPENROUTER_HTTP_REFERER=http://localhost:5173
OPENROUTER_APP_TITLE=Internal AI Chat
DATABASE_PATH=./data/chat.sqlite
DEFAULT_MODEL=google/gemini-2.5-flash
MAX_COMPLETION_TOKENS=6000
MAX_CONTINUATION_ROUNDS=2
OPENROUTER_TIMEOUT_MS=20000
SHIPMENT_EXTRACTION_MODEL=openrouter/auto
ADMIN_PASSWORD=change_this_admin_password
JWT_SECRET=change_this_long_random_secret
```

## Build production

```bash
npm run build
NODE_ENV=production npm start
```

Khi `NODE_ENV=production`, backend se phuc vu luon frontend trong `frontend/dist`.

## Dua code len GitHub

1. Tao repository tren GitHub, vi du: `internal-ai-chat`.
2. Trong thu muc project, chay:

```bash
git init
git add .
git commit -m "Initial internal AI chat app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/internal-ai-chat.git
git push -u origin main
```

Neu Git chua co tren Windows, cai Git for Windows truoc, mo lai PowerShell roi chay lai cac lenh tren.

Kiem tra truoc khi push:

```bash
git status
git check-ignore -v backend/.env
git check-ignore -v backend/data/chat.sqlite
```

Hai lenh `git check-ignore` phai co ket qua, nghia la file nhay cam da duoc chan.

## Deploy len Hostinger VPS qua GitHub

Khuyen dung Ubuntu VPS.

### 1. SSH vao VPS

Trong Hostinger hPanel, vao VPS Overview lay IP, username va password, hoac dung Browser Terminal.

Tu may tinh:

```bash
ssh root@YOUR_VPS_IP
```

### 2. Cai package can thiet

```bash
apt update
apt upgrade -y
apt install -y git nginx ufw
```

Cai Node.js 20 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

Cai PM2:

```bash
npm install -g pm2
```

### 3. Clone code tu GitHub

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/YOUR_USERNAME/internal-ai-chat.git
cd internal-ai-chat
npm install
```

### 4. Tao file production env

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Vi du production:

```env
OPENROUTER_API_KEY=your_new_openrouter_key_here
NODE_ENV=production
PORT=4000
FRONTEND_ORIGIN=https://yourdomain.com
OPENROUTER_HTTP_REFERER=https://yourdomain.com
OPENROUTER_APP_TITLE=Duong Minh Internal AI Chat
DATABASE_PATH=./data/chat.sqlite
DEFAULT_MODEL=google/gemini-2.5-flash
MAX_COMPLETION_TOKENS=6000
MAX_CONTINUATION_ROUNDS=2
OPENROUTER_TIMEOUT_MS=20000
SHIPMENT_EXTRACTION_MODEL=openrouter/auto
ADMIN_PASSWORD=your_strong_admin_password
JWT_SECRET=your_very_long_random_secret
```

Luu file trong nano: `Ctrl + O`, Enter, `Ctrl + X`.

### 5. Build va chay bang PM2

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Kiem tra:

```bash
pm2 status
curl http://127.0.0.1:4000/api/health
```

### 6. Cau hinh Nginx

Tao file:

```bash
nano /etc/nginx/sites-available/internal-ai-chat
```

Noi dung:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
```

Bat site:

```bash
ln -s /etc/nginx/sites-available/internal-ai-chat /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 7. Tro domain ve VPS

Trong DNS cua domain, tao:

- A record `@` tro ve `YOUR_VPS_IP`
- A record `www` tro ve `YOUR_VPS_IP`

DNS co the mat vai phut den 24 gio de cap nhat.

### 8. Bat HTTPS SSL

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Sau khi SSL xong, sua `backend/.env`:

```env
FRONTEND_ORIGIN=https://yourdomain.com
OPENROUTER_HTTP_REFERER=https://yourdomain.com
```

Restart app:

```bash
pm2 restart internal-ai-chat
```

## Cap nhat code sau nay

Tren may local:

```bash
git add .
git commit -m "Update app"
git push
```

Tren VPS:

```bash
cd /var/www/internal-ai-chat
git pull
npm install
npm run build
pm2 restart internal-ai-chat
```

## Lenh huu ich

```bash
pm2 logs internal-ai-chat
pm2 restart internal-ai-chat
pm2 stop internal-ai-chat
systemctl status nginx
nginx -t
```

