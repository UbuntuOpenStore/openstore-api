import { type HydratedDocument, type Model } from 'mongoose';

export interface IUser {
  apikey: string;
  email: string;
  language?: string;
  name?: string;
  role?: string;
  ubuntu_id?: string;
  github_id?: string;
  gitlab_id?: string;
  username: string;
}

export interface IUserMethods {
  serialize: () => IUser;
}

export type HydratedUser = HydratedDocument<IUser, IUserMethods>;

export interface UserModel extends Model<IUser, unknown, IUserMethods> { }
