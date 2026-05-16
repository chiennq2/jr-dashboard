# 🚀 Hướng dẫn Chạy Local Jira Dashboard

## Tổng quan

- **Local Dev**: `jira-server.js` chạy port 3456 (KHÔNG cần auth, KHÔNG kết nối Vercel)
- **Production**: Vercel với Google OAuth (env vars riêng, quản lý tại Vercel Dashboard)

## 1️⃣ Chuẩn bị

### Yêu cầu
- Node.js 18+
- Jira API Token (lấy từ Jira account của bạn)
- Jira server URL

### Cách lấy Jira API Token
1. Đăng nhập Jira tại `https://your-jira-instance/secure/ReleaseTools.jspa`
2. Click **Profile** → **API Tokens**
3. Click **Create API token**
4. Copy token (lưu ở nơi an toàn)

## 2️⃣ Setup Local

### Step 1: Tạo file .env.local

```bash
cp .env.example .env.local
```

### Step 2: Edit .env.local

```bash
# Thêm credentials của bạn
JIRA_BASE=https://your-jira-instance:port
JIRA_TOKEN=paste_your_token_here
```

**Ví dụ:**
```
JIRA_BASE=https://jira.company.com
JIRA_TOKEN=ATC_abc123xyz789def456
```

### Step 3: Cài dependencies (lần đầu)

```bash
npm install
```

### Step 4: Chạy local server

```bash
# Cách 1: Chạy trực tiếp
node jira-server.js

# Cách 2: macOS - nhấp đúp file
./start-jira-dashboard.command

# Cách 3: Chạy với dev script (nếu có)
npm run dev
```

**Output:**
```
🚀 Jira Dashboard: http://localhost:3456
   Press Ctrl+C to stop
```

### Step 5: Truy cập dashboard

Mở browser: `http://localhost:3456`

## ⚠️ Giữ Local & Prod Riêng Biệt

| Khía cạnh | Local | Vercel |
|-----------|-------|--------|
| **File chạy** | `jira-server.js` | `/api/*` routes |
| **Auth** | KHÔNG có | Google OAuth |
| **Port** | 3456 | Production domain |
| **Env vars** | `.env.local` | Vercel Dashboard |
| **Commit?** | ❌ NO (.gitignore) | ❌ NO (Dashboard) |

### .gitignore (đảm bảo không commit credentials)

```
.env.local
.env.production
.env*.local
node_modules/
.DS_Store
```

## 🔧 Troubleshooting

### ❌ "EADDRINUSE: address already in use :::3456"
Cổng 3456 đang bị dùng.

**Fix:**
```bash
# Tìm process dùng port 3456
lsof -i :3456

# Kill process
kill -9 <PID>

# Hoặc chạy ở cổng khác
PORT=3457 node jira-server.js
```

### ❌ "Jira Token is missing"
`JIRA_TOKEN` không được set hoặc sai.

**Fix:**
```bash
# Kiểm tra .env.local tồn tại
ls -la .env.local

# Kiểm tra nội dung
cat .env.local

# Đảm bảo token hợp lệ từ Jira
```

### ❌ "Unable to connect to Jira"
`JIRA_BASE` URL sai hoặc Jira server offline.

**Fix:**
```bash
# Test kết nối
curl -H "Authorization: Bearer $JIRA_TOKEN" \
  "$JIRA_BASE/rest/api/2/serverInfo"
```

### ❌ CORS error trong browser
Check headers CORS đã được thêm vào `jira-server.js`.

## 📝 Các File Quan Trọng

| File | Mục đích |
|------|---------|
| `.env.local` | ✅ Tạo cho local (👈 **add to .gitignore**) |
| `.env.example` | 📋 Template, commit vào repo |
| `jira-server.js` | 🖥️ Local server, chạy trực tiếp |
| `/api/*` | 🌐 Vercel routes, chỉ chạy trên Vercel |
| `vercel.json` | ⚙️ Config Vercel rewrites |

## ✅ Checklist Trước Commit

```
☑️ .env.local được thêm vào .gitignore
☑️ Credentials KHÔNG được commit lên repo
☑️ Local & Prod dùng riêng biệt env vars
☑️ Vercel env vars được set ở Dashboard
☑️ .env.example có template mà không secrets
☑️ Local chạy được tại http://localhost:3456
```

## 🚢 Deploy Changes lên Vercel

1. **Push code** (KHÔNG có .env.local)
   ```bash
   git push
   ```

2. **Vercel** tự deploy (dùng env vars từ Dashboard)

3. **Local vẫn riêng** - chỉ dùng .env.local

---

**Nguyên tắc an toàn:** Local & Prod hoàn toàn độc lập. Thay đổi local KHÔNG bao giờ ảnh hưởng tới production. 🎯
