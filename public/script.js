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
    const enableSchedulingCheckbox = document.getElementById('enableScheduling');
    const scheduleTimeContainer = document.getElementById('scheduleTimeContainer');
    const scheduleTimeInput = document.getElementById('scheduleTime');

    // --- State Management ---
    let activeTabs = new Set();
    let quillEditor = null;
    let areCategoriesLoaded = false;

    // --- Library Initializations ---
    function initializeQuillEditor() {
        if (quillEditor) return;
        quillEditor = new Quill('#wp_content_editor', {
            theme: 'snow',
            placeholder: 'متن کامل مقاله را اینجا بنویسید...',
            modules: { toolbar: [[{ 'header': [1, 2, false] }], ['bold', 'italic', 'link'], [{ 'list': 'ordered'}, { 'list': 'bullet' }]] }
        });
        quillEditor.on('text-change', () => { hiddenWpContentInput.value = quillEditor.root.innerHTML; });
    }

    function initializeJalaliDatePicker() {
        jalaliDatepicker.startWatch({
            selector: '.jalali-datepicker',
            time: true,
            hasSecond: false
        });
    }

    // --- Core Functions ---
    async function loadWordPressCategories() {
        if (areCategoriesLoaded) return;
        wpCategoriesContainer.innerHTML = '<p class="loading-text">در حال بارگذاری دسته‌بندی‌ها...</p>';
        try {
            const response = await fetch('/api/wordpress/categories');
            if (!response.ok) throw new Error('Failed to fetch categories.');
            const categories = await response.json();
            wpCategoriesContainer.innerHTML = '';
            if (categories.length === 0) {
                wpCategoriesContainer.innerHTML = '<p class="loading-text">دسته‌بندی‌ای پیدا نشد.</p>';
                return;
            }
            categories.forEach(category => {
                const div = document.createElement('div');
                div.className = 'checkbox-group';
                div.innerHTML = `<input type="checkbox" id="wp_cat_${category.id}" name="wp_categories" value="${category.id}"><label for="wp_cat_${category.id}">${category.name}</label>`;
                wpCategoriesContainer.appendChild(div);
            });
            areCategoriesLoaded = true;
        } catch (error) {
            console.error('Error loading categories:', error);
            wpCategoriesContainer.innerHTML = '<p class="loading-text" style="color: red;">خطا در بارگذاری دسته‌بندی‌ها.</p>';
        }
    }

    function switchTab(tabId) {
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        const tabButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
        const tabContent = document.getElementById(tabId);
        if (tabButton && tabContent) {
            tabButton.classList.add('active');
            tabContent.classList.add('active');
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

    function aggregateFormData() {
        const data = {
            platforms: [...activeTabs].map(id => id.replace('Tab', '')),
            common: { alt_text: document.getElementById('alt_text').value }
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
                    } else if (el.name !== 'wp_content') {
                        data[platform][el.name] = el.value;
                    }
                }
            });
            if (platform === 'wordpress' && quillEditor) {
                data.wordpress.wp_content = quillEditor.root.innerHTML;
            }
        });
        return data;
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        setLoading(true);
        const file = mediaFileInput.files[0];
        if (!file) {
            displayPublicationResults({ success: false, message: 'لطفاً یک فایل رسانه انتخاب کنید.' });
            return setLoading(false);
        }
        const textData = aggregateFormData();
        if (textData.platforms.length === 0) {
            displayPublicationResults({ success: false, message: 'لطفاً حداقل یک پلتفرم را انتخاب کنید.' });
            return setLoading(false);
        }
        const formData = new FormData();
        formData.append('mediaFile', file);
        formData.append('data', JSON.stringify(textData));
        let endpoint = '/publish';
        if (enableSchedulingCheckbox.checked) {
            if (!scheduleTimeInput.value) {
                displayPublicationResults({ success: false, message: 'لطفاً تاریخ و زمان زمان‌بندی را انتخاب کنید.' });
                return setLoading(false);
            }
            // The date picker gives a Jalali string. We need to convert it to a standard format.
            // The library instance is on the element: el.jalaliDatepicker.getMoment()
            const datepickerInstance = scheduleTimeInput.jalaliDatepicker;
            if (datepickerInstance) {
                const momentDate = datepickerInstance.getMoment();
                formData.append('scheduleTime', momentDate.toISOString());
            } else {
                 displayPublicationResults({ success: false, message: 'خطا در خواندن تاریخ زمان‌بندی.' });
                 return setLoading(false);
            }
            endpoint = '/schedule';
        }
        try {
            const response = await fetch(endpoint, { method: 'POST', body: formData });
            const result = await response.json();
            displayPublicationResults(result);
            if (result.success) {
                uploadForm.reset();
                if (quillEditor) quillEditor.setText('');
                platformCheckboxes.forEach(cb => cb.checked = false);
                enableSchedulingCheckbox.checked = false;
                scheduleTimeContainer.style.display = 'none';
                updateTabs();
            }
        } catch (error) {
            console.error('Submission Error:', error);
            displayPublicationResults({ success: false, message: 'خطای ارتباط با سرور', details: [{ platform: 'Application', success: false, message: error.message }] });
        } finally {
            setLoading(false);
        }
    }

    function applyMarkdown(format) {
        const textarea = document.getElementById('telegram_caption');
        const start = textarea.selectionStart, end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        const wrapper = format === 'bold' ? '*' : '_';
        textarea.setRangeText(`${wrapper}${selectedText}${wrapper}`, start, end, 'end');
        textarea.focus();
    }

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

    // --- Dashboard Modal Logic ---
    const dashboardModal = document.getElementById('dashboardModal');
    const viewScheduledBtn = document.getElementById('viewScheduledBtn');
    const closeBtn = document.querySelector('.modal .close-button');
    const dashboardContent = document.getElementById('dashboardContent');

    async function loadAndDisplayScheduledJobs() {
        dashboardContent.innerHTML = '<p class="loading-text">در حال بارگذاری لیست...</p>';
        try {
            const response = await fetch('/api/jobs');
            const jobs = await response.json();
            dashboardContent.innerHTML = '';
            if (jobs.length === 0) {
                dashboardContent.innerHTML = '<p>هیچ پست زمان‌بندی شده‌ای وجود ندارد.</p>';
                return;
            }
            jobs.forEach(job => {
                const jobElement = document.createElement('div');
                jobElement.className = 'job-item';
                const platforms = job.payload.platforms.join(', ');
                const title = job.payload.wordpress?.wp_title || job.payload.telegram?.telegram_caption.substring(0, 30) + '...' || 'بدون عنوان';
                const scheduleDate = new Date(job.scheduleTime).toLocaleString('fa-IR');

                jobElement.innerHTML = `
                    <div class="job-details">
                        <p class="job-title">${title}</p>
                        <p class="job-platforms">پلتفرم‌ها: ${platforms}</p>
                        <p class="job-time">زمان انتشار: ${scheduleDate}</p>
                    </div>
                    <button type="button" class="delete-job-btn" data-job-id="${job.id}">حذف</button>
                `;
                dashboardContent.appendChild(jobElement);
            });
        } catch (error) {
            dashboardContent.innerHTML = '<p style="color:red;">خطا در دریافت لیست.</p>';
        }
    }

    async function deleteJob(jobId) {
        if (!confirm('آیا از حذف این پست زمان‌بندی شده مطمئن هستید؟')) return;
        try {
            const response = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete job.');
            // Refresh the list after deleting
            await loadAndDisplayScheduledJobs();
        } catch (error) {
            alert('خطا در حذف پست.');
        }
    }

    // --- Event Listeners & Initial Calls ---
    platformCheckboxes.forEach(checkbox => checkbox.addEventListener('change', updateTabs));
    mediaFileInput.addEventListener('change', () => {
        fileNameDisplay.textContent = mediaFileInput.files.length > 0 ? `فایل: ${mediaFileInput.files[0].name}` : '';
    });
    uploadForm.addEventListener('submit', handleFormSubmit);
    document.querySelectorAll('.toolbar-button').forEach(button => button.addEventListener('click', e => applyMarkdown(e.currentTarget.dataset.format)));
    enableSchedulingCheckbox.addEventListener('change', () => {
        scheduleTimeContainer.style.display = enableSchedulingCheckbox.checked ? 'block' : 'none';
    });

    viewScheduledBtn.addEventListener('click', () => {
        dashboardModal.style.display = 'block';
        loadAndDisplayScheduledJobs();
    });
    closeBtn.addEventListener('click', () => { dashboardModal.style.display = 'none'; });
    window.addEventListener('click', (event) => {
        if (event.target == dashboardModal) dashboardModal.style.display = 'none';
    });
    dashboardContent.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-job-btn')) {
            deleteJob(event.target.dataset.jobId);
        }
    });

    initializeJalaliDatePicker();
    updateTabs();
});
