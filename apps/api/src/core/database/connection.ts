/**
 * Database connection setup
 */
import mongoose from 'mongoose';
import { config } from '@erp/config';
import logger from '../security/logger';

export async function connectDatabase(): Promise<void> {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(config.MONGODB_URI, {
      retryWrites: true,
      w: 'majority',
    });
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error('MongoDB disconnection error:', error);
    throw error;
  }
}
