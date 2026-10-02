const mongoose = require('mongoose');

const CommentVoteSchema = new mongoose.Schema({
  comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['right', 'wrong'], required: true },
  createdAt: { type: Date, default: Date.now }
});

CommentVoteSchema.index({ comment: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('CommentVote', CommentVoteSchema);
