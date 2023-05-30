import { type HydratedDocument, type Model } from 'mongoose';
import { type Request } from 'express';

export interface ILock {
  name: string;
  expire: Date;
  inserted: Date;
}

export type HydratedLock = HydratedDocument<ILock>;

export interface LockModel extends Model<ILock> {
  acquire: (name: string) => Promise<HydratedLock>;
  release: (lock: HydratedLock | null, req: Request) => Promise<void>;
}
