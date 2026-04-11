const Quiz = require('../models/Quiz');
const Enrollment = require('../models/Enrollment');
const Certificate = require('../models/Certificate');
const certificateController = require('./certificateController');

exports.createQuiz = async (req, res, next) => {
  try {
    const { course, title, questions, passMarks, durationMinutes, isPublic } = req.body;
    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) return res.status(400).json({ message: 'title and questions required' });
    const total = (questions || []).reduce((s, q) => s + (typeof q.marks === 'number' && q.marks > 0 ? q.marks : 1), 0);
    const pm = typeof passMarks === 'number' ? passMarks : parseInt(String(passMarks || 0));
    if (pm > total) return res.status(400).json({ message: 'passMarks cannot exceed total marks' });
    const quiz = await Quiz.create({ course, title, questions, passMarks: pm, durationMinutes, isPublic });
    return res.status(201).json({ quiz });
  } catch (err) {
    next(err);
  }
};

exports.attemptQuiz = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const quizId = req.params.quizId;
    const { answers } = req.body; // [{ questionId, answerIndex }]
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'quiz not found' });
    if (!quiz.isActive) return res.status(404).json({ message: 'quiz not available' });

    // if quiz is tied to a course, ensure user is enrolled and readyForQuiz
    let enrollment = null;
    if (quiz.course) {
      enrollment = await Enrollment.findOne({ user: userId, course: quiz.course });
      if (!enrollment) return res.status(403).json({ message: 'not enrolled for this course' });
      if (enrollment.status && enrollment.status !== 'approved') return res.status(403).json({ message: 'enrollment not approved' });
      if (!enrollment.readyForQuiz) return res.status(400).json({ message: 'complete lessons before taking the quiz' });
    }

    // grade
    const qMap = {};
    (quiz.questions || []).forEach(q => { qMap[String(q._id)] = q; });
    let score = 0;
    (answers || []).forEach(ans => {
      const q = qMap[String(ans.questionId)];
      if (!q) return;
      const givenIdx = Number(ans.answerIndex);
      const correctIdx = Number(q.correctIndex);
      if (Number.isFinite(givenIdx) && Number.isFinite(correctIdx) && givenIdx === correctIdx) {
        const marks = (typeof q.marks === 'number' && q.marks > 0) ? q.marks : 1;
        score += marks;
      }
    });

    const totalMarksCalculated = (quiz.questions || []).reduce((s, q) => {
      const m = (typeof q.marks === 'number' && q.marks > 0) ? q.marks : 1;
      return s + m;
    }, 0);

    const pm = Number(quiz.passMarks || 0);
    const effectivePassMarks = Math.min(pm, totalMarksCalculated || pm);
    const passed = score >= effectivePassMarks;

      let certObj = null;
    if (passed && quiz.course) {
      // mark enrollment completed and generate certificate
      enrollment.isCompleted = true;
      enrollment.completedAt = new Date();
      await enrollment.save();
        certObj = await certificateController.generateCertificate(userId, quiz.course, quiz._id, score, totalMarksCalculated || quiz.totalMarks || 0);
    }

      return res.json({ score, total: totalMarksCalculated || quiz.totalMarks || 0, passed, certificate: certObj });
  } catch (err) {
    next(err);
  }
};

exports.listQuizzes = async (req, res, next) => {
  try {
    const filter = {};
    if (!(req.query.include_inactive === 'true' && req.user && req.user.role === 'admin')) {
      filter.isActive = true;
    }
    
    if (req.query.course) {
      filter.course = req.query.course;
    } else {
      const Course = require('../models/Course');
      const activeCoursesDocs = await Course.find({ isActive: true, status: 'active' }, '_id');
      const activeCourseIds = activeCoursesDocs.map(c => c._id);
      
      filter.$or = [
        { course: { $in: activeCourseIds } },
        { course: null },
        { course: { $exists: false } }
      ];
    }

    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '10'));
    const skip = (page - 1) * limit;

    const [total, quizzes] = await Promise.all([
      Quiz.countDocuments(filter),
      Quiz.find(filter).populate('course').sort({ createdAt: -1 }).skip(skip).limit(limit)
    ]);

    return res.json({ meta: { total, page, limit }, quizzes });
  } catch (err) {
    next(err);
  }
};

exports.getQuiz = async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ message: 'quiz not found' });
    if (!quiz.isActive && (!req.user || req.user.role !== 'admin')) {
      return res.status(404).json({ message: 'quiz not available' });
    }
    return res.json({ questions: quiz.questions, quiz });
  } catch (err) {
    next(err);
  }
};

exports.updateQuiz = async (req, res, next) => {
  try {
    const quizId = req.params.quizId;
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'quiz not found' });
    const allowed = ['course', 'title', 'passMarks', 'durationMinutes', 'isPublic', 'isActive'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) quiz[k] = req.body[k];
    });
    if (Array.isArray(req.body.questions)) {
      if (req.body.questions.length === 0) return res.status(400).json({ message: 'questions cannot be empty' });
      quiz.questions = req.body.questions;
      quiz.totalMarks = (quiz.questions || []).reduce((s, q) => s + (q.marks || 0), 0);
    }
    const total = (quiz.questions || []).reduce((s, q) => s + (typeof q.marks === 'number' && q.marks > 0 ? q.marks : 1), 0);
    const pm = typeof quiz.passMarks === 'number' ? quiz.passMarks : parseInt(String(quiz.passMarks || 0));
    if (pm > total) return res.status(400).json({ message: 'passMarks cannot exceed total marks' });
    quiz.passMarks = pm;
    await quiz.save();
    return res.json({ quiz });
  } catch (err) {
    next(err);
  }
};

exports.deleteQuiz = async (req, res, next) => {
  try {
    const quizId = req.params.quizId;
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'quiz not found' });
    if (!quiz.isActive) return res.status(400).json({ message: 'quiz already deactivated' });
    quiz.isActive = false;
    await quiz.save();
    return res.json({ message: 'quiz deactivated', quiz: { id: quiz._id, isActive: quiz.isActive } });
  } catch (err) {
    next(err);
  }
};
