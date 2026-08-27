const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Order = require('../models/Order');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-local-secret';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || 'admin@picklemart.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@12345!';

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requireAdmin(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (!token) return res.status(401).json({ message: 'Admin login required' });

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.role !== 'admin') throw new Error('Invalid role');
        req.admin = payload;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Admin session expired. Please login again.' });
    }
}

router.post('/login', (req, res) => {
    const { userId, password } = req.body || {};

    if (userId !== ADMIN_USER_ID || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    const token = jwt.sign({ role: 'admin', userId: ADMIN_USER_ID }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, userId: ADMIN_USER_ID });
});

router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const [totalOrders, pendingPayments, paidPayments, deliveredOrders, cancelledOrders] = await Promise.all([
            Order.countDocuments(),
            Order.countDocuments({ paymentStatus: 'Pending' }),
            Order.countDocuments({ paymentStatus: 'Paid' }),
            Order.countDocuments({ status: { $in: ['Delivered', 'delivered'] } }),
            Order.countDocuments({ status: { $in: ['Cancelled', 'cancelled'] } })
        ]);

        res.json({ totalOrders, pendingPayments, paidPayments, deliveredOrders, cancelledOrders });
    } catch (err) {
        res.status(500).json({ message: 'Unable to load admin statistics' });
    }
});

router.get('/orders', requireAdmin, async (req, res) => {
    try {
        const { status, paymentStatus, q } = req.query;
        const query = {};

        if (status) query.status = status;
        if (paymentStatus) query.paymentStatus = paymentStatus;
        if (q) {
            const search = new RegExp(escapeRegex(q), 'i');
            query.$or = [
                { userId: search },
                { razorpayOrderId: search },
                { razorpayPaymentId: search },
                { 'items.name': search }
            ];
            if (mongoose.Types.ObjectId.isValid(q)) {
                query.$or.push({ _id: q });
            }
        }

        const orders = await Order.find(query)
            .select('-razorpaySignature')
            .populate('user', 'firstName lastName username userId address')
            .populate('items.product', 'name image')
            .sort({ createdAt: -1 })
            .lean();

        res.json({ total: orders.length, orders });
    } catch (err) {
        res.status(500).json({ message: 'Unable to load orders' });
    }
});

router.patch('/orders/:orderId', requireAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) {
            return res.status(400).json({ message: 'Invalid order ID' });
        }

        const updates = {};
        if (req.body.status !== undefined) updates.status = req.body.status;
        if (req.body.paymentStatus !== undefined) updates.paymentStatus = req.body.paymentStatus;
        if (req.body.deliveryEstimate !== undefined) updates.deliveryEstimate = String(req.body.deliveryEstimate).trim();

        if (!Object.keys(updates).length) {
            return res.status(400).json({ message: 'No valid order changes supplied' });
        }

        const order = await Order.findByIdAndUpdate(
            req.params.orderId,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-razorpaySignature');

        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json({ message: 'Order updated successfully', order });
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({ message: 'Invalid order status or payment status' });
        }
        res.status(500).json({ message: 'Unable to update order' });
    }
});

module.exports = router;
