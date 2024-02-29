const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
dotenv.config();

const mongoURI = process.env.MONGO_URI

 async function mongoConnect(fid) {
    const client = new MongoClient(mongoURI);
  await client.connect();
  console.log('MongoDB connected');
  const db = client.db('Lollypop');
  const collection = db.collection('users');

  const result = await collection.findOne({ fid: fid });
  await client.close();
  return result;
}

mongoConnect()

module.exports = mongoConnect;