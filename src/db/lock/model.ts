import { Schema, model } from 'mongoose';
import { LockDoc, LockModel } from './types';

const lockSchema = new Schema<LockDoc, LockModel>({
  name: { type: String },
  expire: { type: Date },
  inserted: { type: Date, default: Date.now },
}, { autoIndex: true });

lockSchema.index({ name: 1 }, { unique: true });

export default model<LockDoc, LockModel>('Lock', lockSchema);
