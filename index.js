const express = require('express');
const app = express();
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();
const port = 3000; // You can change this to any port you prefer

const neynarApi = process.env.NEYNAR_API

app.get('/', (req, res) => {
  res.send('Hello, Lolly Leaderboard!');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
