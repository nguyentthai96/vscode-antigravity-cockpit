---
trigger: always
description: "Responsive design rules — mobile-first, mọi thay đổi UI phải hoạt động tốt trên mobile"
---

# Responsive Design Rules

> Mọi thay đổi UI/UX phải responsive trên tất cả thiết bị: mobile (320–480px), tablet (481–768px), desktop (769px+).

## Principles

- **Mobile-first**: Viết CSS/styles cho mobile trước, dùng breakpoints mở rộng cho tablet/desktop
- **Touch-friendly**: Mọi target tương tác tối thiểu 44×44px trên mobile
- **Content priority**: Nội dung quan trọng nhất hiển thị đầu tiên trên mobile
- **No horizontal scroll**: Tuyệt đối không để trang bị scroll ngang trên bất kỳ thiết bị nào

## Rules

### MUI Breakpoints (dùng nhất quán)

| Breakpoint | Giá trị | Thiết bị |
|-----------|---------|----------|
| `xs` | 0–599px | Mobile |
| `sm` | 600–899px | Tablet dọc |
| `md` | 900–1199px | Tablet ngang / Laptop |
| `lg` | 1200–1535px | Desktop |
| `xl` | ≥1536px | Desktop lớn |

### Layout

- Dùng MUI `Grid` với `size={{ xs: 12, sm: 6, md: 4 }}` — không hardcode width
- Dùng responsive `sx` props: `sx={{ p: { xs: 1.5, sm: 2.5, md: 3 } }}`
- Flex layout phải có `flexWrap: 'wrap'` khi có nhiều items
- Dùng `gap` thay vì margin để spacing giữa flex items
- `maxWidth` cho Paper/Card phải kèm `width: '100%'`

### Typography

- Font size responsive: `fontSize: { xs: '0.85rem', sm: '0.95rem', md: '1rem' }`
- Tiêu đề trang: `variant="h4"` trên desktop, hiển thị nhỏ hơn trên mobile qua `sx`
- Text dài phải có `overflow: 'hidden'`, `textOverflow: 'ellipsis'` khi cần

### Form Fields

- Tất cả form fields phải `fullWidth` trên mobile (`xs: 12`)
- Chia cột 2-3 chỉ từ `sm` trở lên
- Input height phải đủ lớn cho touch: `size="small"` (40px) hoặc `size="medium"` (56px)
- Label không được bị cắt — dùng `shrink` cho date fields
- Buttons trong form:
  - Mobile: `fullWidth` hoặc ít nhất chiếm 50% width
  - Desktop: auto-width với `px: 3` hoặc `px: 4`

### Navigation & Actions

- Action bar (buttons group): `flexWrap: 'wrap'` + `gap: 1` trên mobile
- Stepper: dùng `alternativeLabel` hoặc đổi sang dọc trên mobile nếu quá 4 steps
- Breadcrumbs: ẩn trên mobile nếu quá dài, hoặc dùng `maxItems={2}`
- Bottom action bar: `position: 'sticky'` trên mobile để luôn nhìn thấy

### Table & Data

- Bảng dữ liệu phải có `overflow-x: auto` container
- Ẩn cột phụ trên mobile: `display: { xs: 'none', md: 'table-cell' }`
- Xem xét dùng Card layout thay bảng trên mobile

### Dialog & Modal

- Dialog: `fullScreen` trên mobile, `maxWidth="sm"` trên desktop
- Bottom sheet pattern cho action menus trên mobile

### Images & Media

- Logo/images: responsive height `sx={{ height: { xs: 36, sm: 44, md: 52 } }}`
- Dùng `objectFit: 'contain'` cho logo, `'cover'` cho ảnh nền

### Print

- `@media print` không bị ảnh hưởng bởi responsive rules
- Print form luôn full-width, không responsive

## Testing Checklist

Mỗi khi sửa UI, PHẢI kiểm tra trên:
- [ ] Mobile (≤ 480px) — Chrome DevTools: iPhone SE / 14
- [ ] Tablet (768px) — Chrome DevTools: iPad
- [ ] Desktop (1280px+)
- [ ] Không có horizontal scroll trên mobile
- [ ] Touch targets ≥ 44px trên mobile
- [ ] Text không bị cắt / overflow

## Anti-Patterns

- ❌ Hardcode `width: 500px` — dùng `maxWidth` + `width: '100%'`
- ❌ `position: 'fixed'` không responsive — luôn test trên mobile
- ❌ Dùng `display: 'flex'` mà không có `flexWrap: 'wrap'`
- ❌ Font size cố định không responsive
- ❌ Stepper ngang > 4 bước trên mobile
- ❌ Table column quá nhiều mà không ẩn/scroll trên mobile
- ❌ Buttons quá nhỏ (< 36px height) trên mobile
- ❌ Padding/margin hardcode không dùng `{ xs, sm, md }`

