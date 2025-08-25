document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const uploadForm = document.getElementById('uploadForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');
    const statusArea = document.getElementById('statusArea');
    const mediaFileInput = document.getElementById('mediaFile');
    const fileNameDisplay = document.getElementById('fileNameDisplay');

    // WordPress specific elements
    const wordpressCheckbox = document.getElementById('wordpress');
    const wordpressOptionsContainer = document.getElementById('wordpressOptions');
    const wpPostTypeRadios = document.querySelectorAll('input[name="wpPostType"]');
    const wpStatusContainer = document.getElementById('wpStatusContainer');


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

    // Toggle WordPress options visibility
    wordpressCheckbox.addEventListener('change', () => {
        wordpressOptionsContainer.style.display = wordpressCheckbox.checked ? 'block' : 'none';
    });

    // Toggle WordPress post status visibility based on post type
    wpPostTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'post') {
                wpStatusContainer.style.display = 'block';
            } else {
                wpStatusContainer.style.display = 'none';
            }
        });
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

            const result = await response.json();

            // Display detailed results from the server
            displayPublicationResults(result);

            // If the overall operation was a success, reset the form.
            if (result.success) {
                uploadForm.reset();
                fileNameDisplay.textContent = '';
                wordpressOptionsContainer.style.display = 'none';
            }

        } catch (error) {
            // --- UI State: Error ---
            // This catches network errors or issues with parsing the response.
            console.error('Submission Error:', error);
            showStatus(`<p><strong>خطای ارتباط با سرور:</strong> ${error.message}</p>`, 'error');
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
     * Displays a status message to the user, accepting HTML content.
     * @param {string} htmlContent - The HTML content to display.
     * @param {'success' | 'error'} type - The type of message.
     */
    function showStatus(htmlContent, type) {
        statusArea.innerHTML = htmlContent;
        statusArea.className = `status-area ${type}`; // Applies .success or .error class
    }

    /**
     * Renders the detailed results from the server's response.
     * @param {object} result - The JSON response from the server.
     */
    function displayPublicationResults(result) {
        let html = `<h3>${result.message}</h3>`;
        if (result.details && result.details.length > 0) {
            html += '<ul>';
            result.details.forEach(detail => {
                const status = detail.success
                    ? `<span class="status-icon-success">✔</span> موفق`
                    : `<span class="status-icon-error">✖</span> ناموفق`;

                html += `<li><strong>${detail.platform}:</strong> ${status}`;
                if (!detail.success) {
                    html += `<br><small class="error-message">${detail.message}</small>`;
                }
                html += '</li>';
            });
            html += '</ul>';
        }
        showStatus(html, result.success ? 'success' : 'error');
    }

    /**
     * Clears the status message area.
     */
    function clearStatus() {
        statusArea.textContent = '';
        statusArea.className = 'status-area';
    }

});
