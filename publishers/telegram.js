const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// --- Telegram Configuration ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Publishes content to Telegram.
 * @param {object} data - The data object containing all necessary information.
 * @param {string} data.title - The title of the post.
 * @param {string} data.caption - The text content for the post.
 * @param {object} data.file - The uploaded file object from Multer.
 * @returns {Promise<object>} A promise that resolves with the result from the Telegram API.
 */
async function publishToTelegram({ title, caption, file }) {
    console.log('Preparing to publish to Telegram...');

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        throw new Error("Telegram bot token or chat ID is not defined in .env file.");
    }

    // --- Create Enhanced Caption ---
    // Prepend the title in bold Markdown, followed by the main caption.
    const enhancedCaption = `*${title}*\n\n${caption}`;

    const fileStream = fs.createReadStream(file.path);
    const fileType = file.mimetype.startsWith('image/') ? 'photo' : 'video';
    const telegramApiMethod = fileType === 'photo' ? 'sendPhoto' : 'sendVideo';
    const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${telegramApiMethod}`;

    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('caption', enhancedCaption);
    formData.append('parse_mode', 'Markdown'); // Important: Tell Telegram to parse Markdown
    formData.append(fileType, fileStream, file.originalname);

    try {
        console.log(`Sending ${fileType} to Telegram...`);
        const response = await axios.post(apiUrl, formData, {
            headers: formData.getHeaders()
        });
        console.log('Successfully published to Telegram.');
        return response.data;
    } catch (error) {
        const errorMessage = error.response?.data?.description || error.message;
        console.error('Error publishing to Telegram:', errorMessage);
        throw new Error(`Telegram API Error: ${errorMessage}`);
    }
}

module.exports = { publishToTelegram };
