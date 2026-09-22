/**
 * Superficie pública del módulo CRM (FASE 8).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  createCrmRouter,
  createCrmRouters,
  CRM_ROUTE_PATHS,
  type CrmEntity,
  type CrmRouterDeps,
} from './presentation/routes/crm-routes.js';
export {
  createSearchRouter,
  CRM_SEARCH_TYPES,
  type CrmSearchType,
  type SearchResultItem,
} from './presentation/routes/search-routes.js';
export { getCustomer, listCustomers } from './application/customer-service.js';
export { getContact, listContacts } from './application/contact-service.js';
export { getLead, listLeads } from './application/lead-service.js';
export { getOpportunity, listOpportunities } from './application/opportunity-service.js';
export { getActivity, listActivities } from './application/activity-service.js';
export {
  toPublicCustomer,
  type Customer,
  type CustomerType,
  type PublicCustomer,
} from './domain/entities/customer.js';
export { toPublicContact, type Contact, type PublicContact } from './domain/entities/contact.js';
export {
  LEAD_SOURCES,
  LEAD_STATUSES,
  toPublicLead,
  type Lead,
  type LeadSource,
  type LeadStatus,
  type PublicLead,
} from './domain/entities/lead.js';
export {
  OPEN_STAGES,
  OPPORTUNITY_STAGES,
  toPublicOpportunity,
  type Opportunity,
  type OpportunityStage,
  type PublicOpportunity,
} from './domain/entities/opportunity.js';
export {
  ACTIVITY_TYPES,
  toPublicActivity,
  type Activity,
  type ActivityType,
  type PublicActivity,
} from './domain/entities/activity.js';
export { canTransitionLead, canTransitionOpportunity } from './domain/rules/crm-rules.js';
