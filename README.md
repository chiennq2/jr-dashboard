# Jira Dashboard

Jira Dashboard là một ứng dụng web nhẹ để xem và phân tích issue từ Jira. Dự án gồm một dashboard HTML tĩnh, một server Node.js để chạy local/proxy Jira API, và một bộ API routes để triển khai trên Vercel với đăng nhập Google.

## Tính năng

- Xem danh sách issue Jira theo project, assignee, trạng thái và khoảng ngày.
- Hiển thị thống kê bằng biểu đồ và các thẻ tổng quan.
- Tìm kiếm, lọc và phân trang danh sách issue.
- Xuất báo cáo từ dashboard.
- Hỗ trợ đăng nhập Google cho bản deploy trên Vercel.

## Cấu trúc dự án

- `jira-dashboard.html`: giao diện dashboard chính.
- `login.html`: trang đăng nhập Google.
- `jira-server.js`: server Node.js chạy local, phục vụ file tĩnh và proxy Jira API.
- `start-jira-dashboard.command`: script khởi động nhanh trên macOS.
- `api/`: các API route cho Vercel, gồm auth và proxy Jira.
- `doc/jira-rest-api-v2.json`: tài liệu/đặc tả Jira REST API tham chiếu.

## Yêu cầu

- Node.js 18 trở lên.
- Quyền truy cập Jira qua token.
- Nếu dùng bản deploy, cần Google OAuth client và danh sách email được phép đăng nhập.

## Chạy local

### Cách 1: dùng Node trực tiếp

```bash
node jira-server.js
```

Sau đó mở:

```text
http://localhost:3456
```

### Cách 2: dùng file `.command` trên macOS

Nhấp đúp `start-jira-dashboard.command` hoặc chạy từ Terminal:

```bash
chmod +x start-jira-dashboard.command
./start-jira-dashboard.command
```

## Biến môi trường

### Local server

- `JIRA_TOKEN`: token dùng để gọi Jira API.

### Vercel / API auth

- `AUTH_SECRET` hoặc `NEXTAUTH_SECRET`: secret để ký session cookie.
- `GOOGLE_CLIENT_ID`: client ID của Google OAuth.
- `GOOGLE_CLIENT_SECRET`: client secret của Google OAuth.
- `ALLOWED_EMAILS`: danh sách email được phép đăng nhập, phân tách bằng dấu phẩy.
- `JIRA_BASE`: base URL của Jira, ví dụ `https://your-jira-host/rest/api/2` hoặc `https://your-jira-host`.
- `JIRA_TOKEN`: token dùng để proxy request sang Jira.
- `JIRA_ALLOW_SELF_SIGNED`: đặt `true` nếu Jira dùng chứng chỉ tự ký.

## Luồng sử dụng

1. Mở dashboard.
2. Nếu đang dùng bản Vercel, hệ thống sẽ chuyển sang `login.html` khi chưa có session.
3. Đăng nhập bằng Google bằng email nằm trong `ALLOWED_EMAILS`.
4. Dashboard gọi Jira qua endpoint `/api/jira/*` hoặc `/jira/*` tùy môi trường chạy.

## API chính

- `GET /api/auth/login`: bắt đầu đăng nhập Google.
- `GET /api/auth/callback`: callback OAuth.
- `GET /api/auth/logout`: đăng xuất và xoá session.
- `GET /api/auth/session`: kiểm tra trạng thái đăng nhập.
- `GET /api/jira?path=...`: proxy request đến Jira trên Vercel.
- `GET /jira/*`: proxy Jira khi chạy local bằng `jira-server.js`.

## Deploy trên Vercel

1. Đẩy source lên repository.
2. Tạo project Vercel từ repo đó.
3. Khai báo các biến môi trường ở phần trên.
4. Deploy theo cấu hình trong `vercel.json`.

## Ghi chú

- Giao diện dashboard dùng CDN cho Tailwind, Chart.js và Flatpickr.
- Khi chạy local, server Node sẽ phục vụ file tĩnh từ thư mục gốc và proxy Jira API qua `/jira/*`.