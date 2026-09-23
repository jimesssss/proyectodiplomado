/**
 * Superficie pública del módulo AI (FASE 20, ADR-008).
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  AI_ROUTE_PATH,
  createAiRouter,
  createAiRouters,
  type AiRouterDeps,
} from './presentation/routes/ai-routes.js';
export {
  getAiTool,
  listAiTools,
  type AiTool,
  type AiToolCatalogItem,
} from './application/tool-registry.js';
export {
  getInteraction,
  listInteractions,
  runAiTool,
  type AiCaller,
  type InteractionListQuery,
  type RunToolInput,
} from './application/ai-service.js';
export {
  AI_INTERACTION_STATUSES,
  toPublicAiInteraction,
  type AiInteraction,
  type AiInteractionStatus,
  type PublicAiInteraction,
} from './domain/entities/ai-interaction.js';
export { AI_INTERACTIONS_COLLECTION } from './infrastructure/schemas/collections.js';
