const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const Certificate = require('../models/Certificate');
const Course = require('../models/Course');
const User = require('../models/User');

exports.generateCertificate = async (userId, courseId, quizId, marks = 0, outOf = 0) => {
  // helper used by quizController — returns certificate metadata
  const user = await User.findById(userId);
  const course = await Course.findById(courseId);
  if (!user || !course) throw new Error('user or course not found');

  const safeCourseTitle = String(course.title || 'course').replace(/[^\w\-]+/g, '_');
  const safeUserName = String(user.first_name || 'user').replace(/[^\w\-]+/g, '_');
  const fileName = `${safeUserName}_${user._id}_${safeCourseTitle}_${Date.now()}.pdf`;
  const outDir = path.join(__dirname, '..', '..', 'certificates');
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch {}
  const filePath = path.join(outDir, fileName);

  const doc = new PDFDocument({ size: 'A4', layout: "landscape",margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // doc.fontSize(20).text('Certificate of Completion', { align: 'center' });
  // doc.moveDown();
  // doc.fontSize(14).text(`This certifies that ${user.first_name || ''} ${user.last_name || ''}` , { align: 'center' });
  // doc.moveDown();
  // doc.fontSize(12).text(`Has successfully completed the course: ${course.title}`, { align: 'center' });
  // doc.moveDown();
  // doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'center' });
  // if (Number.isFinite(marks) && Number.isFinite(outOf) && outOf > 0) {
  //   doc.moveDown();
  //   doc.text(`Marks: ${marks} / ${outOf}`, { align: 'center' });
  // }

  // doc.end();


  // New code 

   const pageWidth = doc.page.width;
  const center = pageWidth / 2;

  // Border
  doc
    .lineWidth(3)
    .rect(20, 20, doc.page.width - 40, doc.page.height - 40)
    .stroke("#1f4e79");

  // Title
  doc
    .fontSize(40)
    .fillColor("#1f4e79")
    .font("Helvetica-Bold")
    .text("CERTIFICATE", 0, 80, { align: "center" });

  doc
    .fontSize(20)
    .fillColor("#555")
    .text("OF COMPLETION", { align: "center" });

  // Presented text
  doc.moveDown(2);

  doc
    .fontSize(16)
    .fillColor("#444")
    .text("This certificate is proudly presented to", {
      align: "center"
    });

  // Name
  doc.moveDown(1);

  doc
    .fontSize(34)
    .fillColor("#000")
    .font("Helvetica-Bold")
    .text(`${user.first_name || ''} ${user.last_name || ''}`, {
      align: "center"
    });

  // Course text
  doc.moveDown(1);

  doc
    .fontSize(16)
    .font("Helvetica")
    .text("for successfully completing the course", {
      align: "center"
    });

  doc.moveDown(1);

  doc
    .fontSize(26)
    .font("Helvetica-Bold")
    .fillColor("#1f4e79")
    .text(`${course.title}`, {
      align: "center"
    });

  // Date + ID
  doc.moveDown(2);

  doc
    .fontSize(14)
    .fillColor("#444")
    .text(`Date: ${new Date().toLocaleDateString()}`, center - 200, 420);

  // Signature line
  doc
    .moveTo(center - 200, 480)
    .lineTo(center - 80, 480)
    .stroke();

  doc
    .moveTo(center + 80, 480)
    .lineTo(center + 200, 480)
    .stroke();

  // doc
  //   .fontSize(12)
  //   .text("Instructor", center - 180, 485);

  // doc
  //   .text("Authorized Signature", center + 90, 485);

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const cert = await Certificate.create({ user: userId, course: courseId, quiz: quizId, filePath: `/certificates/${fileName}`, marks: marks || 0, outOf: outOf || 0 });
  return cert;
};

exports.listCertificates = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role !== 'admin') {
      filter.user = req.user.id;
    }
    const hasSkip = req.query.skip !== undefined;
    const limit = Math.min(100, parseInt(req.query.limit || '10'));
    const page = hasSkip ? Math.floor(parseInt(req.query.skip || '0') / limit) + 1 : Math.max(1, parseInt(req.query.page || '1'));
    const skip = hasSkip ? Math.max(0, parseInt(req.query.skip || '0')) : (page - 1) * limit;

    const [total, certs] = await Promise.all([
      Certificate.countDocuments(filter),
      Certificate.find(filter)
        .populate('user')
        .populate({ path: 'course', populate: { path: 'category' } })
        .sort({ awardedAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    return res.json({ meta: { total, page, limit, skip }, certificates: certs });
  } catch (err) {
    next(err);
  }
};
