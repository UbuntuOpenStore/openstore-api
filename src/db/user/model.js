const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
    apikey: String,
    email: String,
    language: String,
    name: String,
    role: String,
    ubuntu_id: {type: String, index: true},
    github_id: String,
    gitlab_id: String,
    username: String,
});

const User = mongoose.model('User', userSchema);

module.exports = User;
