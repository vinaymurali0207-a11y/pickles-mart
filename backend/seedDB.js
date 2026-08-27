require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const Review = require('./models/Review');
const User = require('./models/User');
const products = require('./data/productCatalog');

const sampleReviews = [
    {
        username: 'Rajesh Sharma',
        productName: 'Mango',
        rating: 5,
        reviewText: 'Authentic Andhra style mango pickle! Perfect spice level and oil blend. Tastes just like homemade.',
        verified: true
    },
    {
        username: 'Priya Reddy',
        productName: 'Chicken',
        rating: 5,
        reviewText: 'The non-veg chicken pickle is absolutely delicious! Rich masala and generous chicken pieces.',
        verified: true
    },
    {
        username: 'Suresh Kumar',
        productName: 'Garlic',
        rating: 4,
        reviewText: 'Great punchy garlic flavor! Goes amazingly well with hot rice and ghee.',
        verified: true
    },
    {
        username: 'Ananya Verma',
        productName: 'Lemon',
        rating: 5,
        reviewText: 'Tangy and fresh lemon pickle. Best companion for curd rice!',
        verified: true
    },
    {
        username: 'Venkatesh Rao',
        productName: 'Mutton',
        rating: 5,
        reviewText: 'Hearty mutton pickle with slow-cooked tenderness and rich spicy masala.',
        verified: true
    }
];

async function seedDB() {
    try {
        console.log('🌱 Starting MongoDB database seeding...');

        // 1. Seed Products
        let seededProductsCount = 0;
        for (const prod of products) {
            await Product.findOneAndUpdate(
                { name: prod.name },
                { $set: prod },
                { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
            );
            seededProductsCount++;
        }
        console.log(`✅ Seeded ${seededProductsCount} products into MongoDB.`);

        // 2. Seed Sample Reviews if none exist, and update verified status for all reviews
        const reviewCount = await Review.countDocuments();
        if (reviewCount === 0) {
            for (const sample of sampleReviews) {
                const matchedProduct = await Product.findOne({
                    name: new RegExp(`^${sample.productName}$`, 'i')
                });
                if (matchedProduct) {
                    await Review.create({
                        product: matchedProduct._id,
                        productName: matchedProduct.name,
                        username: sample.username,
                        rating: sample.rating,
                        reviewText: sample.reviewText,
                        price: matchedProduct.basePrice,
                        image: matchedProduct.image,
                        weight: '100g',
                        verified: true
                    });
                }
            }
            console.log(`✅ Seeded ${sampleReviews.length} initial verified reviews into MongoDB.`);
        } else {
            await Review.updateMany({ verified: { $ne: true } }, { $set: { verified: true } });
            console.log(`ℹ️ MongoDB has ${reviewCount} reviews stored (verified status updated).`);
        }

        console.log('🎉 MongoDB database seeding complete!');
    } catch (err) {
        console.error('❌ Error during MongoDB seeding:', err.message);
    }
}

// Standalone execution support
if (require.main === module) {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pickleMart';
    mongoose.connect(mongoUri)
        .then(async () => {
            console.log('Connected to MongoDB for seeding');
            await seedDB();
            process.exit(0);
        })
        .catch(err => {
            console.error('Failed to connect to MongoDB:', err);
            process.exit(1);
        });
}

module.exports = seedDB;
