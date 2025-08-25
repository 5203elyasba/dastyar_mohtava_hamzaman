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
 * Publishes content to WordPress as either a blog post or a WooCommerce product.
 * @param {object} data - The data object containing all necessary information.
 * @param {string} data.title - The title of the post/product.
 * @param {string} data.caption - The content/description.
 * @param {object} data.file - The file object from Multer.
 * @param {string} data.wpPostType - The type of post ('post' or 'product').
 * @param {string} data.wpStatus - The status for the post ('draft' or 'publish').
 * @returns {Promise<object>} A promise that resolves with the result from the WordPress API.
 */
async function publishToWordPress({ title, caption, file, wpPostType, wpStatus }) {
    console.log(`Preparing to publish to WordPress as a '${wpPostType}'...`);

    if (!WORDPRESS_URL) {
        throw new Error("WORDPRESS_URL is not defined in .env file.");
    }

    // Step 1: Upload the media file and get its ID.
    const mediaId = await uploadMedia(file, title);

    // Step 2: Create the post or product and associate the media with it.
    let postEndpoint;
    let postData;

    if (wpPostType === 'post') {
        postEndpoint = `${WORDPRESS_URL}/wp-json/wp/v2/posts`;
        postData = {
            title: title,
            content: caption,
            status: wpStatus, // 'draft' or 'publish'
            featured_media: mediaId, // Associate the uploaded media
        };
    } else if (wpPostType === 'product') {
        // WooCommerce API endpoint
        postEndpoint = `${WORDPRESS_URL}/wp-json/wc/v3/products`;
        postData = {
            name: title,
            description: caption,
            status: 'draft', // WooCommerce products are created as draft by default for safety.
            images: [
                { id: mediaId } // Associate the uploaded media
            ],
            // NOTE: More fields like 'regular_price', 'sku', etc., can be added here in the future.
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
