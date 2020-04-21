const mongoose = require('mongoose');

const commentSchema = mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    date: Date,
    body: String,
});

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
