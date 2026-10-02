const Comment = require('../models/Comment');
const CommentVote = require('../models/CommentVote');

exports.listComments = async (req, res, next) => {
  try {
    const { lessonId } = req.query;
    if (!lessonId) return res.status(400).json({ message: 'lessonId is required' });

    const comments = await Comment.find({ lessonId })
      .populate('user', 'first_name last_name role')
      .sort({ createdAt: 1 });

    const myVotes = await CommentVote.find({
      comment: { $in: comments.map(c => c._id) },
      user: req.user.id
    });
    const myVoteMap = {};
    myVotes.forEach(v => { myVoteMap[v.comment.toString()] = v.type; });

    const out = comments.map(c => {
      const obj = c.toObject();
      obj.myVote = myVoteMap[c._id.toString()] || null;
      return obj;
    });

    return res.json({ comments: out });
  } catch (err) {
    next(err);
  }
};

exports.createComment = async (req, res, next) => {
  try {
    const { course, chapterId, lessonId, text } = req.body;
    if (!course || !chapterId || !lessonId || !text || !text.trim()) {
      return res.status(400).json({ message: 'course, chapterId, lessonId and text are required' });
    }
    const comment = await Comment.create({ course, chapterId, lessonId, text: text.trim(), user: req.user.id });
    await comment.populate('user', 'first_name last_name role');
    const obj = comment.toObject();
    obj.myVote = null;
    return res.status(201).json({ comment: obj });
  } catch (err) {
    next(err);
  }
};

exports.deleteComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'comment not found' });
    if (comment.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'you can only delete your own comment' });
    }
    await CommentVote.deleteMany({ comment: comment._id });
    await comment.deleteOne();
    return res.json({ message: 'comment deleted' });
  } catch (err) {
    next(err);
  }
};

exports.voteComment = async (req, res, next) => {
  try {
    const { type } = req.body;
    if (!['right', 'wrong'].includes(type)) return res.status(400).json({ message: 'type must be right or wrong' });

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'comment not found' });

    const existing = await CommentVote.findOne({ comment: comment._id, user: req.user.id });

    if (!existing) {
      await CommentVote.create({ comment: comment._id, user: req.user.id, type });
      comment[type === 'right' ? 'rightCount' : 'wrongCount'] += 1;
    } else if (existing.type === type) {
      await existing.deleteOne();
      comment[type === 'right' ? 'rightCount' : 'wrongCount'] = Math.max(0, comment[type === 'right' ? 'rightCount' : 'wrongCount'] - 1);
    } else {
      const previousType = existing.type;
      existing.type = type;
      await existing.save();
      comment[previousType === 'right' ? 'rightCount' : 'wrongCount'] = Math.max(0, comment[previousType === 'right' ? 'rightCount' : 'wrongCount'] - 1);
      comment[type === 'right' ? 'rightCount' : 'wrongCount'] += 1;
    }

    await comment.save();
    const myVote = await CommentVote.findOne({ comment: comment._id, user: req.user.id });
    return res.json({ rightCount: comment.rightCount, wrongCount: comment.wrongCount, myVote: myVote ? myVote.type : null });
  } catch (err) {
    next(err);
  }
};
