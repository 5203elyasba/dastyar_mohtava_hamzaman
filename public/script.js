document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const uploadForm = document.getElementById('uploadForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');
    const statusArea = document.getElementById('statusArea');
    const mediaFileInput = document.getElementById('mediaFile');
    const fileNameDisplay = document.getElementById('fileNameDisplay');

    const MAX_FILE_SIZE_MB = 25;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    // --- Event Listeners ---

    // Listen for form submission
    uploadForm.addEventListener('submit', handleFormSubmit);

    // Listen for file selection to display its name
    mediaFileInput.addEventListener('change', () => {
        if (mediaFileInput.files.length > 0) {
            const fileName = mediaFileInput.files[0].name;
            fileNameDisplay.textContent = `فایل انتخاب شده: ${fileName}`;
        } else {
            fileNameDisplay.textContent = '';
        }
    });


    // --- Main Handler Function ---

    /**
     * Handles the form submission process.
     * @param {Event} e - The form submission event.
     */
    async function handleFormSubmit(e) {
        e.preventDefault(); // Prevent the default browser form submission

        // --- Client-Side Validation ---
        const file = mediaFileInput.files[0];
        if (!file) {
            showStatus('لطفاً یک فایل رسانه انتخاب کنید.', 'error');
            return;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            showStatus(`حجم فایل نباید بیشتر از ${MAX_FILE_SIZE_MB} مگابایت باشد.`, 'error');
            return;
        }

        // --- UI State: Start Loading ---
        setLoading(true);
        clearStatus();

        // --- Prepare and Send Data ---
        const formData = new FormData(uploadForm);

        try {
            const response = await fetch('/publish', {
                method: 'POST',
                body: formData,
                // Note: 'Content-Type' header is not needed.
                // The browser automatically sets it to 'multipart/form-data' with the correct boundary.
            });

            const result = await response.json();

            if (!response.ok) {
                // If response is not 2xx, throw an error to be caught by the catch block
                throw new Error(result.message || 'خطایی در سرور رخ داد.');
            }

            // --- UI State: Success ---
            showStatus(result.message, 'success');
            uploadForm.reset(); // Clear the form fields
            fileNameDisplay.textContent = ''; // Clear file name display

        } catch (error) {
            // --- UI State: Error ---
            console.error('Submission Error:', error);
            showStatus(error.message, 'error');
        } finally {
            // --- UI State: End Loading ---
            setLoading(false);
        }
    }


    // --- Helper Functions ---

    /**
     * Toggles the loading state of the submit button.
     * @param {boolean} isLoading - Whether to show the loading state.
     */
    function setLoading(isLoading) {
        if (isLoading) {
            submitBtn.disabled = true;
            btnText.style.display = 'none';
            spinner.style.display = 'inline-block';
        } else {
            submitBtn.disabled = false;
            btnText.style.display = 'inline-block';
            spinner.style.display = 'none';
        }
    }

    /**
     * Displays a status message to the user.
     * @param {string} message - The message to display.
     * @param {'success' | 'error'} type - The type of message.
     */
    function showStatus(message, type) {
        statusArea.textContent = message;
        statusArea.className = `status-area ${type}`; // Applies .success or .error class
    }

    /**
     * Clears the status message area.
     */
    function clearStatus() {
        statusArea.textContent = '';
        statusArea.className = 'status-area';
    }

});
