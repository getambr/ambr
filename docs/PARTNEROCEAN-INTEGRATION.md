# PartnerOcean x Ambr Integration Design

**Status:** Design doc (no code yet)
**Date:** March 10, 2026

## Context

PartnerOcean is a B2B partner discovery platform with an AI-powered deal pipeline.
When deals close (`DEAL_CLOSED` stage), there's currently no contract artifact —
just a stage transition timestamp. Ambr can generate a Ricardian Contract at deal
closure, giving both parties a verifiable, hash-linked legal document.

This is Ambr's first client integration and a dogfood of the MCP server.

## Integration Point

**Trigger:** Lead pipeline stage transition to `DEAL_CLOSED`

When `PATCH /api/v1/leads/{lead_id}/stage` sets `pipeline_stage = DEAL_CLOSED`:
1. Record commission (existing)
2. Create notification (existing)
3. **NEW:** Fire Celery task `create_ambr_contract`

## Flow

```
Lead → DEAL_CLOSED
  │
  ├─ record_commission() ← existing
  ├─ create_notification() ← existing
  └─ create_ambr_contract.delay(lead_id, team_id) ← NEW
       │
       ├─ Fetch lead + company + contact from DB
       ├─ POST /api/mcp (ambr_create_contract tool)
       │   template: "c4-partnership-agreement"
       │   parameters: { company_name, contact_name, deal_value, ... }
       │   principal_declaration: { agent_id, principal_name, principal_type }
       │
       ├─ Store ambr_contract_hash + reader_url on Lead record
       └─ Create notification: "Contract generated for {company_name}"
```

## New Template: `c4-partnership-agreement`

B2B partnership agreement template for PartnerOcean deals.

**Parameters:**
| Field | Type | Source |
|-------|------|--------|
| `company_name` | string | Lead → CompanyProfile.name |
| `company_country` | string | CompanyProfile.country |
| `contact_name` | string | ContactRecord.name |
| `contact_title` | string | ContactRecord.title |
| `deal_value` | number | Lead.deal_value |
| `currency` | string | Lead default "EUR" |
| `partnership_type` | string | "B2B Partnership" |
| `effective_date` | string | Lead.deal_closed_at (ISO) |

**Principal declaration:**
```json
{
  "agent_id": "partnerocean-{team_id}",
  "principal_name": "{team.name}",
  "principal_type": "company"
}
```

## PartnerOcean Schema Changes

Add to `Lead` model:

```python
ambr_contract_hash = Column(String(64), nullable=True, index=True)
ambr_reader_url = Column(String(256), nullable=True)
ambr_synced_at = Column(DateTime(timezone=True), nullable=True)
```

Migration: `alembic revision --autogenerate -m "add_ambr_contract_fields"`

## Celery Task

```python
# app/tasks/ambr.py

@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def create_ambr_contract(self, lead_id: str, team_id: str):
    """Create Ambr contract when deal closes."""
    # 1. Fetch lead with company + contact
    # 2. Build parameters from lead data
    # 3. Call Ambr MCP endpoint (POST https://getamber.dev/api/mcp)
    # 4. Store contract_hash + reader_url on Lead
    # 5. Create notification
```

**Config:** `AMBR_API_KEY` env var on PartnerOcean server, `AMBR_API_URL` default `https://getamber.dev/api/mcp`.

## Frontend Changes

### DealPanel.tsx

When `lead.ambr_reader_url` exists, show:

```
┌──────────────────────────────────────┐
│  Contract                            │
│  ─────────────────────────────────── │
│  Partnership agreement generated     │
│  [View in Reader Portal →]           │
│  Hash: abc123...                     │
└──────────────────────────────────────┘
```

Add as a new section in `DealPanel.tsx` below the existing deal metrics.

### LeadDetailPanel.tsx

Show contract status badge next to pipeline stage when `ambr_contract_hash` is set.

## MCP vs REST API

The integration calls Ambr's MCP endpoint (`POST /api/mcp`) using the `tools/call` JSON-RPC method. This dogfoods the MCP server and proves that non-LLM clients can use MCP tools as a standard API.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "ambr_create_contract",
    "arguments": {
      "template": "c4-partnership-agreement",
      "parameters": { ... },
      "principal_declaration": { ... }
    }
  }
}
```

**Headers:** `X-API-Key: {AMBR_API_KEY}`

## Rollout

1. Add template `c4-partnership-agreement` to Ambr seed data
2. Create Celery task on PartnerOcean
3. Add schema migration + API response fields
4. Add DealPanel contract section
5. Test end-to-end: close deal → verify contract appears in Reader Portal

## Open Questions

- **Who is the counterparty?** Currently the contract only identifies the principal (PartnerOcean team). The partner company would need to be a second signatory. Phase 2: add `ambr_sign_contract` step where the partner signs via email link.
- **Template legal review:** The `c4-partnership-agreement` template needs legal review before production use. For MVP, include disclaimer: "AI-generated, not legally reviewed."
- **Retry strategy:** If Ambr API is down at deal close time, Celery retries 3x with 30s delay. If all fail, log error and skip — contract can be generated manually later.
