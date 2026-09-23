/**
 * Dominio Projects — proyecto (FASE 17).
 *
 * Máquina de estados: `planning → active → completed`; `on_hold` como pausa
 * reversible desde `active`; `cancelled` desde cualquier estado NO terminal.
 * `completed` y `cancelled` son terminales: los campos de negocio quedan
 * congelados (patrón "solo borrador" de Sales/Purchasing/Manufacturing,
 * aquí aplicado a los no-terminales). `code` es la clave natural única por
 * tenant (normalizada e inmutable, patrón customer/supplier/product/BOM).
 */

export const PROJECT_STATUSES = [
  'planning',
  'active',
  'on_hold',
  'completed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  readonly id: string;
  readonly tenantId: string;
  /** Clave natural única por tenant (mayúsculas, espacios → guiones). */
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  /** Gerente del proyecto: usuario del MISMO tenant (FK) o `null`. */
  readonly managerId: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura para respuestas (sin `tenantId`: sale del JWT). */
export interface PublicProject {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ProjectStatus;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly managerId: string | null;
  readonly archived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function toPublicProject(project: Project): PublicProject {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    description: project.description,
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    managerId: project.managerId,
    archived: project.archived,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}
