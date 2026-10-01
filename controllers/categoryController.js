const Category = require('../models/category')
const Product = require('../models/product')

const cloudinary = require('../config/cloudinary')
  
const createCategory = async(req,res)=>{
    try {
        const result = await cloudinary.uploader.upload(req.file.path,{
            folder:'categories'
        })        
        const category = await Category.create ({
            categoryName:req.body.categoryName,
            image:result.secure_url,
            publicId:result.public_id
        })
        res.status(201).json({message:"Category Created"})
    } catch (error) {
        return res.status(500).json({message:"Server Error",error})
    }
}



const getCategory = async(req,res)=>{
    try {
        const category = await Category.find()
        res.status(200).json({message:"Category Found",category})
    } catch (error) {
        res.status(400).json({message:"Server error during getting category"})
    }
}


const updateCategory =async(req,res)=>{
    try {
        const category = await Category.findById(req.params.id)
        if(!category){
            return res.status(404).json({message:"Category not found"})
        }
        if(req.file){
            await cloudinary.uploader.destroy(category.publicId)
            const result = await cloudinary.uploader.upload(req.file.path,{
            folder:'categories'
        }) 
        category.publicId=result.public_id
        category.image=result.secure_url
        
        }
        category.categoryName = req.body.categoryName || category.categoryName 
        await category.save()
        res.status(200).json({message:"Category Updated"})

    } catch (error) {
        res.status(500).json({message:"Server Error",error})
    }
}


const deleteCategory = async(req,res)=>{
    try {
        const category = await Category.findById(req.params.id)
        if(!category){
            return res.status(404).json({message:"Category not found"})
        }
        if (await Product.exists({ category: category._id })) {
            return res.status(409).json({message:"Move or delete this category's products before deleting the category"})
        }
        await cloudinary.uploader.destroy(category.publicId)
        await category.deleteOne()
        res.status(200).json({message:"Category Deleted"})
    } catch (error) {
        return res.status(500).json({message:"Server Error During Delete Category",error})
    }
}


module.exports= {createCategory,getCategory,updateCategory,deleteCategory}