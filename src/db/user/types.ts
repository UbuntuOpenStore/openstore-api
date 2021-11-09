import { Document, Model } from 'mongoose';

export interface UserSchema {
  apikey: string,
  email: string,
  language?: string,
  name?: string,
  role?: string,
  ubuntu_id?: string,
  github_id?: string,
  gitlab_id?: string,
  username: string,
}

export interface UserDoc extends UserSchema, Document { }

export interface UserModel extends Model<UserDoc> { }
