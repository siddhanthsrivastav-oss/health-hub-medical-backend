const readline = require('node:readline/promises')
const path = require('node:path')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const dotenv = require('dotenv')
const Admin = require('../models/admin')

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const main = async () => {
    if (!process.env.Mongo_URI) {
        throw new Error('Mongo_URI is missing from Backend/.env')
    }

    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
    try {
        const name = (await terminal.question('Admin name: ')).trim()
        const email = (await terminal.question('Admin email: ')).trim().toLowerCase()
        const roleInput = (await terminal.question('Role (admin/superadmin): ')).trim().toLowerCase()
        const password = await terminal.question('Password (minimum 8 characters): ')
        const confirmation = await terminal.question('Confirm password: ')

        if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
            throw new Error('A name and valid email are required')
        }
        if (!['admin', 'superadmin'].includes(roleInput)) {
            throw new Error('Role must be admin or superadmin')
        }
        if (password.length < 8 || password !== confirmation) {
            throw new Error('Passwords must match and contain at least 8 characters')
        }

        await mongoose.connect(process.env.Mongo_URI)
        const admin = await Admin.create({
            name,
            email,
            role: roleInput,
            password: await bcrypt.hash(password, 12)
        })

        console.log(`${admin.role} created in the admins collection: ${admin.email}`)
    } finally {
        terminal.close()
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect()
        }
    }
}

main().catch((error) => {
    console.error(`Admin creation failed: ${error.message}`)
    process.exitCode = 1
})