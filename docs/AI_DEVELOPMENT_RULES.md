# AI Development Rules

⚠️ **CRITICAL**: Read this before making changes to the ERP system.

This document defines the rules that any AI or developer must follow when working on this project.

## Core Principles (Non-Negotiable)

### 1. **Respect Multi-Tenancy Architecture**

- ✅ **DO**: Always include `organizationId` in queries
- ✅ **DO**: Validate that user belongs to the organization they're accessing
- ❌ **DON'T**: Trust `organizationId` sent from frontend - verify from JWT token context
- ❌ **DON'T**: Query without `organizationId` filter
- ❌ **DON'T**: Allow data leakage between organizations

**Test Case to Always Verify**:
```typescript
// User from Org-A tries to access Org-B data
User: user-from-org-a
Request: GET /api/v1/products?organizationId=org-b

Result: 403 Forbidden (NOT 200 with org-b data)
```

### 2. **Never Skip Architectural Layers**

**Good**:
```
Route → Controller → Service → Repository → MongoDB
```

**Bad**:
```
Route → Repository → MongoDB (skipped Controller & Service)
Route → MongoDB directly (skipped everything)
```

**Rules**:
- ✅ Controllers call Services
- ✅ Services call Repositories  
- ✅ Repositories call MongoDB models
- ❌ No direct MongoDB queries from Controllers
- ❌ No business logic in Controllers
- ❌ Controllers only handle request/response

### 3. **Type Safety is Mandatory**

- ❌ **NO** `any` types without documented justification
- ✅ **USE** TypeScript strict mode
- ✅ **DEFINE** all types in `@erp/types`
- ✅ **VALIDATE** at runtime with Zod

```typescript
// Bad
const data: any = req.body;

// Good
const data = LoginSchema.parse(req.body);
```

### 4. **Security Requirements**

#### Passwords
- ❌ NEVER store plain-text passwords
- ✅ Hash with bcryptjs before saving
- ✅ Use secure comparison for verification

#### Secrets
- ❌ NEVER hardcode secrets
- ❌ NEVER commit .env file
- ✅ Use environment variables
- ✅ Document in .env.example

#### Tokens
- ✅ Use JWT with RS256 or HS256
- ✅ Implement token expiry
- ✅ Validate token on every protected route
- ❌ Never expose refresh token to frontend (use httpOnly cookies when possible)

#### Authorization
- ✅ Check permissions before any data operation
- ✅ Log all authorization failures
- ❌ Don't trust frontend permission claims

### 5. **Error Handling Rules**

- ✅ Use custom error classes (ValidationError, AuthorizationError, etc)
- ✅ Return consistent error format
- ✅ Never expose internal stack traces to clients
- ✅ Log full errors server-side for debugging
- ❌ Don't send database errors directly to frontend
- ❌ Don't reveal sensitive information in error messages

```typescript
// Bad
res.json({ error: e.stack });

// Good
logger.error(e);
res.status(403).json({
  success: false,
  error: {
    code: 'AUTHORIZATION_ERROR',
    message: 'Access denied'
  }
});
```

### 6. **Validation at All Boundaries**

- ✅ Validate in Controllers before Controller → Service
- ✅ Validate at API boundary (incoming requests)
- ✅ Use Zod schemas
- ❌ Never assume data is correct
- ❌ Trust frontend validation alone

```typescript
// Route level
router.post('/users', validateInput(CreateUserSchema), controller.create);

// Controller level
const input = CreateUserSchema.parse(req.body);

// Service level (defensive)
if (!organizationId) throw new ValidationError('Organization ID required');
```

## Architectural Rules

### 7. **Module Organization**

Each module must have this structure:

```
module-name/
├── module-name.routes.ts        # 1. Define endpoints
├── module-name.controller.ts     # 2. Handle HTTP
├── module-name.service.ts        # 3. Business logic
├── module-name.repository.ts     # 4. Data access
├── module-name.model.ts          # 5. MongoDB schema
├── module-name.validation.ts     # 6. Input validation
├── module-name.permissions.ts    # 7. Permission checks
├── module-name.events.ts         # 8. Event definitions
├── module-name.types.ts          # 9. Module types
└── module-name.test.ts           # 10. Tests
```

**Don't**:
- ❌ Mixing concerns in one file
- ❌ Creating arbitrary file structure
- ❌ Putting business logic in routes
- ❌ Direct imports from repository layers outside module

### 8. **Dependency Direction**

```
Controllers → Services → Repositories → Models
Packages → Apps (not the other way)
```

**Rules**:
- ✅ Apps depend on Packages (shared code)
- ✅ Higher layers depend on lower layers
- ❌ Repositories should never be accessed directly from outside module
- ❌ Circular dependencies

### 9. **Testing Requirements**

Before marking a task as complete:

```
[✅] Unit tests for Service methods
[✅] Integration tests for Repository queries
[✅] API tests for Controller endpoints
[✅] Tenant isolation tests (critical)
[✅] Permission tests (critical)
[✅] Error handling tests
```

**Minimum Coverage**:
- Core modules (Auth, Org, Users, Permissions): 80%+
- Business modules: 70%+
- Utilities: 60%+

### 10. **No Breaking Changes Without Discussion**

If you're thinking about:
- ❌ Changing API contract (endpoint path, request/response format)
- ❌ Changing database schema (field names, indices)
- ❌ Changing permission system
- ❌ Changing authentication mechanism
- ❌ Removing or renaming shared types

**DO**: 
✅ Document in ADR first
✅ Plan migration strategy
✅ Update documentation
✅ Update tests

### 11. **Audit & Logging**

- ✅ Log all authentication attempts (success and failure)
- ✅ Log all authorization failures
- ✅ Log all data modifications (create, update, delete)
- ✅ Include: userId, organizationId, action, timestamp, severity
- ✅ Use structured logging (pino)
- ❌ Log passwords, tokens, or sensitive data
- ❌ Use console.log as primary logging

```typescript
logger.info({
  event: 'USER_CREATED',
  userId,
  organizationId,
  email,
  timestamp: new Date(),
});
```

### 12. **Database Indices**

- ✅ Index every field used in WHERE clauses
- ✅ Create compound indices for multi-field queries
- ✅ Always include organizationId in indices
- ✅ Document indices in schema comments
- ❌ Create indices arbitrarily
- ❌ Query on unindexed fields

### 13. **Event-Based Communication**

- ✅ Use EventBus for cross-module communication
- ✅ Define event contracts clearly
- ✅ Emit events from Services
- ✅ Handle with try/catch and logging
- ❌ Have modules call each other directly
- ❌ Circular event dependencies

```typescript
// Service emits
await eventBus.emit('PRODUCT_CREATED', { productId, organizationId });

// Other module listens
eventBus.on('PRODUCT_CREATED', async (event) => {
  // Handle it
});
```

## Code Quality Standards

### 14. **TypeScript Strict Mode**

```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "strictFunctionTypes": true,
  "noUnusedLocals": true,
  "noImplicitReturns": true
}
```

**NO**: `any`, `@ts-ignore` without comment explaining why

### 15. **Naming Conventions**

```typescript
// Variables
const organizationId = '...';       // descriptive
const org = '...';                  // OK but less clear

// Functions 
async function createUser(payload) {} // verb + noun
const getUserById = (id) => {}      // get + what + qualifier

// Interfaces/Types
interface IOrganization {}          // I prefix for interfaces  
type OrganizationStatus = '...';   // Descriptive

// Constants
const VALID_STATUSES = [...];      // UPPER_SNAKE_CASE
const MAX_FAILED_ATTEMPTS = 5;     // UPPER_SNAKE_CASE
```

### 16. **Code Organization**

- ✅ Modules organized by feature/domain (auth, inventory, sales)
- ✅ Features organized by responsibility (routes, controller, service, etc)
- ✅ One primary class/function per file
- ✅ Related exports grouped
- ❌ Mixing concerns in one file
- ❌ Arbitrary folder structures

### 17. **Import Organization**

```typescript
// 1. External packages
import express from 'express';
import { z } from 'zod';

// 2. Workspace packages
import { IUser } from '@erp/types';
import { createUserSchema } from '@erp/validation';

// 3. Local imports
import { userRepository } from './user.repository';
import { logger } from '../core/security/logger';

// 4. Relative imports only for same-module dependencies
import { userRoutes } from './user.routes';
```

### 18. **Error Messages**

- ✅ Clear, actionable messages
- ✅ Include what failed and why
- ✅ Suggest fix when possible

```typescript
// Bad
throw new Error('Request failed');

// Good  
throw new ValidationError('Email is already registered in this organization');
throw new NotFoundError('Product', productId);
```

### 19. **Environment Variables**

- ✅ Define in `.env.example` with default or placeholder
- ✅ Validate on startup with Zod
- ✅ Strong validation (URLs must be URLs, ports must be numbers)
- ❌ Optional vars that are actually critical
- ❌ Unvalidated environment access

```typescript
// Good
const config = {
  databaseUrl: z.string().url().parse(process.env.DATABASE_URL),
  port: z.number().parse(process.env.PORT),
};
```

## Workflow & Execution

### 20. **Implementation Checklist**

Before committing code:

```
[✅] Code written
[✅] TypeScript compiles (tsc --noEmit)
[✅] ESLint passes (npm run lint)
[✅] Prettier formatted (npm run format)
[✅] Tests written
[✅] Tests pass (npm run test)
[✅] No console.log or TODO comments without explanation
[✅] No hardcoded secrets
[✅] No unused imports
[✅] Documentation updated
[✅] Error handling implemented
[✅] Security considerations addressed
[✅] Multi-tenancy respected
[✅] Permissions checked
```

### 21. **Commit Messages**

```
feat(auth): implement JWT refresh token rotation
fix(inventory): prevent negative stock levels
docs(architecture): update module structure guidelines
test(permissions): add tenant isolation test cases
refactor(services): extract common validation logic
```

Format: `type(scope): concise description`

### 22. **PR Requirements**

Every PR must include:

```
## Description
What changed and why

## Testing
How tested (unit/integration/E2E)

## Security
Any security considerations

## Breaking Changes
None / List any

## Documentation
What docs updated or need updating
```

## For Large Changes

### 23. **Architecture Decision Records**

When making significant architectural decisions:

1. Create file: `docs/decisions/ADR-NNN-decision-name.md`
2. Document: Context, decision, consequences, alternatives
3. Get approval before implementing
4. Reference in code: `// See ADR-NNN`

### 24. **Code Review Checklist**

When reviewing another developer's or AI's code:

- [ ] Follows architectural layers
- [ ] Multi-tenancy properly implemented
- [ ] Permission checks present and correct
- [ ] Error handling complete
- [ ] Tests included and passing
- [ ] Types properly defined
- [ ] No secrets in code
- [ ] Documentation updated
- [ ] Database changes indexed
- [ ] Event contracts clear

## What To Do If Uncertain

### 25. **When in Doubt**

1. **Read**: Check docs/ARCHITECTURE.md
2. **Search**: Look for similar patterns in codebase
3. **Test**: Write a test to validate your assumption
4. **Ask**: Document your uncertainty and suggest approach
5. **Document**: Record the decision for future reference

## Prohibited Actions

**NEVER**:
- ❌ Modify AUTH system without extensive testing
- ❌ Change database schema without migration plan
- ❌ Add dependencies without analyzing conflicts
- ❌ Expose environment secrets
- ❌ Skip permission checks "just for this case"
- ❌ Trust user input without validation
- ❌ Access MongoDB without repository layer
- ❌ Allow cross-organization data access
- ❌ Commit code that doesn't compile
- ❌ Ignore security warnings
- ❌ Create large monolithic functions
- ❌ Mix business logic with HTTP handling

## Quick Reference

### Permission Scenario

```typescript
// Always validate context
if (!context) throw new AuthenticationError();

// Always check permission
requirePermission(context, 'inventory.product.read');

// Always include organizationId
const products = await repository.findByOrganization(context.organizationId);

// Always return filtered results
return products.filter(p => p.organizationId === context.organizationId);
```

### Error Scenario

```typescript
try {
  const result = await service.doSomething(input);
  res.json({ success: true, data: result });
} catch (error) {
  if (error instanceof ValidationError) {
    res.status(error.statusCode).json(formatError(error));
  } else if (error instanceof AuthorizationError) {
    logger.warn(`Unauthorized access attempt: ${context.userId}`);
    res.status(error.statusCode).json(formatError(error));
  } else {
    logger.error('Unexpected error', error);
    res.status(500).json(formatError(new InternalServerError()));
  }
}
```

### Testing Tenant Isolation

```typescript
it('should NOT allow org-a user to access org-b data', async () => {
  const user_a = { organizationId: 'org-a', userId: 'user-1' };
  const product_b = { organizationId: 'org-b', productId: 'prod-1' };
  
  await request(app)
    .get(`/api/v1/products/${product_b.productId}`)
    .set('Authorization', token_for_user_a)
    .expect(403); // Forbidden, NOT 200
});
```

---

**This is not a suggestion** - these rules are the foundation of this ERP system. Violations create security vulnerabilities, data leaks, and maintenance nightmares.

**Remember**: Other AIs, developers, and your future self will read this code. Make it right.
