# API Contract: {{CHANGE_NAME}}

<!-- contract-version: 1.0 -->
<!-- backend-status: pending -->
<!-- frontend-status: pending -->
<!-- openapi-spec: {{OPENAPI_URL_OR_PATH}} -->
<!-- generated-by: wf_api_contract -->
<!-- generated-at: {{TIMESTAMP}} -->

> **Pipeline Bridge**: This contract is the shared source of truth between Backend Track (`wf_openspec_apply`) and Frontend Track (`wf_fe_spec` → `wf_fe_apply`).
> Both tracks MUST validate their implementation against this contract.

---

## Response Wrapper (Standard)

> All API responses MUST be wrapped in this standard envelope.
> Frontend service layer MUST unwrap `data` field before returning to hooks/components.

```typescript
interface ApiResponse<T> {
  code: string;        // "00" = success, other = error
  message: string;     // Human-readable message
  data: T;             // Response payload
  timestamp: string;   // ISO 8601 UTC
}

interface ApiErrorResponse {
  code: string;        // Error code (e.g., "AUTH_001")
  message: string;     // Error message
  errors?: Record<string, string[]>; // Field-level validation errors
  timestamp: string;
}
```

---

## Endpoints

<!-- 
  For each endpoint, specify:
  - HTTP method + path
  - Request interface with field visibility
  - Response interface (wrapped in ApiResponse<T>)
  - Error codes
  - Auth requirement

  Field visibility annotations:
  - visibility: public   → exposed to frontend
  - visibility: internal → backend only, NOT in frontend types
-->

### {{METHOD}} {{PATH}}

- **Auth**: `required` | `optional` | `none`
- **Request**:
  ```typescript
  interface {{RequestName}} {
    fieldName: type;    // validation rules, visibility: public
  }
  ```
- **Response ({{STATUS_CODE}})**:
  ```typescript
  // Wrapped: ApiResponse<{{ResponseName}}>
  interface {{ResponseName}} {
    fieldName: type;    // visibility: public
  }
  ```
- **Errors**:
  | Code | HTTP Status | Description | Frontend Action |
  |------|------------|-------------|-----------------|
  | {{ERR_CODE}} | {{HTTP_STATUS}} | {{description}} | {{toast/modal/redirect}} |

---

## Shared Types

<!--
  Define all types shared between endpoints.
  Mark internal fields as comments with "visibility: internal".
  Frontend type generator MUST skip internal fields.
-->

### {{TypeName}}

```typescript
interface {{TypeName}} {
  id: string;              // visibility: public
  // internalField: type;  // visibility: internal — NOT exposed to frontend
}
```

---

## State Contracts

> Define frontend state shape that corresponds to this feature.
> Frontend hooks/context MUST implement this interface.

### {{FeatureName}} State (Frontend)

```typescript
interface {{FeatureName}}State {
  // State shape
}
```

---

## Pagination Contract (if applicable)

```typescript
interface PaginatedRequest {
  page: number;       // 0-indexed, visibility: public
  size: number;       // default: 20, max: 100, visibility: public
  sort?: string;      // field:asc|desc, visibility: public
}

interface PaginatedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}
```

---

## Contract Rules

1. **Bi-directional sync**: If frontend needs additional fields → update this contract → notify backend
2. **Version bump**: Any breaking change MUST increment `contract-version`
3. **Status tracking**: Each track updates its status header after implementation
4. **Visibility enforcement**: Frontend generators MUST filter out `visibility: internal` fields
5. **Error handling**: Every error code MUST have a corresponding frontend action
6. **OpenAPI link**: When available, link to generated OpenAPI spec for type validation

---

## Validation Checklist

- [ ] Every endpoint has Request + Response + Errors defined
- [ ] All fields have visibility annotation
- [ ] Response wrapper format matches backend implementation
- [ ] Error codes are unique and documented
- [ ] State contract matches endpoint response shape
- [ ] OpenAPI spec link is valid (if available)
