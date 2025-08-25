const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- WordPress Configuration ---
// Normalize the URL by removing any trailing slash
const WORDPRESS_URL = (process.env.WORDPRESS_URL || '').replace(/\/$/, "");
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

// --- Helper function for Authentication ---
const getAuthHeader = () => {
    if (!WORDPRESS_USERNAME || !WORDPRESS_APP_PASSWORD) {
        throw new Error("WordPress username or application password is not defined in .env file.");
    }
    // WordPress Application Passwords use Basic Authentication.
    const credentials = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
    return `Basic ${credentials}`;
};

/**
 * Uploads a media file to the WordPress Media Library.
 * @param {object} file - The file object from Multer.
 * @param {string} title - The title for the media item.
 * @returns {Promise<number>} The ID of the uploaded media item.
 */
async function uploadMedia(file, title) {
    console.log('Uploading media to WordPress...');
    const mediaEndpoint = `${WORDPRESS_URL}/wp-json/wp/v2/media`;
    const fileStream = fs.createReadStream(file.path);

    try {
        const response = await axios.post(mediaEndpoint, fileStream, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': file.mimetype,
                'Content-Disposition': `attachment; filename="${path.basename(file.originalname)}"`
            }
        });
        console.log(`Media uploaded successfully. Media ID: ${response.data.id}`);
        return response.data.id; // Return the new Media ID
    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        console.error('WordPress Media Upload Error:', errorMessage);
        throw new Error(`WordPress Media Upload Failed: ${errorMessage}`);
    }
}

/**
 * Publishes content to WordPress using data from its specific tab.
 * @param {object} wpData - The data object from the WordPress tab.
 * @param {object} file - The uploaded file object from Multer.
 * @returns {Promise<object>} A promise that resolves with the result from the WordPress API.
 */
async function publishToWordPress(wpData, file) {
    const { wp_title, wp_content, wp_excerpt, wp_tags, wpPostType, wpStatus } = wpData;
    console.log(`Preparing to publish to WordPress as a '${wpPostType}'...`);

    if (!WORDPRESS_URL) {
        throw new Error("WORDPRESS_URL is not defined in .env file.");
    }

    // Step 1: Upload the media file and get its ID.
    const mediaId = await uploadMedia(file, wp_title);

    // Step 2: Create the post or product and associate the media with it.
    let postEndpoint;
    let postData;

    if (wpPostType === 'post') {
        postEndpoint = `${WORDPRESS_URL}/wp-json/wp/v2/posts`;
        postData = {
            title: wp_title,
            content: wp_content,
            excerpt: wp_excerpt,
            status: wpStatus, // 'draft' or 'publish'
            featured_media: mediaId,
            // FUTURE-PROOFING: Handling tags requires finding/creating tag IDs.
            // This is a multi-step process and is omitted for now.
            // A future implementation would look like:
            // const tagIds = await getTagIds(wp_tags);
            // tags: tagIds,
        };
    } else if (wpPostType === 'product') {
        postEndpoint = `${WORDPRESS_URL}/wp-json/wc/v3/products`;
        postData = {
            name: wp_title,
            description: wp_content,
            short_description: wp_excerpt,
            status: 'draft', // Products are always created as draft for safety.
            images: [{ id: mediaId }],
        };
    } else {
        throw new Error(`Unsupported WordPress post type: ${wpPostType}`);
    }

    console.log(`Creating ${wpPostType} on WordPress...`);
    try {
        const response = await axios.post(postEndpoint, postData, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json'
            }
        });
        console.log(`Successfully published to WordPress. Post Link: ${response.data.link}`);
        return response.data;
    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        console.error(`WordPress ${wpPostType} Creation Error:`, errorMessage);
        throw new Error(`WordPress Post Creation Failed: ${errorMessage}`);
    }
}

module.exports = { publishToWordPress };
