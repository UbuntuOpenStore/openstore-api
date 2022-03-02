import { Document, Model } from 'mongoose';
import { Request } from 'express';

export interface LockSchema {
  name: string,
  expire: Date,
  inserted: Date,
}

export interface LockDoc extends LockSchema, Document { }

export interface LockModel extends Model<LockDoc> {
  acquire(name: string): Promise<LockDoc>
  release(lock: LockDoc | null, req: Request): void
}
