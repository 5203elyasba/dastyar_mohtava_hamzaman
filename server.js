// Import necessary modules
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Load environment variables from .env file
dotenv.config();

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// --- Initializations ---
const app = express();
// Using 'uploads/' directory for temporary file storage
const upload = multer({ dest: 'uploads/' });

// --- Middlewares ---
// Enable Cross-Origin Resource Sharing for all routes
app.use(cors());
// Serve static files (index.html, style.css, script.js) from the 'public' directory
app.use(express.static('public'));
// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true }));
// Parse JSON bodies (as sent by API clients)
app.use(express.json());


// --- Validation ---
// Check for essential environment variables on startup
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("FATAL ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be defined in the .env file.");
    process.exit(1); // Exit the process with an error code
}


// --- Core Logic: Publisher Modules ---

/**
 * Publishes content to Telegram.
 * @param {string} caption - The text content for the post.
 * @param {object} file - The uploaded file object from Multer.
 * @returns {Promise<object>} A promise that resolves with the result from the Telegram API.
 */
async function publishToTelegram(caption, file) {
    console.log('Preparing to publish to Telegram...');

    const fileStream = fs.createReadStream(file.path);
    const fileType = file.mimetype.startsWith('image/') ? 'photo' : 'video';
    const telegramApiMethod = fileType === 'photo' ? 'sendPhoto' : 'sendVideo';
    const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${telegramApiMethod}`;

    // Create a form data object to send the file and caption
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('caption', caption);
    // The third argument to append is the filename, which is important for Telegram
    formData.append(fileType, fileStream, file.originalname);

    try {
        console.log(`Sending ${fileType} to Telegram...`);
        const response = await axios.post(apiUrl, formData, {
            headers: formData.getHeaders()
        });
        console.log('Successfully published to Telegram.');
        return response.data;
    } catch (error) {
        console.error('Error publishing to Telegram:', error.response ? error.response.data : error.message);
        // Re-throw a more specific error for the endpoint handler
        throw new Error(`Telegram API Error: ${error.response ? error.response.data.description : error.message}`);
    }
}


// --- API Endpoint ---

/**
 * @route POST /publish
 * @description Receives content from the frontend, and dispatches it to the selected platforms.
 */
app.post('/publish', upload.single('mediaFile'), async (req, res) => {
    const { caption, platforms } = req.body;
    const file = req.file;

    // --- Input Validation ---
    if (!file) {
        return res.status(400).json({ success: false, message: "No media file was uploaded." });
    }
    if (!caption) {
        return res.status(400).json({ success: false, message: "Caption is required." });
    }
    if (!platforms || platforms.length === 0) {
        return res.status(400).json({ success: false, message: "At least one platform must be selected." });
    }

    // --- Platform Dispatcher ---
    // This is designed for future scalability.
    // For now, it only handles Telegram.
    let results = [];
    let errors = [];

    // SUGGESTION FOR FUTURE: A queue system could be implemented here.
    // Instead of publishing immediately, jobs could be pushed to an array (queue)
    // and processed sequentially to handle rate limits gracefully.

    if (platforms.includes('telegram')) {
        try {
            // FUTURE-PROOFING: An AI enhancement step could be added here.
            // const enhancedCaption = await enhanceWithAI(caption);
            // await publishToTelegram(enhancedCaption, file);

            const result = await publishToTelegram(caption, file);
            results.push({ platform: 'telegram', success: true, data: result });
        } catch (error) {
            errors.push({ platform: 'telegram', success: false, message: error.message });
        }
    }

    // --- Cleanup ---
    // Always delete the temporary file from the 'uploads/' directory.
    fs.unlink(file.path, (err) => {
        if (err) {
            console.error("Error deleting temporary file:", err);
            // This error is not sent to the client, as it's a server-side cleanup issue.
        } else {
            console.log("Temporary file deleted successfully:", file.path);
        }
    });

    // --- Final Response ---
    if (errors.length > 0) {
        // If there were any errors, send a failure response with details
        const errorMessage = errors.map(e => e.message).join(', ');
        return res.status(500).json({ success: false, message: `Failed to publish to some platforms: ${errorMessage}`, details: errors });
    } else {
        // If all platforms succeeded
        return res.status(200).json({ success: true, message: "Content published successfully to all selected platforms!", details: results });
    }
});


// --- Server Initialization ---
app.listen(PORT, () => {
    console.log(`Tahrirchi Content Assistant server is running on http://localhost:${PORT}`);
    console.log("Serving frontend from the 'public' directory.");
});
