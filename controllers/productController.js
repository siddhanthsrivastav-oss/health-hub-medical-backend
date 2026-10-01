const Product = require('../models/product')
const ProductRating = require('../models/productRating')
const mongoose = require('mongoose')
const cloudinary = require('../config/cloudinary')

exports.createProduct = async (req, res) => {
  try {
    const { productName, price, description, category } = req.body;

    let images = [];

    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: "products",
      });

      images.push({
        url: result.secure_url,
        publicId: result.public_id,
      });
    }

    const product = await Product.create({
      productName,
      price,
      description,
      category,
      images,
    });

    res.status(201).json({
      message: "Product Created",
      product,
    });
  }catch (error) {
    console.log(error);
    res.status(500).json({
        message: "Server Error",
        error: error.message
    });
}
};


exports.getProducts=async(req,res)=>{
    try {
    const [products, ratingSummaries] = await Promise.all([
      Product.find().populate('category').lean(),
      ProductRating.aggregate([
        {
          $group: {
            _id: '$product',
            average: { $avg: '$rating' },
            count: { $sum: 1 }
          }
        }
      ])
    ])
    const ratingsByProduct = new Map(
      ratingSummaries.map((summary) => [String(summary._id), summary])
    )
    const product = products.map((item) => {
      const summary = ratingsByProduct.get(String(item._id))
      return {
        ...item,
        ratingAverage: summary?.average || 0,
        ratingCount: summary?.count || 0
      }
    })
    const ratingCount = ratingSummaries.reduce((count, summary) => count + summary.count, 0)
    const ratingTotal = ratingSummaries.reduce(
      (total, summary) => total + summary.average * summary.count,
      0
    )

    return res.status(200).json({
      message: 'Product Found',
      product,
      ratingAverage: ratingCount ? ratingTotal / ratingCount : 0,
      ratingCount
    })
    } catch (error) {
    console.error('GET PRODUCTS ERROR:', error.message)
    return res.status(500).json({ message: 'Server error' })
    }
}

exports.getProductById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id' })
    }

    const product = await Product.findById(req.params.id)
      .populate('category')
      .lean()

    if (!product) {
      return res.status(404).json({ message: 'Product not found' })
    }

    const [ratingSummary] = await ProductRating.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(req.params.id) } },
      {
        $group: {
          _id: null,
          average: { $avg: '$rating' },
          count: { $sum: 1 }
        }
      }
    ])

    return res.status(200).json({
      message: 'Product found',
      product: {
        ...product,
        ratingAverage: ratingSummary?.average || 0,
        ratingCount: ratingSummary?.count || 0
      }
    })
  } catch (error) {
    console.error('GET PRODUCT ERROR:', error.message)
    return res.status(500).json({ message: 'Could not load product details' })
  }
}

exports.rateProduct = async (req, res) => {
  try {
    const { id: productId } = req.params
    const rating = Number(req.body.rating)

    if (!mongoose.isValidObjectId(productId) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Choose a rating from 1 to 5 stars' })
    }

    if (req.user?.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can rate products' })
    }

    const productExists = await Product.exists({ _id: productId })
    if (!productExists) {
      return res.status(404).json({ message: 'Product not found' })
    }

    await ProductRating.findOneAndUpdate(
      { product: productId, customer: req.user.userId },
      { $set: { rating } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    )

    const [summary] = await ProductRating.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(productId) } },
      {
        $group: {
          _id: null,
          average: { $avg: '$rating' },
          count: { $sum: 1 }
        }
      }
    ])

    return res.status(200).json({
      message: 'Your rating has been saved',
      rating,
      ratingAverage: summary?.average || 0,
      ratingCount: summary?.count || 0
    })
  } catch (error) {
    console.error('RATE PRODUCT ERROR:', error.message)
    return res.status(500).json({ message: 'Could not save rating' })
  }
}

exports.deleteProduct = async (req,res) => {
    try {
        const product = await Product.findById(req.params.id)

        if (!product) {
            return res.status(404).json({ message: 'Product not found' })
        }

        await product.deleteOne()

        if (product.images && product.images.length > 0) {
          for (const image of product.images) {
            if (!image.publicId) continue

            try {
              await cloudinary.uploader.destroy(image.publicId)
            } catch (imageError) {
              console.log('CLOUDINARY DELETE ERROR:', imageError.message)
            }
          }
        }

        res.status(200).json({ message: 'Product deleted successfully' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Server error during delete product', error: error.message })
    }
}