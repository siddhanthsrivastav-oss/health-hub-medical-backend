const express = require('express')
const categoryRouter = express.Router()


const upload = require('../middleware/upload')
const auth = require('../middleware/auth')
const adminOnly = require('../middleware/adminOnly')
const {createCategory,getCategory,updateCategory,deleteCategory} = require('../controllers/categoryController')

categoryRouter.post('/create-category',auth,adminOnly,upload.single('image'),createCategory)
categoryRouter.get('/all-category',getCategory)
categoryRouter.put('/:id',auth,adminOnly,upload.single('image'),updateCategory)
categoryRouter.delete('/:id',auth,adminOnly,deleteCategory)

module.exports = categoryRouter 