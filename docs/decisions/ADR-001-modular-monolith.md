# ADR-001: Modular Monolith vs Microservices

## Status
✅ **ACCEPTED**

## Context

We need to decide between:
1. **Monolith**: Single codebase, single deployment
2. **Microservices**: Multiple codebases, distributed services
3. **Modular Monolith**: Single deployment, but modules designed to be independent

Initial project needs:
- Fast development velocity
- Simple deployment and operations
- But future growth to potentially 100+ services
- Support for multiple business types

## Decision

**Use Modular Monolith initially**, with clear module boundaries that allow future migration to microservices.

## Rationale

### Monolith Advantages
✅ Simpler to develop initially
✅ Easier to test (no network calls)
✅ Simpler deployment
✅ No distributed transaction complexity
✅ Easier debugging
✅ Single database simplifies consistency

### Monolith Disadvantages  
❌ At scale, can become hard to maintain
❌ Technology lock-in
❌ Harder to scale individual modules
❌ Single point of failure

### Microservices Disadvantages
❌ Operational complexity
❌ Distributed transaction complexity
❌ Network latency
❌ More complex testing
❌ More infrastructure required

### Modular Monolith (Our Choice)
✅ Start with simplicity
✅ Clear module boundaries (can become services)
✅ EventBus can become message queue later
✅ Repositories can become separate databases
✅ Services can become independent services
**NO premature complexity**

## Migration Path (Future)

When real need exists (high traffic, scaling needs):

```
Monolith with modules
    ↓
Extract module to service (REST/gRPC)
    ↓
EventBus → RabbitMQ/Kafka
    ↓
Full microservices architecture
```

## Consequences

### Positive
- Fast development velocity
- Simple deployment
- Clear structure ready for future scaling
- No premature optimization

### Negative
- Cannot independently scale individual modules
- Still has monolith limitations at very large scale
- Will require refactoring to become microservices

## Alternatives Considered

### Full Microservices Now
- **Rejected**: Too complex for current stage
- Would slow down development significantly
- Overkill for unknown future requirements

### Unstructured Monolith
- **Rejected**: Would create technical debt
- Would be impossible to migrate later
- Clear module boundaries are essential

## Related Decisions
- ADR-002: Module communication via EventBus
- ADR-003: Multi-tenancy architecture
