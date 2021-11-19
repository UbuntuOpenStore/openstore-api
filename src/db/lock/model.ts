import { Schema, model } from 'mongoose';
import { LockDoc, LockModel } from './types';

const lockSchema = new Schema<LockDoc, LockModel>({
  name: { type: String },
  expire: { type: Date },
  inserted: { type: Date, default: () => new Date() },
}, { autoIndex: true });

lockSchema.index({ name: 1 }, { unique: true });

export default model<LockDoc, LockModel>('Lock', lockSchema);
