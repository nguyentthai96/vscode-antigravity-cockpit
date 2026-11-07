---
# Contract State Template
# Auto-managed by wf_api_contract workflow
# User-editable: gate_rules section ONLY
# Copy to: openspec/changes/<name>/.memory/contract_state.md
# ─────────────────────────────────────

# Contract metadata (auto-set by wf_api_contract)
contract_version: null
backend_status: pending         # pending | implemented | drift | tested
frontend_status: pending        # pending | implemented | tested
last_generated: null            # ISO 8601 timestamp
last_validated: null            # ISO 8601 timestamp
endpoints_count: 0
drift_detected: false
drift_log: []
#  Example drift_log entry:
#  - endpoint: "POST /api/v1/auth/login"
#    issue: "Response field 'avatar' missing in backend"
#    severity: MEDIUM        # LOW | MEDIUM | HIGH | CRITICAL
#    detected_at: "2026-08-11T15:00:00+07:00"
#    resolved: false

# Consumers — platforms consuming this contract
consumers:
  - platform: web
    workflow: wf_fe_spec
    status: pending             # pending | ready | implemented | tested | n/a
  # - platform: mobile          # Uncomment when mobile frontend active
  #   workflow: wf_fe_spec
  #   status: n/a

# ─────────────────────────────────────
# Gate Rules — User-editable section
# These rules control wf_api_contract behavior
# ─────────────────────────────────────
gate_rules:
  frontend_active: true         # Primary gate — is frontend pipeline active?
  auto_generate: true           # Auto-generate contract after openspec completes?
  require_validation: true      # Require validation before fe_spec can run?
  # Custom rules — add your own conditions below:
  # custom_rule_1: true
  # custom_rule_2: "condition_value"
---
