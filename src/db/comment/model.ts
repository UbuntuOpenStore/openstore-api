import { Schema, model } from 'mongoose';
import { CommentDoc, CommentModel } from './types';

const commentSchema = new Schema<CommentDoc, CommentModel>({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  date: Date,
  body: String,
});

export default model<CommentDoc, CommentModel>('Comment', commentSchema);