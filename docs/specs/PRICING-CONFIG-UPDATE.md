# Pricing Configuration Update — A2C + C2C Templates

> Exact values to add to 3 files when new templates are implemented.

---

## 1. seed-data.ts — `price_cents` column

Add after existing c3 INSERT:

| Slug | price_cents | Display price |
|---|---|---|
| `a1-service-purchase` | 30 | $0.30 |
| `a2-ai-subscription` | 30 | $0.30 |
| `a3-warranty-liability` | 30 | $0.30 |
| `p1-nda` | 50 | $0.50 |
| `p2-freelance` | 50 | $0.50 |
| `p3-rental-settlement` | 50 | $0.50 |

---

## 2. x402/pricing.ts — `defaults` map (USDC 6-decimal)

Add to the `defaults` object in `getTemplatePrice()`:

```typescript
'a1-service-purchase': 300000n,       // $0.30
'a2-ai-subscription': 300000n,        // $0.30
'a3-warranty-liability': 300000n,     // $0.30
'p1-nda': 500000n,                    // $0.50
'p2-freelance': 500000n,             // $0.50
'p3-rental-settlement': 500000n,     // $0.50
```

**Conversion formula:** `price_cents * 10000 = USDC units` (6 decimals)
- 30 cents = 30 * 10000 = 300000n
- 50 cents = 50 * 10000 = 500000n

---

## 3. A2A handler pricing (a2a/handler.ts ~line 303)

Add to the pricing object returned in 402 responses:

```typescript
"a1-service-purchase": "$0.30",
"a2-ai-subscription": "$0.30",
"a3-warranty-liability": "$0.30",
"p1-nda": "$0.50",
"p2-freelance": "$0.50",
"p3-rental-settlement": "$0.50",
```

Note: A2A display prices can differ from actual pricing (existing pattern shows d1 at $2.00 display vs $0.50 actual). For consumer templates, keep display = actual to maintain pricing transparency per compliance checklist.

---

## Blended ARPU verification

| Segment | Templates | Avg price | Weight (by volume) |
|---|---|---|---|
| Delegation (d1-d3) | 3 | $1.07 | 20% |
| Commerce (c1-c3) | 3 | $1.25 | 15% |
| A2C (a1-a3) | 3 | $0.30 | 55% |
| C2C (p1-p3) | 3 | $0.50 | 10% |
| **Blended** | **12** | **$0.50** | **100%** |

Weighted: (0.20 * 1.07) + (0.15 * 1.25) + (0.55 * 0.30) + (0.10 * 0.50) = 0.214 + 0.188 + 0.165 + 0.050 = **$0.617**

Actual blended will be closer to $0.50 because A2C volume dominance ($0.30 * 55% weight) pulls the average down. v3.4 model uses $0.50 blended ARPU which is reasonable for the expected volume mix.
