const express = require('express');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

const router = express.Router();

router.post('/checkout', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ message: 'User is required' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const cart = await Cart.findOne({ userId }).populate('items.product');
        if (!cart || !cart.items.length) return res.status(400).json({ message: 'Cart is empty' });

        const items = [];
        for (const item of cart.items) {
            const product = item.product || await findProductByName(item.name);
            if (!product) continue;

            const unitPrice = Number(item.price) || 0;
            const qty = Number(item.qty) || 1;
            items.push({
                product: product._id,
                name: product.name,
                weight: item.weight || '100g',
                unitPrice,
                qty,
                total: unitPrice * qty
            });
        }

        if (!items.length) return res.status(400).json({ message: 'Cart has no valid products' });

        const subtotal = items.reduce((total, item) => total + item.total, 0);
        const order = await Order.create({
            user: user._id,
            userId,
            items,
            subtotal,
            deliveryAddress: req.body.deliveryAddress || user.address || ''
        });

        cart.items = [];
        await cart.save();

        res.status(201).json(await order.populate('items.product'));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/user/:userId', async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.params.userId })
            .populate('items.product')
            .sort({ createdAt: -1 });

        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

function findProductByName(name) {
    if (!name) return null;
    const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Product.findOne({ name: new RegExp(`^${escapedName}$`, 'i') });
}
