const axios = require('axios');
const util = require('util');
const setTimeoutPromise = util.promisify(setTimeout);

// --- Instagram API Configuration ---
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const GRAPH_API_VERSION = 'v19.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Helper to check for necessary credentials.
 */
function checkCredentials() {
    if (!INSTAGRAM_ACCOUNT_ID || !INSTAGRAM_ACCESS_TOKEN) {
        throw new Error("Instagram Business Account ID and Access Token must be defined in .env file.");
    }
}

/**
 * Uploads media and returns a container ID.
 * @param {object} fileInfo - The file object.
 * @param {string} caption - The caption for the post.
 * @returns {Promise<string>} The container ID.
 */
async function createMediaContainer(fileInfo, caption) {
    console.log('Instagram: Creating media container...');
    // The Instagram API requires the media to be accessible via a public URL.
    // This is a major challenge as our file is local.
    // The official documentation suggests using a server to temporarily host the file.
    // For this implementation, we will assume the local server can be accessed,
    // but in a real-world scenario, this would need to be a public URL (e.g., uploaded to S3).
    // This is a placeholder and will need to be addressed in a production environment.
    const mediaUrl = `http://localhost:${process.env.PORT || 3000}/scheduled_media/${require('path').basename(fileInfo.path)}`;

    const isVideo = fileInfo.mimetype.startsWith('video/');
    let url = `${BASE_URL}/${INSTAGRAM_ACCOUNT_ID}/media?caption=${encodeURIComponent(caption)}&access_token=${INSTAGRAM_ACCESS_TOKEN}`;

    if (isVideo) {
        url += `&media_type=VIDEO&video_url=${mediaUrl}`;
    } else {
        url += `&image_url=${mediaUrl}`;
    }

    const response = await axios.post(url);
    return response.data.id;
}

/**
 * Checks the status of a media container until it's finished processing.
 * @param {string} containerId - The ID of the media container.
 */
async function checkContainerStatus(containerId) {
    console.log(`Instagram: Checking status for container ${containerId}...`);
    let status = 'IN_PROGRESS';
    let attempts = 0;
    const maxAttempts = 10; // 10 attempts * 5 seconds = 50 seconds timeout

    while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
        const url = `${BASE_URL}/${containerId}?fields=status_code&access_token=${INSTAGRAM_ACCESS_TOKEN}`;
        const response = await axios.get(url);
        status = response.data.status_code;

        if (status === 'FINISHED') {
            console.log('Instagram: Container is finished processing.');
            return;
        }
        if (status === 'ERROR') {
             throw new Error('Instagram: Media container processing failed.');
        }

        attempts++;
        console.log(`Instagram: Status is ${status}. Waiting 5 seconds...`);
        await setTimeoutPromise(5000); // Wait 5 seconds before checking again
    }

    if (status !== 'FINISHED') {
        throw new Error('Instagram: Media container processing timed out.');
    }
}

/**
 * Publishes a finished media container.
 * @param {string} containerId - The ID of the finished media container.
 * @returns {Promise<object>} The API response.
 */
async function publishMediaContainer(containerId) {
    console.log(`Instagram: Publishing container ${containerId}...`);
    const url = `${BASE_URL}/${INSTAGRAM_ACCOUNT_ID}/media_publish?creation_id=${containerId}&access_token=${INSTAGRAM_ACCESS_TOKEN}`;
    const response = await axios.post(url);
    return response.data;
}

/**
 * Publishes content to Instagram.
 * @param {object} igData - The data from the Instagram tab.
 * @param {object} fileInfo - The file object.
 * @returns {Promise<object>} The result from the Instagram API.
 */
async function publishToInstagram(igData, fileInfo) {
    checkCredentials();
    const { instagram_caption, instagram_post_type } = igData;

    // The Instagram API does not support publishing stories via this method for regular posts.
    // Story publishing is more complex. For now, we'll focus on feed posts.
    if (instagram_post_type === 'story') {
        throw new Error("Instagram Story publishing is not yet supported in this version.");
    }

    try {
        // Step 1: Create a container for the media.
        const containerId = await createMediaContainer(fileInfo, instagram_caption);

        // Step 2: Check the container's status until it's ready.
        await checkContainerStatus(containerId);

        // Step 3: Publish the container.
        const result = await publishMediaContainer(containerId);
        console.log('Instagram: Successfully published post.');
        return result;

    } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        console.error('Error publishing to Instagram:', errorMessage);
        throw new Error(`Instagram API Error: ${errorMessage}`);
    }
}

module.exports = { publishToInstagram };
