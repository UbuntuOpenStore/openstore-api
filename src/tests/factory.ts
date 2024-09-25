import { type IPackage, type IRevision, Package, type IPackageMethods } from 'db/package';
import { type IReview, Review } from 'db/review';
import { type IUser, User } from 'db/user';

export type TestPackage = IPackage & IPackageMethods & { _id: any; save: () => Promise<IPackage> };
export type TestUser = IUser & { _id: any; save: () => Promise<IUser> };
export type TestReview = IReview & { _id: any; save: () => Promise<IReview> };

export default {
  package(data: Omit<Partial<IPackage>, 'revisions'> & { revisions?: Partial<IRevision>[] } = {}): Promise<TestPackage> {
    const pkg = new Package({
      id: `foo.${Math.random()}`,
      name: `Package ${Math.random()}`,
      author: `Author ${Math.random()}`,
      updated_date: (new Date()).toISOString(),
      ...data,
    });

    return pkg.save();
  },

  review(data = {}): Promise<TestReview> {
    const review = new Review({
      rating: 'THUMBS_UP',
      body: `review body ${Math.random()}`,
      date: new Date(),
      redacted: false,
      ...data,
    });

    return review.save();
  },

  user(data = {}): Promise<TestUser> {
    const user = new User({
      name: `User ${Math.random()}`,
      username: `username-${Math.random()}`,
      apikey: `apikey-${Math.random()}`,
      role: 'community',
      ...data,
    });

    return user.save();
  },
};
