---
description: Implement frontend tasks from fe_tasks.md with React skills enforcement, dual-mode services, and post-implementation UI review
---

## EXECUTION CONTRACT

Steps 1→6 sequential. Each task: validate → if fail → retry 2x → STOP with error.

**DO NOT:** skip knowledge load (Step 1), skip contract validation (Step 4), implement without reading task's skill rules, create types for `visibility: internal` fields, generate code without dual-mode service pattern, skip UI review (Step 5).

---

## SHARED RULES

> 📖 Base rules: See [`_shared_rules.md`](./_shared_rules.md) for: **CONTEXT PRIORITY**, **ANTI-HALLUCINATION**, **TOOL PRIORITY**, **DIFF AWARENESS**.
> Workflow-specific overrides below.

### FE-Apply-specific Overrides

- **CONTEXT PRIORITY** (frontend-adapted):
  | # | Source | Override Rule |
  |---|--------|--------------|
  | 1 | `fe_tasks.md` | Task definitions — source of truth for WHAT to build |
  | 2 | `api_contract.md` | API shape — source of truth for HOW services connect |
  | 2 | `ui_design_spec.md` | UI design — source of truth for HOW screens look and behave |
  | 3 | `openspec/specs/design-guidelines.md` | Shared design system: tokens, colors, typography, components |
  | 4 | React skills (loaded per task) | Best practices for implementation quality |
  | 5 | Existing frontend source (`src/`) | Current patterns to follow |

- **ANTI-HALLUCINATION**: Same base. Additionally: DO NOT create endpoints not in `api_contract.md`. DO NOT invent MUI components not in project dependencies. DO NOT deviate from wireframe layout in `ui_design_spec.md`.
- **DIFF AWARENESS**: Check existing files BEFORE creating new ones. Modify first, create only when justified.
- **DESIGN COMPLIANCE**: Page components MUST match wireframe layout. ALL 4 states MUST be implemented. Responsive behavior MUST follow spec.

---

**Pipeline**: `/wf_fe_spec` → **`/wf_fe_apply`** → `/wf_e2e_verify` (Phase 3)

**Input**: Change name (kebab-case). Requires `fe_tasks.md` in change directory.

**Resumable**: Can pause and continue across sessions. Track progress in `fe_tasks.md` (`[ ]` → `[/]` → `[x]`).

---

## STEP 1 — Load Knowledge

### 1a. Verify fe_tasks.md

Check `openspec/changes/<name>/fe_tasks.md` exists. If missing → STOP → run `/wf_fe_spec`.

**Validate:**
- Has metadata header (contract version, complexity)
- Has ≥1 task with `[ ]` status
- All tasks have: file, action, contract source

### 1b. Load API Contract

Read `openspec/changes/<name>/api_contract.md`:
- Extract Response Wrapper format → needed for service unwrapping
- Extract endpoints → needed for contract compliance (Step 4)
- Extract error codes → needed for error handling implementation

### 1b-2. Load UI Design Spec

Read `openspec/changes/<name>/ui_design_spec.md`:
- Extract wireframes → needed for page component layout
- Extract interaction spec → needed for state implementation (loading, empty, error, success)
- Extract responsive spec → needed for breakpoint behavior
- Extract component hierarchy → needed for component structure decisions

> ⚠️ If `ui_design_spec.md` missing → WARN `"⚠️ No UI design spec. Implementation will follow basic MUI patterns."` → continue with degraded quality.

### 1b-3. Load Design Guidelines

Read `openspec/specs/design-guidelines.md`:
- Extract color palette → no hardcoded hex, use theme tokens
- Extract typography scale → use correct heading/body sizes
- Extract spacing tokens → consistent padding/margin
- Extract interaction states → loading/empty/error/success patterns
- Extract animation tokens → transition duration/easing

### 1c. Load React Skills (Per-Task, Max 3 Active)

> ⚠️ **Context isolation**: Load skills ON DEMAND per task type. DO NOT load all skills upfront.

| Task Type | Skills to Load |
|-----------|---------------|
| Design Review | _(verify `ui_design_spec.md` completeness — no skill needed)_ |
| TypeScript Types | _(no skill needed — follow contract directly)_ |
| API Service | `vercel-react-best-practices` → load rules: `async-parallel`, `client-swr-dedup` |
| Custom Hook | `vercel-react-best-practices` → load rules: `rerender-*` (relevant subset) |
| Page Component | `vercel-react-view-transitions` → load SKILL.md + CSS recipes; `design-taste-frontend` → layout variance, typography, color calibration; `ui-ux-designer` → interaction design, accessibility |
| Route Config | `vercel-react-best-practices` → load rules: `bundle-dynamic-imports` |
| Unit Tests | _(use Vitest conventions from existing tests)_ |
| UI Review | `ui-review` + `web-design-guidelines` + `design-taste-frontend` (Step 5) |

### 1d. Scan Existing Patterns

Quick scan of existing code for reuse patterns:

```bash
# HTTP client pattern
grep -r "import.*from.*utils/api" src/ --include="*.ts" --include="*.tsx" | head -5

# Hook pattern
ls src/hooks/ 2>/dev/null

# Service pattern
ls src/services/ 2>/dev/null

# Mock API pattern  
ls src/mock/ 2>/dev/null || ls mock/ 2>/dev/null
```

**Validate:** Tasks loaded, contract loaded, patterns discovered.

---

## STEP 2 — Per-Task Implementation

For each task in `fe_tasks.md` (in dependency order):

### 2a. Mark Task In-Progress

Update `fe_tasks.md`: `[ ]` → `[/]`

### 2b. Load Task-Specific Skills

Read skill rule files listed in the task (from `fe_tasks.md`). Max 3 rule files per task.

### 2c. Implement

#### For Design Review (`[REVIEW]` — Task 0)

> Pre-implementation gate — runs FIRST before any code task.

Verify `ui_design_spec.md` completeness:

- [ ] Wireframes cover ALL screens listed in Screen Inventory
- [ ] Component hierarchy matches screen inventory
- [ ] ALL interaction states defined (loading, empty, error, success) for every screen
- [ ] Responsive spec complete for all screens (desktop + tablet + mobile)
- [ ] Design guidelines compliance: colors, typography, spacing references present
- [ ] No `[OPEN]` design questions remain unresolved

**Gate logic:**
- **PASS** → continue to Task 1 (TypeScript Types)
- **NEEDS REVISION** → STOP → log issues → output `"⚠️ Design Review FAILED: <issues>. Fix ui_design_spec.md before continuing."` → wait for user
- **`ui_design_spec.md` missing** → WARN → continue with degraded quality (basic MUI patterns)

#### For TypeScript Types (`[NEW]` or `[MODIFY]`)

```typescript
// Pattern: Generate from contract, filter by visibility
// File: src/types/<feature>.types.ts

// ONLY include fields with visibility: public
// DO NOT include fields with visibility: internal
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

// Standard API response wrapper (shared across services)
export interface ApiResponse<T> {
  code: string;
  message: string;
  data: T;
  timestamp: string;
}
```

#### For API Service Layer (`[NEW]`)

```typescript
// Pattern: Dual-mode service with contract compliance
// File: src/services/<feature>.service.ts

import type { LoginRequest, LoginResponse, ApiResponse } from '@/types/<feature>.types';

const useMock = import.meta.env.VITE_USE_MOCK_API === 'true';

// Real API implementation
const realService = {
  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      // Map contract error codes to typed errors
      const error = await response.json();
      throw new ApiError(error.code, error.message);
    }
    
    // Unwrap ApiResponse<T> → return T directly
    const result: ApiResponse<LoginResponse> = await response.json();
    return result.data;
  },
};

// Mock implementation (preserves existing mock behavior)
const mockService = {
  async login(data: LoginRequest): Promise<LoginResponse> {
    // Reuse existing mock from src/mock/ or @auth/
    const { default: mockData } = await import('@/mock/auth/login');
    return mockData;
  },
};

export const authService = useMock ? mockService : realService;
```

**Skill enforcement for services:**
- `async-parallel`: Independent API calls → `Promise.all()`
- `client-swr-dedup`: Use SWR/fetch dedup pattern for GET endpoints

#### For Custom Hooks (`[NEW]`)

```typescript
// Pattern: Hook with error/loading state
// File: src/hooks/use<Feature>.ts

import { useState, useCallback } from 'react';
import { authService } from '@/services/<feature>.service';
import type { LoginRequest, LoginResponse } from '@/types/<feature>.types';

export function useAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const login = useCallback(async (data: LoginRequest): Promise<LoginResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.login(data);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  
  return { login, loading, error };
}
```

**Skill enforcement for hooks:**
- `rerender-functional-setstate`: Use functional setState for stable callbacks
- `rerender-derived-state-no-effect`: Derive state during render, not effects

#### For Page Components (`[NEW]` or `[MODIFY]`)

**Design-Aware Implementation (MANDATORY):**

1. **Read wireframe** from `ui_design_spec.md` → Screen section matching this page
2. **Apply layout** from wireframe: exact grid structure, component placement, content zones
3. **Implement ALL 4 states** from interaction spec:
   - **Loading**: Skeleton matching wireframe shape (NOT circular spinner)
   - **Empty**: Illustration + descriptive message + primary action CTA
   - **Error**: Alert banner with error message + retry action button
   - **Success**: Toast notification (auto-dismiss 5s)
4. **Apply responsive behavior** from responsive spec:
   - Desktop (≥1024): full layout as in wireframe
   - Tablet (768-1023): apply collapse rules (hide low-priority columns, stack layout)
   - Mobile (<768): card view, bottom sheets, simplified navigation
5. **Apply interactions** from interaction spec:
   - Hover/focus/active states with correct duration from `design-guidelines.md` §8
   - Form validation timing (onBlur/onChange/onSubmit per field spec)
   - Transitions: `ease-out` for enter, `ease-in` for exit

**Implementation order:**
```
1. Layout structure (grid, sections) ← from wireframe
2. Component placement             ← from component hierarchy  
3. Data binding (hooks, props)      ← from fe_tasks.md
4. Interaction states               ← from interaction spec
5. Responsive breakpoints           ← from responsive spec
6. Animation/transitions            ← from design-guidelines §8
7. Accessibility (aria-*, focus)    ← from design-guidelines §9
```

- Use MUI components following existing patterns + design-guidelines §11 (MUI Theme Mapping)
- Apply `<ViewTransition>` for route enter/exit (if applicable)
- Use `React.lazy()` + `Suspense` for code splitting

**Skill enforcement for components:**
- `vercel-react-view-transitions`: Wrap page in `<ViewTransition>` with proper `enter`/`exit`/`default="none"` 
- `rendering-conditional-render`: Use ternary, not `&&` for conditionals
- `rerender-no-inline-components`: Don't define components inside components
- `bundle-dynamic-imports`: Use dynamic imports for heavy sub-components

#### For Route Config (`[NEW]` or `[MODIFY]`)

Follow existing pattern from `src/app/(public)/(auth)/route.tsx`:
```typescript
import { lazy } from 'react';
import { CoreRouteItemType } from '@core/utils/CoreUtils';

const PageView = lazy(() => import('./components/views/PageView'));

const route: CoreRouteItemType = {
  children: [
    {
      path: '<route-path>',
      element: <PageView />,
      settings: {
        layout: {
          config: { /* navbar, toolbar, footer visibility */ }
        }
      },
      auth: /* authRoles config */
    }
  ]
};

export default route;
```

#### For Unit Tests (`[NEW]`)

Follow Vitest + JSDOM pattern:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
```

### 2d. Validate Per-Task

| Task Type | Validation |
|-----------|-----------|
| TypeScript Types | ✅ Interfaces match contract `Shared Types` (public fields only) |
| Service Layer | ✅ Endpoints match contract, dual-mode toggle works |
| Custom Hook | ✅ Returns correct state shape, error handling |
| Page Component | ✅ Renders with MUI, responsive layout |
| Route Config | ✅ Lazy-loaded, auth-protected, layout config |
| Unit Test | ✅ `pnpm test -- <file>` passes |

### 2e. Mark Task Complete

Update `fe_tasks.md`: `[/]` → `[x]`

---

## STEP 3 — Build Verification

After ALL tasks complete:

```bash
pnpm tsc --noEmit    # Type check — MUST pass
pnpm lint            # Lint check — MUST pass
pnpm build           # Production build — MUST pass
pnpm test            # All unit tests — MUST pass
```

> **Parallel execution note**: Code generation (Step 2) CAN run parallel with backend `wf_openspec_apply`.
> Build verification (Step 3) SHOULD run after backend API is available if `VITE_USE_MOCK_API=false`.
> When `VITE_USE_MOCK_API=true` (default during development), build verification runs independently.

**If any check fails**: Fix → re-run → max 3 retries → STOP with error report.

---

## STEP 4 — Contract Compliance

Verify implementation matches `api_contract.md`:

| Check | Method |
|-------|--------|
| Endpoint coverage | Every contract endpoint has a service function |
| Type accuracy | Frontend types match contract `Shared Types` (public fields only) |
| Error handling | Every contract error code has frontend handling |
| Response unwrapping | Services unwrap `ApiResponse<T>` → return `T` |
| State shape | Hook state matches contract `State Contracts` |

**Update contract status:**

```markdown
<!-- frontend-status: implemented -->
```

**If mismatch found**: Log as `⚠️ CONTRACT VIOLATION: <detail>` → fix immediately.

---

## STEP 5 — Post-Implementation UI Review

### 5a. Run `ui-review` Audit

Load `ui-review` SKILL.md → apply full checklist:

- [ ] **Design Tokens**: No hardcoded hex colors, proper MUI theme usage (ref: `design-guidelines.md` §2, §11)
- [ ] **Component Conventions**: Uses project class merge helpers, supports className (ref: `design-guidelines.md` §5)
- [ ] **Accessibility**: Touch targets, focus states, aria-* attributes, contrast (ref: `design-guidelines.md` §9)
- [ ] **Mobile UX**: No horizontal overflow, readable text, thumb-friendly spacing (ref: `design-guidelines.md` §7)
- [ ] **Typography & Spacing**: System type hierarchy, consistent spacing (ref: `design-guidelines.md` §3, §4)

### 5b. Run `web-design-guidelines` Audit

Fetch latest guidelines:
```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Apply rules to generated components → output findings.

### 5c. Design Compliance Audit (NEW — from `ui_design_spec.md`)

Verify implementation matches design spec:

| Check | Source | Method |
|-------|--------|--------|
| **Wireframe compliance** | `ui_design_spec.md` → Wireframes | Visual: layout structure matches wireframe grid |
| **Interaction states** | `ui_design_spec.md` → Interaction Spec | Code: all 4 states (loading, empty, error, success) exist |
| **Responsive behavior** | `ui_design_spec.md` → Responsive Spec | Code: breakpoint collapse rules applied correctly |
| **Component hierarchy** | `ui_design_spec.md` → Component Hierarchy | Code: component tree matches hierarchy diagram |
| **Form validation UX** | `ui_design_spec.md` → Interaction Spec → Form Validation | Code: validation timing matches spec (onBlur/onChange/onSubmit) |
| **Color palette** | `design-guidelines.md` §2 | Code: no hardcoded hex, all from theme tokens |
| **Typography** | `design-guidelines.md` §3 | Code: correct type scale applied per hierarchy |
| **Spacing** | `design-guidelines.md` §4 | Code: consistent spacing using defined tokens |
| **Animation** | `design-guidelines.md` §8 | Code: correct duration + easing, respects `prefers-reduced-motion` |
| **Accessibility** | `design-guidelines.md` §9 | Code: WCAG 2.1 AA baseline met |

### 5d. Generate Review Output

Write `openspec/changes/<name>/fe_review.md`:

```markdown
# Frontend Review: <name>

## Verdict: PASS | NEEDS IMPROVEMENT | FAIL

## API Contract Compliance
- Endpoints: <covered>/<total>
- Types: <matched>/<total>
- Error handling: <covered>/<total>

## Design Compliance
- Wireframe match: <screens_matched>/<total_screens>
- Interaction states: <pages_with_all_states>/<total_pages>
- Responsive spec: <pages_responsive>/<total_pages>
- Component hierarchy: <match_percentage>%
- Design guidelines: <compliant_checks>/<total_checks>

## Issues (prioritized)
1. [file:line] <issue> → <fix>

## Skills Compliance
- vercel-react-best-practices: <N>/<total> rules applied
- vercel-react-view-transitions: <applicable/not-applicable>
- design-taste-frontend: <verdict>
- ui-ux-designer: <verdict>
- ui-review: <verdict>
- web-design-guidelines: <N> issues found

## Open Questions
- <any design ambiguities>
```

**If FAIL**: Fix critical issues → re-audit → max 2 retries.

---

## STEP 6 — Summary

```
═══════════════════════════════════════
FE APPLY COMPLETE
═══════════════════════════════════════
Change:    <name>
Tasks:     <completed>/<total> completed
Build:     ✅ tsc | ✅ lint | ✅ build | ✅ test
Contract:  ✅ <endpoints>/<total> endpoints covered

🎨 Design Compliance:
  Wireframe:  <screens_matched>/<total> screens match
  States:     <pages_with_states>/<total> pages with all 4 states
  Responsive: <pages_responsive>/<total> pages responsive
  Guidelines: <compliant>/<total> design checks passed

Review:    <PASS|NEEDS IMPROVEMENT|FAIL>
Skills:    vercel-react-best-practices ✅
           vercel-react-view-transitions ✅
           design-taste-frontend ✅
           ui-ux-designer ✅
           ui-review ✅
           web-design-guidelines ✅
═══════════════════════════════════════
Ready: /wf_e2e_verify <name> (Phase 3)
  or:  /wf_client_doc <name>
  or:  /wf_archive <name>
```
