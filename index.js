document.addEventListener('DOMContentLoaded', () => {
    // Display user ID in header
    Config.displayUserId();
    // --- DOM Element Selectors ---
    const clientsTableBody = document.querySelector('#clients-table tbody');
    const searchInput = document.getElementById('search-input');
    const staffFilter = document.getElementById('staff-filter');
    const monthFilter = document.getElementById('month-filter');
    const clientsTableHeadRow = document.querySelector('#clients-table thead tr');
    // Staff modal elements
    const staffEditModal = document.getElementById('staff-edit-modal');
    const closeStaffModalButton = staffEditModal.querySelector('.close-button');
    const staffListContainer = document.getElementById('staff-list-container');
    const newStaffInput = document.getElementById('new-staff-input');
    const addStaffButton = document.getElementById('add-staff-button');
    const saveStaffButton = document.getElementById('save-staff-button');
    const cancelStaffButton = document.getElementById('cancel-staff-button');

    // Accordion and Default Tasks Modal elements
    const accordionHeader = document.querySelector('#management-accordion .accordion-header');
    const accordionContent = document.querySelector('#management-accordion .accordion-content');
    const defaultTasksModal = document.getElementById('default-tasks-modal');
    const openDefaultTasksModalButton = document.getElementById('default-tasks-settings-button');
    const closeDefaultTasksModalButton = defaultTasksModal.querySelector('.close-button');
    const saveDefaultTasksButton = document.getElementById('save-default-tasks-button');
    const cancelDefaultTasksButton = document.getElementById('cancel-default-tasks-button');
    const tasksKityoContainer = document.getElementById('tasks-kityo');
    const tasksJikeiContainer = document.getElementById('tasks-jikei');
    const defaultTasksContainer = defaultTasksModal.querySelector('.default-tasks-container');

    // Basic Settings Modal elements
    const basicSettingsModal = document.getElementById('basic-settings-modal');
    const openBasicSettingsModalButton = document.getElementById('basic-settings-button');
    const closeBasicSettingsModalButton = basicSettingsModal.querySelector('.close-button');
    const saveBasicSettingsButton = document.getElementById('save-basic-settings-button');
    const cancelBasicSettingsButton = document.getElementById('cancel-basic-settings-button');
    const yellowThresholdSelect = document.getElementById('yellow-threshold');
    const redThresholdSelect = document.getElementById('red-threshold');
    const yellowColorInput = document.getElementById('yellow-color');
    const redColorInput = document.getElementById('red-color');
    const fontFamilySelect = document.getElementById('font-family-select');
    const hideInactiveClientsCheckbox = document.getElementById('hide-inactive-clients');
    
    // CSV Import/Export elements
    const exportCsvButton = document.getElementById('export-csv-button');
    const importCsvButton = document.getElementById('import-csv-button');
    const csvFileInput = document.getElementById('csv-file-input');

    // --- State Variables ---
    let clients = [];
    let staffs = [];
    let currentSortKey = 'fiscal_month';
    let currentSortDirection = 'asc';
    let originalStaffsState = [];
    let currentEditingStaffs = [];
    let defaultTasks = {}; // State for default tasks
    let appSettings = {}; // State for application settings
    let filterState = {}; // フィルター状態を保存

    const API_BASE_URL = Config.getApiBaseUrl();

    // --- Mappings ---
    const headerMap = {
        'No.': 'id',
        '事業所名': 'name',
        '決算月': 'fiscal_month',
        '未入力期間': 'unattendedMonths',
        '月次進捗': 'monthlyProgress',
        '最終更新': 'lastUpdated',
        '担当者': 'staff_name',
        '経理方式': 'accounting_method',
        '進捗ステータス': 'status'
    };

    // --- Initial Setup ---
    async function initializeApp() {
        setupTableHeaders();
        addEventListeners();
        populateMonthThresholds(); // Populate month dropdowns
        populateFontFamilySelect(); // Populate font family dropdown
        loadFilterState(); // フィルター状態をロード
        
        try {
            // Fetch data from backend
            [clients, staffs, appSettings] = await Promise.all([
                fetchClients(),
                fetchStaffs(),
                fetchSettings()
            ]);

            applyFontFamily(appSettings.font_family); // Apply font family from settings

            populateFilters();
            applyFilterState(); // 保存されたフィルター状態を適用
            renderClients();
            updateSortIcons();
        } catch (error) {
            console.error("Error initializing app:", error);
            alert("アプリケーションの初期化に失敗しました。");
        }
    }

    function populateFontFamilySelect() {
        const fonts = [
            { name: 'デフォルト', value: '' }, // ブラウザのデフォルトフォント
            { name: 'メイリオ', value: 'メイリオ, Meiryo, sans-serif' },
            { name: '游ゴシック', value: '游ゴシック, YuGothic, "Hiragino Kaku Gothic ProN", sans-serif' },
            { name: 'ＭＳ Ｐゴシック', value: '"ＭＳ Ｐゴシック", "MS PGothic", sans-serif' },
            { name: 'Arial', value: 'Arial, sans-serif' },
            { name: 'Verdana', value: 'Verdana, sans-serif' },
            { name: 'Times New Roman', value: '"Times New Roman", serif' },
            { name: 'BIZ UDゴシック', value: '"BIZ UDゴシック", "BIZ UDGothic", sans-serif' },
            { name: 'UD Digi Kyokasho NK-B', value: '"UD Digi Kyokasho NK-B", sans-serif' }
        ];

        fontFamilySelect.innerHTML = ''; // Clear existing options
        fonts.forEach(font => {
            const option = document.createElement('option');
            option.value = font.value;
            option.textContent = font.name;
            fontFamilySelect.appendChild(option);
        });
    }

    function applyFontFamily(fontFamily) {
        document.body.style.fontFamily = fontFamily || ''; // デフォルトは空文字列でブラウザのデフォルトに
    }

    function setupTableHeaders() {
        const noTh = document.createElement('th');
        noTh.textContent = 'No.';
        clientsTableHeadRow.insertBefore(noTh, clientsTableHeadRow.firstChild);

        const editTh = document.createElement('th');
        editTh.textContent = '登録情報編集';
        clientsTableHeadRow.appendChild(editTh);

        Array.from(clientsTableHeadRow.children).forEach(th => {
            const headerText = th.textContent.trim();
            const sortKey = headerMap[headerText];
            if (sortKey) {
                th.dataset.sortKey = sortKey;
                const sortIconSpan = document.createElement('span');
                sortIconSpan.classList.add('sort-icon');
                th.appendChild(sortIconSpan);
            }
        });
    }

    function populateFilters() {
        // Staff Filter
        staffFilter.innerHTML = '<option value="">すべての担当者</option>';
        staffs.forEach(staff => {
            const option = document.createElement('option');
            option.value = staff.name;
            option.textContent = staff.name;
            staffFilter.appendChild(option);
        });

        // Month Filter
        monthFilter.innerHTML = '<option value="">すべての決算月</option>';
        for (let i = 1; i <= 12; i++) {
            const month = `${i}月`;
            const option = document.createElement('option');
            option.value = month;
            option.textContent = month;
            monthFilter.appendChild(option);
        }

        // Initialize custom dropdowns
        initializeCustomDropdown(staffFilter);
        initializeCustomDropdown(monthFilter);
    }

    function addEventListeners() {
        // Search and filter listeners
        searchInput.addEventListener('input', () => {
            saveFilterState();
            renderClients();
        });
        staffFilter.addEventListener('change', () => {
            saveFilterState();
            renderClients();
        });
        monthFilter.addEventListener('change', () => {
            saveFilterState();
            renderClients();
        });

        // Sorting listener
        clientsTableHeadRow.addEventListener('click', handleSortClick);

        // Button listeners
        document.getElementById('add-client-button').addEventListener('click', () => {
            window.location.href = 'edit.html';
        });
        
        // CSV Import/Export listeners
        exportCsvButton.addEventListener('click', exportClientsCSV);
        importCsvButton.addEventListener('click', () => csvFileInput.click());
        csvFileInput.addEventListener('change', importClientsCSV);
        
        // Database Reset listener
        document.getElementById('reset-database-button').addEventListener('click', resetDatabase);

        // Staff Modal listeners
        document.getElementById('manage-staff-button').addEventListener('click', openStaffModal);
        closeStaffModalButton.addEventListener('click', () => staffEditModal.style.display = 'none');
        cancelStaffButton.addEventListener('click', () => staffEditModal.style.display = 'none');
        window.addEventListener('click', (event) => {
            if (event.target === staffEditModal) {
                staffEditModal.style.display = 'none';
            }
        });

        saveStaffButton.addEventListener('click', saveStaff);
        staffListContainer.addEventListener('click', handleStaffListClick);
        staffListContainer.addEventListener('input', handleStaffListInput);
        addStaffButton.addEventListener('click', addStaff);

        // Basic Settings Modal Listeners
        openBasicSettingsModalButton.addEventListener('click', openBasicSettingsModal);
        closeBasicSettingsModalButton.addEventListener('click', () => basicSettingsModal.style.display = 'none');
        cancelBasicSettingsButton.addEventListener('click', () => basicSettingsModal.style.display = 'none');
        saveBasicSettingsButton.addEventListener('click', saveBasicSettings);

        // Accordion and Modal Listeners
        accordionHeader.addEventListener('click', toggleAccordion);
        openDefaultTasksModalButton.addEventListener('click', openDefaultTasksModal);
        closeDefaultTasksModalButton.addEventListener('click', () => defaultTasksModal.style.display = 'none');
        cancelDefaultTasksButton.addEventListener('click', () => defaultTasksModal.style.display = 'none');
        defaultTasksContainer.addEventListener('click', handleDefaultTasksClick);
        saveDefaultTasksButton.addEventListener('click', saveDefaultTasks);

        window.addEventListener('click', (event) => {
            if (event.target === staffEditModal) {
                staffEditModal.style.display = 'none';
            }
            if (event.target === defaultTasksModal) {
                defaultTasksModal.style.display = 'none';
            }
        });
    }

    // --- Accordion and Default Tasks Modal Logic ---

    function toggleAccordion() {
        const isOpen = accordionContent.style.display === 'block';
        accordionContent.style.display = isOpen ? 'none' : 'block';
        accordionHeader.querySelector('.accordion-icon').textContent = isOpen ? '▼' : '▲';
    }

    async function openDefaultTasksModal() {
        try {
            const response = await fetch(`${API_BASE_URL}/default-tasks`);
            if (!response.ok) {
                throw new Error('Failed to fetch default tasks');
            }
            defaultTasks = await response.json();
            
            renderDefaultTaskList('kityo', defaultTasks['記帳代行'] || []);
            renderDefaultTaskList('jikei', defaultTasks['自計'] || []);
            
            defaultTasksModal.style.display = 'block';
        } catch (error) {
            console.error(error);
            alert('初期設定の読み込みに失敗しました。');
        }
    }

    function renderDefaultTaskList(target, tasks) {
        const container = target === 'kityo' ? tasksKityoContainer : tasksJikeiContainer;
        container.innerHTML = '';
        tasks.forEach((task, index) => {
            const taskItem = document.createElement('div');
            taskItem.classList.add('task-item');
            taskItem.innerHTML = `
                <input type="text" value="${task}" data-index="${index}">
                <button class="delete-task-button" data-index="${index}">削除</button>
            `;
            container.appendChild(taskItem);
        });
    }

    function handleDefaultTasksClick(event) {
        const button = event.target.closest('button');
        if (!button) return;

        const taskColumn = event.target.closest('.task-column');
        const target = taskColumn.querySelector('.task-list-container').id.includes('kityo') ? 'kityo' : 'jikei';
        const method = target === 'kityo' ? '記帳代行' : '自計';
        let currentTasks = defaultTasks[method] || [];

        // Add button
        if (button.dataset.target) {
            const input = taskColumn.querySelector('input[type="text"][placeholder]');
            const newTaskName = input.value.trim();
            if (newTaskName && !currentTasks.includes(newTaskName)) {
                currentTasks.push(newTaskName);
                renderDefaultTaskList(target, currentTasks);
                input.value = '';
            }
        }
        // Delete button
        else if (button.classList.contains('delete-task-button')) {
            const index = parseInt(button.dataset.index, 10);
            currentTasks.splice(index, 1);
            renderDefaultTaskList(target, currentTasks);
        }
    }

    async function saveDefaultTasks() {
        // Collect data from inputs, in case of edits
        const kityoTasks = Array.from(tasksKityoContainer.querySelectorAll('.task-item input')).map(input => input.value.trim()).filter(Boolean);
        const jikeiTasks = Array.from(tasksJikeiContainer.querySelectorAll('.task-item input')).map(input => input.value.trim()).filter(Boolean);

        const updatedTasks = {
            '記帳代行': kityoTasks,
            '自計': jikeiTasks
        };

        try {
            const response = await fetch(`${API_BASE_URL}/default-tasks`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedTasks)
            });

            if (!response.ok) {
                throw new Error('Failed to save default tasks');
            }

            alert('初期値を保存しました。');
            defaultTasksModal.style.display = 'none';
        } catch (error) {
            console.error(error);
            alert('保存に失敗しました。');
        }
    }

    // --- Basic Settings Modal Logic ---

    function openBasicSettingsModal() {
        // Populate current settings
        yellowThresholdSelect.value = appSettings.highlight_yellow_threshold || 3;
        redThresholdSelect.value = appSettings.highlight_red_threshold || 6;
        yellowColorInput.value = appSettings.highlight_yellow_color || '#FFFF99';
        redColorInput.value = appSettings.highlight_red_color || '#FFCDD2';
        fontFamilySelect.value = appSettings.font_family || ''; // Set current font family
        hideInactiveClientsCheckbox.checked = appSettings.hide_inactive_clients || false;

        basicSettingsModal.style.display = 'block';
    }

    async function saveBasicSettings() {
        const updatedSettings = {
            highlight_yellow_threshold: parseInt(yellowThresholdSelect.value),
            highlight_yellow_color: yellowColorInput.value,
            highlight_red_threshold: parseInt(redThresholdSelect.value),
            highlight_red_color: redColorInput.value,
            font_family: fontFamilySelect.value, // Save selected font family
            hide_inactive_clients: hideInactiveClientsCheckbox.checked
        };

        try {
            const response = await fetch(`${API_BASE_URL}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSettings)
            });

            if (!response.ok) {
                throw new Error('Failed to save settings');
            }

            appSettings = updatedSettings; // Update local state
            applyFontFamily(appSettings.font_family); // Apply new font family
            renderClients(); // Re-render clients to apply new colors
            alert('基本設定を保存しました。');
            basicSettingsModal.style.display = 'none';
        } catch (error) {
            console.error(error);
            alert('設定の保存に失敗しました。');
        }
    }

    // --- Data Fetching Functions ---
    async function fetchClients() {
        try {
            const response = await fetch(`${API_BASE_URL}/clients`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Failed to fetch clients:", error);
            alert("顧客情報の読み込みに失敗しました。");
            return [];
        }
    }

    async function fetchStaffs() {
        try {
            const response = await fetch(`${API_BASE_URL}/staffs`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Failed to fetch staffs:", error);
            alert("担当者情報の読み込みに失敗しました。");
            return [];
        }
    }

    async function fetchSettings() {
        try {
            const response = await fetch(`${API_BASE_URL}/settings`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const settings = await response.json();
            // Set default font if not present
            if (!settings.font_family) {
                settings.font_family = ''; // Default to empty string for browser default
            }
            return settings;
        } catch (error) {
            console.error("Failed to fetch settings:", error);
            alert("設定の読み込みに失敗しました。デフォルト値を使用します。");
            // Return default settings if fetch fails
            return {
                highlight_yellow_threshold: 3,
                highlight_yellow_color: '#FFFF99',
                highlight_red_threshold: 6,
                highlight_red_color: '#FFCDD2',
                font_family: '' // Default font family
            };
        }
    }

    function populateMonthThresholds() {
        for (let i = 1; i <= 12; i++) {
            const optionYellow = document.createElement('option');
            optionYellow.value = i;
            optionYellow.textContent = `${i}ヶ月`;
            yellowThresholdSelect.appendChild(optionYellow);

            const optionRed = document.createElement('option');
            optionRed.value = i;
            optionRed.textContent = `${i}ヶ月`;
            redThresholdSelect.appendChild(optionRed);
        }
    }

    // --- Rendering and Filtering ---
    function renderClients() {
        clientsTableBody.innerHTML = '';

        const textFilter = searchInput.value.toLowerCase();
        const staffFilterValue = staffFilter.value;
        const monthFilterValue = monthFilter.value;

        let filteredClients = clients.filter(client => {
            const nameMatch = client.name.toLowerCase().includes(textFilter);
            const staffNameMatch = client.staff_name ? client.staff_name.toLowerCase().includes(textFilter) : false;
            const textMatch = textFilter === '' || nameMatch || staffNameMatch;

            const staffMatch = staffFilterValue === '' || client.staff_name === staffFilterValue;
            const monthMatch = monthFilterValue === '' || `${client.fiscal_month}月` === monthFilterValue;
            
            // 関与終了クライアントのフィルタリング
            const inactiveMatch = !appSettings.hide_inactive_clients || !client.is_inactive;

            return textMatch && staffMatch && monthMatch && inactiveMatch;
        });

        // Custom sorting logic: 決算月（今月-2ヶ月）起点 → 未入力期間降順
        filteredClients.sort((a, b) => {
            // まず決算月で比較（今月-2ヶ月を起点）
            const currentMonth = new Date().getMonth() + 1; // 現在の月（1-12）

            // 今月-2ヶ月から始まって昇順になるよう調整
            function getMonthOrder(month) {
                // 例: 現在8月の場合、startMonthは6月
                let startMonth = currentMonth - 2;
                if (startMonth <= 0) {
                    startMonth += 12;
                }

                // 6月が1、7月が2、...、5月が12になるような順序を作る
                let order = month - startMonth + 1;
                if (order <= 0) order += 12;
                return order;
            }

            const orderA = getMonthOrder(a.fiscal_month);
            const orderB = getMonthOrder(b.fiscal_month);

            if (orderA !== orderB) {
                return orderA - orderB;
            }

            // 決算月が同じ場合、未入力期間で比較（降順：長い期間が上）
            const unattendedA = parseInt(a.unattendedMonths.replace('ヶ月', ''));
            const unattendedB = parseInt(b.unattendedMonths.replace('ヶ月', ''));

            return unattendedB - unattendedA; // 降順
        });

        updateSortIcons();

        // Render rows
        filteredClients.forEach(client => {
            const row = clientsTableBody.insertRow();
            row.insertCell().textContent = client.id;
            row.insertCell().innerHTML = `<a href="details.html?no=${client.id}" class="client-name-link">${client.name}</a>`;
            row.insertCell().textContent = `${client.fiscal_month}月`;
            const unattendedMonthsCell = row.insertCell();
            unattendedMonthsCell.textContent = client.unattendedMonths;
            unattendedMonthsCell.style.backgroundColor = ''; // Reset background

            // Apply highlighting based on settings
            const months = parseInt(client.unattendedMonths.replace('ヶ月', ''));
            if (!isNaN(months)) {
                if (months >= appSettings.highlight_red_threshold) {
                    unattendedMonthsCell.style.backgroundColor = appSettings.highlight_red_color;
                } else if (months >= appSettings.highlight_yellow_threshold) {
                    unattendedMonthsCell.style.backgroundColor = appSettings.highlight_yellow_color;
                }
            }
            row.insertCell().textContent = client.monthlyProgress;
            const updatedAtCell = row.insertCell();
            if (client.updated_at) {
                const date = new Date(client.updated_at);
                const jstString = date.toLocaleString('ja-JP', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    timeZone: 'Asia/Tokyo'
                });
                updatedAtCell.textContent = jstString;
            } else {
                updatedAtCell.textContent = 'N/A';
            }
            row.insertCell().textContent = client.staff_name;
            row.insertCell().textContent = client.accounting_method;
            
            const statusCell = row.insertCell();
            const customSelectWrapper = createStatusDropdown(client);
            statusCell.appendChild(customSelectWrapper);
            initializeCustomDropdown(customSelectWrapper.querySelector('select'));
            updateStatusBackgroundColor(customSelectWrapper, client.status);

            row.insertCell().innerHTML = `<a href="edit.html?no=${client.id}">編集</a>`;
            
            // 関与終了クライアントに特別なクラスを追加
            if (client.is_inactive) {
                row.classList.add('inactive-client');
                // 事業者名の後に関与終了バッジを追加
                const nameCell = row.cells[1]; // 事業者名のセル
                nameCell.innerHTML = `<a href="details.html?no=${client.id}" class="client-name-link">${client.name}</a><span class="inactive-badge">関与終了</span>`;
            }
        });
    }

    function createStatusDropdown(client) {
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        wrapper.appendChild(trigger);

        const options = document.createElement('div');
        options.className = 'custom-options';
        wrapper.appendChild(options);

        const select = document.createElement('select');
        select.className = 'status-dropdown';
        select.style.display = 'none';
        wrapper.appendChild(select);

        const statuses = ['未着手', '依頼中', 'チェック待ち', '作業中', '完了'];
        statuses.forEach(status => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            if (client.status === status) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        select.addEventListener('change', (event) => {
            client.status = event.target.value;
            updateStatusBackgroundColor(wrapper, client.status);
            // TODO: Call API to save status change
            console.log(`Status for client ${client.id} changed to ${client.status}. API call to be implemented.`);
            // saveData(window.clients, window.clientDetails, window.staffs);
        });

        return wrapper;
    }

    function updateStatusBackgroundColor(element, status) {
        element.className = 'custom-select-wrapper'; // Reset classes
        element.classList.add(`status-${status}`);
    }

    // --- Sorting ---
    function handleSortClick(event) {
        const targetTh = event.target.closest('th');
        if (!targetTh || !targetTh.dataset.sortKey) return;

        const sortKey = targetTh.dataset.sortKey;
        if (currentSortKey === sortKey) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortKey = sortKey;
            currentSortDirection = 'asc';
        }
        renderClients();
    }

    function updateSortIcons() {
        clientsTableHeadRow.querySelectorAll('th[data-sort-key]').forEach(th => {
            const sortIcon = th.querySelector('.sort-icon');
            th.classList.remove('sorted-column');
            sortIcon.classList.remove('asc', 'desc');
            if (th.dataset.sortKey === currentSortKey) {
                th.classList.add('sorted-column');
                sortIcon.classList.add(currentSortDirection);
            }
        });
    }

    function monthToNumber(monthStr) {
        if (typeof monthStr !== 'string') return 0;
        return parseInt(monthStr.replace('月', ''));
    }

    // --- Staff Modal Logic ---
    function openStaffModal() {
        // The 'staffs' array is already fetched from the API in initializeApp
        originalStaffsState = JSON.parse(JSON.stringify(staffs));
        currentEditingStaffs = JSON.parse(JSON.stringify(staffs));
        renderStaffList(currentEditingStaffs);
        staffEditModal.style.display = 'block';
    }

    function renderStaffList(staffsToRender) {
        staffListContainer.innerHTML = '';
        staffsToRender.forEach(staff => {
            const staffItem = document.createElement('div');
            staffItem.classList.add('task-item'); // Assuming task-item style is generic
            staffItem.innerHTML = `
                <span class="staff-no">No. ${staff.id}</span>
                <input type="text" value="${staff.name}" data-id="${staff.id}" class="task-input">
                <button class="delete-task-button" data-id="${staff.id}">削除</button>
            `;
            staffListContainer.appendChild(staffItem);
        });
    }

    async function addStaff() {
        const newStaffName = newStaffInput.value.trim();
        if (!newStaffName) {
            alert('担当者名を入力してください。');
            return;
        }
        if (currentEditingStaffs.some(s => s.name === newStaffName)) {
            alert('その担当者は既に追加されています。');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/staffs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newStaffName }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '担当者の追加に失敗しました。');
            }

            const newStaff = await response.json();
            currentEditingStaffs.push(newStaff);
            renderStaffList(currentEditingStaffs);
            newStaffInput.value = '';

        } catch (error) {
            alert(error.message);
        }
    }

    async function handleStaffListClick(event) {
        if (!event.target.classList.contains('delete-task-button')) {
            return;
        }

        const staffIdToDelete = parseInt(event.target.dataset.id);
        const staffToDelete = currentEditingStaffs.find(s => s.id === staffIdToDelete);

        if (!staffToDelete) return;

        if (!confirm(`「${staffToDelete.name}」さんを削除します。よろしいですか？\n（既に使用中の担当者は削除できません）`)) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/staffs/${staffIdToDelete}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '担当者の削除に失敗しました。');
            }

            currentEditingStaffs = currentEditingStaffs.filter(staff => staff.id !== staffIdToDelete);
            renderStaffList(currentEditingStaffs);

        } catch (error) {
            alert(error.message);
        }
    }

    function handleStaffListInput(event) {
        if (event.target.classList.contains('task-input')) { // Assuming 'task-input' class is used for staff name inputs
            const staffId = parseInt(event.target.dataset.id);
            const staff = currentEditingStaffs.find(s => s.id === staffId);
            if (staff) {
                staff.name = event.target.value.trim();
            }
        }
    }

    async function saveStaff() {
        const updatePromises = [];

        // Find updated staff members
        currentEditingStaffs.forEach(editedStaff => {
            const originalStaff = originalStaffsState.find(s => s.id === editedStaff.id);
            // Check if the staff existed before and the name has changed
            if (originalStaff && originalStaff.name !== editedStaff.name) {
                const promise = fetch(`${API_BASE_URL}/staffs/${editedStaff.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: editedStaff.name }),
                });
                updatePromises.push(promise);
            }
        });

        // Note: This implementation only handles UPDATES.
        // Additions and deletions are handled instantly and are not part of the "Save" button's logic.

        if (updatePromises.length === 0) {
            // If nothing changed, just close the modal.
            staffEditModal.style.display = 'none';
            return;
        }

        try {
            const responses = await Promise.all(updatePromises);

            // Check if all API calls were successful
            const failedResponse = responses.find(res => !res.ok);
            if (failedResponse) {
                const errorData = await failedResponse.json();
                throw new Error(errorData.error || `Failed to update staff with status: ${failedResponse.status}`);
            }

            alert('保存しました！');
            window.location.reload(); // Reload the page to reflect all changes

        } catch (error) {
            alert(`保存中にエラーが発生しました: ${error.message}`);
        }
    }

    // --- CSV Import/Export Functions ---
    async function exportClientsCSV() {
        try {
            const response = await fetch(`${API_BASE_URL}/clients/export`);
            
            if (!response.ok) {
                throw new Error(`Export failed: ${response.status}`);
            }
            
            // Create download link
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'clients.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            alert('✅ CSVエクスポートが完了しました！');
            
        } catch (error) {
            console.error('Export error:', error);
            alert(`❌ CSVエクスポートに失敗しました: ${error.message}`);
        }
    }

    async function importClientsCSV(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Reset file input
        event.target.value = '';
        
        if (!confirm('CSVファイルをインポートしますか？\n既存データは更新され、新しいデータは追加されます。')) {
            return;
        }
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch(`${API_BASE_URL}/clients/import`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Import failed');
            }
            
            // Show results
            let message = `✅ ${result.message}`;
            if (result.errors && result.errors.length > 0) {
                message += '\n\n⚠️ 以下のエラーがありました:\n' + result.errors.join('\n');
            }
            
            alert(message);
            
            // Reload data to show changes
            await initializeApp();
            
        } catch (error) {
            console.error('Import error:', error);
            alert(`❌ CSVインポートに失敗しました: ${error.message}`);
        }
    }

    async function resetDatabase() {
        const confirmMessage = `⚠️ データベース初期化の警告\n\n` +
            `この操作により以下のデータが完全に削除されます:\n` +
            `• すべての事業者データ\n` +
            `• すべての月次進捗データ\n` +
            `• すべての担当者データ\n` +
            `• すべてのカスタム設定\n\n` +
            `この操作は元に戻すことができません。\n` +
            `本当に実行しますか？`;
            
        if (!confirm(confirmMessage)) {
            return;
        }
        
        const doubleConfirm = confirm('最終確認：データベースを初期化しますか？\n\n全データが失われます。');
        if (!doubleConfirm) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/admin/reset-database`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(result.error || 'Database reset failed');
            }
            
            alert(`✅ ${result.message}\n\nサンプルデータと初期設定が作成されました。`);
            
            // Reload the page to show fresh data
            window.location.reload();
            
        } catch (error) {
            console.error('Database reset error:', error);
            alert(`❌ データベース初期化に失敗しました: ${error.message}`);
        }
    }

    // --- Filter State Management ---
    function loadFilterState() {
        try {
            const savedState = localStorage.getItem('clientListFilterState');
            if (savedState) {
                filterState = JSON.parse(savedState);
            }
        } catch (error) {
            console.warn('フィルター状態の読み込みに失敗しました:', error);
            filterState = {};
        }
    }
    
    function saveFilterState() {
        try {
            filterState = {
                searchText: searchInput.value,
                staffFilter: staffFilter.value,
                monthFilter: monthFilter.value
            };
            localStorage.setItem('clientListFilterState', JSON.stringify(filterState));
        } catch (error) {
            console.warn('フィルター状態の保存に失敗しました:', error);
        }
    }
    
    function applyFilterState() {
        if (filterState.searchText !== undefined) {
            searchInput.value = filterState.searchText;
        }
        if (filterState.staffFilter !== undefined) {
            staffFilter.value = filterState.staffFilter;
        }
        if (filterState.monthFilter !== undefined) {
            monthFilter.value = filterState.monthFilter;
        }
        
        // カスタムドロップダウンの表示更新
        updateCustomDropdownTrigger(staffFilter);
        updateCustomDropdownTrigger(monthFilter);
    }
    
    function updateCustomDropdownTrigger(selectElement) {
        const wrapper = selectElement.closest('.custom-select-wrapper');
        if (wrapper) {
            const trigger = wrapper.querySelector('.custom-select-trigger');
            const selectedOption = selectElement.options[selectElement.selectedIndex];
            if (trigger && selectedOption) {
                trigger.textContent = selectedOption.textContent;
            }
        }
    }

    // --- Run Application ---
    initializeApp();
});