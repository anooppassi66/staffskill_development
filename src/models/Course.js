const mongoose = require('mongoose');

const LessonSchema = new mongoose.Schema({
  name: { type: String, required: true },
  video_url: { type: String },
  thumbnail_url: { type: String },
  description: { type: String },
  durationSeconds: { type: Number },
  visibleTo: { type: [String], enum: ['normal_user', 'employee'], default: ['normal_user', 'employee'] },
  createdAt: { type: Date, default: Date.now }
});

const ChapterSchema = new mongoose.Schema({
  title: { type: String, required: true },
  lessons: [LessonSchema],
  createdAt: { type: Date, default: Date.now }
});

const CourseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  level: { type: String, enum: ['Easy', 'Intermediate', 'Hard'], default: 'Easy' },
  language: { type: String, enum: ['English', 'Hindi'], default: 'English' },
  short_description: { type: String },
  description: { type: String },
  course_image: { type: String },
  videoDurationMinutes: { type: Number, default: 0 },
  chapters: [ChapterSchema],
  visibleTo: { type: [String], enum: ['normal_user', 'employee'], default: ['normal_user', 'employee'] },
  status: { type: String, enum: ['published', 'draft', 'deleted'], default: 'draft' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Course', CourseSchema);
