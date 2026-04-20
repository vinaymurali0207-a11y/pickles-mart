const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');

// ADD ITEM
router.post('/add', async (req, res) => {
    try {
        const { userId, name, price } = req.body;

        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        const item = cart.items.find(i => i.name === name);

        if (item) {
            item.qty += 1;
        } else {
            cart.items.push({ name, price, qty: 1 });
        }

        await cart.save();

        res.json(cart);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET CART
router.get('/:userId', async (req, res) => {
    try {
        const cart = await Cart.findOne({ userId: req.params.userId });
        res.json(cart || { items: [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// REMOVE ITEM
router.post('/remove', async (req, res) => {
    const { userId, name } = req.body;

    let cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ items: [] });

    cart.items = cart.items.filter(item => item.name !== name);
    await cart.save();

    res.json(cart);
});

// CLEAR CART
router.post('/clear', async (req, res) => {
    const { userId } = req.body;

    let cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ items: [] });

    cart.items = [];
    await cart.save();

    res.json(cart);
});

module.exports = router;