const dotenv = require('dotenv')
const mongoose = require('mongoose')
const path = require('path')

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const migrate = async () => {
    if (!process.env.Mongo_URI) {
        throw new Error('Mongo_URI is not configured in Backend/.env')
    }

    await mongoose.connect(process.env.Mongo_URI)

    const users = mongoose.connection.collection('users')
    const indexes = await users.indexes()
    const emailIndex = indexes.find((index) => index.key?.email === 1)

    if (emailIndex && (!emailIndex.sparse || !emailIndex.unique)) {
        await users.dropIndex(emailIndex.name)
        console.log(`Dropped ${emailIndex.name}`)
    }

    await users.createIndex({ email: 1 }, { unique: true, sparse: true })
    console.log('Email index is now unique and sparse')
}

migrate()
    .catch((error) => {
        console.error('PHONE INDEX MIGRATION ERROR:', error.message)
        process.exitCode = 1
    })
    .finally(async () => {
        await mongoose.disconnect()
    })