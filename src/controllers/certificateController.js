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

  const doc = new PDFDocument({ size: 'A4', layout: "landscape", margin: 0 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const qr = require('qr-image');
  
  // Background
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');
  // Left Sidebar
  doc.rect(0, 0, 210, doc.page.height).fill('#052549');
  
  // Sidebar Logo
  const logoPath = path.join(__dirname, '..', 'assets', 'logo.png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 40, 60, { width: 130 });
  }
  
  // Certificate specific details (Dummy QR code with user id and course id for validation)
  const validationUrl = `${process.env.FRONTEND_URL || 'https://example.com'}/verify-certificate/${user._id}/${course._id}`;
  const qrImage = qr.imageSync(validationUrl, { type: 'png', margin: 0 });
  doc.image(qrImage, 55, 420, { width: 100 });

  // Add QR code white background to match design
  doc.rect(45, 410, 120, 120).lineWidth(2).stroke('#ffffff');

  // Title text
  doc.font('Helvetica-Bold').fontSize(40).fillColor('#2d2d2d').text('CERTIFICATE', 240, 70);
  doc.font('Helvetica-Bold').fontSize(22).text('OF COMPLETION', 240, 115);

  // Golden Badge
  const currentYear = new Date().getFullYear().toString();
  doc.circle(700, 100, 45).fill('#e5b850');
  doc.circle(700, 100, 40).lineWidth(1).stroke('#ffffff');
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#052549').text(currentYear, 680, 85);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#052549').text('AWARDED', 681, 105);
  
  // Ribbons for badge
  doc.polygon([670, 140], [665, 190], [685, 175], [705, 195], [695, 145]).fill('#052549');
  doc.polygon([730, 140], [735, 190], [715, 175], [695, 195], [705, 145]).fill('#052549');

  // Presented text
  doc.font('Helvetica').fontSize(16).fillColor('#333333').text('We proudly present this certificate to', 240, 240);
  
  // Name
  doc.font('Helvetica-Bold').fontSize(40).fillColor('#2d2d2d').text(`${user.first_name || ''} ${user.last_name || ''}`, 240, 280);
  
  // Separator line
  doc.moveTo(240, 335).lineTo(700, 335).lineWidth(0.5).stroke('#cccccc');
  
  // Course and description
  doc.font('Helvetica').fontSize(14).fillColor('#333333').text(`honouring completion of the course: "${course.title || 'Brand Management'}"\nFor the ability to objectively assess the profitability of\nprojects and present products.`, 240, 360, { lineGap: 4 });

  // Signatures
  // doc.font('Helvetica-Oblique').fontSize(26).fillColor('#2d2d2d').text('Jane Kane', 240, 480);
  // doc.font('Helvetica-Bold').fontSize(10).fillColor('#2d2d2d').text('Jane Kane', 240, 510);
  // doc.font('Helvetica-Bold').fontSize(10).fillColor('#666666').text('MARKETING DIRECTOR', 240, 525);
  
  // const formattedDate = new Date().toISOString().split('T')[0];
  // doc.font('Helvetica-Bold').fontSize(10).fillColor('#666666').text(formattedDate, 240, 555);

  doc.font('Helvetica-Oblique').fontSize(26).fillColor('#2d2d2d').text('Harika Maganti', 520, 480);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#2d2d2d').text('Harika Maganti,', 520, 510);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#666666').text('Technology Manager', 520, 525);
  
  // A pseudo UUID for certificate id
  // const randomCertId = '93c7eb85-b2ee-49ff-acad-\n6b43f1c0d8cb'; 
  // doc.font('Helvetica-Bold').fontSize(10).fillColor('#666666').text(randomCertId, 520, 555);

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const cert = await Certificate.create({ 
      user: userId, 
      course: courseId, 
      quiz: quizId, 
      filePath: `/certificates/${fileName}`, 
      marks: marks || 0, 
      outOf: outOf || 0 
  });
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
