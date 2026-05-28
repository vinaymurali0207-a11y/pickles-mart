const Product = require('./models/Product');
const products = require('./data/productCatalog');

async function seedProducts() {
    for (const product of products) {
        await Product.findOneAndUpdate(
            { name: product.name },
            { $set: product },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );
    }
}

module.exports = seedProducts;
