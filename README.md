# ERP System - README

## 🏢 Enterprise Resource Planning System

This is a **modular, scalable, multi-tenant ERP system** designed to adapt to different business types and industries.

**Current Status**: Phase 0 - Foundation ✅

---

## 🎯 Project Objectives

Build a professional ERP architecture that:

- ✅ **Modular**: Independent feature modules
- ✅ **Scalable**: From startup to enterprise
- ✅ **Multi-tenant**: Support multiple organizations
- ✅ **Secure**: Authentication, authorization, audit trails
- ✅ **Maintainable**: Clean architecture, strong types
- ✅ **Documented**: Clear guidelines and examples
- ✅ **Testable**: Unit, integration, and E2E tests
- ✅ **Future-proof**: Ready for microservices migration

---

## 🛠️ Tech Stack

### Backend
- **Node.js** 18+
- **Express** - HTTP server
- **TypeScript** - Type safety
- **MongoDB Atlas** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **Pino** - Logging

### Frontend
- **React Native** - Cross-platform UI
- **React Native Web** - Web support
- **TypeScript** - Type safety
- **Zustand** - State management
- **TanStack Query** - Server state
- **Zod** - Validation

### DevOps
- **Docker** - Containerization
- **GitHub Actions** - CI/CD
- **pnpm** - Package management
- **Vitest** - Testing
- **ESLint** - Code quality
- **Prettier** - Code formatting

---

## 📁 Project Structure

```
erp-system/
├── apps/
│   ├── api/              # Backend API (Express)
│   ├── web/              # Web app (React Native Web)
│   ├── mobile/           # Mobile app (React Native)
│   └── worker/           # Background jobs
├── packages/             # Shared code
│   ├── types/           # Type definitions
│   ├── validation/      # Zod schemas
│   ├── ui/              # UI components
│   ├── api-client/      # HTTP client
│   ├── permissions/     # Auth system
│   ├── config/          # Configuration
│   └── utils/           # Utilities
├── infrastructure/      # DevOps
├── docs/                # Documentation
└── tests/               # E2E tests
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm 8+
- MongoDB Atlas account
- Optional: Android Studio for the mobile module

### Setup

```bash
# Install dependencies
pnpm install

# Create environment file
cp .env.example .env
# Edit .env with your MongoDB URI and secrets

# Build workspace packages
pnpm build

# Start all apps
pnpm dev

# Run tests
pnpm test

# Check types
pnpm typecheck

# Format code
pnpm format
```

### Run Web

```bash
cd apps/web
pnpm install
pnpm dev
```

### Run Mobile

```bash
cd apps/mobile
pnpm install
pnpm start
# then run Android or iOS from the Metro bundler
```

### Run API

```bash
cd apps/api
pnpm install
pnpm dev
```

### Run Worker

```bash
cd apps/worker
pnpm install
pnpm dev
```

### Development

```bash
# Run linting
pnpm lint

# Run type checking
pnpm typecheck

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui
```

---

## 📚 Documentation

- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System architecture and design
- **[DEVELOPMENT.md](./docs/DEVELOPMENT.md)** - Setup and development workflow
- **[AI_DEVELOPMENT_RULES.md](./docs/AI_DEVELOPMENT_RULES.md)** - Rules for AI/developers ⚠️
- **[DATABASE.md](./docs/DATABASE.md)** - Database schema (coming soon)
- **[API.md](./docs/API.md)** - API documentation (coming soon)
- **[SECURITY.md](./docs/SECURITY.md)** - Security guidelines (coming soon)
- **[decisions/](./docs/decisions)** - Architecture Decision Records

---

## 🔐 Security

⚠️ **CRITICAL**: Read [AI_DEVELOPMENT_RULES.md](./docs/AI_DEVELOPMENT_RULES.md) before making changes.

Key principles:
- ✅ Multi-tenant isolation from day 1
- ✅ JWT authentication with token refresh
- ✅ Password hashing with bcryptjs
- ✅ Granular permission system
- ✅ Audit logging for all actions
- ✅ Environment-based configuration
- ✅ No hardcoded secrets

---

## 🏗️ Architecture

### Clean Architecture

```
Routes → Controllers → Services → Repositories → MongoDB
```

Each layer has single responsibility.

### Multi-Tenancy

Every entity includes `organizationId` to isolate customer data:

```typescript
// All queries filter by organizationId
const products = await Product.find({ organizationId: org_123 });
```

### Event-Driven

Services communicate through EventBus to avoid coupling:

```typescript
// When sale completes
await eventBus.emit('SALE_COMPLETED', { saleId, organizationId });

// Inventory listens
eventBus.on('SALE_COMPLETED', async (event) => {
  await inventoryService.updateStock(event.saleId);
});
```

---

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific file
pnpm test __tests__/auth.test.ts

# Watch mode
pnpm test --watch

# UI dashboard
pnpm test:ui
```

**Critical test areas**:
1. Authentication (JWT, password hashing)
2. Authorization (permission checking)
3. Tenant isolation (data segregation)
4. Multi-tenancy (organization membership)
5. Error handling (all error paths)

---

## 📊 Roadmap

### ✅ Phase 0 - Foundation (Current)
- TypeScript & ESLint setup
- Project structure
- Database connection
- Authentication scaffold
- Permission system structure
- Error handling
- Logging
- Testing setup

### 🔵 Phase 1 - Core Backend
- Organizations
- Users
- Authentication (login/register)
- JWT tokens
- Organization memberships
- Role management

### 🔵 Phase 2 - Authorization
- Permission system
- Role-based access
- Tenant isolation tests
- Audit logging

### 🔵 Phase 3 - Frontend Core
- Design System
- Login page
- Organization selector
- Navigation
- Dashboard
- Permission guards

---

## 🤝 Contributing

### Code Quality Checklist

Before committing:
```
[✅] Code compiles (pnpm typecheck)
[✅] No lint errors (pnpm lint)
[✅] Formatted correctly (pnpm format)
[✅] Tests pass (pnpm test)
[✅] Multi-tenancy respected
[✅] Permissions checked
[✅] Errors handled
[✅] Documentation updated
```

### Commit Convention

```
feat(module): add feature description
fix(module): fix bug description
docs(section): update documentation
test(module): add test cases
refactor(module): restructure code
```

### Pull Request

Include:
- Description of changes
- Testing performed
- Security considerations
- Breaking changes (if any)
- Documentation updates

---

## 📝 License

[Add your license here]

---

## 🆘 Support

- 📖 Read [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- 📖 Read [DEVELOPMENT.md](./docs/DEVELOPMENT.md)
- ⚠️ Read [AI_DEVELOPMENT_RULES.md](./docs/AI_DEVELOPMENT_RULES.md)
- 🐛 Check existing issues
- 💬 Discuss in PR/Issues

---

## 🎓 Learning Resources

- [EXPRESS Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [MongoDB Multi-Tenancy](https://docs.mongodb.com/manual/tutorial/build-a-multi-tenant-saas-application/)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [JWT Authentication](https://tools.ietf.org/html/rfc7519)
- [OWASP Security](https://owasp.org/)

---

**Status**: Ready for Phase 1 development 🚀

Next step: Implement Core backend (Organizations, Users, Authentication)
