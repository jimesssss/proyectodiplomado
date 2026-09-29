/**
 * Shared utility functions
 */
/**
 * Generate a unique request ID for tracking
 */
export function generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Format ISO timestamp
 */
export function formatTimestamp() {
    return new Date().toISOString();
}
/**
 * Hash a password (placeholder - use bcryptjs in actual implementation)
 */
export async function hashPassword(password) {
    // This will be imported from bcryptjs in the API
    throw new Error('hashPassword should be called with bcryptjs');
}
/**
 * Verify a password (placeholder)
 */
export async function verifyPassword(password, hash) {
    // This will be imported from bcryptjs in the API
    throw new Error('verifyPassword should be called with bcryptjs');
}
/**
 * Check if a value is a valid MongoDB ObjectId
 */
export function isValidObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(id);
}
//# sourceMappingURL=index.js.map