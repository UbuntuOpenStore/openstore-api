import User from './model';

export default {
  find() {
    return User.find({});
  },

  findOne(id: string) {
    return User.findOne({ _id: id });
  },
};
