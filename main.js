import { TwitterApi } from "twitter-api-v2";
import fetch from "node-fetch";
import fs from "fs";
import { createApi } from "unsplash-js";
import OpenAI from "openai";

global.fetch = fetch;

const client = new TwitterApi({
    appKey: process.env.TWITTER_APP_KEY,
    appSecret: process.env.TWITTER_APP_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET
});

const unsplash = createApi({ accessKey: process.env.UNSPLASH_ACCESS_KEY });
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Function to download image
const downloadImage = async (uri, filename) => {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filename, Buffer.from(buffer));
};

// Function to get caption from GPT-4 Vision
const getImageCaption = async (imageUrl) => {
    try {
        console.log("Attempting to get caption from GPT for image:", imageUrl);
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Describe this image in a concise, engaging way that would make a good tweet caption. Keep it under 200 characters and make it interesting for social media."
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: imageUrl
                            }
                        }
                    ]
                }
            ],
            max_tokens: 150
        });
        
        const caption = response.choices[0].message.content || "Beautiful Nature Image";
        console.log("GPT generated caption:", caption);
        return caption;
    } catch (error) {
        console.log("Error getting caption from GPT:", error.message);
        throw error; // Re-throw instead of returning fallback
    }
};

const tweet = async (retryCount = 10) => {
    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            console.log(`\n--- Attempt ${attempt} ---`);
            
            const photo = await unsplash.photos.getRandom({ query: "Nature" });
            const rawUrl = photo.response.urls.raw;
            const smallUrl = photo.response.urls.small;
            
            console.log("Got Unsplash photo:", {
                rawUrl: rawUrl,
                smallUrl: smallUrl,
                photoId: photo.response.id,
                photographer: photo.response.user?.name
            });

            const caption = await getImageCaption(smallUrl);
            const filename = "image.png";
            
            console.log("Downloading image...");
            await downloadImage(rawUrl, filename);
            console.log("Image downloaded successfully");

            console.log("Uploading media to Twitter...");
            const mediaId = await client.v1.uploadMedia(filename);
            console.log("Media uploaded, ID:", mediaId);

            console.log("Posting tweet...");
            await client.v2.tweet({
                text: caption,
                media: { media_ids: [mediaId] }
            });

            console.log("Tweeted successfully with caption:", caption);
            break; // exit loop on success
        } catch (e) {
            console.log(`Attempt ${attempt} failed: ${e.message}`);
            if (attempt < retryCount) {
                console.log(`Waiting 2 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                console.log("All attempts failed. Using fallback caption.");
                // On final failure, try one more time with fallback
                try {
                    const photo = await unsplash.photos.getRandom({ query: "Nature" });
                    const rawUrl = photo.response.urls.raw;
                    const filename = "image.png";
                    
                    await downloadImage(rawUrl, filename);
                    const mediaId = await client.v1.uploadMedia(filename);
                    await client.v2.tweet({
                        text: "Stunning Nature Photography",
                        media: { media_ids: [mediaId] }
                    });
                    console.log("Tweeted with fallback caption");
                } catch (finalError) {
                    console.log("Even fallback failed:", finalError.message);
                }
            }
        }
    }
};

// For GitHub Actions: just run the tweet function
(async () => {
    try {
        await tweet();
        console.log("Tweet successful!");
    } catch (e) {
        console.log("Error in tweet:", e.message);
        process.exit(1); // Exit with error code for GitHub Actions
    }
})(); 