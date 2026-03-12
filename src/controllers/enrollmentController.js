const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');

const isApprovedEnrollment = (enrollment) => {
  // treat missing status as approved for backward compatibility
  return enrollment && (!enrollment.status || enrollment.status === 'approved');
};

exports.enroll = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const courseId = req.params.courseId;
    const course = await Course.findById(courseId);
    if (!course || !course.isActive) return res.status(404).json({ message: 'course not found' });

    const existing = await Enrollment.findOne({ user: userId, course: courseId });
    if (existing) {
      if (existing.status === 'pending') return res.status(400).json({ message: 'enrollment request already pending' });
      return res.status(400).json({ message: 'already enrolled' });
    }

    const enrollment = await Enrollment.create({ user: userId, course: courseId, status: 'pending', requestedAt: new Date() });
    return res.status(201).json({ enrollment });
  } catch (err) {
    next(err);
  }
};

exports.enrollEmployee = async (req, res, next) => {
  try {
    const courseId = req.params.courseId;
    const employeeId = req.params.employeeId;
    const course = await Course.findById(courseId);
    if (!course || !course.isActive) return res.status(404).json({ message: 'course not found' });

    const user = await User.findById(employeeId);
    if (!user || user.role !== 'employee') return res.status(404).json({ message: 'employee not found' });

    const existing = await Enrollment.findOne({ user: employeeId, course: courseId });
    if (existing) {
      if (existing.status === 'approved') return res.status(400).json({ message: 'already enrolled' });
      existing.status = 'approved';
      existing.approvedAt = new Date();
      await existing.save();
      return res.json({ enrollment: existing });
    }

    const enrollment = await Enrollment.create({ user: employeeId, course: courseId, status: 'approved', approvedAt: new Date() });
    return res.status(201).json({ enrollment });
  } catch (err) {
    next(err);
  }
};

exports.approveEnrollment = async (req, res, next) => {
  try {
    const enrollment = await Enrollment.findById(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ message: 'enrollment not found' });
    if (enrollment.status === 'approved') return res.status(400).json({ message: 'enrollment already approved' });
    enrollment.status = 'approved';
    enrollment.approvedAt = new Date();
    await enrollment.save();
    return res.json({ enrollment });
  } catch (err) {
    next(err);
  }
};

exports.listUserEnrollments = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const filter = { user: userId };
    // optional status filter: active|completed
    if (req.query.status === 'active') filter.isCompleted = false;
    if (req.query.status === 'completed') filter.isCompleted = true;
    if (req.query.approval === 'pending') filter.status = 'pending';
    if (req.query.approval === 'approved') filter.status = 'approved';
    const enrollments = await Enrollment.find(filter).populate({ path: 'course', populate: { path: 'category' } });
    return res.json({ enrollments });
  } catch (err) {
    next(err);
  }
};

exports.listPendingEnrollments = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ status: 'pending' })
      .populate({ path: 'user', select: '-password' })
      .populate({ path: 'course', populate: { path: 'category' } });
    return res.json({ enrollments });
  } catch (err) {
    next(err);
  }
};

exports.markLessonComplete = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const courseId = req.params.courseId;
    const { chapterId, lessonId } = req.body;
    if (!chapterId || !lessonId) return res.status(400).json({ message: 'chapterId and lessonId required' });

    const enrollment = await Enrollment.findOne({ user: userId, course: courseId });
    if (!enrollment) return res.status(404).json({ message: 'not enrolled' });
    if (!isApprovedEnrollment(enrollment)) return res.status(403).json({ message: 'enrollment not approved' });

    const already = enrollment.completedLessons.find(cl => cl.chapter.toString() === chapterId && cl.lesson.toString() === lessonId);
    if (already) return res.json({ message: 'lesson already marked complete', enrollment });

    enrollment.completedLessons.push({ chapter: chapterId, lesson: lessonId });

    // check if all lessons are completed
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'course not found' });

    // count total lessons
    let totalLessons = 0;
    course.chapters.forEach(ch => { totalLessons += (ch.lessons || []).length; });
    const completedCount = enrollment.completedLessons.length;
    if (completedCount >= totalLessons && totalLessons > 0) {
      enrollment.readyForQuiz = true;
    }

    await enrollment.save();
    return res.json({ enrollment });
  } catch (err) {
    next(err);
  }
};

exports.getProgress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const courseId = req.params.courseId;
    const enrollment = await Enrollment.findOne({ user: userId, course: courseId }).populate('course');
    if (!enrollment) return res.status(404).json({ message: 'not enrolled' });
    if (!isApprovedEnrollment(enrollment)) return res.status(403).json({ message: 'enrollment not approved' });
    return res.json({ enrollment });
  } catch (err) {
    next(err);
  }
};

exports.getNextLesson = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const courseId = req.params.courseId;
    const enrollment = await Enrollment.findOne({ user: userId, course: courseId });
    if (!enrollment) return res.status(404).json({ message: 'not enrolled' });
    if (!isApprovedEnrollment(enrollment)) return res.status(403).json({ message: 'enrollment not approved' });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'course not found' });

    // build set of completed lesson ids
    const completed = new Set(enrollment.completedLessons.map(cl => `${cl.chapter.toString()}::${cl.lesson.toString()}`));

    for (const ch of course.chapters) {
      for (const lesson of ch.lessons) {
        const key = `${ch._id.toString()}::${lesson._id.toString()}`;
        if (!completed.has(key)) {
          return res.json({ next: { chapterId: ch._id, lessonId: lesson._id, lesson } });
        }
      }
    }

    // all lessons completed
    return res.json({ next: null, message: 'all lessons completed' });
  } catch (err) {
    next(err);
  }
};
