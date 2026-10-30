require('dotenv').config(); //environment variables
const mongoose = require('mongoose'); //connect to mongodb
const session = require('express-session');
const cors = require('cors'); //what origin to allow
const express = require('express'); //to create server
const helmet = require('helmet'); //protection
const rateLimit = require('express-rate-limit');
const path = require('path');
// General limit is generous because the app polls /barangay/sync every few seconds.
const apiLimiter = rateLimit({
    windowMs: 1000*60*15,
    limit: 1500,
    message: "Too many request, please try again later."
});
// Login / signup / recover are limited much more tightly (brute-force protection)
const authLimiter = rateLimit({
    windowMs: 1000*60*15,
    limit: 40,
    message: { success: false, message: "Too many attempts, please try again later." }
});

const PORT = process.env.PORT;

const app = express();

// Render sits behind a proxy: without this every user shares one IP and hits the rate limit together
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SECRETKEY,
    resave: false,
    saveUninitialized: true
}));

//allow any origin to request
app.use(cors());
app.use(helmet());
// 4mb so a compressed photo (base64) fits in an announcement / person request
app.use(express.json({limit: '4mb'}));
app.use(express.urlencoded({ limit: '4mb', extended: true }));

const datenow = new Date();
app.get('/', (req, res) => {
    res.send(`Version: 1.0.0 - Updated: ${datenow.toLocaleString()}`);
});

app.use('/api/v1/auths', authLimiter);
app.use('/api/v1', apiLimiter, require('./routes/v1/'));

//utils download file
app.get('/downloads/:fileext', (req, res) => {
    const fileExt = req.params.fileext.toLowerCase();

    let filePath;
    if (fileExt === "typescript" || fileExt === "ts") {
        filePath = path.join(__dirname, 'uploads', 'coreapi.ts');
        res.setHeader('Content-Disposition', 'attachment; filename="coreapi.ts"');
    }
    
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Error sending file:', err);
            res.status(500).send(`${fileExt} is not a valid file type. Available types: typescript`);
        } else {
            console.log('File sent successfully:', fileExt);
        }
    });
});

//Connecting to Database
const mongoDBUri = process.env.MONGO_URI;
mongoose.connect(mongoDBUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => {
        console.log('Mongodb database configured successfully.');
    })
    .catch(err => {
        console.error('Failed to connect to MongoDB', err)
    });
const db = mongoose.connection;
db.on('connected', () => { console.log('Connected to database MongoDB.'); });
db.on('error', err => console.error('Mongoose connection error:', err));
db.on('disconnected', () => { });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening at port ${PORT}`)
});

//When the user press ctrl C
process.on('SIGINT', () => {
    async function closeConnection() {
        try {
            await mongoose.connection.close();
            console.log('Connection closed successfully.');
            process.exit(0);
        } catch (err) {
            console.error('Failed to close the connection:', err);
        }
    }
    // Call the function when you need to close the connection
    closeConnection();
});
