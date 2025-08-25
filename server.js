// --- Import Core Modules ---
const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');

// --- Load Environment Variables ---
dotenv.config();

// --- Import Publisher Modules ---
const { publishToTelegram } = require('./publishers/telegram');
const { publishToWordPress } = require('./publishers/wordpress');

// --- Configuration & Initializations ---
const PORT = process.env.PORT || 3000;
const app = express();
const upload = multer({ dest: 'uploads/' });

// --- Middlewares ---
app.use(cors());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- API Endpoint ---

/**
 * @route POST /publish
 * @description Receives content and dispatches it to selected platforms.
 */
app.post('/publish', upload.single('mediaFile'), async (req, res) => {
    const { file } = req;

    // --- Input Validation ---
    if (!file) {
        return res.status(400).json({ success: false, message: "No media file was uploaded." });
    }
    if (!req.body.data) {
         return res.status(400).json({ success: false, message: "No text data was provided." });
    }

    // The frontend sends all text data as a single JSON string.
    const payload = JSON.parse(req.body.data);
    const { platforms } = payload;

    if (!platforms || platforms.length === 0) {
        return res.status(400).json({ success: false, message: "At least one platform must be selected." });
    }

    // --- Platform Dispatcher ---
    const platformTasks = [];

    // For each selected platform, create a task object with its name and the promise.
    // The specific data for each platform is passed from the payload.
    if (platforms.includes('telegram')) {
        platformTasks.push({
            name: 'telegram',
            task: publishToTelegram(payload.telegram, file)
        });
    }
    if (platforms.includes('wordpress')) {
        platformTasks.push({
            name: 'wordpress',
            task: publishToWordPress(payload.wordpress, file)
        });
    }

    try {
        const promises = platformTasks.map(p => p.task);
        const results = await Promise.allSettled(promises);

        const outcomes = results.map((result, index) => {
            const platformName = platformTasks[index].name;
            if (result.status === 'fulfilled') {
                return { platform: platformName, success: true, response: result.value };
            } else {
                return { platform: platformName, success: false, message: result.reason.message };
            }
        });

        const allSucceeded = outcomes.every(o => o.success);
        const finalMessage = allSucceeded
            ? "محتوا با موفقیت در تمام پلتفرم‌ها منتشر شد!"
            : "عملیات با چند خطا به پایان رسید.";

        res.status(200).json({ // Always send 200, let the frontend decide based on the 'success' flag
            success: allSucceeded,
            message: finalMessage,
            details: outcomes
        });

    } catch (error) {
        console.error("An unexpected error occurred in the dispatcher:", error);
        res.status(500).json({ success: false, message: "یک خطای پیش‌بینی نشده در سرور رخ داد." });
    } finally {
        fs.unlink(file.path, (err) => {
            if (err) console.error("Error deleting temporary file:", err);
            else console.log("Temporary file deleted successfully:", file.path);
        });
    }
});

// --- Server Initialization ---
app.listen(PORT, () => {
    console.log(`Tahrirchi Content Assistant server is running on http://localhost:${PORT}`);
});
