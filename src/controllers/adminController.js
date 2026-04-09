const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');

// List employees with pagination
exports.listEmployees = async (req, res, next) => {
  try {
    const hasSkip = req.query.skip !== undefined;
    const limit = Math.min(100, parseInt(req.query.limit || '10'));
    const page = hasSkip ? Math.floor(parseInt(req.query.skip || '0') / limit) + 1 : Math.max(1, parseInt(req.query.page || '1'));
    const skip = hasSkip ? Math.max(0, parseInt(req.query.skip || '0')) : (page - 1) * limit;

    const filter = { role: 'employee' };
    // optionally filter by active status
    if (req.query.active !== undefined) {
      filter.isActive = req.query.active === 'true';
    }
    // search by name/email/user_name
    if (req.query.q) {
      const q = String(req.query.q).trim();
      filter.$or = [
        { first_name: { $regex: q, $options: 'i' } },
        { last_name: { $regex: q, $options: 'i' } },
        { user_name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }

    const [total, employees] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    return res.json({ meta: { total, page, limit, skip }, employees });
  } catch (err) {
    next(err);
  }
};

// Deactivate employee account
exports.deactivateEmployee = async (req, res, next) => {
  try {
    const employeeId = req.params.employeeId;
    const user = await User.findById(employeeId);
    if (!user) return res.status(404).json({ message: 'employee not found' });
    if (user.role !== 'employee') return res.status(400).json({ message: 'user is not an employee' });
    if (!user.isActive) return res.status(400).json({ message: 'employee already deactivated' });

    user.isActive = false;
    user.deactivatedAt = new Date();
    await user.save();

    return res.json({ message: 'employee deactivated', user: { id: user._id, email: user.email, isActive: user.isActive } });
  } catch (err) {
    next(err);
  }
};

// Activate employee account
exports.activateEmployee = async (req, res, next) => {
  try {
    const employeeId = req.params.employeeId;
    const user = await User.findById(employeeId);
    if (!user) return res.status(404).json({ message: 'employee not found' });
    if (user.role !== 'employee') return res.status(400).json({ message: 'user is not an employee' });
    if (user.isActive) return res.status(400).json({ message: 'employee already active' });
    user.isActive = true;
    user.deactivatedAt = null;
    await user.save();
    return res.json({ message: 'employee activated', user: { id: user._id, email: user.email, isActive: user.isActive } });
  } catch (err) {
    next(err);
  }
};

// Update employee profile (admin)
exports.updateEmployee = async (req, res, next) => {
  try {
    const employeeId = req.params.employeeId;
    const user = await User.findById(employeeId);
    if (!user) return res.status(404).json({ message: 'employee not found' });
    if (user.role !== 'employee') return res.status(400).json({ message: 'user is not an employee' });
    const allowed = ['first_name', 'last_name', 'user_name', 'email', 'phone_number', 'gender', 'dob', 'bio'];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        user[k] = req.body[k];
      }
    }
    if (req.body.email && String(req.body.email).toLowerCase() !== String(user.email).toLowerCase()) {
      const exists = await User.findOne({ email: String(req.body.email).toLowerCase() });
      if (exists && String(exists._id) !== String(user._id)) {
        return res.status(400).json({ message: 'email already in use' });
      }
    }
    await user.save();
    const out = user.toObject();
    delete out.password;
    return res.json({ user: out });
  } catch (err) {
    next(err);
  }
};

// Deactivate quiz (soft delete)
exports.deactivateQuiz = async (req, res, next) => {
  try {
    const quizId = req.params.quizId;
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'quiz not found' });
    if (!quiz.isActive) return res.status(400).json({ message: 'quiz already deactivated' });

    quiz.isActive = false;
    await quiz.save();

    return res.json({ message: 'quiz deactivated', quiz: { id: quiz._id, title: quiz.title, isActive: quiz.isActive } });
  } catch (err) {
    next(err);
  }
};

exports.dashboard = async (req, res, next) => {
  try {
    const [totalEmployees, totalCourses, activeCourses, totalEnrollments, completedEnrollments] = await Promise.all([
      User.countDocuments({ role: 'employee' }),
      Course.countDocuments({}),
      Course.countDocuments({ isActive: true, status: { $ne: 'deleted' } }),
      Enrollment.countDocuments({}),
      Enrollment.countDocuments({ isCompleted: true })
    ]);

    let employeesWithCompleted = 0;
    const agg = await Enrollment.aggregate([
      { $match: { isCompleted: true } },
      { $group: { _id: '$user', count: { $sum: 1 } } }
    ]);
    employeesWithCompleted = agg.length;

    const avgCoursesCompleted = totalEmployees > 0 ? Math.round((completedEnrollments / totalEmployees) * 100) / 100 : 0;
    const employeeCompletionPercentage = totalEmployees > 0 ? Math.round((employeesWithCompleted / totalEmployees) * 100) : 0;

    const recent = await Course.find({ isActive: true, status: { $ne: 'deleted' } }).sort({ createdAt: -1 }).limit(3);
    const recentWithEnrollCounts = await Promise.all(recent.map(async (c) => {
      const enrolledCount = await Enrollment.countDocuments({ course: c._id });
      let thumb = null;
      for (const ch of (c.chapters || [])) {
        for (const ls of (ch.lessons || [])) {
          if (ls.thumbnail_url) { thumb = ls.thumbnail_url; break; }
        }
        if (thumb) break;
      }
      return { id: c._id, title: c.title, description: c.description, createdAt: c.createdAt, status: c.status, enrolled: enrolledCount, thumbnail: thumb };
    }));

    return res.json({
      metrics: {
        enrolledCourses: totalEnrollments,
        activeCourses,
        avgCoursesCompleted,
        totalEmployees,
        totalCourses,
        employeeCompletionPercentage
      },
      recentCourses: recentWithEnrollCounts
    });
  } catch (err) {
    next(err);
  }
};

exports.getEnrolledEmployees = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find()
      .populate('user', 'first_name last_name email')
      .populate('course', 'title chapters');

    const employeeMap = {};

    enrollments.forEach(enrollment => {
      const user = enrollment.user;
      const course = enrollment.course;

      if (!user || !course) return; // Skip if user or course is missing

      const userId = user._id.toString();

      if (!employeeMap[userId]) {
        employeeMap[userId] = {
          _id: userId,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          courses: []
        };
      }
      
      const totalLessons = course.chapters ? course.chapters.reduce((sum, ch) => sum + (ch.lessons ? ch.lessons.length : 0), 0) : 0;
      const completedLessons = enrollment.completedLessons ? enrollment.completedLessons.length : 0;
      let percentage = 0;
      if (totalLessons > 0) {
        percentage = Math.round((completedLessons / totalLessons) * 100);
      } else if (enrollment.isCompleted) {
        percentage = 100;
      }
      
      employeeMap[userId].courses.push(`${course.title} (${percentage}%)`);
    });

    const enrolledEmployees = Object.values(employeeMap);

    return res.json({ enrolledEmployees });
  } catch (err) {
    next(err);
  }
};
