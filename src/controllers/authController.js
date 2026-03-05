const User = require('../models/User');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'please_change_this_secret';

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

exports.seedAdmin = async (req, res, next) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) return res.status(400).json({ message: 'ADMIN_EMAIL and ADMIN_PASSWORD must be set' });
    let admin = await User.findOne({ email: adminEmail.toLowerCase() });
    if (admin) return res.json({ message: 'admin already exists' });
    admin = await User.create({ email: adminEmail.toLowerCase(), password: adminPassword, role: 'admin', first_name: 'Admin' });
    return res.json({ message: 'admin created', email: admin.email });
  } catch (err) {
    next(err);
  }
};

exports.register = async (req, res, next) => {
  try {
    // only admin allowed (middleware should have enforced)
    const { first_name, last_name, email, phone_number, role } = req.body;
    if (!email) return res.status(400).json({ message: 'email required' });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: 'email already in use' });

    // generate temporary password
    const tempPassword = req.body.password ? req.body.password : Math.random().toString(36).slice(-8);
    const user = await User.create({
      first_name,
      last_name,
      email: email.toLowerCase(),
      phone_number,
      role: role || 'employee',
      password: tempPassword,
      user_name: (email.split('@')[0])
    });

    return res.status(201).json({ message: 'user created', user: { id: user._id, email: user.email, role: user.role }, tempPassword });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'email and password required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'invalid credentials' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'invalid credentials' });
    if (!user.isActive) return res.status(403).json({ message: 'account deactivated' });
    const token = signToken(user);
    return res.json({ token, user: { id: user._id, email: user.email, role: user.role, first_name: user.first_name, last_name: user.last_name } });
  } catch (err) {
    next(err);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'user not found' });
    return res.json({ user });
  } catch (err) {
    next(err);
  }
};

exports.editProfile = async (req, res, next) => {
  try {
    const allowed = ['first_name', 'last_name', 'user_name', 'phone_number', 'gender', 'dob', 'bio'];
    const updates = {};
    allowed.forEach(k => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    return res.json({ user });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { current, newPassword } = req.body;
    if (!current || !newPassword) return res.status(400).json({ message: 'current and newPassword required' });
    if (String(newPassword).length < 6) return res.status(400).json({ message: 'new password must be at least 6 characters' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'user not found' });
    const ok = await user.comparePassword(current);
    if (!ok) return res.status(401).json({ message: 'current password is incorrect' });

    user.password = newPassword;
    await user.save();
    return res.json({ message: 'password updated' });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { current, newPassword } = req.body;
    if (!current || !newPassword) return res.status(400).json({ message: 'current and newPassword required' });
    if (String(newPassword).length < 6) return res.status(400).json({ message: 'new password must be at least 6 characters' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'user not found' });
    const ok = await user.comparePassword(current);
    if (!ok) return res.status(401).json({ message: 'current password is incorrect' });

    user.password = newPassword;
    await user.save();
    return res.json({ message: 'password updated' });
  } catch (err) {
    next(err);
  }
};
