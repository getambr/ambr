# Ambr Contract Template Schemas

6 Ricardian Contract template schemas for AI agent agreements.

## Templates

### Delegation (D-series)

| Slug | Name | Use Case |
|------|------|----------|
| `d1-general-auth` | General Agent Authorization | Broad delegation with spending caps and revocation terms |
| `d2-limited-service` | Limited Service Agent | Time-bounded, single-task delegation with fixed budget |
| `d3-fleet-auth` | Multi-Agent Fleet Authorization | Authorize a class of agents under a lead agent |

### Commerce (C-series)

| Slug | Name | Use Case |
|------|------|----------|
| `c1-api-access` | API Access Agreement | Pay-per-call or subscription API access between agents |
| `c2-compute-sla` | Compute & Data Processing SLA | Infrastructure SLA with uptime guarantees |
| `c3-task-execution` | Task Execution Agreement | Agent-to-agent task contract with deliverables |

## Schema Format

Each template is a JSON Schema (`type: "object"`) defining required and optional
parameters. Pass these parameters to the Ambr API when generating a contract.

## Legal Grounding

Templates are informed by legal research across:
- EU: eIDAS Art. 25 (electronic signatures), GDPR (data processing)
- US: UETA s. 14 (electronic agents), Delaware LLC Act
- UK: Electronic Communications Act 2000, Computer Misuse Act 1990
- Singapore: Electronic Transactions Act, Smart Nation initiatives

Templates are AI-generated and NOT legally certified. Consult qualified
legal counsel before relying on any generated contract.

## License

MIT
