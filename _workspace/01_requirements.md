# Yêu cầu phân tích: Tối ưu giao diện Jira Dashboard cho Mobile

## Yêu cầu tóm tắt
Tối ưu hóa giao diện Jira Dashboard để hiển thị và hoạt động tốt trên mobile/tablet, giữ nguyên trải nghiệm desktop.

## Phạm vi

### Bao gồm
- Responsive layout cho màn hình mobile (320px-768px) và tablet (768px-1024px)
- Tối ưu header, navigation và các thành phần điều khiển cho touch interface
- Responsive cho các thẻ thống kê (stat cards) - hiển thị dạng stack/grid linh hoạt
- Tối ưu bộ lọc (filter bar) - có thể collapse/expand trên mobile
- Responsive cho bảng dữ liệu issues - horizontal scroll hoặc card view
- Tối ưu biểu đồ Chart.js để hiển thị tốt trên màn hình nhỏ
- Responsive modal ULNN - điều chỉnh width, padding, font size
- Tối ưu form inputs, dropdowns cho touch interaction
- Điều chỉnh kích thước nút bấm, spacing cho mobile (minimum 44x44px touch target)
- Breakpoint strategy sử dụng Tailwind CSS responsive utilities (sm:, md:, lg:, xl:)

### Loại trừ
- Không thay đổi logic nghiệp vụ hoặc data flow
- Không làm thay đổi giao diện desktop (phải giữ nguyên trải nghiệm hiện tại ở màn hình ≥1024px)
- Không tạo mobile app riêng (chỉ responsive web)
- Không thay đổi Backend API
- Không refactor sang framework khác (giữ nguyên HTML/Vanilla JS)
- Không thay đổi màu sắc, branding hiện có

## Các lớp bị ảnh hưởng

- [x] Frontend (jira-dashboard.html, login.html, odoo-auth.html)
- [ ] Backend API (api/*, jira-server.js)
- [ ] Triển khai (Dockerfile, docker-compose.yml, vercel.json)
- [ ] Biến môi trường (.env)
- [ ] Tài liệu (README, SETUP, DEPLOY)

## Yêu cầu chi tiết

### Yêu cầu chức năng

#### 1. Header Navigation (jira-dashboard.html lines 32-117)
- **Hiện trạng**: Header fixed với `max-w-7xl`, flex layout, logo + title bên trái, logout + export buttons bên phải
- **Mobile**: 
  - Stack layout (flex-col) cho mobile < 640px
  - Logo/title center-aligned
  - Buttons full-width hoặc compact icons
  - Reduce padding từ `px-6 py-5` xuống `px-4 py-3`
  - Font size title giảm từ `text-xl` xuống `text-lg`

#### 2. Stat Cards (Section thống kê tổng quan)
- **Hiện trạng**: Grid layout với các card hiển thị số liệu (Total Issues, Open, In Progress, Resolved, Closed, ULNN)
- **Mobile**: 
  - Chuyển từ grid nhiều cột sang 1-2 cột
  - Sử dụng `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
  - Reduce padding trong card
  - Icon size điều chỉnh nhỏ hơn

#### 3. Filter Bar (Bộ lọc)
- **Hiện trạng**: Horizontal layout với nhiều inputs (Project, Assignee, Status, Date Range)
- **Mobile**:
  - Chuyển sang vertical stack
  - Collapse/expand với button toggle
  - Full-width inputs
  - Date picker responsive (Flatpickr có hỗ trợ mobile)
  - Nút "Áp dụng" full-width

#### 4. ULNN Modal (lines 44-113)
- **Hiện trạng**: Modal width `w-[92vw] max-w-6xl`, table với nhiều cột
- **Mobile**:
  - Width `w-full` với margin nhỏ hơn
  - Reduce padding từ `px-6` xuống `px-4`
  - Table horizontal scroll hoặc stack rows
  - Chart canvas height điều chỉnh từ 520px xuống 300px
  - Close button dễ nhấn hơn (lớn hơn)

#### 5. Charts (Chart.js)
- **Hiện trạng**: Canvas fixed height, responsive: true trong config
- **Mobile**:
  - Điều chỉnh height động theo viewport
  - Font size trong legend, tooltips, axes giảm
  - Padding/margins trong chart options
  - Có thể ẩn bớt labels trên trục x nếu quá dày

#### 6. Issue Table (lines 3174-3199)
- **Hiện trạng**: Table với 8 cột (Key, Summary, Project, Assignee, Status, Estimate, TimeSpent, Created)
- **Mobile**:
  - Option 1: Horizontal scroll với fixed first column
  - Option 2: Card view - mỗi issue là 1 card
  - Reduce padding từ `px-6 py-3` xuống `px-3 py-2`
  - Font size nhỏ hơn

#### 7. Forms & Inputs
- **Hiện trạng**: Inputs với padding chuẩn, dropdowns mặc định
- **Mobile**:
  - Minimum touch target 44x44px
  - Increase input height/padding
  - Dropdowns dễ chọn hơn với touch
  - Multi-select tags (ulnnUserChips) wrap tốt hơn

#### 8. Buttons & Actions
- **Hiện trạng**: Buttons với padding `px-4 py-2`
- **Mobile**:
  - Minimum size 44x44px
  - Full-width buttons cho primary actions
  - Icon-only buttons có padding đủ lớn

### Yêu cầu phi chức năng

#### Hiệu năng
- Không tăng bundle size đáng kể (vẫn dùng Tailwind CDN)
- Chart.js vẫn render nhanh trên mobile (có thể giảm số data points nếu cần)
- Không lazy load - giữ nguyên cơ chế hiện tại

#### Responsive Design
- **Breakpoints**: 
  - Mobile: < 640px (sm)
  - Tablet: 640px - 1024px (sm, md)
  - Desktop: ≥ 1024px (lg, xl)
- Sử dụng Tailwind responsive prefixes: `sm:`, `md:`, `lg:`, `xl:`
- Desktop breakpoint (≥1024px) phải giữ nguyên 100% giao diện hiện tại

#### Tương thích
- iOS Safari, Chrome Mobile, Android Chrome
- Landscape và Portrait orientation
- Viewport meta tag đã có: `width=device-width, initial-scale=1.0`
- Touch-friendly (no hover-only interactions)

#### Maintainability
- Không thay đổi cấu trúc HTML lớn
- Chỉ thêm/sửa Tailwind classes
- Có thể thêm custom CSS trong `<style>` nếu cần cho mobile-specific tweaks
- JavaScript logic giữ nguyên, chỉ điều chỉnh DOM manipulation nếu cần

## Luồng dữ liệu
Không thay đổi. Vẫn giữ nguyên:
- Client gọi API `/api/jira/issues`
- Render data với Chart.js và DOM manipulation
- LocalStorage cho user preferences, ULNN OT/Leave state

## Điều kiện chấp nhận

- [ ] Tất cả các trang (jira-dashboard.html, login.html, odoo-auth.html) responsive tốt trên mobile (320px-768px)
- [ ] Giao diện desktop (≥1024px) không bị thay đổi gì so với hiện tại
- [ ] Header, stat cards, filter bar, modal ULNN hiển thị tốt và sử dụng được trên mobile
- [ ] Biểu đồ Chart.js hiển thị rõ ràng, không bị cắt/overflow trên mobile
- [ ] Bảng issues có thể xem được trên mobile (scroll hoặc card view)
- [ ] Tất cả buttons, inputs đều có minimum touch target 44x44px
- [ ] Test trên iPhone Safari, Android Chrome ở cả portrait và landscape
- [ ] Không có horizontal scroll không mong muốn (trừ table nếu dùng scroll strategy)
- [ ] Toast notifications, modals hoạt động tốt trên mobile
- [ ] DatePicker (Flatpickr) hoạt động tốt với touch
- [ ] Export report image vẫn hoạt động trên mobile

## Rủi ro

### 1. Chart.js trên mobile nhỏ
- **Vấn đề**: Quá nhiều data points, labels bị chồng lên nhau
- **Giảm thiểu**: Điều chỉnh Chart options (font size, skip labels, reduce padding), có thể filter bớt data trên mobile

### 2. Table quá nhiều cột
- **Vấn đề**: 8 cột không vừa màn hình mobile
- **Giảm thiểu**: Horizontal scroll với fixed first column, hoặc chuyển sang card view với toggle

### 3. Modal ULNN quá phức tạp
- **Vấn đề**: Table OT/Leave với nhiều input, chart lớn
- **Giảm thiểu**: Reduce tất cả kích thước, có thể ẩn bớt thông tin phụ, hoặc tab navigation

### 4. Performance trên mobile cũ
- **Vấn đề**: Chart.js + DOM heavy có thể chậm
- **Giảm thiểu**: Không thay đổi logic, chỉ CSS. Nếu cần có thể debounce resize events

### 5. Touch interactions
- **Vấn đề**: Hover effects không hoạt động, dropdowns khó chọn
- **Giảm thiểu**: Sử dụng `@media (hover: hover)` cho hover styles, tăng touch target size

### 6. Tailwind CDN limitations
- **Vấn đề**: Không purge, bundle lớn, không customize config
- **Giảm thiểu**: Đã chấp nhận trade-off này từ đầu, CDN vẫn đủ nhanh cho use case

## Ghi chú kỹ thuật

### File structure hiện tại
- **jira-dashboard.html**: 3204 dòng, chứa HTML + CSS + JS inline
- **Tailwind CSS**: CDN, không có config file
- **Chart.js**: CDN v4.4.0
- **Flatpickr**: CDN v4.6.13

### Các section chính cần tối ưu
1. Header (lines 32-117)
2. ULNN Modal (lines 44-113)
3. Stat cards section (cần tìm trong file)
4. Filter bar section (cần tìm)
5. Charts rendering (Chart.js config trong script)
6. Issue table (lines 3174-3199)

### Chiến lược implementation
1. **Phase 1**: Thêm responsive classes cho layout chính (header, stat cards, filter)
2. **Phase 2**: Tối ưu modal, tables với scroll/card strategy
3. **Phase 3**: Điều chỉnh Chart.js options cho mobile
4. **Phase 4**: Fine-tune touch targets, spacing, fonts
5. **Phase 5**: Test trên devices thực và fix bugs

### Breakpoint strategy (Tailwind)
```
Default (mobile-first): < 640px
sm: 640px
md: 768px  
lg: 1024px (desktop baseline - KHÔNG ĐƯỢC THAY ĐỔI)
xl: 1280px
2xl: 1536px
```

Sử dụng pattern: `class="mobile-default md:tablet-style lg:desktop-style"`
