const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// DB CONNECTION
mongoose.connect('mongodb://127.0.0.1:27017/pickleMart')
.then(async () => {
    console.log('DB connected');
    const seedProducts = require('./seedProducts');
    await seedProducts();
    console.log('Products ready');
})
.catch(err => console.log(err));

// TEST ROUTE
app.get('/', (req, res) => {
    res.send('Server working');
});

// AUTH ROUTES
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// 🔥 CART ROUTES (THIS IS WHAT YOU MISSED)
const cartRoutes = require('./routes/cart');
app.use('/api/cart', cartRoutes);

const productRoutes = require('./routes/products');
app.use('/api/products', productRoutes);

const orderRoutes = require('./routes/orders');
app.use('/api/orders', orderRoutes);

const reviewRoutes = require('./routes/reviews');
app.use('/api/reviews', reviewRoutes);

// START SERVER
app.listen(5000, () => console.log('Server running on port 5000'));
