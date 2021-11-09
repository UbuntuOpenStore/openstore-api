import { Schema, model } from 'mongoose';
import { UserModel, UserDoc } from './types';

const userSchema = new Schema<UserDoc, UserModel>({
  apikey: String,
  email: String,
  language: String,
  name: String,
  role: String,
  ubuntu_id: { type: String, index: true },
  github_id: String,
  gitlab_id: String,
  username: String,
});

export default model<UserDoc, UserModel>('User', userSchema);
