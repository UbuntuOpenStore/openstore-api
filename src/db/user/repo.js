const User = require('./model');
const {getData, getDataArray} = require('../../utils/helpers');

const UserRepo = {
    find() {
        return User.find({});
    },

    findOne(id) {
        return User.findOne({ _id: id});
    },
};


module.exports = UserRepo
