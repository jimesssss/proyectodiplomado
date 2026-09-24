# ADR-003: Authentication & JWT Strategy

## Status
✅ **ACCEPTED**

## Context

The system needs:
- Secure user authentication
- Support for multiple organizations per user
- Token-based stateless authentication
- Refresh token rotation capability
- Mobile and web clients

## Decision

**Use JWT (JSON Web Tokens) with separate Access and Refresh tokens**

### Token Strategy

```typescript
// Access Token (short-lived, 15 minutes)
{
  iss: "erp-system",
  sub: "user-123",
  id: "user-123",
  organizationId: "org-456",
  email: "user@company.com",
  iat: 1234567890,
  exp: 1234567890 + 900  // 15 minutes
}

// Refresh Token (long-lived, 7 days)
{
  iss: "erp-system",
  sub: "user-123",
  id: "user-123",
  organizationId: "org-456",
  iat: 1234567890,
  exp: 1234567890 + 604800  // 7 days
}
```

## Implementation

### Login Flow

```typescript
1. User provides email + password
   ↓
2. Hash password with bcryptjs and compare
   ↓
3. Generate Access Token + Refresh Token
   ↓
4. Return tokens to client
   ↓
5. Client stores:
     - Access Token: memory or sessionStorage
     - Refresh Token: httpOnly cookie (if web) or secure storage (if mobile)
```

### Protected Endpoints

```typescript
1. Client sends request with: Authorization: Bearer ACCESS_TOKEN
   ↓
2. Middleware verifies signature and expiry
   ↓
3. Extracts context (userId, organizationId)
   ↓
4. Validates user still exists and belongs to org
   ↓
5. Proceeds with request
```

### Token Refresh

```typescript
1. Access Token expires
   ↓
2. Client detects 401 response
   ↓
3. Client sends Refresh Token to /api/v1/auth/refresh
   ↓
4. Server validates Refresh Token
   ↓
5. Server returns new Access Token (may create new Refresh Token)
   ↓
6. Client retries original request
```

## Storage Strategy

### Web (React Native Web)
```typescript
// Access Token: sessionStorage or memory
// Reason: Compromised if XSS, but limited duration
sessionStorage.setItem('accessToken', token);

// Refresh Token: httpOnly cookie
// Reason: Cannot be accessed by JavaScript (XSS protection)
// Sent automatically by browser
httpOnly: true
secure: true  // HTTPS only in production
sameSite: 'strict'
```

### Mobile (React Native)
```typescript
// Both tokens: Secure storage (AsyncStorage + encryption)
// Access Token: Memory when app is running
// Refresh Token: Encrypted storage
```

## Password Security

```typescript
// Hashing with bcryptjs
const passwordHash = await bcrypt.hash(password, 10);
  // 10 = salt rounds
  // Results in ~100ms per hash (acceptable)

// Verification
const isValid = await bcrypt.compare(userPassword, storedHash);
  // Timing-safe comparison
```

## Secret Management

```
JWT_ACCESS_SECRET = 64+ character random string
JWT_REFRESH_SECRET = 64+ character random string

Store in:
✅ Environment variables
✅ Secrets management system (AWS Secrets Manager, etc)
✅ .env file (dev only, NEVER commit)

❌ Hardcoded
❌ In database
❌ In git history
```

## Multiple Organization Support

```typescript
// User logs in - system asks which org
// Or: System creates token for their primary org
// Or: System creates platform-level token, then switch orgs

// When switching organizations
const context = {
  userId: 'user-123',
  organizationId: 'org-456',  ← Changes per request
  roles: ['admin', 'user']
};

// Backend confirms user is member of new org
const membership = await OrganizationMembership.findOne({
  organizationId: newOrgId,
  userId: userId,
  status: 'active'
});

if (!membership) throw new AuthorizationError();
```

## Revocation (Future)

Currently: Tokens are valid until expiry

Future implementation (when needed):
- Revocation list (blacklist expired tokens from logout)
- Redis store for fast lookup
- Session kill endpoint

```typescript
// Logout stores token in Redis with TTL = expiry time
// Middleware checks: is token in revocation list?
```

## Consequences

### Positive
✅ Stateless authentication (no session storage needed)
✅ Scalable (no server-side session data)
✅ Mobile-friendly
✅ Cross-domain/CORS compatible
✅ Self-contained (org info in token)
✅ Separate access/refresh allows flexibility
✅ Token expiry forces re-authentication

### Negative
❌ Cannot immediately revoke tokens (until expiry)
❌ Token size increases response size
❌ Requires HTTPS in production
❌ Client must store tokens securely

## Security Considerations

### ✅ DO
- Use HTTPS in production
- Use httpOnly cookies for refresh tokens (web)
- Use secure storage for tokens (mobile)
- Verify token signature on every request
- Check token expiry
- Validate user still exists and is active
- Log authentication attempts

### ❌ DON'T
- Send sensitive data in JWT (passwords, social security numbers)
- Trust token claims without verification
- Use weak secrets
- Store unencrypted tokens in localStorage
- Use JWT for storing roles (load from membership table)
- Share JWT secret between environments

## Testing

```typescript
it('should reject expired access token', async () => {
  // Create token with very short expiry
  // Wait for expiry
  // Send request with expired token
  // Expect 401 Unauthorized
});

it('should refresh access token via refresh token', async () => {
  // Get refresh token from login
  // Access token expires
  // Call /api/v1/auth/refresh
  // Expect new access token
});

it('should not accept invalid signature', async () => {
  // Tamper with token payload
  // Send request
  // Expect 401 Unauthorized
});
```

## Related Decisions
- ADR-002: Multi-tenancy influences token payload
- ADR-004: Authorization checks JWT context
