const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Review = require('../models/Review');

const router = express.Router();

function clampRating(value) {
    const rating = Number(value);
    if (!Number.isFinite(rating)) return 5;
    return Math.min(Math.max(Math.round(rating), 1), 5);
}

function pickFirst(...values) {
    return values.find(value => value !== undefined && value !== null && String(value).trim() !== '');
}

function getReviewUserId(review) {
    const user = typeof review.user === 'object' && review.user !== null ? review.user : {};
    const rawUserId = pickFirst(
        review.userId,
        review.customerId,
        review.reviewerId,
        review.user_id,
        user._id,
        user.userId,
        typeof review.user === 'string' ? review.user : ''
    );

    return rawUserId ? String(rawUserId) : '';
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

async function findProduct(productName, productId) {
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
        const product = await Product.findById(productId);
        if (product) return product;
    }

    if (!productName) return null;
    return Product.findOne({ name: new RegExp(`^${escapeRegex(productName)}$`, 'i') });
}

function normalizeReview(review, verifiedUsers) {
    const product = typeof review.product === 'object' && review.product !== null ? review.product : {};
    const customerName = pickFirst(
        review.customerName,
        review.userName,
        review.username,
        review.reviewer,
        review.author,
        review.name,
        'Customer'
    );
    const reviewText = pickFirst(
        review.reviewText,
        review.review,
        review.comment,
        review.message,
        review.text,
        review.content,
        review.description,
        ''
    );
    const productName = pickFirst(
        review.productName,
        review.itemName,
        review.pickleName,
        product.name,
        typeof review.product === 'string' ? review.product : '',
        'Pickle'
    );
    const price = pickFirst(review.price, review.productPrice, product.price, '');
    const image = pickFirst(review.image, review.productImage, product.image, '');
    const rating = Number(pickFirst(review.rating, review.stars, 5));
    const reviewUserId = getReviewUserId(review);
    const userRecord = reviewUserId ? verifiedUsers.get(reviewUserId) : null;
    const userExists = Boolean(userRecord);
    const verified = userExists && (
        typeof review.verified === 'boolean'
            ? review.verified
            : userRecord.verifiedReviewer === true
    );
    // Use firstName from user record if available, otherwise use customerName
    const displayName = userRecord?.firstName || customerName;

    return {
        id: String(review._id),
        customerName: displayName,
        username: displayName,
        reviewText,
        productName,
        price,
        image,
        rating: Number.isFinite(rating) ? Math.min(Math.max(rating, 1), 5) : 5,
        verified,
        createdAt: review.createdAt || review._id?.getTimestamp?.() || new Date()
    };
}

router.post('/add', async (req, res) => {
    try {
        const userId = pickFirst(req.body.userId, req.body.customerId, '');
        const username = pickFirst(req.body.username, req.body.customerName, req.body.name, 'Customer');
        const productName = pickFirst(req.body.productName, req.body.itemName, req.body.pickleName, '');
        const reviewText = pickFirst(req.body.reviewText, req.body.review, req.body.comment, req.body.text, '');
        const rating = clampRating(req.body.rating || req.body.stars);
        const image = pickFirst(req.body.image, req.body.productImage, '');
        const weight = req.body.weight || '100g';

        console.log('📝 Review Submission - Input:', { userId, productName, username, rating, reviewText: reviewText.substring(0, 50) });

        if (!userId) {
            console.warn('⚠️ Review submission failed: User ID missing');
            return res.status(400).json({ message: 'User ID is required' });
        }
        if (!productName) {
            console.warn('⚠️ Review submission failed: Product name missing');
            return res.status(400).json({ message: 'Product name is required' });
        }
        if (!reviewText) {
            console.warn('⚠️ Review submission failed: Review text missing');
            return res.status(400).json({ message: 'Review text is required' });
        }

        const user = mongoose.Types.ObjectId.isValid(userId) ? await User.findById(userId) : await User.findOne({ userId });
        const product = await findProduct(productName, req.body.productId);

        if (!user) {
            console.warn('⚠️ Review submission failed: User not found -', userId);
            return res.status(404).json({ message: 'User not found' });
        }
        if (!product) {
            console.warn('⚠️ Review submission failed: Product not found -', productName);
            return res.status(404).json({ message: `Product "${productName}" not found` });
        }

        // Use firstName if available, otherwise use provided username
        const displayName = user.firstName || String(username);

        const review = await Review.create({
            user: user._id,
            userId: String(user._id),
            product: product._id,
            username: displayName,
            productName: product.name,
            rating,
            reviewText: String(reviewText),
            price: priceForWeight(product, weight),
            image: image || product.image,
            weight,
            verified: user.verifiedReviewer === true
        });

        console.log('✅ Review created successfully:', { id: review._id, productName: product.name, reviewerName: displayName });
        res.status(201).json(review);
    } catch (err) {
        console.error('❌ Review submission error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get('/product/:productName', async (req, res) => {
    try {
        const productName = req.params.productName;
        const product = await findProduct(productName);
        const query = product
            ? { $or: [{ product: product._id }, { productName: new RegExp(`^${escapeRegex(product.name)}$`, 'i') }] }
            : { productName: new RegExp(`^${escapeRegex(productName)}$`, 'i') };
        const reviews = await Review.find(query).sort({ createdAt: -1, _id: -1 }).lean();

        const reviewUserIds = [...new Set(reviews.map(getReviewUserId).filter(Boolean))];
        const objectIds = reviewUserIds
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        const users = await User.find({
            $or: [
                { _id: { $in: objectIds } },
                { userId: { $in: reviewUserIds } }
            ]
        }).select('_id userId firstName verifiedReviewer');

        const verifiedUsers = new Map();
        users.forEach(user => {
            const userInfo = { verifiedReviewer: user.verifiedReviewer === true, firstName: user.firstName };
            verifiedUsers.set(String(user._id), userInfo);
            if (user.userId) verifiedUsers.set(String(user.userId), userInfo);
        });

        res.json(reviews.map(review => ({
            id: String(review._id),
            userId: getReviewUserId(review),
            username: verifiedUsers.get(getReviewUserId(review))?.firstName || pickFirst(review.username, review.customerName, review.userName, review.name, 'Customer'),
            productName: pickFirst(review.productName, productName),
            rating: clampRating(review.rating || review.stars),
            reviewText: pickFirst(review.reviewText, review.review, review.comment, review.text, ''),
            createdAt: review.createdAt || review._id?.getTimestamp?.() || new Date(),
            verified: verifiedUsers.get(getReviewUserId(review))?.verifiedReviewer === true || review.verified === true
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const reviews = await Review.find({}).sort({ createdAt: -1, _id: -1 }).limit(20).lean();

        const reviewUserIds = [...new Set(reviews.map(getReviewUserId).filter(Boolean))];
        const objectIds = reviewUserIds
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        const users = await User.find({
            $or: [
                { _id: { $in: objectIds } },
                { userId: { $in: reviewUserIds } }
            ]
        }).select('_id userId firstName verifiedReviewer');

        const verifiedUsers = new Map();
        users.forEach(user => {
            const userInfo = { verifiedReviewer: user.verifiedReviewer === true, firstName: user.firstName };
            verifiedUsers.set(String(user._id), userInfo);
            if (user.userId) verifiedUsers.set(String(user.userId), userInfo);
        });

        res.json(reviews.map(review => normalizeReview(review, verifiedUsers)).filter(review => review.reviewText));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/:id/verified', async (req, res) => {
    try {
        const { verified } = req.body;
        const reviewId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(reviewId)) return res.status(400).json({ message: 'Invalid review id' });

        const result = await Review.findByIdAndUpdate(
            reviewId,
            { verified: verified === true },
            { new: true }
        );

        if (result) {
            return res.json({
                id: String(result._id),
                verified: result.verified === true
            });
        }

        res.status(404).json({ message: 'Review not found' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
