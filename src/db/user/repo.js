const User = require('./model');

const UserRepo = {
  find() {
    return User.find({});
  },

  findOne(id) {
    return User.findOne({ _id: id });
  },
};


module.exports = UserRepo;
