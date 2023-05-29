import { HydratedDocument, Model, Types } from 'mongoose';

export interface IComment {
  user: Types.ObjectId,
  date: Date,
  body: string,
}

export type HydratedComment = HydratedDocument<IComment>;
export interface CommentModel extends Model<IComment> {}
