const mongoose = require("mongoose")
const productSchema = new mongoose.Schema({

    productName: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    description: {
        type: String,
    },
    images: [
        {
            url: String,
            publicId: String
        }
    ],
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "category",
        required: true
    }
})

module.exports = mongoose.model("Product", productSchema)