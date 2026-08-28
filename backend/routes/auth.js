const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Review = require('../models/Review');
const bcrypt = require('bcryptjs');

function isValidUserId(userId) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userId) || /^\d{10}$/.test(userId);
}

function isStrongPassword(password) {
  return typeof password === 'string'
    && password.length >= 8
    && password.length <= 16
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[0-9]/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

function userLookupQuery(id) {
  return mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: id }, { userId: id }] }
    : { userId: id };
}

// GET PROFILE DETAILS
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findOne(userLookupQuery(req.params.id))
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userStringIds = [String(user._id), user.userId].filter(Boolean);
    const ownershipQuery = {
      $or: [
        { user: user._id },
        { userId: { $in: userStringIds } }
      ]
    };

    const [totalOrders, userReviews] = await Promise.all([
      Order.countDocuments(ownershipQuery),
      Review.find(ownershipQuery)
        .select('productName rating reviewText createdAt verified')
        .sort({ createdAt: -1, _id: -1 })
        .lean()
    ]);

    res.json({
      ...user,
      loginId: user.userId || String(user._id),
      totalOrders,
      userReviews
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REGISTER
router.post('/register', async (req, res) => {
  const { userId, firstName, lastName, address, password } = req.body;

  try {
    if (!isValidUserId(userId)) {
      return res.status(400).json({
        message: 'Enter a valid email or 10 digit phone number'
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: 'Password must be 8-16 characters with uppercase, lowercase, number, and special character'
      });
    }

    const existingUser = await User.findOne({ userId });

    if (existingUser) {
      return res.status(400).json({
        message: 'User already exists'
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = new User({
      userId,
      firstName,
      lastName,
      username: firstName,
      address,
      password: hashed
    });

    await user.save();

    res.json({
      message: 'User saved in DB',
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.firstName,
      address: user.address || ''
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { userId, password } = req.body;

  try {
    if (!isValidUserId(userId)) {
      return res.status(400).json({
        message: 'Enter a valid email or 10 digit phone number'
      });
    }

    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(400).json({
        message: 'User not found'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: 'Wrong password'
      });
    }

    res.json({
      message: 'Login successful',
      userId: user._id,
      firstName: user.firstName || user.username || '',
      lastName: user.lastName || '',
      username: user.firstName || user.username || user.userId,
      address: user.address || ''
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

function formatAddress(addressDetails) {
  return ['houseNo', 'street', 'area', 'city', 'state', 'pincode', 'landmark']
    .map(field => addressDetails[field])
    .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
    .map(value => String(value).trim())
    .join(', ');
}

// UPDATE PROFILE OR STRUCTURED ADDRESS
router.put('/profile/:id', async (req, res) => {
  const { username, firstName, lastName, profileImage, address, addressDetails } = req.body;

  try {
    const update = {};

    if (username !== undefined) update.username = String(username).trim();
    if (firstName !== undefined) update.firstName = String(firstName).trim();
    if (lastName !== undefined) update.lastName = String(lastName).trim();
    if (profileImage !== undefined) update.profileImage = String(profileImage).trim();
    if (address !== undefined) update.address = String(address).trim();

    if (addressDetails && typeof addressDetails === 'object') {
      const normalizedDetails = {
        houseNo: String(addressDetails.houseNo || '').trim(),
        area: String(addressDetails.area || '').trim(),
        city: String(addressDetails.city || '').trim(),
        state: String(addressDetails.state || '').trim(),
        pincode: String(addressDetails.pincode || '').trim(),
        landmark: String(addressDetails.landmark || '').trim()
      };

      update.addressDetails = normalizedDetails;
      update.address = formatAddress(addressDetails);
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ message: 'No profile details were provided' });
    }

    const user = await User.findOneAndUpdate(
      userLookupQuery(req.params.id),
      { $set: update },
      { new: true, runValidators: true }
    ).select('-password').lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      ...user,
      message: 'Profile updated',
      loginId: user.userId || String(user._id)
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// CONTROL VERIFIED REVIEW BADGE
router.put('/verified-reviewer/:id', async (req, res) => {
  try {
    const query = req.params.id.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: req.params.id }
      : { userId: req.params.id };

    const user = await User.findOneAndUpdate(
      query,
      {
        verifiedReviewer: req.body.verifiedReviewer === true
      },
      {
        new: true
      }
    );

    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    res.json({
      userId: user._id,
      username: user.username || user.userId,
      verifiedReviewer: user.verifiedReviewer === true
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;
