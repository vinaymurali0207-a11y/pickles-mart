const express = require('express');
const router = express.Router();
const User = require('../models/User');
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

// REGISTER
router.post('/register', async (req, res) => {
    const { userId, firstName, lastName, address, password } = req.body;

    try {
        if (!isValidUserId(userId)) {
            return res.status(400).json({ message: 'Enter a valid email or 10 digit phone number' });
        }

        if (!isStrongPassword(password)) {
            return res.status(400).json({ message: 'Password must be 8-16 characters with uppercase, lowercase, number, and special character' });
        }

        const existingUser = await User.findOne({ userId });

        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
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
        res.status(500).json({ error: err.message });
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    const { userId, password } = req.body;

    try {
        if (!isValidUserId(userId)) {
            return res.status(400).json({ message: 'Enter a valid email or 10 digit phone number' });
        }

        const user = await User.findOne({ userId });

        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ message: 'Wrong password' });
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
        res.status(500).json({ error: err.message });
    }
});

// UPDATE PROFILE
router.put('/profile/:id', async (req, res) => {
    const { username, address } = req.body;

    try {
        if (!username || !address) {
            return res.status(400).json({ message: 'Username and address are required' });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { username, firstName: username, address },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            message: 'Profile updated',
            userId: user._id,
            firstName: user.firstName,
            username: user.username,
            address: user.address
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
