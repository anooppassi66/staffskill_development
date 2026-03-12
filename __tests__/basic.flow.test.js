const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { app } = require('../src/index');
const fs = require('fs');

jest.setTimeout(20000);

describe('basic lms flow', () => {
  let mongod;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    process.env.ADMIN_EMAIL = 'admin@test.com';
    process.env.ADMIN_PASSWORD = 'adminpass';
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  test('seed admin, login, create category, create course, enroll, complete, quiz flow', async () => {
    // seed admin
    await request(app).get('/api/auth/seed-admin').expect(200);

    // login
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'adminpass' }).expect(200);
    const token = loginRes.body.token;
    expect(token).toBeTruthy();

    // create category
    const catRes = await request(app).post('/api/categories').set('Authorization', `Bearer ${token}`).send({ category_name: 'Testing' }).expect(201);
    const categoryId = catRes.body.category._id;

    // create course
    const courseRes = await request(app).post('/api/courses').set('Authorization', `Bearer ${token}`).send({ title: 'Test Course', category: categoryId }).expect(201);
    const courseId = courseRes.body.course._id;

    // add chapter
    const chapRes = await request(app).post(`/api/courses/${courseId}/chapters`).set('Authorization', `Bearer ${token}`).send({ title: 'Chap 1' }).expect(201);
    const chapter = chapRes.body.chapters[0];

    // add lesson (no video)
    const lessonRes = await request(app)
      .post(`/api/courses/${courseId}/chapters/${chapter._id}/lessons`)
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Lesson 1')
      .field('description', 'desc')
      .expect(201);

    // seed employee via admin register
    const regRes = await request(app).post('/api/auth/register').set('Authorization', `Bearer ${token}`).send({ email: 'emp@test.com', first_name: 'Emp' }).expect(201);
    const tempPassword = regRes.body.tempPassword;

    // employee login
    const empLogin = await request(app).post('/api/auth/login').send({ email: 'emp@test.com', password: tempPassword }).expect(200);
    const empToken = empLogin.body.token;

    // employee requests enrollment (pending approval)
    const enrollRes = await request(app)
      .post(`/api/enrollments/${courseId}/enroll`)
      .set('Authorization', `Bearer ${empToken}`)
      .expect(201);
    expect(enrollRes.body.enrollment.status).toBe('pending');

    // cannot access course content before approval
    const lessonId = lessonRes.body.chapter.lessons[0]._id || lessonRes.body.chapter.lessons[0]._id;
    await request(app)
      .post(`/api/enrollments/${courseId}/complete-lesson`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ chapterId: chapter._id, lessonId })
      .expect(403);

    // admin approves the enrollment request
    const pending = await request(app)
      .get('/api/enrollments/me')
      .set('Authorization', `Bearer ${empToken}`)
      .expect(200);
    const enrollmentId = pending.body.enrollments[0]._id;
    await request(app)
      .post(`/api/enrollments/${enrollmentId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // now mark lesson complete
    await request(app).post(`/api/enrollments/${courseId}/complete-lesson`).set('Authorization', `Bearer ${empToken}`).send({ chapterId: chapter._id, lessonId }).expect(200);

    // create quiz for course
    const quizPayload = { course: courseId, title: 'Final', questions: [{ text: 'Q1', options: ['a','b'], correctIndex: 0, marks: 1 }], passMarks: 1 };
    const quizRes = await request(app).post('/api/quizzes').set('Authorization', `Bearer ${token}`).send(quizPayload).expect(201);
    const quizId = quizRes.body.quiz._id;

    // attempt quiz as employee
    const attemptRes = await request(app).post(`/api/quizzes/${quizId}/attempt`).set('Authorization', `Bearer ${empToken}`).send({ answers: [{ questionId: quizRes.body.quiz.questions[0]._id, answerIndex: 0 }] }).expect(200);
    expect(attemptRes.body.passed).toBe(true);
    expect(attemptRes.body.certificate).toBeTruthy();
  });
});
