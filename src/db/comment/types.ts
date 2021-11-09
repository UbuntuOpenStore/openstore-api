import { Document, Model } from 'mongoose';
import { UserDoc } from '../user/types';

export interface CommentSchema {
  user: UserDoc,
  date: Date,
  body: string,
}

export interface CommentDoc extends CommentSchema, Document {}

export interface CommentModel extends Model<CommentDoc> {}
