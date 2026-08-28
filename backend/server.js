require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// CORS middleware with complete origin support (file://, localhost, 127.0.0.1)
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, file://) or any origin
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
}));
app.use(express.json());

// MODELS FOR DB STATUS
const User = require('./models/User');
const Product = require('./models/Product');
const Review = require('./models/Review');
const Order = require('./models/Order');
const Cart = require('./models/Cart');

// MONGODB CONNECTION
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pickleMart';
const PORT = process.env.PORT || 5000;

mongoose.connect(MONGO_URI)
.then(async () => {
    console.log('⚡ Connected to MongoDB Database:', MONGO_URI);
    try {
        const seedDB = require('./seedDB');
        await seedDB();
    } catch (seedErr) {
        console.log('MongoDB Seeding notice:', seedErr.message);
    }
})
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
});

// TEST & HEALTH CHECK ROUTES
app.get('/api/health', (req, res) => {
    res.json({
        message: 'Pickles Mart Backend Server Operating Successfully',
        database: mongoose.connection.readyState === 1 ? 'Connected to MongoDB' : 'Disconnected',
        timestamp: new Date()
    });
});

// DATABASE STATUS & METRICS ROUTE
app.get('/api/db-status', async (req, res) => {
    try {
        const isConnected = mongoose.connection.readyState === 1;
        if (!isConnected) {
            return res.status(503).json({
                status: 'Disconnected',
                message: 'MongoDB database is currently unreachable.'
            });
        }

        const [productCount, reviewCount, userCount, orderCount, cartCount] = await Promise.all([
            Product.countDocuments(),
            Review.countDocuments(),
            User.countDocuments(),
            Order.countDocuments(),
            Cart.countDocuments()
        ]);

        res.json({
            status: 'Connected',
            databaseName: mongoose.connection.name || 'pickleMart',
            counts: {
                products: productCount,
                reviews: reviewCount,
                users: userCount,
                orders: orderCount,
                carts: cartCount
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ROUTE MOUNTING
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/admin', require('./routes/admin'));

// SERVE FRONTEND STATIC FILES
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// CATCH-ALL: serve pickle.html (home page) for any non-API route
app.get('{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pickle.html'));
});

// START SERVER
app.listen(PORT, () => console.log(`🚀 Pickles Mart Express server running on port ${PORT}`));

