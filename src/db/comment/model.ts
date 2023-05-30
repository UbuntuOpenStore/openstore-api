import { Schema, model } from 'mongoose';
import { type CommentModel, type IComment } from './types';

const schema = new Schema<IComment, CommentModel>({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  date: Date,
  body: String,
});

export const Comment = model<IComment, CommentModel>('Comment', schema);
