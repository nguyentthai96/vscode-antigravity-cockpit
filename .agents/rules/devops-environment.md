---
trigger: always
description: "Hướng dẫn chạy source dev và production — agent đọc file này để biết cách start/build/deploy nhanh"
---

# DevOps & Environment Rules

> Chuẩn hóa cách chạy source development, build production, và deploy.

## Project Overview

- **Monorepo**: pnpm workspaces + Turborepo
- **Workspaces**: `apps/web` (Next.js 16), `apps/api` (NestJS 12), `packages/shared` (shared types/validators)
- **Package Manager**: pnpm v11+ (via corepack)
- **Node.js**: v22+

## Development — Start Source

### Start cả Frontend + Backend

```bash
# Từ workspace root — Turborepo chạy song song
pnpm dev
```

### Start riêng từng service

```bash
# Backend (NestJS API) → http://localhost:4000/api
pnpm --filter @edumathmind/api dev

# Frontend (Next.js) → http://localhost:3000
pnpm --filter @edumathmind/web dev
```

### Port mặc định

| Service | Port | URL |
|---------|------|-----|
| Frontend (Next.js) | 3000 | http://localhost:3000 |
| Backend API (NestJS) | 4000 | http://localhost:4000/api |
| API Health | 4000 | http://localhost:4000/api/health |

### Environment Files

| File | Scope | Mô tả |
|------|-------|-------|
| `.env` | Backend (workspace root) | Database, JWT, Redis, Encryption, Logging |
| `apps/web/.env.local` | Frontend | `NEXT_PUBLIC_*` variables |
| `.env.example` | Reference | Mẫu tất cả biến cần thiết |

## Build Production (Local Verify)

```bash
# Full build (shared → api → web, theo dependency order)
pnpm build

# Build riêng
pnpm --filter @edumathmind/shared build   # TypeScript → dist/
pnpm --filter @edumathmind/api build      # NestJS → dist/
pnpm --filter @edumathmind/web build      # Next.js → .next/
```

### Build giống Vercel (verify trước khi push)

```bash
pnpm --filter @edumathmind/shared build && pnpm --filter @edumathmind/web build
```

### Build giống Render (verify Docker)

```bash
docker build -f Dockerfile.api -t edumathmind-api .
docker run -p 4000:10000 --env-file .env edumathmind-api
```

## Database

```bash
pnpm --filter @edumathmind/api db:generate   # Generate migration từ schema changes
pnpm --filter @edumathmind/api db:migrate    # Apply pending migrations
pnpm --filter @edumathmind/api db:studio     # Open Drizzle Studio GUI
```

## Testing

```bash
pnpm test                                    # All tests (Turborepo)
pnpm --filter @edumathmind/web test          # Frontend vitest
pnpm --filter @edumathmind/api test          # Backend vitest
```

## Deployment

### Frontend → Vercel

- **Trigger**: Push `main` branch
- **Config**: `vercel.json`
- **Build command**: `pnpm --filter @edumathmind/shared build && pnpm --filter @edumathmind/web build`
- **Output**: `apps/web/.next`

### Backend → Render

- **Trigger**: Push `main` branch (auto-deploy via Docker)
- **Config**: `render.yaml` + `Dockerfile.api`
- **Port**: 10000
- **Health check**: `/api/health`
- **CMD**: `node apps/api/dist/main.js`

### GitHub Actions

- `render-deploy-status.yml`: Poll Render API → hiện deploy status trên GitHub commit checks
- Secrets cần: `RENDER_API_KEY`, `RENDER_SERVICE_ID`

## Git Workflow

```bash
# Commit & push develop + main
git add . && git commit -m "feat/fix/ci: message"
git push origin develop
git checkout main && git merge develop --no-edit && git push origin main
git checkout develop
```

## Anti-Patterns

- ❌ Không chạy `npm install` — dùng `pnpm install`
- ❌ Không chạy `cd apps/web && next dev` — dùng `pnpm --filter @edumathmind/web dev`
- ❌ Không dùng `--disable-proto=throw` trong CMD — passport@0.7.0 không tương thích
- ❌ Không include test files trong tsconfig.json build — exclude `__tests__/**`, `*.test.ts`
- ❌ Không dùng middleware.ts — đã migrate sang proxy.ts (Next.js 16 convention)
