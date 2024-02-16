const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

const mongoURI = process.env.MONGO_URI;

app.get('/leaderboard', async (req, res) => {
    try {
        const client = new MongoClient(mongoURI);
        await client.connect();

        const database = client.db('Lollypop');
        const usersCollection = database.collection('users');

        // Example: Get top 10 users based on points (you can modify this query based on your needs)
        const leaderboardData = await usersCollection.find().sort({ points: -1 }).limit(10).toArray();

        res.json(leaderboardData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});