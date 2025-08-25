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
    const { body: data, file } = req;
    const platforms = Array.isArray(data.platforms) ? data.platforms : [data.platforms];

    // --- Input Validation ---
    if (!file) {
        return res.status(400).json({ success: false, message: "No media file was uploaded." });
    }
    if (!data.caption || !data.title) {
        return res.status(400).json({ success: false, message: "Title and Caption are required." });
    }
    if (!platforms || platforms.length === 0) {
        return res.status(400).json({ success: false, message: "At least one platform must be selected." });
    }

    // --- Platform Dispatcher ---
    const platformTasks = [];

    // For each selected platform, create a task object with a name and the promise.
    if (platforms.includes('telegram')) {
        platformTasks.push({
            name: 'telegram',
            task: publishToTelegram({ title: data.title, caption: data.caption, file })
        });
    }
    if (platforms.includes('wordpress')) {
        platformTasks.push({
            name: 'wordpress',
            task: publishToWordPress({ ...data, file })
        });
    }

    // FUTURE-PROOFING: To add a new platform, just add another task to the array.
    // if (platforms.includes('instagram')) {
    //     platformTasks.push({ name: 'instagram', task: publishToInstagram({ ...data, file }) });
    // }

    try {
        // Extract the promises to run them concurrently.
        const promises = platformTasks.map(p => p.task);
        const results = await Promise.allSettled(promises);

        // Process results, mapping them back to their platform name for a clear response.
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
            ? "Content published successfully to all selected platforms!"
            : "Completed with some errors.";

        res.status(allSucceeded ? 200 : 500).json({
            success: allSucceeded,
            message: finalMessage,
            details: outcomes
        });

    } catch (error) {
        // This would catch errors in the Promise.allSettled logic itself, which is unlikely.
        console.error("An unexpected error occurred in the dispatcher:", error);
        res.status(500).json({ success: false, message: "An unexpected server error occurred." });
    } finally {
        // --- Cleanup ---
        // Always delete the temporary file from the 'uploads/' directory.
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
