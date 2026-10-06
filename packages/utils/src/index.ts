/**
 * Shared utility functions
 */

/**
 * Generate a unique request ID for tracking
 */
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format ISO timestamp
 */
export function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Hash a password (placeholder - use bcryptjs in actual implementation)
 */
export async function hashPassword(_password: string): Promise<string> {
  // This will be imported from bcryptjs in the API
  throw new Error('hashPassword should be called with bcryptjs');
}

/**
 * Verify a password (placeholder)
 */
export async function verifyPassword(_password: string, _hash: string): Promise<boolean> {
  // This will be imported from bcryptjs in the API
  throw new Error('verifyPassword should be called with bcryptjs');
}

/**
 * Check if a value is a valid MongoDB ObjectId
 */
export function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}
