
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to the database
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to database'))
    .catch((err) => console.log('Error connecting to database:', err));

// Define a schema for the user and admin data
const userSchema = new mongoose.Schema({
    name: String,
    chatId: { type: Number, unique: true },
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }]
});

const orderSchema = new mongoose.Schema({
    package: String,
    numUsers: Number,
    seller: String,
    date: { type: Date, default: Date.now }
});

const adminSchema = new mongoose.Schema({
    name: String,
    password: String,
    chatId: { type: Number, unique: true }
});

// Create a model for the user, order, and admin data
const User = mongoose.model('User', userSchema);
const Order = mongoose.model('Order', orderSchema);
const Admin = mongoose.model('Admin', adminSchema);

// Create a new bot using the token provided by BotFather
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

////////////////////////////////////////////////////////////////////////////////////////////////

// When a user starts a conversation with the bot
bot.onText(/^\/start/, async (msg) => {

    // Check if user already exists
    const user = await User.findOne({ chatId: msg.chat.id });
    if (user) {
        // Greet the user
        await bot.sendMessage(msg.chat.id, `Welcome back, ${user.name} !`);
    } else {
        await bot.sendMessage(msg.chat.id, "Hi there! What's your name?");

        // Wait for user response
        bot.once("message", async (response) => {
            const name = response.text;

            // Save the user to the database
            const newUser = new User({
                name,
                chatId: msg.chat.id,
            });
            await newUser.save();

            // Respond with a greeting that includes the user's name
            await bot.sendMessage(
                msg.chat.id,
                `Nice to meet you, ${name} !`
            );
        });
    }
    // Ask the user to select a package
    await bot.sendMessage(
        msg.chat.id,
        "Please select a package:",
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '15GB 1User', callback_data: '15GB_1User' },
                        { text: '30GB 1User', callback_data: '30GB_1User' },
                        { text: '60GB 1User', callback_data: '60GB_1User' }
                    ],
                    [
                        { text: '15GB 2Users', callback_data: '15GB_2Users' },
                        { text: '30GB 2Users', callback_data: '30GB_2Users' },
                        { text: '60GB 2Users', callback_data: '60GB_2Users' }
                    ]
                ]
            },
        }
    );

    await bot.sendMessage(
        msg.chat.id,
        "Please select a seller:",
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "Elahe", callback_data: "Elahe" },
                        { text: "Shahriyar", callback_data: "Shahriyar" },
                        { text: "Sajad", callback_data: "Sajad" },
                    ],
                ],
            },
        }
    );
    // When a user selects a package
    bot.on('callback_query', async (query) => {


        const package = query.data;
        console.log(query.data);
        const chatId = query.message.chat.id;

        // Get the user from the database
        const user = await User.findOne({ chatId });

        // Ask the user to select a seller


        // Process the selected seller
        bot.once("callback_query", async (sellerQuery) => {
            const seller = sellerQuery.data;

            // Ask the user how many users they want
            // await bot.sendMessage(chatId, `You selected the ${package} package.How many users do you want ? `);
            // bot.once('message', async (response) => {
            //     const numUsers = response.text;

            // Create a new order in the database
            const newOrder = new Order({
                package,
                // numUsers,
                seller
            });
            await newOrder.save();

            // Add the order to the user's list of orders
            user.orders.push(newOrder._id);
            await user.save();

            // Respond with a message
            await bot.sendMessage(chatId, `You selected the ${package} package from ${seller}. Thanks for choosing us!`);
        });
        // });
    });
});
////////////////////////////////////////////////////////////////////////////////////////////////

// Function to handle password input
const handlePasswordInput = async (msg, admin) => {
    const password = msg.text;
    const chatId = msg.chat.id;

    if (password === admin.password) {
        // Respond with the admin panel
        bot.sendMessage(chatId, "Welcome to the admin panel!");
    } else {
        bot.sendMessage(chatId, "Invalid password. Please try again.");
        bot.once('message', (msg) => handlePasswordInput(msg, admin));
    }
};


// When an admin starts a conversation with the bot
bot.onText(/^\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const admin = await Admin.findOne({ chatId });

    if (admin) {
        // Ask for the password
        bot.sendMessage(chatId, "Please enter your password:");

        // Listen for the admin's response
        bot.once('message', (msg) => handlePasswordInput(msg, admin));
    } else {
        // Ask for the name
        bot.sendMessage(chatId, "Please enter your name:");

        // Listen for the admin's response
        bot.once('message', async (msg) => {
            const name = msg.text;

            // Ask for the password
            bot.sendMessage(chatId, "Please enter your password:");

            // Listen for the admin's response
            bot.once('message', async (msg) => {
                const password = msg.text;

                // Create a new admin in the database
                const newAdmin = new Admin({
                    chatId,
                    name,
                    password
                });
                await newAdmin.save();

                // Respond with the admin panel
                bot.sendMessage(chatId, "Welcome to the admin panel!");
            });
        });
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////

// When a user sends the "/orders" command
bot.onText(/^\/orders/, async (msg) => {
    try {
        // Find the user in the database
        const user = await User.findOne({ chatId: msg.chat.id }).populate('orders');

        // Check if the user has any orders
        if (user.orders.length === 0) {
            await bot.sendMessage(msg.chat.id, 'You have not placed any orders yet.');
            return;
        }

        // Build a message with the list of orders
        let ordersMsg = 'Your orders:\n';
        user.orders.forEach(order => {
            ordersMsg += `- ${order.package} package, ${order.seller}, ${order.date.toLocaleDateString()}\n`;
        });

        // Send the message to the user
        await bot.sendMessage(msg.chat.id, ordersMsg);
    } catch (err) {
        console.log('Error:', err);
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////

// When a user sends a command to see their clients
bot.onText(/\/clients/, async (msg) => {
    const chatId = msg.chat.id;

    // Check if the user is an admin
    const admin = await Admin.findOne({ chatId });
    if (!admin) {
        await bot.sendMessage(chatId, 'Sorry, only admins can use this command.');
        return;
    }

    // Fetch the orders with the corresponding seller's name
    const orders = await Order.find({ seller: admin.name }).populate('user');

    // Check if there are any orders
    if (orders.length === 0) {
        await bot.sendMessage(chatId, 'There are no clients for you at the moment.');
        return;
    }

    // Format the order information and send it to the admin
    let response = 'Here are your clients:\n\n';
    orders.forEach((order, index) => {
        const formattedDate = new Intl.DateTimeFormat('en-US', {
            dateStyle: 'full',
            timeStyle: 'short',
        }).format(order.date);

        response += `${index + 1}. Name: ${order.user.name}\n`;
        response += `   Package: ${order.package}\n`;
        response += `   Date: ${formattedDate}\n\n`;
    });

    await bot.sendMessage(chatId, response);
});





