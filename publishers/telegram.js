const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// --- Telegram Configuration ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Publishes content to Telegram using data from its specific tab.
 * @param {object} telegramData - The data object from the Telegram tab.
 * @param {string} telegramData.telegram_caption - The caption for the post.
 * @param {object} file - The uploaded file object from Multer.
 * @returns {Promise<object>} A promise that resolves with the result from the Telegram API.
 */
async function publishToTelegram(telegramData, file) {
    const { telegram_caption } = telegramData;
    console.log('Preparing to publish to Telegram...');

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        throw new Error("Telegram bot token or chat ID is not defined in .env file.");
    }

    const fileStream = fs.createReadStream(file.path);
    const fileType = file.mimetype.startsWith('image/') ? 'photo' : 'video';
    const telegramApiMethod = fileType === 'photo' ? 'sendPhoto' : 'sendVideo';
    const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${telegramApiMethod}`;

    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('caption', telegram_caption);
    // Note: We are not setting parse_mode anymore, to allow the user to use raw text or their own Markdown/HTML.
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
