const axios = require('axios');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

dotenv.config();

const neynarApi = process.env.NEYNAR_API;
const mongoURI = process.env.MONGO_URI;

const awardPoints = (action) => {
  switch (action) {
    case 'post':
      return 100;
    case 'like':
      return 10;
    case 'recast':
      return 20;
    default:
      return 0;
  }
};

const updatePointsInMongoDB = async (authorId, points, likesCount, recastsCount, castHash, username) => {
    try {
        const client = new MongoClient(mongoURI);
        await client.connect();
        const database = client.db('Lollypop');
        const usersCollection = database.collection('users');

        const user = await usersCollection.findOne({ authorId });

        if (user) {
            const processedCastIndex = user.processedCasts.findIndex((cast) => cast.hash === castHash);

            if (processedCastIndex !== -1) {
                // If the cast has already been processed, update relevant details
                const processedCast = user.processedCasts[processedCastIndex];

                if (!isWithinLast24Hours(processedCast.updatedAt)) {
                    // If the cast hasn't been processed in the last 24 hours, update it
                    const totalLikesCount = user.processedCasts.reduce((total, cast) => total + cast.likesCount, 0);

                    const prevDayLikesCount = user.likesCount || 0;
                    const likesDifference = totalLikesCount - prevDayLikesCount;

                    const pointsForLikesDifference = likesDifference * awardPoints('like');
                    const pointsForRecasts = recastsCount * awardPoints('recast');

                    await usersCollection.updateOne(
                        { authorId, 'processedCasts.hash': castHash },
                        {
                            $set: {
                                'processedCasts.$.likesCount': likesCount,
                                'processedCasts.$.recastsCount': recastsCount,
                                'processedCasts.$.updatedAt': new Date(),
                                likesCount: totalLikesCount,
                                username, // Add the username to the update
                            },
                            $inc: { points: points + pointsForLikesDifference + pointsForRecasts },
                        }
                    );
                }
            } else {
                // If the cast hasn't been processed before, add it to the processedCasts array
                const totalLikesCount = user.processedCasts.reduce((total, cast) => total + cast.likesCount, 0);
                const prevDayLikesCount = user.likesCount || 0;
                const likesDifference = totalLikesCount - prevDayLikesCount;

                const pointsForLikesDifference = likesDifference * awardPoints('like');
                const pointsForRecasts = recastsCount * awardPoints('recast');

                await usersCollection.updateOne(
                    { authorId },
                    {
                        $addToSet: {
                            processedCasts: {
                                hash: castHash,
                                likesCount,
                                recastsCount,
                                updatedAt: new Date(),
                                username, // Add the username to the new cast
                            },
                        },
                        $set: { likesCount: totalLikesCount, username }, // Update the username
                        $inc: { points: points + pointsForLikesDifference + pointsForRecasts },
                    }
                );
            }
        } else {
            // If the user document doesn't exist, create a new one
            await usersCollection.insertOne({
                authorId,
                points,
                likesCount,
                username,
                processedCasts: [{ hash: castHash, likesCount, recastsCount, updatedAt: new Date(), username }],
            });
        }

        await client.close();
    } catch (error) {
        console.error(error);
    }
};


const isWithinLast24Hours = (timestamp) => {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    return timestamp > twentyFourHoursAgo;
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
  
      for (const post of posts) {
        const authorId = post.author.fid;
        const username = post.author.username
        const likesCount = post.reactions.likes.length;
        const recastsCount = post.reactions.recasts.length;
        const castHash = post.hash;
  
        const postPoints = awardPoints('post');
        const likePoints = likesCount * awardPoints('like');
        const recastPoints = recastsCount * awardPoints('recast');
        const totalPoints = postPoints + likePoints + recastPoints;
  
        await updatePointsInMongoDB(authorId, totalPoints, likesCount, recastsCount, castHash, username);
      }
  
      const nextCursor = response.data.next.cursor;
  
      if (nextCursor) {
        await fetchAndProcessCasts(nextCursor);
      }
    } catch (error) {
      console.error(error);
    }
  };
  
  fetchAndProcessCasts();