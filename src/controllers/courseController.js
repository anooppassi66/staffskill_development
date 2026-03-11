const Course = require('../models/Course');

exports.createCourse = async (req, res, next) => {
  try {
    const { title, category, level, language, short_description, description, status, course_image } = req.body;
    if (!title || !category) return res.status(400).json({ message: 'title and category are required' });
    const course = await Course.create({ title, category, level, language, short_description, description, status, course_image });
    return res.status(201).json({ course });
  } catch (err) {
    next(err);
  }
};

exports.editCourse = async (req, res, next) => {
  try {
    const updates = {};
    const allowed = ['title', 'category', 'level', 'language', 'short_description', 'description', 'status', 'isActive'];
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const course = await Course.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!course) return res.status(404).json({ message: 'course not found' });
    return res.json({ course });
  } catch (err) {
    next(err);
  }
};

// Soft-delete / deactivate course
exports.deactivateCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: 'course not found' });
    course.isActive = false;
    course.status = 'deleted';
    await course.save();
    return res.json({ message: 'course deactivated' });
  } catch (err) {
    next(err);
  }
};

exports.listCourses = async (req, res, next) => {
  try {
    const filter = {};
    // status and category filters
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.level) filter.level = req.query.level;
    if (req.query.language) filter.language = req.query.language;

    // search query (title/short_description)
    if (req.query.q) {
      const q = req.query.q.trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { short_description: { $regex: q, $options: 'i' } }
      ];
    }

    // only include active unless explicitly requested
    if (!req.query.include_inactive) filter.isActive = true;

    if (req.user && req.user.id) {
      const Enrollment = require('../models/Enrollment');
      const allEnrolled = await Enrollment.find({ user: req.user.id }).select('course');
      const excludeIds = allEnrolled.map(e => e.course).filter(Boolean);
      if (excludeIds.length > 0) {
        filter._id = { $nin: excludeIds };
      }
    }

    // pagination (support skip/limit or page/limit)
    const hasSkip = req.query.skip !== undefined;
    const limit = Math.min(100, parseInt(req.query.limit || '10'));
    const page = hasSkip ? Math.floor(parseInt(req.query.skip || '0') / limit) + 1 : Math.max(1, parseInt(req.query.page || '1'));
    const skip = hasSkip ? Math.max(0, parseInt(req.query.skip || '0')) : (page - 1) * limit;

    const [total, docs] = await Promise.all([
      Course.countDocuments(filter),
      Course.find(filter).populate('category').sort({ createdAt: -1 }).skip(skip).limit(limit)
    ]);

    // add a top-level thumbnail_url for convenience (first lesson thumbnail)
    const courses = docs.map((c) => {
      const obj = c.toObject();
      let thumb = null;
      for (const ch of (obj.chapters || [])) {
        for (const ls of (ch.lessons || [])) {
          if (ls.thumbnail_url) { thumb = ls.thumbnail_url; break; }
        }
        if (thumb) break;
      }
      obj.thumbnail_url = thumb;
      return obj;
    });

    return res.json({ meta: { total, page, limit, skip }, courses });
  } catch (err) {
    next(err);
  }
};

exports.getCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id).populate('category');
    if (!course) return res.status(404).json({ message: 'course not found' });
    return res.json({ course });
  } catch (err) {
    next(err);
  }
};

// public course details with optional user progress mapping
exports.getCoursePublic = async (req, res, next) => {
  try {
    const CourseModel = Course;
    const Enrollment = require('../models/Enrollment');
    const course = await CourseModel.findById(req.params.id).populate('category');
    if (!course) return res.status(404).json({ message: 'course not found' });

    // base response
    const response = { course: course.toObject() };
    const enrolledCount = await Enrollment.countDocuments({ course: course._id });
    response.course.enrolledCount = enrolledCount;
    if (!response.course.videoDurationMinutes) {
      const totalSeconds = (response.course.chapters || []).reduce((sum, ch) => {
        return sum + (ch.lessons || []).reduce((acc, ls) => acc + (ls.durationSeconds || 0), 0);
      }, 0);
      response.course.videoDurationMinutes = Math.round(totalSeconds / 60);
    }

    // if a user is present (optionalAuth), include per-lesson completed flags
    if (req.user && req.user.id) {
      const enrollment = await Enrollment.findOne({ user: req.user.id, course: course._id });
      const completedSet = new Set((enrollment ? enrollment.completedLessons : []).map(cl => `${cl.chapter.toString()}::${cl.lesson.toString()}`));

      // annotate chapters/lessons
      response.course.chapters = response.course.chapters.map(ch => {
        const chId = ch._id;
        const lessons = (ch.lessons || []).map(ls => ({
            _id: ls._id,
            name: ls.name,
            video_url: ls.video_url,
            thumbnail_url: ls.thumbnail_url,
            description: ls.description,
            completed: completedSet.has(`${chId.toString()}::${ls._id.toString()}`)
          }));
        return { _id: chId, title: ch.title, lessons };
      });

      response.enrollment = enrollment || null;
    }

    return res.json(response);
  } catch (err) {
    next(err);
  }
};

exports.addChapter = async (req, res, next) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ message: 'chapter title required' });
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ message: 'course not found' });
    course.chapters.push({ title, lessons: [] });
    await course.save();
    return res.status(201).json({ chapters: course.chapters });
  } catch (err) {
    next(err);
  }
};

exports.addLesson = async (req, res, next) => {
  try {
    const { name, description, durationSeconds, durationMinutes, video_url, thumbnail_url } = req.body;
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ message: 'course not found' });
    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) return res.status(404).json({ message: 'chapter not found' });

    const lesson = { name, description };

    // multer.fields places uploaded files in req.files as arrays
    // if (req.files) {
    //   if (req.files.video && req.files.video[0]) {
    //     lesson.video_url = `/uploads/${req.files.video[0].filename}`;
    //   }
    //   if (req.files.thumbnail && req.files.thumbnail[0]) {
    //     lesson.thumbnail_url = `/uploads/${req.files.thumbnail[0].filename}`;
    //   }
    // }

    lesson.video_url = video_url;
    lesson.thumbnail_url = thumbnail_url;
    const durSec = typeof durationSeconds === 'number' ? durationSeconds : parseInt(String(durationSeconds || 0));
    const durMin = typeof durationMinutes === 'number' ? durationMinutes : parseInt(String(durationMinutes || 0));
    const finalDurSec = !isNaN(durSec) && durSec > 0 ? durSec : (!isNaN(durMin) && durMin > 0 ? durMin * 60 : undefined);
    if (finalDurSec) lesson.durationSeconds = finalDurSec;

    chapter.lessons.push(lesson);
    await course.save();
    const totalSeconds = course.chapters.reduce((sum, ch) => {
      return sum + (ch.lessons || []).reduce((acc, ls) => acc + (ls.durationSeconds || 0), 0);
    }, 0);
    course.videoDurationMinutes = Math.round(totalSeconds / 60);
    await course.save();
    return res.status(201).json({ chapter });
  } catch (err) {
    next(err);
  }
};

exports.updateLesson = async (req, res, next) => {
  try {
    const { name, description, durationSeconds, durationMinutes, video_url, thumbnail_url } = req.body;
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ message: 'course not found' });
    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) return res.status(404).json({ message: 'chapter not found' });
    const lesson = chapter.lessons.id(req.params.lessonId);
    if (!lesson) return res.status(404).json({ message: 'lesson not found' });

    if (name !== undefined) lesson.name = name;
    if (description !== undefined) lesson.description = description;

    // if (req.files) {
    //   if (req.files.video && req.files.video[0]) {
    //     lesson.video_url = `/uploads/${req.files.video[0].filename}`;
    //   }
    //   if (req.files.thumbnail && req.files.thumbnail[0]) {
    //     lesson.thumbnail_url = `/uploads/${req.files.thumbnail[0].filename}`;
    //   }
    // }

    lesson.video_url = video_url || lesson.video_url;
    lesson.thumbnail_url = thumbnail_url || lesson.thumbnail_url;

    const durSec = typeof durationSeconds === 'number' ? durationSeconds : parseInt(String(durationSeconds || 0));
    const durMin = typeof durationMinutes === 'number' ? durationMinutes : parseInt(String(durationMinutes || 0));
    const finalDurSec = !isNaN(durSec) && durSec > 0 ? durSec : (!isNaN(durMin) && durMin > 0 ? durMin * 60 : undefined);
    if (finalDurSec) lesson.durationSeconds = finalDurSec;

    await course.save();

    const totalSeconds = course.chapters.reduce((sum, ch) => {
      return sum + (ch.lessons || []).reduce((acc, ls) => acc + (ls.durationSeconds || 0), 0);
    }, 0);
    course.videoDurationMinutes = Math.round(totalSeconds / 60);
    await course.save();

    return res.json({ lesson });
  } catch (err) {
    next(err);
  }
};
