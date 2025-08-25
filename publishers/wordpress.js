const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- WordPress Configuration ---
const WORDPRESS_URL = (process.env.WORDPRESS_URL || '').replace(/\/$/, "");
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

// --- Helper function for Authentication ---
const getAuthHeader = () => {
    if (!WORDPRESS_USERNAME || !WORDPRESS_APP_PASSWORD) {
        throw new Error("WordPress credentials are not defined in .env file.");
    }
    const credentials = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
    return `Basic ${credentials}`;
};

/**
 * Uploads a media file to the WordPress Media Library with Alt Text.
 * @param {object} file - The file object from Multer.
 * @param {string} alt_text - The alt text for the image.
 * @returns {Promise<number>} The ID of the uploaded media item.
 */
async function uploadMedia(file, alt_text) {
    console.log('Uploading media to WordPress...');
    const mediaEndpoint = `${WORDPRESS_URL}/wp-json/wp/v2/media`;
    const fileStream = fs.createReadStream(file.path);

    try {
        // First, upload the file itself
        const response = await axios.post(mediaEndpoint, fileStream, {
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': file.mimetype,
                'Content-Disposition': `attachment; filename="${path.basename(file.originalname)}"`
            }
        });

        const mediaId = response.data.id;
        console.log(`Media uploaded successfully. Media ID: ${mediaId}`);

        // If alt_text is provided, make a second request to update the media item with it.
        if (alt_text) {
            console.log(`Adding alt text to media item ${mediaId}...`);
            await axios.post(`${mediaEndpoint}/${mediaId}`, { alt_text }, {
                headers: { 'Authorization': getAuthHeader() }
            });
        }

        return mediaId;
    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        console.error('WordPress Media Upload Error:', errorMessage);
        throw new Error(`WordPress Media Upload Failed: ${errorMessage}`);
    }
}

/**
 * Publishes a blog post to WordPress.
 * @param {object} wpData - The data object from the WordPress tab.
 * @param {object} commonData - The common data object with alt_text.
 * @param {object} file - The uploaded file object from Multer.
 * @returns {Promise<object>} A promise that resolves with the result from the WordPress API.
 */
async function publishToWordPress(wpData, commonData, file) {
    const { wp_title, wp_content, wp_excerpt, wp_categories, wpStatus } = wpData;
    const { alt_text } = commonData;
    console.log(`Preparing to publish blog post to WordPress...`);

    if (!WORDPRESS_URL) throw new Error("WORDPRESS_URL is not defined in .env file.");

    // Step 1: Upload the media file with its alt text.
    const mediaId = await uploadMedia(file, alt_text);

    // Step 2: Create the blog post.
    const postEndpoint = `${WORDPRESS_URL}/wp-json/wp/v2/posts`;
    const postData = {
        title: wp_title,
        content: wp_content,
        excerpt: wp_excerpt,
        status: wpStatus,
        featured_media: mediaId,
        categories: wp_categories || [], // Pass the array of category IDs
    };

    console.log(`Creating blog post on WordPress...`);
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
        console.error(`WordPress Post Creation Error:`, errorMessage);
        throw new Error(`WordPress Post Creation Failed: ${errorMessage}`);
    }
}

module.exports = { publishToWordPress };
