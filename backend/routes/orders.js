const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

const router = express.Router();

function findUserQuery(userId) {
    return mongoose.Types.ObjectId.isValid(userId)
        ? { $or: [{ _id: userId }, { userId }] }
        : { userId };
}

function getRazorpayInstance() {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (key_id && key_secret && !key_id.includes('xxxx') && !key_secret.includes('xxxx')) {
        return new Razorpay({ key_id, key_secret });
    }
    return null;
}

function normalizeProductName(name) {
    return String(name || '').replace(/\s+pickle$/i, '').trim();
}

// 1. CREATE RAZORPAY ORDER
router.post('/create-razorpay-order', async (req, res) => {
    try {
        const { amount, currency = 'INR', receipt = `receipt_${Date.now()}` } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Valid order amount is required' });
        }

        const razorpay = getRazorpayInstance();
        if (razorpay) {
            const options = {
                amount: Math.round(Number(amount) * 100), // Amount in paise
                currency,
                receipt,
                payment_capture: 1
            };
            const razorpayOrder = await razorpay.orders.create(options);
            return res.json({
                success: true,
                razorpayOrderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                keyId: process.env.RAZORPAY_KEY_ID,
                isMock: false
            });
        } else {
            // Fallback / Sandbox Mode when keys are missing or test mode
            const mockOrderId = `order_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            return res.json({
                success: true,
                razorpayOrderId: mockOrderId,
                amount: Math.round(Number(amount) * 100),
                currency,
                keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_pickle_mart',
                isMock: true
            });
        }
    } catch (err) {
        console.error('Error creating Razorpay order:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. VERIFY RAZORPAY PAYMENT & SAVE ORDER TO MONGODB
router.post('/verify-payment', async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            isMock,
            userId,
            items,
            deliveryAddress,
            deliveryMethod,
            deliveryEstimate,
            paymentMethod,
            subtotal,
            discount,
            deliveryFee,
            tax,
            totalAmount,
            fromCart
        } = req.body;

        if (!userId) return res.status(400).json({ message: 'User ID is required' });

        const user = await User.findOne(findUserQuery(userId));
        if (!user) return res.status(404).json({ message: 'User account not found' });

        const key_secret = process.env.RAZORPAY_KEY_SECRET;
        const razorpay = getRazorpayInstance();

        // Perform signature verification if real Razorpay keys are active
        if (razorpay && key_secret && !isMock) {
            const body = razorpay_order_id + '|' + razorpay_payment_id;
            const expectedSignature = crypto
                .createHmac('sha256', key_secret)
                .update(body.toString())
                .digest('hex');

            if (expectedSignature !== razorpay_signature) {
                return res.status(400).json({ success: false, message: 'Invalid payment signature' });
            }
        }

        // Format items & fetch product ObjectIds
        const processedItems = [];
        if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                let matchedProduct = null;
                if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
                    matchedProduct = await Product.findById(item.productId);
                }
                if (!matchedProduct && item.name) {
                    matchedProduct = await findProductByName(item.name);
                }

                const unitPrice = Number(item.unitPrice || item.price) || 0;
                const qty = Number(item.qty) || 1;
                processedItems.push({
                    product: matchedProduct ? matchedProduct._id : new mongoose.Types.ObjectId(),
                    name: item.name || (matchedProduct ? matchedProduct.name : 'Pickle Item'),
                    weight: item.weight || '100g',
                    unitPrice,
                    qty,
                    total: unitPrice * qty
                });
            }
        }

        if (processedItems.length === 0) {
            return res.status(400).json({ message: 'Order contains no valid products' });
        }

        const calculatedSubtotal = subtotal || processedItems.reduce((acc, i) => acc + i.total, 0);
        const calculatedTax = tax !== undefined ? tax : Math.round(calculatedSubtotal * 0.05 * 100) / 100;
        const calculatedTotal = totalAmount || (calculatedSubtotal - (discount || 0) + (deliveryFee || 0) + calculatedTax);

        // Create MongoDB Order
        const order = await Order.create({
            user: user._id,
            userId: user.userId || String(user._id),
            items: processedItems,
            subtotal: calculatedSubtotal,
            discount: discount || 0,
            deliveryFee: deliveryFee || 0,
            tax: calculatedTax,
            totalAmount: calculatedTotal,
            status: 'Payment Confirmed',
            paymentMethod: paymentMethod || 'razorpay',
            paymentStatus: 'Paid',
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id || `pay_sim_${Date.now()}`,
            razorpaySignature: razorpay_signature || 'simulated_sig',
            deliveryMethod: deliveryMethod || 'Standard Delivery',
            deliveryEstimate: deliveryEstimate || '3-5 Business Days',
            deliveryAddress: deliveryAddress || user.address || {}
        });

        // Clear user cart if order originated from cart
        if (fromCart !== false) {
            await Cart.findOneAndUpdate(
                { $or: [{ userId: String(user._id) }, { userId: user.userId }, { userId: String(userId) }] },
                { $set: { items: [] } }
            );
        }

        const populatedOrder = await Order.findById(order._id).populate('items.product');
        const totalOrdersCount = await Order.countDocuments({
            $or: [{ user: user._id }, { userId: user.userId }, { userId: String(user._id) }]
        });

        res.status(201).json({
            success: true,
            message: 'Payment verified and Order placed successfully in MongoDB database',
            order: populatedOrder,
            orderId: order._id,
            totalOrders: totalOrdersCount
        });
    } catch (err) {
        console.error('Error verifying payment:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3. CHECKOUT (DIRECT ORDER / COD / BUY NOW / CART CHECKOUT)
router.post('/checkout', async (req, res) => {
    try {
        const {
            userId,
            items: inputItems,
            deliveryAddress,
            deliveryMethod = 'Standard Delivery',
            deliveryEstimate = '3-5 Business Days',
            paymentMethod = 'cod',
            paymentStatus = 'Pending',
            discount = 0,
            deliveryFee = 0,
            fromCart = true
        } = req.body;

        if (!userId) return res.status(400).json({ message: 'User ID is required for checkout' });

        const user = await User.findOne(findUserQuery(userId));
        if (!user) return res.status(404).json({ message: 'User account not found in database' });

        let items = [];

        // If items are passed directly (Buy Now flow), process them
        if (Array.isArray(inputItems) && inputItems.length > 0) {
            for (const item of inputItems) {
                let product = null;
                if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
                    product = await Product.findById(item.productId);
                }
                if (!product && item.name) {
                    product = await findProductByName(item.name);
                }

                const unitPrice = Number(item.price || item.unitPrice) || 0;
                const qty = Number(item.qty) || 1;

                items.push({
                    product: product ? product._id : new mongoose.Types.ObjectId(),
                    name: product ? product.name : normalizeProductName(item.name || 'Pickle Product'),
                    weight: item.weight || '100g',
                    unitPrice,
                    qty,
                    total: unitPrice * qty
                });
            }
        } else {
            // Find cart by userId or user._id
            const cart = await Cart.findOne({
                $or: [
                    { userId: String(user._id) },
                    { userId: user.userId },
                    { userId: String(userId) }
                ]
            }).populate('items.product');

            if (!cart || !cart.items || cart.items.length === 0) {
                return res.status(400).json({ message: 'Cart is empty' });
            }

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
        }

        if (!items.length) return res.status(400).json({ message: 'Checkout contains no valid products' });

        const subtotal = items.reduce((total, item) => total + item.total, 0);
        const tax = Math.round(subtotal * 0.05 * 100) / 100;
        const totalAmount = subtotal - discount + deliveryFee + tax;

        const order = await Order.create({
            user: user._id,
            userId: user.userId || String(user._id),
            items,
            subtotal,
            discount,
            deliveryFee,
            tax,
            totalAmount,
            status: 'Order Placed',
            paymentMethod,
            paymentStatus: paymentMethod === 'cod' ? 'Pending' : (paymentStatus || 'Paid'),
            deliveryMethod,
            deliveryEstimate,
            deliveryAddress: deliveryAddress || user.address || {}
        });

        // Clear user cart in MongoDB if ordered from cart
        if (fromCart) {
            await Cart.findOneAndUpdate(
                { $or: [{ userId: String(user._id) }, { userId: user.userId }, { userId: String(userId) }] },
                { $set: { items: [] } }
            );
        }

        const populatedOrder = await Order.findById(order._id).populate('items.product');
        const totalOrdersCount = await Order.countDocuments({
            $or: [
                { user: user._id },
                { userId: user.userId },
                { userId: String(user._id) },
                { userId: String(userId) }
            ]
        });

        res.status(201).json({
            success: true,
            message: 'Order created successfully in MongoDB database',
            order: populatedOrder,
            orderId: order._id,
            totalOrders: totalOrdersCount
        });
    } catch (err) {
        console.error('Error in checkout route:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET USER ORDER HISTORY & TOTAL ORDERS FROM MONGODB
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findOne(findUserQuery(userId));

        const userObjectIds = [];
        const userStringIds = [userId];

        if (user) {
            userObjectIds.push(user._id);
            if (user.userId) userStringIds.push(user.userId);
            userStringIds.push(String(user._id));
        } else if (mongoose.Types.ObjectId.isValid(userId)) {
            userObjectIds.push(new mongoose.Types.ObjectId(userId));
        }

        const query = {
            $or: [
                { user: { $in: userObjectIds } },
                { userId: { $in: userStringIds } }
            ]
        };

        const orders = await Order.find(query)
            .populate('items.product')
            .sort({ createdAt: -1 });

        res.json({
            totalOrders: orders.length,
            orders
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ORDER SUMMARY STATS FOR USER
router.get('/summary/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findOne(findUserQuery(userId));

        const userObjectIds = [];
        const userStringIds = [userId];

        if (user) {
            userObjectIds.push(user._id);
            if (user.userId) userStringIds.push(user.userId);
            userStringIds.push(String(user._id));
        } else if (mongoose.Types.ObjectId.isValid(userId)) {
            userObjectIds.push(new mongoose.Types.ObjectId(userId));
        }

        const orders = await Order.find({
            $or: [
                { user: { $in: userObjectIds } },
                { userId: { $in: userStringIds } }
            ]
        });

        const totalSpent = orders.reduce((sum, order) => sum + (order.totalAmount || order.subtotal || 0), 0);

        res.json({
            userId,
            totalOrders: orders.length,
            totalSpent
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET SINGLE ORDER DETAILS (keep this parameter route after named routes)
router.get('/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: 'Invalid Order ID format' });
        }

        const order = await Order.findById(orderId).populate('items.product');
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.json({ order });
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
