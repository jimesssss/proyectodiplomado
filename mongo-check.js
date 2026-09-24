import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
console.log('URI_OK', !!uri);

if (!uri) {
  console.error('MONGODB_URI not found in .env');
  process.exit(1);
}

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('CONNECTION_OK');
  await mongoose.disconnect();
} catch (err) {
  console.error('CONNECTION_ERROR');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
