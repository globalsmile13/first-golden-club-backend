const path = require('path');
require('dotenv').config()

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
// const logger = require("./config/logger");
const cronScript = require('./cron/schedule');

const feedRoutes = require('./routes/feed');
const levelRoutes = require('./routes/level');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const paymentRoutes = require('./routes/payment');

const app = express()

// app.use((req, res, next) => {
//   logger.info(req.body);
//   let oldSend = res.send;
//   res.send = function (data) {
//     logger.info(JSON.parse(data));
//     oldSend.apply(res, arguments);
//   }
//   next();
// })

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

// app.use(bodyParser.urlencoded()); // x-www-form-urlencoded <form>
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


app.use('/feed', feedRoutes);
app.use('/payment', paymentRoutes);
app.use('/level', levelRoutes);
app.use('/user', profileRoutes);
app.use('/auth', authRoutes);

app.use((error, req, res, next) => {
  
  const status = error.statusCode || 500;
  const message = error.message;
  const data = error.data;
  res.status(status).json({ message: message, data: data });
});


mongoose
  .connect(
    process.env.MONGODB,{
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(result => {
    app.listen(process.env.PORT);
  })
  .catch(err => console.log(err));
