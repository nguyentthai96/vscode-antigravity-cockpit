---
name: api-contract-generator
description: "Generate api_contract.md from OpenSpec artifacts (design.md, srs.md, tasks.md). Bridge between backend and frontend pipelines."
category: pipeline
risk: safe
source: project
date_added: "2026-08-11"
tags: [api-contract, full-stack, pipeline, openspec]
---

# API Contract Generator

## Overview

Generates `api_contract.md` — the shared artifact bridging backend and frontend pipelines. This skill extracts API endpoint specifications from OpenSpec design artifacts and formats them into a standardized contract that both `wf_openspec_apply` and `wf_fe_spec` consume.

## When to Use

- During `/wf_openspec` Step 7f (automatic)
- When manually creating an API contract for frontend-only changes
- When updating a contract after backend API changes

## When NOT to Use

- Backend-only changes with no frontend impact
- Non-API changes (database migrations, config changes)

## Instructions

### Input Sources

| Source | What to Extract |
|--------|----------------|
| `design.md` | Endpoint definitions, class mappings, DTO structures |
| `srs.md` | Validation rules, error codes, functional requirements |
| `tasks.md` | Handler file paths, implementation details |
| Project conventions | Response wrapper format, error response format |

### Generation Steps

1. **Extract Endpoints**: Parse `design.md` for HTTP method + path definitions
2. **Build Request Interfaces**: Map SRS validation rules to TypeScript interface fields
3. **Build Response Interfaces**: Map design DTO structures to TypeScript interfaces
4. **Apply Visibility**: Mark each field as `public` or `internal`
5. **Extract Error Codes**: Map SRS error specifications to error table
6. **Add Response Wrapper**: Include project's standard API response envelope
7. **Add State Contracts**: Define frontend state shape for the feature
8. **Validate**: Cross-check all FRs have endpoint coverage

### Field Visibility Rules

| Field Type | Visibility | Example |
|-----------|-----------|---------|
| API response fields | `public` | `id`, `email`, `displayName` |
| Audit fields | `internal` | `createdBy`, `updatedBy`, `deletedAt` |
| Soft-delete flags | `internal` | `isDeleted`, `deletedAt` |
| Internal IDs | `internal` | `internalSeqId`, `auditTrailId` |
| Security tokens (internal) | `internal` | `passwordHash`, `salt` |

### Template

Use: `templates/api_contract.template.md` (relative to this skill directory)

### Output

File: `openspec/changes/<name>/api_contract.md`

### Validation Checklist

- [ ] Every endpoint in `design.md` has a contract entry
- [ ] Every FR with API interaction has endpoint coverage
- [ ] All fields have visibility annotation
- [ ] Response wrapper matches project convention
- [ ] Error codes are unique across endpoints
- [ ] State contract matches response shape
- [ ] No `visibility: internal` fields in TypeScript interfaces (commented out only)

## Limitations

- Does not generate OpenAPI/Swagger spec (that comes from backend build tools)
- Does not validate against running backend — only against spec artifacts
- Requires `design.md` to exist (run `/wf_openspec` first)
