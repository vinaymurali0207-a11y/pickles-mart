const express = require('express');
const Product = require('../models/Product');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const query = { active: true };
        if (req.query.category) query.category = req.query.category;

        const products = await Product.find(query).sort({ category: 1, name: 1 });
        res.json(products.map(addPriceOptions));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:idOrName', async (req, res) => {
    try {
        const idOrName = req.params.idOrName;
        const query = idOrName.match(/^[0-9a-fA-F]{24}$/)
            ? { _id: idOrName }
            : { name: new RegExp(`^${idOrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };

        const product = await Product.findOne(query);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        res.json(addPriceOptions(product));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

function addPriceOptions(product) {
    const data = product.toObject ? product.toObject() : product;
    return {
        ...data,
        priceOptions: {
            '100g': data.basePrice,
            '250g': data.basePrice * 2.5,
            '500g': data.basePrice * 5,
            '1kg': data.basePrice * 10
        }
    };
}
