import { Schema, model } from 'mongoose';
import { type IUser, type IUserMethods, type UserModel } from './types';

const userSchema = new Schema<IUser, UserModel, IUserMethods>({
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

userSchema.method('serialize', function () {
  return {
    _id: this._id,
    email: this.email,
    name: this.name ? this.name : this.username,
    role: this.role ? this.role : 'community',
    username: this.username,
  };
});

export const User = model<IUser, UserModel>('User', userSchema);
