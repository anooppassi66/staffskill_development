require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/category');
const courseRoutes = require('./routes/course');
const enrollmentRoutes = require('./routes/enrollment');
const quizRoutes = require('./routes/quiz');
const certificateRoutes = require('./routes/certificate');
const employeeRoutes = require('./routes/employee');
const adminRoutes = require('./routes/admin');
const commentRoutes = require('./routes/comment');
const path = require('path');

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/comments', commentRoutes);

// serve uploaded media
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
// serve generated certificates
app.use('/certificates', express.static(path.join(__dirname, '..', 'certificates')));

const PORT = process.env.PORT || 4000;

async function start() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/lms_dev';
  await mongoose.connect(mongoUri).catch(err => {
    console.error('Mongo connection error', err);
    process.exit(1);
  });
  console.log('Connected to MongoDB');

  return app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// only start when run directly
if (require.main === module) {
  start();
}

module.exports = { app, start };
