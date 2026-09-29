/**
 * Shared type definitions for the ERP system
 */
export interface IOrganization {
    _id: string;
    name: string;
    industryType: 'commerce' | 'retail' | 'services' | 'manufacturing' | 'construction' | 'restaurant' | 'other';
    status: 'active' | 'inactive' | 'suspended';
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    updatedBy: string;
}
export interface IBranch {
    _id: string;
    organizationId: string;
    name: string;
    code: string;
    status: 'active' | 'inactive';
    createdAt: Date;
}
export interface IUser {
    _id: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    status: 'active' | 'inactive' | 'suspended';
    createdAt: Date;
    updatedAt: Date;
}
export interface IOrganizationMembership {
    _id: string;
    organizationId: string;
    userId: string;
    roles: string[];
    status: 'active' | 'inactive';
    joinedAt: Date;
}
export interface IJWTPayload {
    userId: string;
    organizationId: string;
    email: string;
    iat?: number;
    exp?: number;
}
export interface IRequestContext {
    userId: string;
    organizationId: string;
    branchId?: string;
    email: string;
    roles: string[];
}
export interface IApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
    timestamp: string;
    requestId: string;
}
export interface ITimestamps {
    createdAt: Date;
    createdBy: string;
    updatedAt: Date;
    updatedBy: string;
}
export interface IAuditEntry {
    _id: string;
    organizationId: string;
    userId: string;
    action: 'create' | 'read' | 'update' | 'delete';
    entity: string;
    entityId: string;
    changes?: Record<string, unknown>;
    timestamp: Date;
    ipAddress?: string;
    requestId: string;
}
//# sourceMappingURL=index.d.ts.map