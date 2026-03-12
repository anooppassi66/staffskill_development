const mongoose = require('mongoose');

const CompletedLessonSchema = new mongoose.Schema({
  chapter: { type: mongoose.Schema.Types.ObjectId, required: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, required: true }
}, { _id: false });

const EnrollmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  status: { type: String, enum: ['pending', 'approved'], default: 'approved' },
  requestedAt: { type: Date, default: Date.now },
  approvedAt: { type: Date },
  completedLessons: [CompletedLessonSchema],
  readyForQuiz: { type: Boolean, default: false },
  isCompleted: { type: Boolean, default: false },
  enrolledAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
});

EnrollmentSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', EnrollmentSchema);
