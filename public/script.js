document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const uploadForm = document.getElementById('uploadForm');
    const submitBtn = document.getElementById('submitBtn');
    const statusArea = document.getElementById('statusArea');
    const mediaFileInput = document.getElementById('mediaFile');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const platformCheckboxes = document.querySelectorAll('input[name="platforms"]');
    const tabButtonsContainer = document.querySelector('.tab-buttons');
    const tabContentContainer = document.querySelector('.tab-content-container');

    // --- State Management ---
    let activeTabs = new Set();

    // --- Functions ---

    /**
     * Switches the view to the specified tab.
     * @param {string} tabId - The ID of the tab content to show.
     */
    function switchTab(tabId) {
        // Deactivate all tab buttons and content
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Activate the selected tab and its content
        const tabButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        const tabContent = document.getElementById(tabId);
        if (tabButton && tabContent) {
            tabButton.classList.add('active');
            tabContent.classList.add('active');
        }
    }

    /**
     * Updates the visible tabs based on the selected platform checkboxes.
     */
    function updateTabs() {
        const previouslyActiveTabs = new Set(activeTabs);
        activeTabs.clear();

        // Determine which tabs should be active
        platformCheckboxes.forEach(checkbox => {
            if (checkbox.checked) {
                activeTabs.add(checkbox.dataset.tab);
            }
        });

        // Clear existing buttons
        tabButtonsContainer.innerHTML = '';

        // Hide all content panes
        document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');

        if (activeTabs.size === 0) {
            // Hide the container if no tabs are selected
            document.querySelector('.tabs-fieldset').style.display = 'none';
            return;
        }

        document.querySelector('.tabs-fieldset').style.display = 'block';

        // Create buttons for active tabs
        activeTabs.forEach(tabId => {
            const platformCheckbox = document.querySelector(`input[data-tab="${tabId}"]`);
            const platformName = platformCheckbox.labels[0].textContent;

            const button = document.createElement('button');
            button.type = 'button'; // Prevent form submission
            button.className = 'tab-button';
            button.textContent = platformName;
            button.dataset.tab = tabId;
            button.addEventListener('click', () => switchTab(tabId));

            tabButtonsContainer.appendChild(button);
            document.getElementById(tabId).style.display = 'block';
        });

        // Determine which tab to show
        let tabToShow = [...activeTabs][0]; // Default to the first active tab
        // Try to keep the previously active tab if it's still selected
        const currentActiveButton = document.querySelector('.tab-button.active');
        if (currentActiveButton && activeTabs.has(currentActiveButton.dataset.tab)) {
            tabToShow = currentActiveButton.dataset.tab;
        }

        if (tabToShow) {
            switchTab(tabToShow);
        }
    }

    /**
     * Gathers data from all active tabs and constructs a single data object.
     * @returns {object} The aggregated data from all forms.
     */
    function aggregateFormData() {
        const data = {
            platforms: []
        };
        activeTabs.forEach(tabId => {
            const platformName = tabId.replace('Tab', '');
            data.platforms.push(platformName);
            data[platformName] = {};
            const formElements = document.getElementById(tabId).querySelectorAll('input, textarea');
            formElements.forEach(el => {
                // Use the element's name attribute as the key
                if (el.name) {
                    if (el.type === 'radio') {
                        if (el.checked) {
                            data[platformName][el.name] = el.value;
                        }
                    } else {
                        data[platformName][el.name] = el.value;
                    }
                }
            });
        });
        return data;
    }

    /**
     * Handles the main form submission.
     */
    async function handleFormSubmit(e) {
        e.preventDefault();
        setLoading(true);

        const file = mediaFileInput.files[0];
        if (!file) {
            showStatus({ message: 'لطفاً یک فایل رسانه انتخاب کنید.', success: false });
            setLoading(false);
            return;
        }

        const textData = aggregateFormData();
        if (textData.platforms.length === 0) {
            showStatus({ message: 'لطفاً حداقل یک پلتفرم را انتخاب کنید.', success: false });
            setLoading(false);
            return;
        }

        const formData = new FormData();
        formData.append('mediaFile', file);
        // Append the structured text data as a JSON string
        formData.append('data', JSON.stringify(textData));

        try {
            const response = await fetch('/publish', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            displayPublicationResults(result);
            if (result.success) {
                // Full reset on success
                uploadForm.reset();
                platformCheckboxes.forEach(cb => cb.checked = false);
                updateTabs();
            }
        } catch (error) {
            console.error('Submission Error:', error);
            displayPublicationResults({ success: false, message: 'خطای ارتباط با سرور', details: [{ platform: 'Application', success: false, message: error.message }] });
        } finally {
            setLoading(false);
        }
    }

    /**
     * Renders detailed results in the status area.
     * @param {object} result - The server response object.
     */
    function displayPublicationResults(result) {
        let html = `<h3>${result.message}</h3>`;
        if (result.details && result.details.length > 0) {
            html += '<ul>';
            result.details.forEach(detail => {
                const status = detail.success ? `<span class="status-icon-success">✔</span> موفق` : `<span class="status-icon-error">✖</span> ناموفق`;
                html += `<li><strong>${detail.platform}:</strong> ${status}`;
                if (!detail.success) {
                    html += `<br><small class="error-message">${detail.message}</small>`;
                }
                html += '</li>';
            });
            html += '</ul>';
        }
        statusArea.innerHTML = html;
        statusArea.className = `status-area ${result.success ? 'success' : 'error'}`;
    }

    function setLoading(isLoading) {
        const btnText = submitBtn.querySelector('.btn-text');
        const spinner = submitBtn.querySelector('.spinner');
        submitBtn.disabled = isLoading;
        btnText.style.display = isLoading ? 'none' : 'inline-block';
        spinner.style.display = isLoading ? 'inline-block' : 'none';
    }

    // --- Initial Setup ---
    platformCheckboxes.forEach(checkbox => checkbox.addEventListener('change', updateTabs));
    mediaFileInput.addEventListener('change', () => {
        fileNameDisplay.textContent = mediaFileInput.files.length > 0 ? `فایل: ${mediaFileInput.files[0].name}` : '';
    });
    uploadForm.addEventListener('submit', handleFormSubmit);

    // Initial call to set up the UI state
    updateTabs();
});
