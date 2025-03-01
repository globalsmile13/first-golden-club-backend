const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const serverless = require('serverless-http');
require('dotenv').config();
const cronScript = require('../../cron/schedule');

const feedRoutes = require('../../routes/feed');
const levelRoutes = require('../../routes/level');
const authRoutes = require('../../routes/auth');
const profileRoutes = require('../../routes/profile');
const paymentRoutes = require('../../routes/payment');



const app = express();

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'images');
  },
  filename: (req, file, cb) => {
    cb(null, new Date().toISOString() + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/jpg' ||
    file.mimetype === 'image/jpeg'
  ) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

app.use(bodyParser.json()); // application/json
app.use(
  multer({ storage: fileStorage, fileFilter: fileFilter }).single('image')
);
app.use('/images', express.static(path.join(__dirname, 'images')));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'OPTIONS, GET, POST, PUT, PATCH, DELETE'
  );
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.use('/.netlify/functions/app/feed', feedRoutes);
app.use('/.netlify/functions/app/payment', paymentRoutes);
app.use('/.netlify/functions/app/level', levelRoutes);
app.use('/.netlify/functions/app/user', profileRoutes);
app.use('/.netlify/functions/app/auth', authRoutes);

app.use((error, req, res, next) => {
  const status = error.statusCode || 500;
  const message = error.message;
  const data = error.data;
  res.status(status).json({ message: message, data: data });
});

mongoose
  .connect(
    process.env.MONGODB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(result => {
    console.log("Connected to MongoDB");
  })
  .catch(err => console.log(err));

module.exports.handler = serverless(app);
