# Triển khai Jira Dashboard bằng Docker Compose

## Yêu cầu

- Docker & Docker Compose đã cài đặt trên máy chủ

## Cách triển khai

### Trên máy chủ (server triển khai)

```bash
# 1. Copy toàn bộ project lên server (trừ node_modules, .env.local đã có trong .dockerignore/.gitignore)
# Đảm bảo file .env.local có mặt trên server

# 2. Build và chạy
docker compose up --build -d

# 3. Xem logs
docker compose logs -f
```

### Truy cập từ các máy khác

Server sẽ lắng nghe trên `0.0.0.0:3456` — mọi máy cùng mạng truy cập qua:

```
http://<IP-MAY-CHU>:3456
```

### Dừng dịch vụ

```bash
docker compose down
```

---

## Triển khai không dùng Docker (Node.js trực tiếp)

```bash
# Cài dependencies
npm install

# Chạy server (đã bind 0.0.0.0)
node jira-server.js
```
