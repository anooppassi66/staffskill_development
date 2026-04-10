const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const Certificate = require('../models/Certificate');

// GET /api/employee/dashboard
// returns list of enrollments with progress, next lesson, resume url, certificate (if any)
exports.dashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const enrollments = await Enrollment.find({ user: userId }).populate('course');

    const items = [];
    for (const en of enrollments) {
      const course = await Course.findById(en.course._id).populate('category');
      if (!course) continue;
      if (course.status !== 'active' && course.isActive !== true) continue;

      // compute total lessons
      let totalLessons = 0;
      course.chapters.forEach(ch => { totalLessons += (ch.lessons || []).length; });

      const completedCount = en.completedLessons.length;
      const progress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

      // compute next lesson
      const completedSet = new Set(en.completedLessons.map(cl => `${cl.chapter.toString()}::${cl.lesson.toString()}`));
      let next = null;
      for (const ch of course.chapters) {
        for (const ls of ch.lessons) {
          const key = `${ch._id.toString()}::${ls._id.toString()}`;
          if (!completedSet.has(key)) {
            next = { chapterId: ch._id, lessonId: ls._id, lesson: ls };
            break;
          }
        }
        if (next) break;
      }

      // find certificate if completed
      let certificate = null;
      if (en.isCompleted) {
        certificate = await Certificate.findOne({ user: userId, course: course._id });
      }

      items.push({
        enrollmentId: en._id,
        course: { id: course._id, title: course.title, category: course.category, status: course.status },
        totalLessons,
        completedLessons: completedCount,
        progress,
        nextLesson: next,
        resumeUrl: next ? `/api/enrollments/${course._id}/resume` : null,
        isCompleted: en.isCompleted || false,
        certificate: certificate || null,
        enrolledAt: en.enrolledAt,
        completedAt: en.completedAt || null
      });
    }

    return res.json({ dashboard: items });
  } catch (err) {
    next(err);
  }
};
