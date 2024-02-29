const dotenv = require('dotenv')
dotenv.config()

const express = require('express')
const { MongoClient } = require('mongodb')
const cors = require('cors')
const bodyParser = require('body-parser')
const mongoConnect = require('./retrivePoints');

const app = express()
const port = process.env.PORT || 3001

app.use(cors())
app.use(bodyParser.json())

const mongoURI = process.env.MONGO_URI

app.get('/leaderboard', async (req, res) => {
  try {
    const client = new MongoClient(mongoURI)
    await client.connect()

    const database = client.db('Lollypop')
    const usersCollection = database.collection('users')

    // Example: Get top 10 users based on points (you can modify this query based on your needs)
    const leaderboardData = await usersCollection
      .find()
      .sort({ points: -1 })
      .limit(100)
      .toArray()

    res.json(leaderboardData)
    await client.close()
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

app.post('/getUserDetails', async (req, res) => {
  try {
    const { fid } = req.body // Assuming the FID is sent in the request body

    const client = new MongoClient(mongoURI)
    await client.connect()

    const database = client.db('Lollypop')
    const usersCollection = database.collection('users')

    const user = await usersCollection.findOne({ fid: fid })

    if (user) {
      res.json({
        success: true,
        user: {
          username: user.username,
          points: user.points
        }
      })
    } else {
      res.json({
        success: false,
        message: 'User not found'
      })
    }
    await client.close()
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

app.post('/getPoints', async (req, res) => {
  try {
    const { fid } = req.body;
    console.log(fid);
    console.log(typeof fid)

    const client = new MongoClient(mongoURI);
    await client.connect();
    console.log('MongoDB connected');

    const db = client.db('Lollypop');
    const collection = db.collection('users');

    const result = await collection.findOne({ fid: Number(fid) });

    if (result) {
      const points = result.points;
      console.log(result);
      res.json(points);
    } else {
      console.log('Document not found');
      res.status(404).json({ error: 'Document not found' });
    }

    await client.close();
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
