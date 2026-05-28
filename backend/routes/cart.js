const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Product = require('../models/Product');

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findProduct(reqBody) {
    if (reqBody.productId) {
        const product = await Product.findById(reqBody.productId);
        if (product) return product;
    }

    if (reqBody.name) {
        return Product.findOne({ name: new RegExp(`^${escapeRegex(reqBody.name)}$`, 'i') });
    }

    return null;
}

function priceForWeight(product, weight) {
    const multipliers = {
        '100g': 1,
        '250g': 2.5,
        '500g': 5,
        '1kg': 10
    };

    return Number(product.basePrice) * (multipliers[weight] || 1);
}

// ADD ITEM
router.post('/add', async (req, res) => {
    try {
        const { userId, name } = req.body;
        const weight = String(req.body.weight || '100g');
        const qty = Math.max(1, Number(req.body.qty) || 1);
        const product = await findProduct(req.body);
        const price = product ? priceForWeight(product, weight) : Number(req.body.price);

        if (!userId || !name || !product || !Number.isFinite(price) || price <= 0) {
            return res.status(400).json({ message: 'Valid user, product, and price are required' });
        }

        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        const item = cart.items.find(i => String(i.product || '') === String(product._id) && (i.weight || '100g') === weight);

        if (item) {
            item.price = price;
            item.weight = weight;
            item.name = product.name;
            item.product = product._id;
            item.qty += qty;
        } else {
            cart.items.push({ product: product._id, name: product.name, price, weight, qty });
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
        const cart = await Cart.findOne({ userId: req.params.userId }).populate('items.product');
        res.json(cart || { items: [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// REMOVE ITEM
router.post('/remove', async (req, res) => {
    const { userId, name } = req.body;
    const weight = req.body.weight ? String(req.body.weight) : null;
    const product = await findProduct(req.body);

    let cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ items: [] });

    cart.items = cart.items.filter(item => {
        const sameProduct = product
            ? String(item.product || '') === String(product._id)
            : item.name === name;
        const sameWeight = !weight || (item.weight || '100g') === weight;
        return !(sameProduct && sameWeight);
    });
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
