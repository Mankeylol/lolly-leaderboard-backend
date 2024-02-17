const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const bodyParser = require('body-parser')

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json())

const mongoURI = process.env.MONGO_URI;

app.get('/leaderboard', async (req, res) => {
    try {
        const client = new MongoClient(mongoURI);
        await client.connect();

        const database = client.db('Lollypop');
        const usersCollection = database.collection('users');

        // Example: Get top 10 users based on points (you can modify this query based on your needs)
        const leaderboardData = await usersCollection.find().sort({ points: -1 }).limit(100).toArray();

        res.json(leaderboardData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/getUserDetails', async (req, res) => {
    try {
        const { fid } = req.body; // Assuming the FID is sent in the request body

        const client = new MongoClient(mongoURI);
        await client.connect();

        const database = client.db('Lollypop');
        const usersCollection = database.collection('users');

        const user = await usersCollection.findOne({ authorId: fid });

        if (user) {
            res.json({
                success: true,
                user: {
                    username: user.username,
                    points: user.points,
                },
            });
        } else {
            res.json({
                success: false,
                message: 'User not found',
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
