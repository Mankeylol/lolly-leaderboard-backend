const axios = require('axios');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

dotenv.config();

const neynarApi = process.env.NEYNAR_API;
const mongoURI = process.env.MONGO_URI;

const awardPoints = action => {
  switch (action) {
    case 'post':
      return 169;
    case 'like':
      return 10;
    case 'recast':
      return 40;
    default:
      return 0;
  }
};

const updatePointsInMongoDB = async (
    authorId,
    points,
    likesCount,
    recastsCount,
    castHash,
    username,
    likesPoints
  ) => {
    try {
      const client = new MongoClient(mongoURI);
      await client.connect();
      const database = client.db('Lollypop');
      const usersCollection = database.collection('users');

      await usersCollection.createIndex({ authorId: 1 }, { unique: true });
  
      const user = await usersCollection.findOne({ authorId });
  
      if (user) {
        const processedCastIndex = user.processedCasts.findIndex(
          (cast) => cast.hash === castHash
        );
  
        if (processedCastIndex !== -1) {
          // Existing post, update if needed
          const processedCast = user.processedCasts[processedCastIndex];
  
          if (!isWithinLast24Hours(processedCast.updatedAt)) {
            const totalLikesCount = user.processedCasts.reduce(
              (total, cast) => total + cast.likesCount,
              0
            );
  
            const prevDayLikesCount = user.likesCount || 0;
            const likesDifference = totalLikesCount - prevDayLikesCount;
  
            const pointsForLikesDifference = likesDifference * awardPoints('like');
            const pointsForRecasts = recastsCount * awardPoints('recast');
            const totalPoints =
              points + pointsForLikesDifference + pointsForRecasts;
  
            await usersCollection.updateOne(
              { authorId, 'processedCasts.hash': castHash },
              {
                $set: {
                  'processedCasts.$.likesCount': likesCount,
                  'processedCasts.$.recastsCount': recastsCount,
                  'processedCasts.$.updatedAt': new Date(),
                  likesCount: totalLikesCount,
                  username,
                },
                $inc: { points: totalPoints },
              }
            );
          }
        } else {
          // New post, check if user exists and update or insert
          const totalLikesCount = user.processedCasts.reduce(
            (total, cast) => total + cast.likesCount,
            0
          );
          const prevDayLikesCount = user.likesCount || 0;
          const likesDifference = totalLikesCount - prevDayLikesCount;
  
          const pointsForLikesDifference = likesDifference * awardPoints('like');
          const pointsForRecasts = recastsCount * awardPoints('recast');
          const totalPoints = points + pointsForLikesDifference + pointsForRecasts;
  
          const processedPost = user.processedCasts.find(
            (cast) => cast.hash === castHash
          );
  
          if (!processedPost) {
            // Check if the user already exists based on authorId
            const existingUser = await usersCollection.findOne({ authorId });
  
            if (existingUser) {
              // Update existing user
              await usersCollection.updateOne(
                { authorId },
                {
                  $addToSet: {
                    processedCasts: {
                      hash: castHash,
                      likesCount,
                      recastsCount,
                      updatedAt: new Date(),
                      username,
                    },
                  },
                  $set: { likesCount: totalLikesCount, username },
                  $inc: { points: totalPoints + likesPoints[authorId] || 0 },
                },
                { upsert: true }
              );
            } else {
              // Insert new user with initial points value
              await usersCollection.insertOne({
                authorId,
                points: 0, // Set an initial value for points
                likesCount,
                username,
                processedCasts: [
                  {
                    hash: castHash,
                    likesCount,
                    recastsCount,
                    updatedAt: new Date(),
                    username,
                  },
                ],
              });
            }
          }
        }
      } else {
        // New user, insert
        await usersCollection.insertOne({
          authorId,
          points: 0, // Set an initial value for points
          likesCount,
          username,
          processedCasts: [
            {
              hash: castHash,
              likesCount,
              recastsCount,
              updatedAt: new Date(),
              username,
            },
          ],
        });
      }
  
      for (const likerId in likesPoints) {
        const likerUsername = likesPoints[likerId].username;
  
        // Check if the liker's document already exists
        const existingLiker = await usersCollection.findOne({ authorId: likerId });
  
        if (existingLiker) {
          // Update the existing liker document
          await usersCollection.updateOne(
            { authorId: likerId },
            {
              $set: { username: likerUsername },
              $inc: { points: likesPoints[likerId].points },
            }
          );
        } else {
          // Create a new liker document if it doesn't exist
          await usersCollection.insertOne({
            authorId: likerId,
            username: likerUsername,
            points: likesPoints[likerId].points,
            likesCount: 0,
            processedCasts: [
              {
                hash: castHash,
                likesCount,
                recastsCount,
                updatedAt: new Date(),
                username,
              },
            ],
          });
        }
      }
  
      await client.close();
    } catch (error) {
      console.error(error);
    }
  };
  
  
const isWithinLast24Hours = timestamp => {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
  return timestamp > twentyFourHoursAgo;
};

const processPost = async (post, likesPoints) => {
  const authorId = post.author.fid;
  const username = post.author.username;
  const likesCount = post.reactions.likes.length;
  const recastsCount = post.reactions.recasts.length;
  const castHash = post.hash;

  const postPoints = awardPoints('post');
  const likePoints = likesCount * awardPoints('like');
  const recastPoints = recastsCount * awardPoints('recast');
  const totalPoints = postPoints + likePoints + recastPoints;

  await updatePointsInMongoDB(
    authorId,
    totalPoints,
    likesCount,
    recastsCount,
    castHash,
    username,
    likesPoints
  );

  const likerUsernames = [];

  for (const like of post.reactions.likes) {
    const likerId = like.fid;
    const likerUsername = like.fname;

    if (!likesPoints[likerId]) {
      likesPoints[likerId] = 0;
    }

    likesPoints[likerId] += awardPoints('like');

    likerUsernames.push({
      likerId,
      likerUsername,
      points: likesPoints[likerId],
    });
  }

  if (Object.keys(likesPoints).length > 0) {
    const client = new MongoClient(mongoURI);
    await client.connect();
    const database = client.db('Lollypop');
    const usersCollection = database.collection('users');

    for (const { likerId, likerUsername, points } of likerUsernames) {
      console.log(`Updating username for likerId ${likerId} to ${likerUsername}`);

      const existingLiker = await usersCollection.findOne({ authorId: likerId });

      if (existingLiker) {
        await usersCollection.updateOne(
          { authorId: likerId },
          {
            $set: { username: likerUsername },
            $inc: { points: points },
          },
          { upsert: true }
        );
      } else {
        await usersCollection.insertOne({
          authorId: likerId,
          username: likerUsername,
          points: points,
          likesCount: 0,
          processedCasts: [
            {
              hash: castHash,
              likesCount,
              recastsCount,
              updatedAt: new Date(),
              username,
            },
          ],
        });
      }
    }

    await client.close();
  }
};

const fetchAndProcessCasts = async (cursor = null) => {
  try {
    const apiUrl = cursor
      ? `https://api.neynar.com/v2/farcaster/feed/channels?channel_ids=lollypop&with_recasts=true&with_replies=true&limit=100&cursor=${cursor}`
      : 'https://api.neynar.com/v2/farcaster/feed/channels?channel_ids=lollypop&with_recasts=true&with_replies=true&limit=100';

    const response = await axios.get(apiUrl, {
      headers: { accept: 'application/json', api_key: neynarApi },
    });

    const posts = response.data.casts;

    const likesPoints = {};

    const processPostPromises = posts.map(async (post) => {
      await processPost(post, likesPoints);
    });

    await Promise.all(processPostPromises);

    const nextCursor = response.data.next.cursor;

    if (nextCursor) {
      await fetchAndProcessCasts(nextCursor);
    }
  } catch (error) {
    console.error(error);
  }
};

fetchAndProcessCasts();
