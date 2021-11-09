import { Document, Model } from 'mongoose';

export interface LockSchema {
  name: string,
  expire: Date,
  inserted: Date,
}

export interface LockDoc extends LockSchema, Document { }

export interface LockModel extends Model<LockDoc> { }
