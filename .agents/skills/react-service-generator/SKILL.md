---
name: react-service-generator
description: "Generate dual-mode API service layer from api_contract.md. Creates TypeScript services with mock/real API toggle and response unwrapping."
category: pipeline
risk: safe
source: project
date_added: "2026-08-11"
tags: [react, service-layer, api, dual-mode, typescript]
---

# React Service Generator

## Overview

Generates TypeScript API service layer from `api_contract.md`. Services are dual-mode (mock/real) with `VITE_USE_MOCK_API` environment toggle. Response unwrapping strips the `ApiResponse<T>` envelope, returning clean typed data to hooks and components.

## When to Use

- During `/wf_fe_apply` Step 2 (service layer tasks)
- When adding new API endpoints to existing service
- When migrating from mock API to real backend

## When NOT to Use

- Frontend-only changes with no API interaction
- Modifying existing service logic (use manual editing)

## Instructions

### Input

- `api_contract.md` → endpoints, types, error codes, response wrapper
- Existing `src/services/` patterns (if any)
- Existing `src/@auth/authApi.ts` for auth pattern reference

### Generation Pattern

#### 1. TypeScript Types (from contract)

```typescript
// src/types/<feature>.types.ts

// Standard API response wrapper
export interface ApiResponse<T> {
  code: string;
  message: string;
  data: T;
  timestamp: string;
}

// Custom API error
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Request/Response types — ONLY visibility: public fields
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}
```

#### 2. Dual-Mode Service

```typescript
// src/services/<feature>.service.ts

import type { ApiResponse, LoginRequest, LoginResponse, ApiError } from '@/types/<feature>.types';

const useMock = import.meta.env.VITE_USE_MOCK_API === 'true';

// ─── Real API Implementation ────────────────────────

async function realLogin(data: LoginRequest): Promise<LoginResponse> {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new ApiError(error.code, error.message, response.status);
  }

  // Unwrap ApiResponse<T> → return T
  const result: ApiResponse<LoginResponse> = await response.json();
  return result.data;
}

// ─── Mock Implementation ────────────────────────────

async function mockLogin(data: LoginRequest): Promise<LoginResponse> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Return mock data matching contract shape
  return {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    user: {
      id: '1',
      email: data.email,
      displayName: 'Demo User',
      role: 'ADMIN',
      createdAt: new Date().toISOString(),
    },
  };
}

// ─── Exported Service (toggle via VITE_USE_MOCK_API) ─

export const authService = {
  login: useMock ? mockLogin : realLogin,
  // ... other endpoints
};
```

### Skill Rules Applied

From `vercel-react-best-practices`:
- `async-parallel`: Use `Promise.all()` for independent API calls
- `client-swr-dedup`: Leverage SWR or fetch deduplication for GET endpoints

### Error Handling Pattern

Map contract error codes to frontend actions:

```typescript
// Error handling helper
export function handleApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'AUTH_001': return 'Invalid email or password';
      case 'AUTH_002': return 'Account is locked. Contact support.';
      default: return error.message;
    }
  }
  return 'An unexpected error occurred';
}
```

### Output Files

| File | Content |
|------|---------|
| `src/types/<feature>.types.ts` | TypeScript interfaces from contract |
| `src/services/<feature>.service.ts` | Dual-mode service with all endpoints |

### Validation

- [ ] Every contract endpoint has a service function
- [ ] All types match contract `Shared Types` (public fields only)
- [ ] Response unwrapping strips `ApiResponse<T>` envelope
- [ ] Error codes mapped to user-friendly messages
- [ ] Mock implementation returns data matching contract shape
- [ ] `VITE_USE_MOCK_API` toggle works correctly
- [ ] No `visibility: internal` fields in generated types

## Limitations

- Does not generate hooks (use manual or separate hook generator)
- Does not handle WebSocket endpoints (REST only)
- Mock data is synthetic — may not match real API edge cases
- Requires `api_contract.md` to exist
