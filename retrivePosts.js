const axios = require('axios')
const dotenv = require('dotenv')
const { MongoClient } = require('mongodb')

dotenv.config()

const neynarApi = process.env.NEYNAR_API
const mongoURI = process.env.MONGO_URI

const awardPoints = action => {
  switch (action) {
    case 'post':
      return 169
    case 'like':
      return 10
    case 'recast':
      return 40
    default:
      return 0
  }
}

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
  
      const user = await usersCollection.findOne({ authorId });
  
      if (user) {
        const processedCastIndex = user.processedCasts.findIndex(
          (cast) => cast.hash === castHash
        );
  
        // Check if the post has been processed
        if (processedCastIndex !== -1) {
          const processedCast = user.processedCasts[processedCastIndex];
  
          // Check if the post was processed within the last 24 hours
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
          const totalLikesCount = user.processedCasts.reduce(
            (total, cast) => total + cast.likesCount,
            0
          );
          const prevDayLikesCount = user.likesCount || 0;
          const likesDifference = totalLikesCount - prevDayLikesCount;
  
          const pointsForLikesDifference = likesDifference * awardPoints('like');
          const pointsForRecasts = recastsCount * awardPoints('recast');
          const totalPoints = points + pointsForLikesDifference + pointsForRecasts;
  
          // Check if the post has been processed based on castHash
          const processedPost = user.processedCasts.find(
            (cast) => cast.hash === castHash
          );
  
          if (!processedPost) {
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
              }
            );
          }
        }
      } else {
        await usersCollection.insertOne({
          authorId,
          points,
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
  
      // Update the likers' usernames
      for (const likerId in likesPoints) {
        await usersCollection.updateOne(
          { authorId: likerId },
          {
            $set: { username: likesPoints[likerId].username },
          }
        );
      }
  
      await client.close();
    } catch (error) {
      console.error(error);
    }
  };
  
const isWithinLast24Hours = timestamp => {
  const twentyFourHoursAgo = new Date()
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)
  return timestamp > twentyFourHoursAgo
}

const fetchAndProcessCasts = async (cursor = null) => {

  try {
    const apiUrl = cursor
      ? `https://api.neynar.com/v2/farcaster/feed/channels?channel_ids=lollypop&with_recasts=true&with_replies=true&limit=100&cursor=${cursor}`
      : 'https://api.neynar.com/v2/farcaster/feed/channels?channel_ids=lollypop&with_recasts=true&with_replies=true&limit=100'

    const response = await axios.get(apiUrl, {
      headers: { accept: 'application/json', api_key: neynarApi }
    })

    const posts = response.data.casts

    const likesPoints = {} // Map to accumulate likes points for each user

    const updateOperations = []
    
    const updatePromises = updateOperations.map(async (update) => {
        const { likerId, likerUsername, points, authorId, castHash } = update;
  
        console.log(`Updating username for likerId ${likerId} to ${likerUsername}`);
  
        const client = new MongoClient(mongoURI);
        await client.connect();
        const database = client.db('Lollypop');
        const usersCollection = database.collection('users');
  
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
                likesCount: 0, // Set initial likesCount for new liker document
                recastsCount: 0, // Set initial recastsCount for new liker document
                updatedAt: new Date(),
                username: likerUsername,
              },
            ],
          });
        }
  
        await client.close();
      });
  
      // Wait for all updates to complete before moving to the next iteration or finishing
      await Promise.all(updatePromises);

    for (const post of posts) {
      const authorId = post.author.fid
      const username = post.author.username
      const likesCount = post.reactions.likes.length
      const recastsCount = post.reactions.recasts.length
      const castHash = post.hash

      const postPoints = awardPoints('post')
      const likePoints = likesCount * awardPoints('like')
      const recastPoints = recastsCount * awardPoints('recast')
      const totalPoints = postPoints + likePoints + recastPoints

      await updatePointsInMongoDB(
        authorId,
        totalPoints,
        likesCount,
        recastsCount,
        castHash,
        username,
        likesPoints
      )

      // ...

      const likerUsernames = [] // Array to store liker usernames

      // Update likes points for each liker
      for (const like of post.reactions.likes) {
        const likerId = like.fid
        const likerUsername = like.fname

        if (!likesPoints[likerId]) {
          likesPoints[likerId] = 0
        }

        likesPoints[likerId] += awardPoints('like')

        // Store liker information including the username
        likerUsernames.push({
          likerId,
          likerUsername,
          points: likesPoints[likerId] // Store points along with liker information
        })
      }

      // ...

      // Execute bulk update operations for points
      if (Object.keys(likesPoints).length > 0) {
        const client = new MongoClient(mongoURI)
        await client.connect()
        const database = client.db('Lollypop')
        const usersCollection = database.collection('users')


        // Update usernames for likers outside the loop
        // ...

// Update usernames for likers outside the loop
for (const { likerId, likerUsername, points } of likerUsernames) {


    // Check if the liker document already exists
    const existingLiker = await usersCollection.findOne({ authorId: likerId });

    if (existingLiker) {
        // Update the existing liker document
        await usersCollection.updateOne(
            { authorId: likerId },
            {
                $set: { username: likerUsername },
                $inc: { points: points },
            },
            { upsert: true }
        );
    } else {
        // Create a new liker document if it doesn't exist
        await usersCollection.insertOne({
            authorId: likerId,
            username: likerUsername,
            points: points,
            likesCount: 0,
            processedCasts: [ // Ensure processedCasts is initialized for new likers
                {
                    hash: castHash,
                    likesCount,
                    recastsCount,
                    updatedAt: new Date(),
                    username
                }
            ]
            // Add any additional fields you want to set for a new liker document
        })
    }
}


        await client.close()
      }
    }

    const nextCursor = response.data.next.cursor

    if (nextCursor) {
      await fetchAndProcessCasts(nextCursor)
    }
  } catch (error) {
    console.error(error)
  }
}

fetchAndProcessCasts()
