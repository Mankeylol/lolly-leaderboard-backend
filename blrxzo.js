const axios = require('axios');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

dotenv.config();

const neynarApi = process.env.NEYNAR_API;
const mongoURI = process.env.MONGO_URI;

const uniqueUsers = [];

async function addAllUsers(cursor = null) {
  try {
    const apiUrl = cursor
      ? `https://api.neynar.com/v2/farcaster/feed/channels?channel_ids=blrxzo&with_recasts=true&with_replies=true&limit=100&cursor=${cursor}`
      : 'https://api.neynar.com/v2/farcaster/feed/channels?channel_ids=blrxzo&with_recasts=true&with_replies=true&limit=100';

    const response = await axios.get(apiUrl, {
      headers: { accept: 'application/json', api_key: neynarApi },
    });

    const casts = response.data.casts;

    for (const cast of casts) {
      processUser(cast.author);
    }

    const nextCursor = response.data.next.cursor;

    if (nextCursor) {
      // Recursive call with the next cursor for pagination
      await addAllUsers(nextCursor);
    }
  } catch (error) {
    console.log(error);
  }
}

async function calculatePoints(cursor = null) {
  try {
    const apiUrl = cursor
      ? `https://api.neynar.com/v2/farcaster/feed/channels?channel_ids=blrxzo&with_recasts=true&with_replies=true&limit=100&cursor=${cursor}`
      : 'https://api.neynar.com/v2/farcaster/feed/channels?channel_ids=blrxzo&with_recasts=true&with_replies=true&limit=100';

    const response = await axios.get(apiUrl, {
      headers: { accept: 'application/json', api_key: neynarApi },
    });

    const casts = response.data.casts;

    for (const cast of casts) {
      processUser(cast.author);
      processLikes(cast.reactions.likes);
      processRecasts(cast.reactions.recasts);

      // Calculate points for the main cast and update the user
      const user = uniqueUsers.find((user) => user.fid === cast.author.fid);
      if (user) {
        user.points += calculateUserPoints(cast);
        user.casts.push(cast.hash);
      }
    }

    const nextCursor = response.data.next.cursor;

    if (nextCursor) {
      // Recursive call with the next cursor for pagination
      await calculatePoints(nextCursor);
    }
  } catch (error) {
    console.log(error);
  }
}

function processUser(author) {
  // Process the main cast author (user who posted the cast)
  const fid = author.fid;
  const username = author.username;
  addUser(fid, username);
}

function processLikes(reactions) {
  // Process users who liked or recasted the cast
  for (const reaction of reactions) {
    const fid = reaction.fid;
    const username = reaction.fname;
    addUser(fid, username);
    awardPoints(fid, 10); // Award 10 points for each like or recast
  }
}
function processRecasts(reactions) {
    // Process users who liked or recasted the cast
    for (const reaction of reactions) {
      const fid = reaction.fid;
      const username = reaction.fname;
      addUser(fid, username);
      awardPoints(fid, 20); // Award 10 points for each like or recast
    }
  }

function addUser(fid, username) {
  // Add user if not already present
  const existingUser = uniqueUsers.find((user) => user.fid === fid);
  if (!existingUser) {
    const newUser = {
      fid: fid,
      username: username,
      casts: [],
      points: 0, // Initialize with zero points
    };
    uniqueUsers.push(newUser);
  }
}

function awardPoints(fid, points) {
  // Award points to the user
  const user = uniqueUsers.find((user) => user.fid === fid);
  if (user) {
    user.points += points;
  }
}

function calculateUserPoints(cast) {
  // Your logic to calculate points for a user based on a cast
  const likePoints = 10 * cast.reactions.likes.length;
  const recastPoints = 20 * cast.reactions.recasts.length;
  const totalPoints = 69 + likePoints + recastPoints;
  return totalPoints;
}

function processUsers() {
  // Iterate through the uniqueUsers array and log each user with points
  for (const user of uniqueUsers) {
    console.log(`User: ${user.username}, Points: ${user.points}`);
  }
}

async function uploadToMongoDB() {
    try {
      const client = new MongoClient(mongoURI);
      await client.connect();
  
      const db = client.db('Lollypop');
      const collection = db.collection('users');
  
      // Insert uniqueUsers array into MongoDB
      await collection.insertMany(uniqueUsers);
  
      console.log('Data uploaded to MongoDB successfully.');
  
      // Close the connection
      await client.close();
    } catch (error) {
      console.log(error);
    }
  }
  

// Main execution
(async () => {
  // Add all users first
  await addAllUsers();

  // Calculate points for users based on casts
  await calculatePoints();

  // Process users, output or perform other actions
  processUsers();
  await uploadToMongoDB();
})();


function processUsers() {
    // Iterate through the uniqueUsers array and log each user with points
    for (const user of uniqueUsers) {
      console.log(`User: ${user.username}, Points: ${user.points}`);
    }
  }
  