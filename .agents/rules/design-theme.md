---
trigger: always
description: "LABMath design theme — brand colors, spacing, typography, component styling standards"
---

# LABMath Design Theme Rules

> Tông màu và design tokens chuẩn cho dự án LABMath EduMathMind. Lấy từ logo SVG và brand identity.

## Brand Color Palette

### Primary Colors (Navy Blue — Giáo dục, Tin cậy)

| Token | Hex | Sử dụng |
|-------|-----|---------|
| `brand.primary` | `#003171` | Buttons chính, headers, section bars, links |
| `brand.primaryDark` | `#001D45` | Hover states, tiêu đề đậm, text emphasis |
| `brand.primaryLight` | `#0056B0` | Links hover, focus rings, secondary elements |
| `brand.primaryBg` | `#EBF2FF` | Background highlight nhạt, selected states |

### Accent Colors (Orange — Năng động, Sáng tạo)

| Token | Hex | Sử dụng |
|-------|-----|---------|
| `brand.accent` | `#FD9615` | Accent bars, badges, highlights, CTA phụ |
| `brand.accentDark` | `#E07800` | Hover trên accent |
| `brand.accentLight` | `#FFF3E0` | Background warning nhạt, accent cards |

### Neutral Colors (Gray Scale)

| Token | Hex | Sử dụng |
|-------|-----|---------|
| `neutral.50` | `#F8FAFC` | Page background, card background light |
| `neutral.100` | `#F1F5F9` | Dividers nhẹ, alternating row |
| `neutral.200` | `#E2E8F0` | Borders, dividers, separator lines |
| `neutral.300` | `#CBD5E1` | Disabled borders, placeholder |
| `neutral.400` | `#94A3B8` | Placeholder text, disabled icons |
| `neutral.500` | `#64748B` | Secondary text, muted labels |
| `neutral.600` | `#475569` | Body text, descriptions |
| `neutral.700` | `#334155` | Strong body text |
| `neutral.800` | `#1E293B` | Heading text |
| `neutral.900` | `#0F172A` | Darkest text |

### Semantic Colors

| Token | Hex | Sử dụng |
|-------|-----|---------|
| `success` | `#059669` | Thành công, hoàn tất, active |
| `successBg` | `#ECFDF5` | Background success alerts |
| `warning` | `#D97706` | Cảnh báo, pending |
| `warningBg` | `#FFFBEB` | Background warning alerts |
| `error` | `#DC2626` | Lỗi, xóa, nguy hiểm |
| `errorBg` | `#FEF2F2` | Background error alerts |
| `info` | `#0284C7` | Thông tin, tips |
| `infoBg` | `#F0F9FF` | Background info alerts |

## Rules

### Color Usage

- **Nền trang**: `#F8FAFC` (admin layout đã set)
- **Paper / Card**: `#FFFFFF` với border `#E2E8F0`
- **Section headers** (bar đậm): `bgcolor: '#003171'` + text `#FFFFFF` + accent bar `#FD9615`
- **Page titles**: `color: '#001D45'`, `fontWeight: 800`
- **Body text**: `color: '#475569'` hoặc `#334155`
- **Muted / Helper text**: `color: '#64748B'`
- **Primary buttons**: `bgcolor: '#003171'`, hover `'#001D45'`, shadow `rgba(0,49,113,0.3)`
- **Outlined buttons**: `borderColor: '#CBD5E1'`, text `'#475569'`
- **Delete / Danger buttons**: `bgcolor: '#DC2626'`, hover `'#B91C1C'`

### Component Styling

#### Paper / Card
```
elevation={0}
borderRadius: 3 (24px)
border: '1px solid #E2E8F0'
backgroundColor: '#FFFFFF'
```

#### Form Inputs
```
size="small"
TextField: default MUI styling (border #CBD5E1 focus #003171)
Labels: Vietnamese primary + English secondary — "Họ và Tên / Full name *"
```

#### Table Header
```
bgcolor: '#F8FAFC'
text: fontWeight 600, color '#001D45'
border-bottom: '2px solid #E2E8F0'
```

#### Status Chips
```
Active/Đang học: color='success' — green
Pending/Chờ: color='warning' — amber
Inactive/Nghỉ: color='default' — gray
```

#### Stepper
```
Active step icon: '#003171'
Completed step icon: '#059669'
Inactive step icon: '#CBD5E1'
```

### Typography Scale

| Element | Weight | Size | Color |
|---------|--------|------|-------|
| Page title (h4) | 800 | 1.5rem–2rem | `#001D45` |
| Page subtitle | 400 | 0.875rem | `#64748B` |
| Section heading | 700 | 0.92–0.95rem | `#001D45` |
| Form label | 400–500 | 0.875rem | MUI default |
| Body text | 400 | 0.875rem | `#475569` |
| Helper text | 400 | 0.75rem | `#64748B` |
| Monospace (codes) | 700 | 0.9rem | `#003171`, `fontFamily: 'monospace'` |

### Spacing Standards

| Context | Value |
|---------|-------|
| Page padding | `p: { xs: 1.5, sm: 2.5, md: 3 }` (admin layout) |
| Section gap | `mb: 3` (24px) |
| Form field gap | `spacing={2.5}` trong Grid |
| Card padding | `p: 2.5` (20px) |
| Button padding | `px: 3` outlined, `px: 4` contained |

### Shadow Standards

- **Cards**: `boxShadow: '0 4px 24px rgba(0,29,69,0.07)'`
- **Primary CTA**: `boxShadow: '0 4px 14px rgba(0,49,113,0.3)'`
- **Elevated elements**: `boxShadow: '0 8px 32px rgba(0,29,69,0.12)'`
- **Print**: `boxShadow: 'none'`

## Anti-Patterns

- ❌ Dùng màu ngoài palette (không random hex) — luôn tham chiếu bảng trên
- ❌ Mix font weight lung tung — theo bảng Typography Scale
- ❌ Dùng `borderRadius` không nhất quán — Paper: 3 (24px), inner card: 2 (16px), button: default
- ❌ Dùng `elevation` > 0 trên Paper — project dùng `elevation={0}` + border
- ❌ Text trắng trên nền nhạt hoặc text đen trên nền đậm mà contrast không đủ
- ❌ Quá nhiều màu accent trong 1 trang — orange accent chỉ dùng điểm nhấn, không phủ rộng

