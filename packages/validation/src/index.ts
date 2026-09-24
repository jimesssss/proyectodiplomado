/**
 * Authentication & User validation schemas
 */
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  industryType: z.enum([
    'commerce',
    'retail',
    'services',
    'manufacturing',
    'construction',
    'restaurant',
    'other',
  ]),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

export const CreateBranchSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  name: z.string().min(1, 'Branch name is required'),
  code: z.string().min(1, 'Branch code is required'),
});

export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;
