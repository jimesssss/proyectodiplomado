/**
 * Shared type definitions for the ERP system
 */

// Organization & Multi-tenancy
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

// Authentication & Users
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

// JWT Token Payload
export interface IJWTPayload {
  userId: string;
  organizationId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// Request Context
export interface IRequestContext {
  userId: string;
  organizationId: string;
  branchId?: string;
  email: string;
  roles: string[];
}

// API Response
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

// Common entity fields
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
