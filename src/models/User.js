const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

const UserSchema = new mongoose.Schema({
  first_name: { type: String },
  last_name: { type: String },
  user_name: { type: String },
  email: { type: String, required: true, lowercase: true },
  phone_number: { type: String },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  dob: { type: Date },
  bio: { type: String },
  role: { type: String, enum: ['admin', 'employee'], default: 'employee' },
  password: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  deactivatedAt: { type: Date }
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const hash = await bcrypt.hash(this.password, SALT_ROUNDS);
    this.password = hash;
    next();
  } catch (err) {
    next(err);
  }
});

UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', UserSchema);
