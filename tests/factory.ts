import Package from '../src/db/package/model';
import Review from '../src/db/review/model';
import User from '../src/db/user/model';

export default {
  package(data = {}) {
    const pkg = new Package({
      id: `foo.${Math.random()}`,
      name: `Package ${Math.random()}`,
      updated_date: (new Date()).toISOString(),
      ...data,
    });

    return pkg.save();
  },

  review(data = {}) {
    const review = new Review({
      rating: 'THUMBS_UP',
      body: `review body ${Math.random()}`,
      date: new Date(),
      redacted: false,
      ...data,
    });

    return review.save();
  },

  user(data = {}) {
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