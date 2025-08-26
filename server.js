// --- Import Core Modules ---
const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs/promises'); // Use promises version for async/await
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

// --- Load Environment Variables ---
dotenv.config();

// --- Import Publisher Modules ---
const { publishToTelegram } = require('./publishers/telegram');
const { publishToWordPress } = require('./publishers/wordpress');
const { publishToInstagram } = require('./publishers/instagram');

// --- Configuration & Initializations ---
const PORT = process.env.PORT || 3000;
const JOBS_FILE_PATH = path.join(__dirname, 'jobs.json');
const SCHEDULED_MEDIA_DIR = path.join(__dirname, 'scheduled_media');
const app = express();
const upload = multer({ dest: 'uploads/' });

// --- Middlewares ---
app.use(cors());
app.use(express.static('public'));
app.use('/scheduled_media', express.static(SCHEDULED_MEDIA_DIR)); // Serve scheduled media if needed
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// --- Reusable Core Publishing Logic ---
/**
 * Executes the publishing tasks for a given job payload.
 * @param {object} payload - The job data.
 * @param {object} fileInfo - Information about the file to be published.
 */
async function executePublishing(payload, fileInfo) {
    const { platforms, common, telegram, wordpress, instagram } = payload;
    const platformTasks = [];

    if (platforms.includes('telegram')) {
        platformTasks.push({ name: 'telegram', task: publishToTelegram(telegram, fileInfo) });
    }
    if (platforms.includes('wordpress')) {
        platformTasks.push({ name: 'wordpress', task: publishToWordPress(wordpress, common, fileInfo) });
    }
    if (platforms.includes('instagram')) {
        platformTasks.push({ name: 'instagram', task: publishToInstagram(instagram, fileInfo) });
    }

    const results = await Promise.allSettled(platformTasks.map(p => p.task));

    // Map results to a detailed outcomes array, which is useful for both direct and scheduled publishing.
    const outcomes = results.map((result, index) => {
        const platformName = platformTasks[index].name;
        if (result.status === 'fulfilled') {
            return { platform: platformName, success: true, response: result.value };
        } else {
            return { platform: platformName, success: false, message: result.reason.message };
        }
    });

    console.log('Publishing outcomes:', outcomes);
    return outcomes;
}


// --- Scheduler Service ---
/**
 * Reads the jobs from the JSON file.
 * @returns {Promise<Array>} A promise that resolves with the array of jobs.
 */
async function readJobs() {
    try {
        const data = await fs.readFile(JOBS_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return []; // File doesn't exist, return empty array
        throw error;
    }
}

/**
 * Writes jobs to the JSON file.
 * @param {Array} jobs - The array of jobs to write.
 */
async function writeJobs(jobs) {
    await fs.writeFile(JOBS_FILE_PATH, JSON.stringify(jobs, null, 2));
}

/**
 * Checks for due jobs and executes them.
 */
async function checkAndRunScheduledJobs() {
    console.log('Scheduler: Checking for due jobs...');
    let jobs = await readJobs();
    const now = new Date().getTime();

    const dueJobs = jobs.filter(job => new Date(job.scheduleTime).getTime() <= now);
    if (dueJobs.length === 0) {
        console.log('Scheduler: No jobs are due.');
        return;
    }

    console.log(`Scheduler: Found ${dueJobs.length} due job(s).`);
    const remainingJobs = jobs.filter(job => new Date(job.scheduleTime).getTime() > now);

    // Process jobs one by one
    for (const job of dueJobs) {
        console.log(`Scheduler: Processing job ${job.id}...`);
        try {
            // The file object for publishers needs a `path` property.
            const fileInfoForPublishers = {
                path: job.mediaFilePath,
                mimetype: job.mediaFileMimeType,
                originalname: job.mediaFileOriginalName
            };
            await executePublishing(job.payload, fileInfoForPublishers);
            console.log(`Scheduler: Job ${job.id} processed successfully.`);
            // Clean up the media file after successful publishing
            await fs.unlink(job.mediaFilePath);
        } catch (error) {
            console.error(`Scheduler: Error processing job ${job.id}:`, error);
            // Optionally, move to a failed jobs file instead of just leaving it
            remainingJobs.push({ ...job, status: 'failed', error: error.message });
        }
    }

    await writeJobs(remainingJobs);
}

// --- API Endpoints ---

/**
 * @route GET /api/wordpress/categories
 */
app.get('/api/wordpress/categories', async (req, res) => {
    // ... (existing categories logic remains the same)
    const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = process.env;
    if (!WORDPRESS_URL || !WORDPRESS_USERNAME || !WORDPRESS_APP_PASSWORD) return res.status(500).json({ message: 'WordPress credentials not configured.' });
    const categoriesEndpoint = `${WORDPRESS_URL.replace(/\/$/, "")}/wp-json/wp/v2/categories?per_page=100`;
    try {
        const response = await axios.get(categoriesEndpoint, { auth: { username: WORDPRESS_USERNAME, password: WORDPRESS_APP_PASSWORD } });
        res.json(response.data.map(cat => ({ id: cat.id, name: cat.name })));
    } catch (error) {
        console.error("Error fetching WordPress categories:", error.response?.data?.message || error.message);
        res.status(500).json({ message: `Failed to fetch categories: ${error.response?.data?.message || error.message}` });
    }
});

/**
 * @route GET /api/jobs
 * @description Fetches the list of all scheduled jobs.
 */
app.get('/api/jobs', async (req, res) => {
    try {
        const jobs = await readJobs();
        res.json(jobs);
    } catch (error) {
        console.error("Error reading jobs file:", error);
        res.status(500).json({ message: "Failed to retrieve scheduled jobs." });
    }
});

/**
 * @route DELETE /api/jobs/:id
 * @description Deletes a specific scheduled job.
 */
app.delete('/api/jobs/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const jobs = await readJobs();
        const jobToDelete = jobs.find(job => job.id === id);

        if (!jobToDelete) {
            return res.status(404).json({ message: "Job not found." });
        }

        // Delete the associated media file
        await fs.unlink(jobToDelete.mediaFilePath).catch(err => {
            // Log the error but don't block the process if file is already gone
            console.error(`Could not delete media file for job ${id}:`, err.message);
        });

        // Filter out the deleted job and write the new array back to the file
        const remainingJobs = jobs.filter(job => job.id !== id);
        await writeJobs(remainingJobs);

        res.status(200).json({ success: true, message: "Scheduled job deleted successfully." });
    } catch (error) {
        console.error(`Error deleting job ${id}:`, error);
        res.status(500).json({ message: "Failed to delete scheduled job." });
    }
});

/**
 * @route POST /schedule
 * @description Receives content and a schedule time, and saves it for later publishing.
 */
app.post('/schedule', upload.single('mediaFile'), async (req, res) => {
    const { file } = req;
    if (!file || !req.body.data || !req.body.scheduleTime) {
        return res.status(400).json({ success: false, message: "File, data, and scheduleTime are required." });
    }

    try {
        // Move file to permanent storage
        const newFileName = `${Date.now()}-${path.basename(file.originalname)}`;
        const newFilePath = path.join(SCHEDULED_MEDIA_DIR, newFileName);
        await fs.rename(file.path, newFilePath);

        const jobs = await readJobs();
        const newJob = {
            id: crypto.randomUUID(),
            scheduleTime: req.body.scheduleTime,
            status: 'scheduled',
            mediaFilePath: newFilePath,
            mediaFileMimeType: file.mimetype,
            mediaFileOriginalName: file.originalname,
            payload: JSON.parse(req.body.data)
        };

        jobs.push(newJob);
        await writeJobs(jobs);

        res.status(201).json({ success: true, message: `پست با موفقیت برای تاریخ ${new Date(req.body.scheduleTime).toLocaleString('fa-IR')} زمان‌بندی شد!` });

    } catch (error) {
        console.error("Error scheduling post:", error);
        res.status(500).json({ success: false, message: "خطا در زمان‌بندی پست." });
    }
});


/**
 * @route POST /publish
 * @description Receives content and dispatches it for immediate publishing.
 */
app.post('/publish', upload.single('mediaFile'), async (req, res) => {
    const { file } = req;
    if (!file || !req.body.data) return res.status(400).json({ success: false, message: "File and data are required." });

    const payload = JSON.parse(req.body.data);

    try {
        const outcomes = await executePublishing(payload, file);
        const allSucceeded = outcomes.every(o => o.success);
        const finalMessage = allSucceeded
            ? "محتوا با موفقیت در تمام پلتفرم‌ها منتشر شد!"
            : "عملیات با چند خطا به پایان رسید.";

        res.status(200).json({
            success: allSucceeded,
            message: finalMessage,
            details: outcomes
        });
    } catch (error) {
        console.error("Error in immediate publishing:", error);
        res.status(500).json({ success: false, message: "خطا در انتشار فوری." });
    } finally {
        await fs.unlink(file.path).catch(err => console.error("Error deleting temp file:", err));
    }
});


// --- Server Initialization ---
app.listen(PORT, async () => {
    // Ensure the scheduled media directory exists
    await fs.mkdir(SCHEDULED_MEDIA_DIR, { recursive: true });
    console.log(`Tahrirchi Content Assistant server is running on http://localhost:${PORT}`);

    // Start the scheduler service
    console.log('Scheduler service started. Will check for jobs every minute.');
    setInterval(checkAndRunScheduledJobs, 60000); // 60,000 ms = 1 minute

    // Run once on startup after a short delay
    setTimeout(checkAndRunScheduledJobs, 5000); // 5 seconds after start
});
