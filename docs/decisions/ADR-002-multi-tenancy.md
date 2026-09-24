# ADR-002: Multi-Tenancy Architecture

## Status
✅ **ACCEPTED**

## Context

The system must support:
- Multiple organizations using same infrastructure
- Data isolation between organizations
- Different configurations per organization
- Possible future SaaS model

## Decision

**Implement multi-tenancy at database layer**:
- Every entity includes `organizationId`
- Queries always filter by `organizationId`
- Organizational boundaries enforced at application layer
- User belongs to one or more organizations

## Architecture

### Tenant Isolation

```typescript
// Every organization entity
interface Entity {
  _id: ObjectId;
  organizationId: string;  ← Tenant identifier
  // ... other fields
}

// Every query
db.collection.find({ organizationId: req.context.organizationId, ... })
```

### User Membership

```typescript
// User can belong to multiple organizations
interface User {
  _id: ObjectId;
  email: string;
  // organizationId NOT here - it's in OrganizationMembership
}

interface OrganizationMembership {
  _id: ObjectId;
  organizationId: string;
  userId: string;
  roles: ['admin', 'user', etc];
  joinedAt: Date;
}
```

### Context Extraction

```typescript
// JWT payload extracts organization context
const context = {
  userId: token.userId,
  organizationId: token.organizationId,  ← From JWT
  roles: membership.roles
}

// Backend VALIDATES user belongs to organizationId
```

## Database Design

### Indices for Tenant Isolation

```typescript
// Single org queries
collection.index({ organizationId: 1 });

// Org + specific field
collection.index({ organizationId: 1, status: 1 });

// Org + time-based
collection.index({ organizationId: 1, createdAt: -1 });

// Ensure unique within org
collection.index({ organizationId: 1, email: 1 }, { unique: true });
```

## Security Implications

### ✅ Secure

```typescript
// Backend validates context
const user = await User.findOne({
  _id: context.userId,
  organizationId: context.organizationId
});

if (!user) throw new AuthorizationError();
```

### ❌ Insecure

```typescript
// Trusting frontend organizationId
const products = await Product.find({
  organizationId: req.body.organizationId  // ← USER CAN CHANGE THIS!
});
```

## Migration Scenarios

### Organizational Growth
- Add `branchId` when company grows
- Queries become `{ organizationId, branchId }`
- Permissions can be branch-specific

### Acquisition / Consolidation
- Merging two organizations
- Historical data retained under original org
- Users can be added to new org via new membership

### Data Migration
- Export org data: `{ organizationId: source_id }`
- Import into new system: `{ organizationId: target_id }`

## Testing

**Critical tests**:
```typescript
// Test 1: User from Org-A cannot see Org-B data
it('should not allow cross-org access', async () => {
  const user_a = createUser('org-a');
  await request(app)
    .get(`/api/v1/products?organizationId=org-b`)
    .set('Authorization', tokenFor(user_a))
    .expect(403);  // NOT 200!
});

// Test 2: Query results always filtered
it('should filter results by org', async () => {
  const products = await productRepository.find(
    { organizationId: 'org-a' },
    req.context
  );
  
  // Verify NO org-b products included
  expect(products.every(p => p.organizationId === 'org-a')).toBe(true);
});
```

## Consequences

### Positive
✅ Data completely isolated between organizations  
✅ Can scale organization-independently in future  
✅ SaaS-ready from day 1  
✅ Regulatory compliance easier (GDPR, etc)  
✅ Clear data ownership  

### Negative
❌ Every query must include organizationId
❌ Complex queries need careful filtering
❌ Risk of accidental data leakage if not careful
❌ Cross-organization reporting needs special handling

## Alternatives Considered

### Database-per-Tenant
- **Rejected**: Management nightmare
- Multiple databases to maintain
- Complex migrations
- Harder to add new organizations

### Schema Separation
- **Rejected**: Complex and not better than field filtering
- Schema variants per org (duplicated code)
- Still need to ensure isolation

## Related Decisions
- ADR-001: Modular monolith allows org-specific services
- ADR-003: Authorization tied to organization membership
