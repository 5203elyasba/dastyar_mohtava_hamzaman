document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const uploadForm = document.getElementById('uploadForm');
    const submitBtn = document.getElementById('submitBtn');
    const statusArea = document.getElementById('statusArea');
    const mediaFileInput = document.getElementById('mediaFile');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const platformCheckboxes = document.querySelectorAll('input[name="platforms"]');
    const tabButtonsContainer = document.querySelector('.tab-buttons');
    const wpCategoriesContainer = document.getElementById('wpCategoriesContainer');
    const hiddenWpContentInput = document.getElementById('wp_content');

    // --- State Management ---
    let activeTabs = new Set();
    let quillEditor = null;
    let areCategoriesLoaded = false;

    // --- Quill.js Initialization ---
    function initializeQuillEditor() {
        if (!quillEditor) {
            quillEditor = new Quill('#wp_content_editor', {
                theme: 'snow',
                placeholder: 'متن کامل مقاله یا توضیحات محصول را اینجا بنویسید...',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'link'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'align': [] }],
                        ['clean']
                    ]
                }
            });
            // Update hidden input on text change
            quillEditor.on('text-change', () => {
                hiddenWpContentInput.value = quillEditor.root.innerHTML;
            });
        }
    }

    // --- Dynamic Category Loading ---
    async function loadWordPressCategories() {
        if (areCategoriesLoaded) return; // Load only once
        wpCategoriesContainer.innerHTML = '<p class="loading-text">در حال بارگذاری دسته‌بندی‌ها...</p>';
        try {
            const response = await fetch('/api/wordpress/categories');
            if (!response.ok) throw new Error('Failed to fetch categories.');

            const categories = await response.json();

            wpCategoriesContainer.innerHTML = ''; // Clear loading text
            if (categories.length === 0) {
                wpCategoriesContainer.innerHTML = '<p class="loading-text">دسته‌بندی‌ای پیدا نشد.</p>';
                return;
            }

            categories.forEach(category => {
                const div = document.createElement('div');
                div.className = 'checkbox-group';
                div.innerHTML = `
                    <input type="checkbox" id="wp_cat_${category.id}" name="wp_categories" value="${category.id}">
                    <label for="wp_cat_${category.id}">${category.name}</label>
                `;
                wpCategoriesContainer.appendChild(div);
            });
            areCategoriesLoaded = true;
        } catch (error) {
            console.error('Error loading categories:', error);
            wpCategoriesContainer.innerHTML = '<p class="loading-text" style="color: red;">خطا در بارگذاری دسته‌بندی‌ها.</p>';
        }
    }

    // --- Tab Management ---
    function switchTab(tabId) {
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        const tabButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        const tabContent = document.getElementById(tabId);
        if (tabButton && tabContent) {
            tabButton.classList.add('active');
            tabContent.classList.add('active');
            // Lazy load categories and initialize editor when WP tab is shown
            if (tabId === 'wordpressTab') {
                initializeQuillEditor();
                loadWordPressCategories();
            }
        }
    }

    function updateTabs() {
        const currentActiveTab = document.querySelector('.tab-button.active')?.dataset.tab;
        activeTabs.clear();
        platformCheckboxes.forEach(checkbox => {
            if (checkbox.checked) activeTabs.add(checkbox.dataset.tab);
        });

        tabButtonsContainer.innerHTML = '';
        document.querySelector('.tabs-fieldset').style.display = activeTabs.size > 0 ? 'block' : 'none';

        activeTabs.forEach(tabId => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'tab-button';
            button.textContent = document.querySelector(`label[for="${tabId.replace('Tab', '')}"]`).textContent;
            button.dataset.tab = tabId;
            button.addEventListener('click', () => switchTab(tabId));
            tabButtonsContainer.appendChild(button);
        });

        let tabToShow = currentActiveTab && activeTabs.has(currentActiveTab) ? currentActiveTab : [...activeTabs][0];
        if (tabToShow) switchTab(tabToShow);
    }

    // --- Form Data Aggregation ---
    function aggregateFormData() {
        const data = {
            platforms: [...activeTabs].map(id => id.replace('Tab', '')),
            common: {
                alt_text: document.getElementById('alt_text').value
            }
        };
        data.platforms.forEach(platform => {
            const tabId = `${platform}Tab`;
            data[platform] = {};
            const formElements = document.getElementById(tabId).querySelectorAll('input, textarea');
            formElements.forEach(el => {
                if (el.name) {
                    if (el.type === 'checkbox') {
                        if (el.checked) {
                            if (!data[platform][el.name]) data[platform][el.name] = [];
                            data[platform][el.name].push(el.value);
                        }
                    } else if (el.type === 'radio') {
                        if (el.checked) data[platform][el.name] = el.value;
                    } else {
                         if(el.name !== 'wp_content') data[platform][el.name] = el.value;
                    }
                }
            });
             if (platform === 'wordpress' && quillEditor) {
                data.wordpress.wp_content = quillEditor.root.innerHTML;
            }
        });
        return data;
    }

    // --- Main Submit Handler ---
    async function handleFormSubmit(e) {
        e.preventDefault();
        setLoading(true);

        const file = mediaFileInput.files[0];
        if (!file) {
            displayPublicationResults({ success: false, message: 'لطفاً یک فایل رسانه انتخاب کنید.' });
            setLoading(false);
            return;
        }

        const textData = aggregateFormData();
        if (textData.platforms.length === 0) {
            displayPublicationResults({ success: false, message: 'لطفاً حداقل یک پلتفرم را انتخاب کنید.' });
            setLoading(false);
            return;
        }

        const formData = new FormData();
        formData.append('mediaFile', file);
        formData.append('data', JSON.stringify(textData));

        const enableSchedulingCheckbox = document.getElementById('enableScheduling');
        const scheduleTimeInput = document.getElementById('scheduleTime');
        let endpoint = '/publish';
        let isScheduling = false;

        if (enableSchedulingCheckbox.checked) {
            if (!scheduleTimeInput.value) {
                displayPublicationResults({ success: false, message: 'لطفاً تاریخ و زمان زمان‌بندی را انتخاب کنید.' });
                setLoading(false);
                return;
            }
            endpoint = '/schedule';
            formData.append('scheduleTime', scheduleTimeInput.value);
            isScheduling = true;
        }

        try {
            const response = await fetch(endpoint, { method: 'POST', body: formData });
            const result = await response.json();
            displayPublicationResults(result);
            if (result.success) {
                uploadForm.reset();
                if(quillEditor) quillEditor.setText('');
                platformCheckboxes.forEach(cb => cb.checked = false);
                enableSchedulingCheckbox.checked = false;
                scheduleTimeInput.style.display = 'none';
                updateTabs();
            }
        } catch (error) {
            console.error('Submission Error:', error);
            displayPublicationResults({ success: false, message: 'خطای ارتباط با سرور', details: [{ platform: 'Application', success: false, message: error.message }] });
        } finally {
            setLoading(false);
        }
    }

    // --- UI Helpers ---
    function displayPublicationResults(result) {
        let html = `<h3>${result.message}</h3>`;
        if (result.details && result.details.length > 0) {
            html += '<ul>';
            result.details.forEach(detail => {
                const status = detail.success ? `<span class="status-icon-success">✔</span> موفق` : `<span class="status-icon-error">✖</span> ناموفق`;
                html += `<li><strong>${detail.platform}:</strong> ${status}`;
                if (!detail.success) html += `<br><small class="error-message">${detail.message}</small>`;
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

    // --- Markdown Toolbar Logic ---
    function applyMarkdown(format) {
        const textarea = document.getElementById('telegram_caption');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        let replacement = '';

        if (format === 'bold') {
            replacement = `*${selectedText}*`;
        } else if (format === 'italic') {
            replacement = `_${selectedText}_`;
        }

        textarea.setRangeText(replacement, start, end, 'end');
        textarea.focus();
    }

    // --- Live Clock ---
    function updateLiveDateTime() {
        const dateTimeContainer = document.getElementById('live-datetime');
        if (!dateTimeContainer) return;
        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        const dateString = now.toLocaleDateString('fa-IR', dateOptions);
        const timeString = now.toLocaleTimeString('en-US', timeOptions); // Use en-US for consistent LTR numbers
        dateTimeContainer.textContent = `${dateString} - ${timeString}`;
    }

    // --- Initial Setup ---
    const enableSchedulingCheckbox = document.getElementById('enableScheduling');
    const scheduleTimeContainer = document.getElementById('scheduleTimeContainer');

    platformCheckboxes.forEach(checkbox => checkbox.addEventListener('change', updateTabs));
    mediaFileInput.addEventListener('change', () => {
        fileNameDisplay.textContent = mediaFileInput.files.length > 0 ? `فایل: ${mediaFileInput.files[0].name}` : '';
    });
    uploadForm.addEventListener('submit', handleFormSubmit);

    document.querySelectorAll('.toolbar-button').forEach(button => {
        button.addEventListener('click', (e) => {
            applyMarkdown(e.currentTarget.dataset.format);
        });
    });

    enableSchedulingCheckbox.addEventListener('change', () => {
        scheduleTimeContainer.style.display = enableSchedulingCheckbox.checked ? 'block' : 'none';
    });

    // Initial call to set up UI state
    updateTabs();
    // Initial call and start interval for the live clock
    updateLiveDateTime();
    setInterval(updateLiveDateTime, 1000);
});
