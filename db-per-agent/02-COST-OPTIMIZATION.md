# Cost Optimization Strategies

## Scenario A: Neon Agent Plan (Apply for This!)

Neon offers a special **Agent Plan** for platforms that deploy databases on behalf of users.

### Two-Organization Structure

| Organization | Purpose | Cost | Limits |
|--------------|---------|------|--------|
| **Free Org** | Your free-tier users' agents | **$0 (Neon-sponsored!)** | 30,000 projects, Scale features |
| **Paid Org** | Your paid users' agents | $0.106/compute hour | 30,000 projects, $25K initial credits |

### How It Works

1. Neon creates **two organizations** in your account
2. **Free Org**: Neon sponsors all infrastructure costs - truly free for you
3. **Paid Org**: Usage-based billing at discounted rate ($0.106 vs $0.16/compute hour)
4. You get separate API keys for each org
5. Transfer projects between orgs when users upgrade/downgrade

### Cost Breakdown (Agent Plan)

| Your Tier | Agents | Monthly Cost | Notes |
|-----------|--------|--------------|-------|
| Free Users | 20 agents | **$0** | Neon sponsors infrastructure |
| Free Users | 100 agents | **$0** | Still free! |
| Free Users | 1,000 agents | **$0** | Up to 30K free |
| Free Users | 10,000 agents | **$0** | Still within limit |
| Paid Users | 100 agents | ~$10-50 | Only compute when active |
| Paid Users | 1,000 agents | ~$100-500 | Scale-to-zero helps |

### How to Apply

1. Contact Neon sales/partnerships team
2. Explain your platform and use case
3. They will set up the two-org structure
4. You receive API keys for both orgs

---

## Scenario B: Standard Scale Plan (Fallback)

If Agent Plan is not available, use the **Scale Plan** ($69/month):

### Scale Plan Includes

| Resource | Included | Extra Cost |
|----------|----------|------------|
| Projects | 1,000 | $50 per 1,000 more |
| Compute | 750 hours/month | $0.16/hour |
| Storage | 50 GB | $1.50/GB-month |
| Branches | 500 per project | $1.50/branch-month |

### Cost Optimization Strategies

#### 1. Aggressive Scale-to-Zero (CRITICAL)

```typescript
default_endpoint_settings: {
  suspend_timeout_seconds: 60,  // Suspend after 1 min (minimum practical)
  autoscaling_limit_min_cu: 0.25,
  autoscaling_limit_max_cu: 0.25,  // Keep at minimum for most agents
}
```

**Why this matters:**
- Compute is ONLY billed when active
- Cold start is ~500ms (acceptable for workflow execution)
- Your use case: "Agent runs x times a day" = perfect for scale-to-zero
- 1000 agents running 10 min/day each = ~83 compute hours (well within 750 included!)

#### 2. Minimal Storage Quotas

```typescript
settings: {
  quota: {
    logical_size_bytes: 52428800,   // 50 MB per agent
    active_time_seconds: 3600,      // 1 hour/day for free tier
    data_transfer_bytes: 104857600, // 100 MB transfer
  }
}
```

**Storage math:**
- 1000 agents x 50 MB = 50 GB (exactly the included amount)
- 2000 agents x 50 MB = 100 GB = $75 extra storage

#### 3. Tiered Quotas

| Your Tier | Compute/Day | Storage | Max CU |
|-----------|-------------|---------|--------|
| Free | 1 hour | 50 MB | 0.25 |
| Pro | 10 hours | 512 MB | 1 |
| Enterprise | Unlimited | 2 GB | 4 |

### Cost Projections (Scale Plan)

| Scenario | Agents | Compute Usage | Monthly Cost |
|----------|--------|---------------|--------------|
| Free tier (20 agents) | 20 | 10 min/day each | ~$69 base |
| Starter (100 agents) | 100 | 10 min/day each | ~$69 + $5 compute |
| Pro (500 agents) | 500 | 30 min/day each | ~$69 + $40 compute |
| Pro (1000 agents) | 1000 | 10 min/day each | ~$69 (within limits!) |
| Enterprise (2000 agents) | 2000 | 30 min/day | ~$119 + $80 compute |

---

## Cost Formula

```
Monthly Cost = Base Plan + Extra Projects + Extra Compute + Extra Storage

Scale Plan Example for 2000 agents:
- Base: $69
- Extra projects (1000): $50
- Compute: 2000 x 30min x 30days = 30,000 min = 500 hrs (within 750)
- Storage: 2000 x 50MB = 100GB, 50GB included = $75 extra
- Total: $69 + $50 + $0 + $75 = $194/month
```

---

## Key Optimization Tips

### 1. Suspend Timeout
Set `suspend_timeout_seconds` as low as practical:
- `60` seconds = Very aggressive, best savings
- `300` seconds = Balanced (5 min)
- `0` = Never suspend (expensive!)

### 2. Minimum Compute Units
Keep `autoscaling_limit_max_cu` low for most agents:
- `0.25` CU = Minimum, good for light workloads
- `1` CU = For medium workloads
- `2-4` CU = Only for heavy processing

### 3. Storage Quotas
Set per-agent storage limits to prevent runaway growth:
- Free tier: 50 MB (enough for config, credentials, small tables)
- Paid tier: 512 MB - 2 GB based on needs

### 4. Active Time Limits
Set `active_time_seconds` to enforce daily/monthly compute limits:
- Free: 3,600 seconds (1 hour/day)
- Paid: 36,000 seconds (10 hours/day)

When quota is exceeded, compute suspends until next period.

---

## Relationship to Cost Tracking

**This document** (02-COST-OPTIMIZATION.md) covers **infrastructure cost optimization**:
- How to configure Neon projects to minimize consumption
- Autoscaling settings, suspend timeouts, compute limits
- Direct impact on our Neon bill

**Cost Tracking** (07-COST-TRACKING.md) covers **user budget enforcement**:
- How we track consumption and calculate costs
- How we enforce per-user budget limits
- User-facing cost breakdown and billing

**These work together:**
1. Optimization strategies (here) → Lower consumption
2. Lower consumption → Lower costs calculated by cost tracking
3. Cost tracking → Enforces user budgets on actual usage
4. Users stay within their plan limits while getting flexible resources
