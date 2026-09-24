# ERP System - Architecture Document

## Overview

This is a modular monolith ERP system designed to scale across multiple business types and industries. The architecture follows Clean Architecture principles with clear separation of concerns.

**Status**: Phase 0 - Foundation

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend Layer                          │
│  ┌─────────────────────┬──────────────────────────────────┐  │
│  │  Web (React Native  │  Mobile (React Native)           │  │
│  │  + React Native Web)│  + Expo                          │  │
│  └──────────┬──────────┴──────────────────────────────────┘  │
└─────────────┼─────────────────────────────────────────────────┘
              │
              │ HTTPS/REST
              │
┌─────────────▼─────────────────────────────────────────────────┐
│                   API Gateway / Express                        │
│  ├─ Request ID tracking                                       │
│  ├─ CORS, Helmet security headers                            │
│  ├─ Request body parsing                                     │
│  └─ Rate limiting                                            │
└─────────────┬─────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────┐
│                    Middleware Layer                            │
│  ├─ Authentication (JWT verification)                         │
│  ├─ Authorization (permission checking)                       │
│  ├─ Tenant isolation validation                              │
│  └─ Error handling                                           │
└─────────────┬─────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────┐
│               Routes / API Endpoints                           │
│  /api/v1/auth          /api/v1/organizations                 │
│  /api/v1/users         /api/v1/products                      │
│  (more modules here)                                         │
└─────────────┬─────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────┐
│            Controllers (Request/Response Handling)             │
│  - Parse input                                               │
│  - Call appropriate service                                  │
│  - Format response                                           │
└─────────────┬─────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────────────────┐
│         Services (Business Logic & Rules)                     │
│  - Validate business rules                                   │
│  - Coordinate repositories                                   │
│  - Emit events                                               │
│  - Handle complex operations                                 │
└─────────────┬──────────────────────────────┬──────────────────┘
              │                              │
┌─────────────▼─────────────────┐ ┌─────────▼──────────────────┐
│   Repositories                │ │   Event Bus                 │
│ - Database queries            │ │ - Event publishing/handling │
│ - Data transformations        │ │ - Loose coupling            │
│ - Multi-tenant isolation      │ │ - Async processing         │
└─────────────┬─────────────────┘ └─────────┬──────────────────┘
              │                              │
┌─────────────▼──────────────────────────────▼──────────────────┐
│                    MongoDB Atlas                              │
│  ├─ organizations   ├─ users        ├─ audit_logs            │
│  ├─ branches        ├─ roles        ├─ events                │
│  └─ (more collections as needed)                            │
└────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
erp-system/
│
├── apps/                           # Standalone applications
│   ├── api/                        # Main backend API (Express + Node.js)
│   │   ├── src/
│   │   │   ├── config/            # Configuration (DB, env vars)
│   │   │   ├── core/              # Core infrastructure
│   │   │   │   ├── errors/        # Custom error classes
│   │   │   │   ├── middleware/    # Express middleware
│   │   │   │   ├── security/      # Auth, JWT, logger
│   │   │   │   ├── permissions/   # Authorization system
│   │   │   │   ├── audit/         # Audit logging
│   │   │   │   ├── events/        # Event bus
│   │   │   │   └── database/      # MongoDB connection
│   │   │   ├── modules/           # Feature modules (organized by domain)
│   │   │   ├── shared/            # Shared utilities for API
│   │   │   ├── app.ts             # Express app setup
│   │   │   └── server.ts          # Server startup
│   │   ├── __tests__/             # Tests
│   │   └── package.json
│   │
│   ├── web/                        # Web application (React Native Web)
│   │   ├── src/
│   │   │   ├── app/               # Global app setup
│   │   │   ├── features/          # Feature-based organization
│   │   │   ├── components/        # Reusable components
│   │   │   ├── hooks/             # Custom React hooks
│   │   │   ├── services/          # API calls
│   │   │   └── store/             # Zustand state
│   │   └── package.json
│   │
│   ├── mobile/                     # Mobile application (React Native)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   └── features/
│   │   └── package.json
│   │
│   └── worker/                     # Background worker
│       ├── src/
│       │   ├── jobs/              # Background job definitions
│       │   └── index.ts
│       └── package.json
│
├── packages/                       # Shared code libraries
│   ├── types/                      # TypeScript type definitions
│   │   └── src/
│   │       └── index.ts           # Core types (User, Org, etc)
│   │
│   ├── validation/                 # Zod validation schemas
│   │   └── src/
│   │       └── index.ts           # Shared validation rules
│   │
│   ├── ui/                         # Design System (React Native components)
│   │   └── src/
│   │       ├── Button/
│   │       ├── Input/
│   │       ├── Card/
│   │       └── (more components)
│   │
│   ├── api-client/                 # Typed HTTP client
│   │   └── src/
│   │       └── index.ts           # API client
│   │
│   ├── permissions/                # Permission system logic
│   │   └── src/
│   │       └── index.ts           # Permission engine
│   │
│   ├── config/                     # Configuration management
│   │   └── src/
│   │       └── index.ts           # Env validation (Zod)
│   │
│   └── utils/                      # Utility functions
│       └── src/
│           └── index.ts           # Common utilities
│
├── infrastructure/                 # Infrastructure & DevOps
│   ├── docker/
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.web
│   │   └── docker-compose.yml
│   └── scripts/
│       ├── setup.sh
│       └── deploy.sh
│
├── docs/                           # Documentation
│   ├── ARCHITECTURE.md            # (this file)
│   ├── API.md                     # API documentation
│   ├── DATABASE.md                # Database schema
│   ├── SECURITY.md                # Security guidelines
│   ├── PERMISSIONS.md             # Permission system docs
│   ├── DEVELOPMENT.md             # Development guide
│   ├── TESTING.md                 # Testing strategy
│   ├── AI_DEVELOPMENT_RULES.md    # Rules for AI development
│   └── decisions/                 # Architecture Decision Records
│       ├── 001-modular-monolith.md
│       └── (more ADRs)
│
├── tests/                          # E2E and integration tests
│   └── e2e/
│
├── .env.example                    # Environment variables template
├── .eslintrc.json                  # ESLint configuration
├── .prettierrc.json                # Prettier configuration
├── .gitignore
├── tsconfig.base.json              # Base TypeScript configuration
├── pnpm-workspace.yaml             # pnpm workspaces config
├── package.json                    # Root package.json
└── README.md
```

## Core Principles

### 1. **Clean Architecture**

Every layer has a single responsibility:

- **Controllers**: Handle HTTP requests/responses
- **Services**: Business logic and rules
- **Repositories**: Data access patterns
- **Models**: Database schema definitions

**NEVER**:
- Put business logic in controllers
- Access MongoDB directly from controllers
- Skip layers without architectural justification

### 2. **Multi-Tenancy First**

Every entity that belongs to a company/organization must have:
- `organizationId`: Which organization owns this data
- `branchId` (when relevant): Which branch within the organization

**CRITICAL**: Always validate that the authenticated user:
1. Belongs to the requested `organizationId`
2. Has the proper role/permission for the action

### 3. **Separation of Concerns**

- **Config**: Environment variables and configuration
- **Core**: Shared infrastructure (auth, errors, middleware, database, events)
- **Modules**: Feature-specific logic (organized by aggregate root)
- **Shared**: Common utilities and functions

### 4. **Type Safety**

- Strict TypeScript mode enabled
- No `any` types without justification
- Share types through `@erp/types` package
- Validation schemas in `@erp/validation`

### 5. **Event-Driven**

- Services emit events when significant business events occur
- Other modules subscribe to events (loose coupling)
- Example: When a sale is completed → emit `SALE_COMPLETED` event → Inventory, Finance, Audit listen

## Backend Layers Explained

### Route Layer

**Responsibility**: Define endpoints and apply middleware

```typescript
router.post('/login', 
  validateInput,
  authController.login
);
```

### Controller Layer

**Responsibility**: Handle HTTP request/response, input parsing

```typescript
export async function login(req: Request, res: Response): Promise<void> {
  const input = LoginSchema.parse(req.body);
  const result = await authService.login(input);
  res.json(result);
}
```

**NEVER**: Business logic here. Just request/response handling.

### Service Layer

**Responsibility**: Business logic and rules, coordinate repositories

```typescript
export async function login(input: LoginInput): Promise<LoginOutput> {
  // Validate user exists
  const user = await userRepository.findByEmail(input.email);
  if (!user) throw new AuthenticationError();

  // Validate password
  const isValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!isValid) throw new AuthenticationError();

  // Create tokens
  const tokens = createTokens(user._id, user.organizationId, user.email);

  // Emit event
  await eventBus.emit('USER_LOGGED_IN', { userId: user._id });

  return tokens;
}
```

### Repository Layer

**Responsibility**: Data access patterns, database queries

```typescript
export async function findByEmail(email: string, organizationId: string): Promise<IUser | null> {
  // Query database with organizationId for tenant isolation
  return User.findOne({ email, organizationId });
}
```

### Model Layer

**Responsibility**: MongoDB schema definition using Mongoose

```typescript
const userSchema = new Schema({
  email: { type: String, required: true, index: true },
  organizationId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  // ...
});

// Compound index for multi-tenant isolation
userSchema.index({ organizationId, email }, { unique: true });
```

## Module Structure

Each feature module should follow this pattern:

```
inventory/
├── inventory.controller.ts       # HTTP handlers
├── inventory.service.ts           # Business logic
├── inventory.repository.ts        # Database queries
├── inventory.model.ts            # Mongoose schemas
├── inventory.routes.ts           # Express routes
├── inventory.validation.ts       # Zod schemas
├── inventory.permissions.ts      # Permission constants
├── inventory.events.ts           # Event definitions
├── inventory.types.ts            # Module-specific types
└── inventory.test.ts             # Tests
```

## Security Architecture

### Authentication Flow

```
User credentials
    ↓
Controller receives login request
    ↓
Service validates password (bcryptjs)
    ↓
Service creates JWT tokens (Access + Refresh)
    ↓
Client stores tokens securely
    ↓
Client sends Access token in Authorization header for each request
    ↓
Middleware verifies token and extracts context
    ↓
Request processed with authenticated context
```

### Authorization Flow

```
Middleware verifies JWT token
    ↓
Extract userId, organizationId from token
    ↓
Load user's roles from OrganizationMembership
    ↓
Verify user has required permission (permission: resource.action)
    ↓
If authorized → proceed
If not authorized → throw AuthorizationError (403)
```

### Tenant Isolation

```
Request arrives with context { userId, organizationId }
    ↓
Backend VALIDATES that userId belongs to organizationId
    ↓
All queries include organizationId in filter
    ↓
If user tries to access different organizationId → 403 Forbidden
```

## Event System

**Purpose**: Decouple modules through event-driven architecture

**Event Flow**:
```
Service performs business action
    ↓
Service emits event through EventBus
    ↓
Other services listen for that event
    ↓
Listeners process async tasks
```

**Example**:
```typescript
// In SalesService
await eventBus.emit('SALE_COMPLETED', {
  saleId: '123',
  organizationId: 'org-456',
  totalAmount: 1000,
});

// In InventoryService (listens)
eventBus.on('SALE_COMPLETED', async (event) => {
  await inventoryService.updateStock(event.saleId);
});

// In FinanceService (listens)
eventBus.on('SALE_COMPLETED', async (event) => {
  await financeService.recordRevenue(event);
});
```

## Database Design Principles

### Indexing Strategy

Create indices for:
- Organizational isolation: `organizationId`
- User queries: `organizationId + email`
- Status-based queries: `organizationId + status`
- Time-series: `organizationId + createdAt`
- Multi-field: `organizationId + branchId + type`

**Example**:
```typescript
// Schema
const productSchema = new Schema({
  organizationId: { type: String, required: true, index: true },
  sku: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Compound indices
productSchema.index({ organizationId, sku }, { unique: true });
productSchema.index({ organizationId, createdAt });
productSchema.index({ organizationId, status });
```

### Collection Strategy

**Avoid**: Creating a collection for every entity.

**Prefer**: 
- One large `users` collection with role-based access
- One `products` collection for all organizations (filtered by `organizationId`)
- Share collections, isolate through indices and queries

## Error Handling

**All errors must be consistent**:

```typescript
{
  success: false,
  error: {
    code: "VALIDATION_ERROR" | "AUTHENTICATION_ERROR" | "NOT_FOUND" | etc,
    message: "Human-readable message"
  },
  timestamp: "2024-01-01T00:00:00Z",
  requestId: "req-12345"
}
```

**Custom Error Classes**:
- `ValidationError` (400)
- `AuthenticationError` (401)
- `AuthorizationError` (403)
- `NotFoundError` (404)
- `ConflictError` (409)
- `BusinessRuleError` (422)
- `InternalServerError` (500)

## Testing Strategy

### Unit Tests
- Individual functions/methods
- No database
- Mock dependencies
- Quick execution

### Integration Tests
- Multiple layers working together
- Real database (in-memory or test MongoDB)
- Real API requests
- Slower but more realistic

### E2E Tests
- Full user workflows
- Via API endpoints
- Test tenant isolation
- Test permission enforcement

### Critical Tests to Implement

Priority areas:
1. **Authentication** - JWT verification, token refresh
2. **Authorization** - Permission checking on all endpoints
3. **Tenant Isolation** - User cannot access another org's data
4. **Role-based Access** - Admin vs regular user permissions
5. **Validation** - Invalid input handling
6. **Error Handling** - Proper error responses
7. **Audit Logging** - All actions logged

## Future Migrations

### From Monolith to Microservices

The architecture supports future migration:

1. Each module has clear boundaries
2. Modules communicate via EventBus (can become message queue)
3. Repositories are module-specific (can become separate databases)
4. Services have single responsibility (can become independent services)

**Migration path**:
```
Monolith (today)
    ↓
Extract module to separate repository + EventBus  
    ↓
Run as separate service, call via HTTP
    ↓
Message queue replaced with RabbitMQ/Kafka
    ↓
Full microservice
```

## Development Workflow

1. Create feature branch
2. Implement module following structure
3. Write tests (unit + integration + E2E)
4. Run linter and typecheck
5. Create PR with:
   - Implementation
   - Tests
   - Documentation updates
6. Merge only if all checks pass

## Deployment

- Docker containerization
- Environment-based configuration
- Secrets management (not in git)
- Health checks
- Graceful shutdown
- Database migration scripts

---

**Next Phase**: PHASE 1 - Core backend setup (Organizations, Users, Auth)
