# Development Guide

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+ (install with `npm install -g pnpm`)
- MongoDB Atlas account
- VS Code (recommended)

### Initial Setup

```bash
# Clone repository
git clone <repo-url>
cd erp-system

# Copy environment file and configure
cp .env.example .env

# Edit .env with your configuration
# - MONGODB_URI: Your MongoDB Atlas connection string
# - JWT_*_SECRET: Generate strong random strings (32+ characters)
# - CORS_ORIGINS: Your frontend URLs

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start development server
pnpm dev
```

### Environment Configuration

1. Create `.env` (never commit this file)
2. Copy from `.env.example`
3. Update for your environment:

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/erp-dev
JWT_ACCESS_SECRET=your-secret-key-at-least-32-chars-long
JWT_REFRESH_SECRET=your-refresh-secret-key-32-chars
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
LOG_LEVEL=debug
```

## Project Commands

### Root Level

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Lint all code
pnpm lint

# Fix lint issues
pnpm lint:fix

# Format all code
pnpm format

# Check formatting
pnpm format:check

# Type checking
pnpm typecheck

# Clean all build outputs and node_modules
pnpm clean
```

### Individual Apps

```bash
# API development with auto-reload
cd apps/api
pnpm dev

# Build API for production
pnpm build

# Run specific tests
pnpm test

# Type check
pnpm typecheck
```

## File Structure Quick Reference

### Adding a New Feature

1. Create module in `apps/api/src/modules/feature-name/`
2. Follow standard structure:
   ```
   feature-name/
   ├── feature-name.routes.ts
   ├── feature-name.controller.ts
   ├── feature-name.service.ts
   ├── feature-name.repository.ts
   ├── feature-name.model.ts
   ├── feature-name.validation.ts
   ├── feature-name.permissions.ts
   └── feature-name.test.ts
   ```

3. Import routes in `apps/api/src/app.ts`
4. Write tests first (TDD approach)
5. Ensure multi-tenancy included
6. Document in ADR if architectural impact

### Adding a Shared Type

1. Define in `packages/types/src/index.ts`
2. Export types properly
3. Import as `import { IMyType } from '@erp/types'`

### Adding Validation Schema

1. Define in `packages/validation/src/index.ts`
2. Use Zod for schemas
3. Export both type and schema
4. Use schema to validate at route level

## Git Workflow

### Branch Naming

```
feature/auth-system          # New features
fix/jwt-expiry               # Bug fixes
docs/architecture-update     # Documentation
test/tenant-isolation        # Tests
refactor/service-layer       # Refactoring
```

### Commit Workflow

```bash
# Create and checkout branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "feat(module): describe change"

# Run validation before push
pnpm lint
pnpm format
pnpm typecheck
pnpm test

# Push to remote
git push origin feature/my-feature

# Create PR with description
# Include testing, security, and docs info
```

## Common Development Tasks

### Create New Module

```bash
# 1. Create directory
mkdir -p apps/api/src/modules/products

# 2. Create base files (copy template or follow structure)
# 3. Implement layer by layer:
#    - Model first (database schema)
#    - Repository (data access)
#    - Validation (Zod schemas)
#    - Service (business logic)
#    - Controller (HTTP handling)
#    - Routes (endpoint definition)

# 4. Register routes in app.ts
# 5. Write tests
# 6. Run validation
pnpm lint:fix && pnpm typecheck && pnpm test
```

### Debug API Locally

```bash
# Terminal 1 - Start MongoDB locally or use Atlas
# Terminal 2 - Start API with debugging
cd apps/api
pnpm dev

# API will start and watch for changes
# Open http://localhost:3000/health to verify
```

### Run Specific Tests

```bash
# Run tests for one file
pnpm test __tests__/auth.test.ts

# Run tests matching pattern
pnpm test --grep "tenant isolation"

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test --watch
```

### Check Type Errors

```bash
# Full project type check
pnpm typecheck

# Watch mode
pnpm typecheck --watch
```

## Code Patterns

### Service Pattern

```typescript
// service.ts - Business logic
export class UserService {
  async createUser(input: CreateUserInput, context: IRequestContext): Promise<IUser> {
    // 1. Validate (already done in controller, but double-check complex rules)
    if (await this.userRepository.existsByEmail(input.email, context.organizationId)) {
      throw new ConflictError('User with this email already exists');
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(input.password, 10);

    // 3. Create in repository
    const user = await this.userRepository.create({
      ...input,
      passwordHash,
      organizationId: context.organizationId,
    });

    // 4. Emit event
    await eventBus.emit('USER_CREATED', {
      userId: user._id,
      organizationId: context.organizationId,
    });

    // 5. Log
    await logAudit({
      organizationId: context.organizationId,
      userId: context.userId,
      action: 'create',
      entity: 'User',
      entityId: user._id,
      requestId: context.requestId,
    });

    return user;
  }
}
```

### Repository Pattern

```typescript
// repository.ts - Data access
export class UserRepository {
  async create(data: CreateUserInput & { passwordHash: string }): Promise<IUser> {
    const user = new User(data);
    return user.save();
  }

  async findByEmail(
    email: string,
    organizationId: string
  ): Promise<IUser | null> {
    // Always include organizationId for multi-tenancy
    return User.findOne({ email, organizationId });
  }

  async findById(
    id: string,
    organizationId: string
  ): Promise<IUser | null> {
    return User.findOne({ _id: id, organizationId });
  }
}
```

### Controller Pattern

```typescript
// controller.ts - HTTP handling
export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    // 1. Validate and parse input
    const input = CreateUserSchema.parse(req.body);

    // 2. Check permission
    requirePermission(req.context, PERMISSIONS['user.create']);

    // 3. Call service
    const user = await userService.createUser(input, req.context!);

    // 4. Return success response
    res.status(201).json({
      success: true,
      data: user,
      timestamp: formatTimestamp(),
      requestId: req.requestId,
    });
  } catch (error) {
    // Error handled by middleware
    next(error);
  }
}
```

## Troubleshooting

### Build Fails with TypeScript Errors

```bash
# Clear and rebuild
pnpm clean
pnpm install
pnpm typecheck

# Fix each error individually
# Most common: missing types from @erp/types, wrong imports
```

### Tests Failing

```bash
# Run with verbose output
pnpm test -- --reporter=verbose

# Run specific test
pnpm test path/to/test.ts

# Check database connection in test setup
```

### Import Errors

```bash
# Check path aliases in tsconfig.base.json
# Common issue: using wrong package path
# Wrong: import from '../../../packages/types'
# Right: import from '@erp/types'
```

## Performance Tips

### Database Queries

- ✅ Always index fields used in WHERE
- ✅ Use compound indices for multi-field queries
- ✅ Limit returned fields with `select()`
- ✅ Implement pagination for large queries

```typescript
// Good - indexed fields, limited results
const users = await User
  .find({ organizationId, status: 'active' })
  .select('_id email firstName lastName')
  .limit(100)
  .skip((page - 1) * 100);
```

### Caching

- Use Redis for session data (future)
- Cache user permissions after first load
- Cache organization settings
- Invalidate cache on updates

### Logging

- Use structured logging (pino)
- Log at appropriate levels (debug, info, warn, error)
- Include context (organizationId, userId, requestId)
- Don't log sensitive data

## Best Practices

1. **Write tests first** - TDD approach helps design better APIs
2. **Keep functions small** - Easier to test and maintain
3. **Use types extensively** - Catch errors at compile time
4. **Document decisions** - Use ADRs for architectural choices
5. **Review your own code first** - Before requesting review
6. **Follow naming conventions** - Consistency aids readability
7. **Handle errors explicitly** - Every error path matters
8. **Test tenant isolation** - Critical for security
9. **Log important events** - For debugging and auditing
10. **Keep dependencies minimal** - Reduce attack surface

## Resources

- [Express Documentation](https://expressjs.com/)
- [Mongoose Documentation](https://mongoosejs.com/)
- [Zod Documentation](https://zod.dev/)
- [Jest/Vitest Documentation](https://vitest.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc7519)
- [OWASP Security Guidelines](https://owasp.org/)

---

For more information, see [ARCHITECTURE.md](./ARCHITECTURE.md) and [AI_DEVELOPMENT_RULES.md](./AI_DEVELOPMENT_RULES.md)
