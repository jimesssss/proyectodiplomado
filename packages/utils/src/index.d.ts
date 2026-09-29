/**
 * Shared utility functions
 */
/**
 * Generate a unique request ID for tracking
 */
export declare function generateRequestId(): string;
/**
 * Format ISO timestamp
 */
export declare function formatTimestamp(): string;
/**
 * Hash a password (placeholder - use bcryptjs in actual implementation)
 */
export declare function hashPassword(password: string): Promise<string>;
/**
 * Verify a password (placeholder)
 */
export declare function verifyPassword(password: string, hash: string): Promise<boolean>;
/**
 * Check if a value is a valid MongoDB ObjectId
 */
export declare function isValidObjectId(id: string): boolean;
//# sourceMappingURL=index.d.ts.map