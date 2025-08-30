document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM Element Selectors ---
    const clientInfoArea = document.getElementById('client-info-area');
    const detailsTableHead = document.querySelector('#details-table thead');
    const detailsTableBody = document.querySelector('#details-table tbody');
    const notesTableHead = document.querySelector('#notes-table thead');
    const notesTableBody = document.querySelector('#notes-table tbody');
    const yearFilter = document.getElementById('year-filter');
    const editTasksButton = document.getElementById('edit-tasks-button');
    const saveChangesButton = document.getElementById('save-changes-button');
    const finalizeYearButton = document.getElementById('finalize-year-button');
    const saveStatus = document.getElementById('save-status');
    const pageOverlay = document.createElement('div');
    pageOverlay.className = 'page-overlay';

    // --- Zoom Slider Elements ---
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomValue = document.getElementById('zoom-value');
    const mainContainer = document.querySelector('.container');

    // --- State Variables ---
    const API_BASE_URL = Config.getApiBaseUrl();
    const urlParams = new URLSearchParams(window.location.search);
    const clientNo = urlParams.get('no');
    let clientDetails = null;
    let currentYearSelection = new Date().getFullYear().toString(); // Will be updated after data load
    let monthsToDisplay = [];
    let allTaskNames = [];
    let isSaving = false;
    let hasConflict = false;
    let hasUnsavedChanges = false;
    let saveStatusTimeout;

    // --- Editing Session Variables ---
    let isEditingMode = true; // Default to editing allowed
    let currentUserId = null;
    let sessionCheckInterval = null;

    // --- State Management ---
    function setUnsavedChanges(isDirty) {
        hasUnsavedChanges = isDirty;
        saveChangesButton.disabled = !isDirty;
    }

    // --- Editing Session Management ---
    async function startEditingSession() {
        try {
            currentUserId = Config.displayUserId(); // Display user ID and get it
            const response = await fetch(`${API_BASE_URL}/clients/${clientNo}/editing-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ user_id: currentUserId })
            });

            const data = await response.json();
            
            if (data.status === 'editing_by_other') {
                // Another user is editing - switch to read-only mode
                isEditingMode = false;
                showEditingByOtherMessage(data.editor, data.started_at);
                disableEditingInterface();
                return false;
            } else if (data.status === 'editing_allowed') {
                // We can edit
                isEditingMode = true;
                startSessionHeartbeat();
                return true;
            }
        } catch (error) {
            console.error('Error starting editing session:', error);
            // Default to editing mode if session check fails
            isEditingMode = true;
            return true;
        }
    }

    async function endEditingSession() {
        if (!currentUserId) return;
        
        try {
            await fetch(`${API_BASE_URL}/clients/${clientNo}/editing-session`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ user_id: currentUserId })
            });
        } catch (error) {
            console.error('Error ending editing session:', error);
        }

        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
            sessionCheckInterval = null;
        }
    }

    function startSessionHeartbeat() {
        // Update session every 5 minutes
        sessionCheckInterval = setInterval(async () => {
            if (!currentUserId || !isEditingMode) return;
            
            try {
                await fetch(`${API_BASE_URL}/clients/${clientNo}/editing-session`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ user_id: currentUserId })
                });
            } catch (error) {
                console.error('Error updating editing session:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    function showEditingByOtherMessage(editorId, startedAt) {
        // Create and show read-only mode message
        const existingMessage = document.getElementById('editing-by-other-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.id = 'editing-by-other-message';
        messageDiv.className = 'editing-by-other-banner';
        messageDiv.innerHTML = `
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 10px 0; border-radius: 5px; color: #856404;">
                <strong>⚠️ 編集中です</strong><br>
                他のユーザー (${editorId}) がこのクライアントを編集中です。<br>
                現在は閲覧専用モードです。編集はできません。
                <div style="margin-top: 10px;">
                    <button id="refresh-editing-status" style="padding: 5px 10px; margin-right: 5px;">
                        状態を更新
                    </button>
                    <button id="force-unlock-session" style="padding: 5px 10px; background-color: #dc3545; color: white; border: none; border-radius: 3px;">
                        強制解除
                    </button>
                </div>
            </div>
        `;

        const container = document.querySelector('.container');
        container.insertBefore(messageDiv, container.firstChild);

        // Add refresh button functionality
        document.getElementById('refresh-editing-status').addEventListener('click', async () => {
            const canEdit = await startEditingSession();
            if (canEdit) {
                location.reload(); // Refresh page to enable editing
            }
        });

        // Add force unlock functionality
        document.getElementById('force-unlock-session').addEventListener('click', async () => {
            if (confirm('⚠️ 強制解除しますか？\n\n他のユーザーの作業が中断される可能性があります。\n本当に実行しますか？')) {
                try {
                    const response = await fetch(`${API_BASE_URL}/clients/${clientNo}/editing-session/force-unlock`, {
                        method: 'DELETE'
                    });

                    if (response.ok) {
                        alert('✅ 編集ロックを強制解除しました。');
                        location.reload(); // Refresh page to enable editing
                    } else {
                        const errorData = await response.json();
                        alert(`❌ 強制解除に失敗しました: ${errorData.error || 'Unknown error'}`);
                    }
                } catch (error) {
                    console.error('Error force unlocking session:', error);
                    alert('❌ 強制解除中にエラーが発生しました。');
                }
            }
        });
    }

    function disableEditingInterface() {
        // Disable all editing controls
        if (editTasksButton) editTasksButton.style.display = 'none';
        if (saveChangesButton) saveChangesButton.style.display = 'none';
        if (finalizeYearButton) finalizeYearButton.style.display = 'none';

        // Add read-only indicators to inputs
        setTimeout(() => {
            const inputs = document.querySelectorAll('input, textarea, select');
            inputs.forEach(input => {
                input.disabled = true;
                input.title = '編集中のため変更できません';
            });

            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.style.opacity = '0.6';
                cb.style.pointerEvents = 'none';
            });
        }, 100);
    }

    // --- Task Inheritance Logic ---
    function inheritFromPreviousYear(targetYear) {
        if (!clientDetails.custom_tasks_by_year) return [];
        
        const targetYearNum = parseInt(targetYear);
        let tasksToInherit = [];
        
        // Look for the most recent previous year with tasks
        for (let year = targetYearNum - 1; year >= targetYearNum - 10; year--) {
            const yearStr = year.toString();
            if (clientDetails.custom_tasks_by_year[yearStr] && 
                clientDetails.custom_tasks_by_year[yearStr].length > 0) {
                tasksToInherit = clientDetails.custom_tasks_by_year[yearStr];
                console.log(`Inheriting tasks from ${yearStr} to ${targetYear}:`, tasksToInherit);
                break;
            }
        }
        
        return tasksToInherit;
    }

    function propagateTasksToFutureYears(fromYear, newTasks) {
        if (!clientDetails.custom_tasks_by_year || !clientDetails.finalized_years) return;
        
        const fromYearNum = parseInt(fromYear);
        const currentYear = new Date().getFullYear();
        const endYear = Math.max(currentYear + 10, fromYearNum + 10); // Look ahead 10 years or more
        
        let propagatedCount = 0;
        
        // Propagate to future years that are not finalized
        for (let year = fromYearNum + 1; year <= endYear; year++) {
            const yearStr = year.toString();
            
            // Skip if year is finalized
            if (clientDetails.finalized_years.includes(yearStr)) {
                continue;
            }
            
            // Only update years that already have tasks (were previously set)
            if (clientDetails.custom_tasks_by_year[yearStr]) {
                clientDetails.custom_tasks_by_year[yearStr] = [...newTasks];
                propagatedCount++;
            }
        }
        
        if (propagatedCount > 0) {
            console.log(`Propagated tasks from ${fromYear} to ${propagatedCount} future years`);
            showNotification(`項目変更を${propagatedCount}つの未来年度にも適用しました`, 'info');
        }
    }

    // --- Notification System ---
    function showNotification(message, type = 'info') {
        // Create or reuse notification element
        let notification = document.getElementById('task-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'task-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 16px;
                border-radius: 4px;
                color: white;
                font-weight: bold;
                z-index: 1000;
                max-width: 300px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                transform: translateX(100%);
                transition: transform 0.3s ease;
            `;
            document.body.appendChild(notification);
        }

        // Set color based on type
        const colors = {
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FF9800',
            error: '#f44336'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        notification.textContent = message;

        // Show notification
        notification.style.transform = 'translateX(0)';

        // Hide after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
        }, 3000);
    }

    // --- Year Selection Logic ---
    function determineOptimalYear() {
        if (!clientDetails || !clientDetails.finalized_years) {
            return new Date().getFullYear().toString();
        }
        
        // Find the latest finalized year
        const finalizedYears = clientDetails.finalized_years.map(year => parseInt(year)).sort((a, b) => b - a);
        
        if (finalizedYears.length === 0) {
            // No finalized years, use current year
            return new Date().getFullYear().toString();
        }
        
        // Return the year after the latest finalized year
        const latestFinalizedYear = finalizedYears[0];
        const nextYear = latestFinalizedYear + 1;
        
        console.log(`Latest finalized year: ${latestFinalizedYear}, selecting: ${nextYear}`);
        return nextYear.toString();
    }

    function updateCustomDropdownDisplay(selectElement) {
        const wrapper = selectElement.closest('.custom-select-wrapper');
        if (!wrapper) return;
        
        const trigger = wrapper.querySelector('.custom-select-trigger');
        if (!trigger) return;
        
        const selectedOption = Array.from(selectElement.options).find(option => option.value === selectElement.value);
        if (selectedOption) {
            trigger.textContent = selectedOption.textContent;
            console.log(`Updated custom dropdown display to: ${selectedOption.textContent}`);
        }
    }

    // --- Initialization ---
    async function initializeApp() {
        if (!clientNo) {
            clientInfoArea.innerHTML = '<p>エラー: クライアントNo.が指定されていません。</p>';
            return;
        }
        document.body.appendChild(pageOverlay);
        setupYearFilter();

        // Start editing session check
        const canEdit = await startEditingSession();

        try {
            clientDetails = await fetchClientDetails(clientNo);
            if (clientDetails) {
                // Determine optimal year after data is loaded
                currentYearSelection = determineOptimalYear();
                
                addEventListeners();
                
                // Update year filter after setup and ensure it's set correctly
                setTimeout(() => {
                    yearFilter.value = currentYearSelection;
                    updateCustomDropdownDisplay(yearFilter);
                    console.log(`Year filter updated to: ${currentYearSelection}`);
                }, 0);
                
                renderDetails();
            } else {
                clientInfoArea.innerHTML = '<p>クライアントデータが見つかりません。</p>';
            }
        } catch (error) {
            console.error("Initialization failed:", error);
            clientInfoArea.innerHTML = '<p>データの読み込み中にエラーが発生しました。</p>';
        }
    }

    // --- Data I/O & Save Logic ---
    async function fetchClientDetails(id) {
        try {
            const response = await fetch(`${API_BASE_URL}/clients/${id}`);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Failed to fetch client details:", error);
            throw error;
        }
    }

    async function performSave() {
        if (hasConflict || isSaving) return;
        isSaving = true;
        showSaveStatus('saving');

        try {
            const response = await fetch(`${API_BASE_URL}/clients/${clientNo}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(clientDetails),
            });

            if (response.status === 409) {
                hasConflict = true;
                pageOverlay.textContent = 'データが他のユーザーによって更新されました。ページをリロードしてください。';
                pageOverlay.style.display = 'flex';
                alert('データが他のユーザーによって更新されました。意図しない上書きを防ぐため、ページをリロードします。');
                window.location.reload();
                return;
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `API Error: ${response.statusText}`);
            }

            const updatedClientDetails = await response.json();
            clientDetails = updatedClientDetails;
            setUnsavedChanges(false); // Reset dirty flag and disable button
            showSaveStatus('success');

        } catch (error) {
            console.error('Failed to save client details:', error);
            showSaveStatus('error');
        } finally {
            isSaving = false;
        }
    }

    function showSaveStatus(status) {
        clearTimeout(saveStatusTimeout);
        saveStatus.classList.remove('success', 'error');

        switch (status) {
            case 'saving':
                saveStatus.textContent = '保存中...';
                break;
            case 'success':
                saveStatus.textContent = 'すべての変更が保存されました';
                saveStatus.classList.add('success');
                break;
            case 'error':
                saveStatus.textContent = '保存に失敗しました';
                saveStatus.classList.add('error');
                break;
        }

        saveStatus.classList.add('visible');

        if (status === 'success' || status === 'error') {
            saveStatusTimeout = setTimeout(() => {
                saveStatus.classList.remove('visible');
            }, 3000);
        }
    }

    // --- UI Setup & Rendering ---
    function setupYearFilter() {
        const currentYear = new Date().getFullYear();
        for (let year = 2025; year <= 2050; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = `${year}年`;
            if (year === currentYear) option.selected = true;
            yearFilter.appendChild(option);
        }
        currentYearSelection = yearFilter.value;
        initializeCustomDropdown(yearFilter);
    }

    function addEventListeners() {
        yearFilter.addEventListener('change', (event) => {
            currentYearSelection = event.target.value;
            renderDetails();
            // Update accordion finalize button when year changes
            if (window.updateFinalizeButton) {
                window.updateFinalizeButton();
            }
        });
        editTasksButton.addEventListener('click', openTaskEditModal);
        saveChangesButton.addEventListener('click', performSave);
        finalizeYearButton.addEventListener('click', () => {
            const isCurrentlyFinalized = clientDetails.finalized_years && clientDetails.finalized_years.includes(currentYearSelection);
            const action = isCurrentlyFinalized ? '解除' : '確定';
            
            if (confirm(`${currentYearSelection}年度の項目を${action}しますか？`)) {
                // Initialize finalized_years if it doesn't exist
                if (!clientDetails.finalized_years) {
                    clientDetails.finalized_years = [];
                }
                
                if (isCurrentlyFinalized) {
                    // Remove from finalized years
                    clientDetails.finalized_years = clientDetails.finalized_years.filter(year => year !== currentYearSelection);
                } else {
                    // Add to finalized years
                    if (!clientDetails.finalized_years.includes(currentYearSelection)) {
                        clientDetails.finalized_years.push(currentYearSelection);
                    }
                }
                
                setUnsavedChanges(true);
                renderDetails(); // Re-render to update UI state
            }
        });

        window.addEventListener('beforeunload', (e) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // Zoom Slider Event Listener
        zoomSlider.addEventListener('input', (e) => {
            const scale = e.target.value / 100;
            mainContainer.style.zoom = scale;
            zoomValue.textContent = `${e.target.value}%`;
        });
    }

    // --- Modal Logic ---
    const taskEditModal = document.getElementById('task-edit-modal');
    const closeButton = taskEditModal.querySelector('.close-button');
    const taskListContainer = document.getElementById('task-list-container');
    const newTaskInput = document.getElementById('new-task-input');
    const addTaskButton = document.getElementById('add-task-button');
    const saveTasksButton = document.getElementById('save-tasks-button');
    const cancelTasksButton = document.getElementById('cancel-tasks-button');
    let currentEditingTasks = [];

    function openTaskEditModal() {
        // Get custom tasks for current year
        currentEditingTasks = [...((clientDetails.custom_tasks_by_year && clientDetails.custom_tasks_by_year[currentYearSelection]) || [])];
        renderTaskList(currentEditingTasks);
        taskEditModal.style.display = 'block';
    }

    function renderTaskList(tasks) {
        taskListContainer.innerHTML = '';
        tasks.forEach((task, index) => {
            const taskItem = document.createElement('div');
            taskItem.classList.add('task-item');
            taskItem.innerHTML = `
                <input type="text" value="${task}" data-index="${index}">
                <button class="delete-task-button" data-index="${index}">削除</button>
            `;
            taskListContainer.appendChild(taskItem);
        });
    }

    addTaskButton.addEventListener('click', () => {
        const newTaskName = newTaskInput.value.trim();
        if (newTaskName && !currentEditingTasks.includes(newTaskName)) {
            currentEditingTasks.push(newTaskName);
            renderTaskList(currentEditingTasks);
        }
    });

    taskListContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('delete-task-button')) {
            const index = parseInt(event.target.dataset.index, 10);
            currentEditingTasks.splice(index, 1);
            renderTaskList(currentEditingTasks);
        }
    });

    taskListContainer.addEventListener('input', (event) => {
        if (event.target.tagName === 'INPUT') {
            const index = parseInt(event.target.dataset.index, 10);
            currentEditingTasks[index] = event.target.value.trim();
        }
    });

    saveTasksButton.addEventListener('click', async () => {
        // Initialize custom_tasks_by_year if it doesn't exist
        if (!clientDetails.custom_tasks_by_year) {
            clientDetails.custom_tasks_by_year = {};
        }
        
        const oldTasks = clientDetails.custom_tasks_by_year[currentYearSelection] || [];
        const newTasks = currentEditingTasks.filter(task => task !== '');
        const deletedTasks = oldTasks.filter(task => !newTasks.includes(task));
        
        // Save tasks for current year
        clientDetails.custom_tasks_by_year[currentYearSelection] = [...newTasks];
        
        // Propagate changes to future unfinalized years
        propagateTasksToFutureYears(currentYearSelection, newTasks);
        
        try {
            // Immediately sync tasks to database
            await syncCustomTasksToDatabase(currentYearSelection, newTasks);
            
            // Clean up deleted tasks from monthly data
            if (deletedTasks.length > 0) {
                await cleanupDeletedTasks(currentYearSelection, deletedTasks);
                showSyncStatus(`カスタムタスクを同期し、${deletedTasks.length}項目をDBから削除しました`, 'success');
            } else {
                showSyncStatus('カスタムタスクをDBに同期しました', 'success');
            }
        } catch (error) {
            console.error('Failed to sync custom tasks:', error);
            showSyncStatus('DBへの同期に失敗しました', 'error');
        }
        
        setUnsavedChanges(true);
        taskEditModal.style.display = 'none';
        renderDetails();
    });

    closeButton.addEventListener('click', () => { taskEditModal.style.display = 'none'; });
    cancelTasksButton.addEventListener('click', () => { taskEditModal.style.display = 'none'; });
    window.addEventListener('click', (event) => { if (event.target === taskEditModal) { taskEditModal.style.display = 'none'; } });

    // --- Main Rendering Logic ---
    function renderDetails() {
        [clientInfoArea, detailsTableHead, detailsTableBody, notesTableHead, notesTableBody].forEach(el => {
            if(el) el.innerHTML = '';
        });

        if (!clientDetails) return;

        // Ensure year filter displays current selection
        if (yearFilter.value !== currentYearSelection) {
            yearFilter.value = currentYearSelection;
            updateCustomDropdownDisplay(yearFilter);
        }
        
        // Check if current year is finalized
        const isYearFinalized = clientDetails.finalized_years && clientDetails.finalized_years.includes(currentYearSelection);

        clientInfoArea.innerHTML = `
            <table class="client-info-table">
                <tbody>
                    <tr><th>No.</th><th>事業所名</th><th>決算月</th></tr>
                    <tr><td>${clientDetails.id}</td><td>${clientDetails.name}</td><td>${clientDetails.fiscal_month}月</td></tr>
                </tbody>
            </table>`;

        const fiscalMonthNum = clientDetails.fiscal_month;
        monthsToDisplay = Array.from({ length: 12 }, (_, i) => {
            let month = fiscalMonthNum - i;
            let year = parseInt(currentYearSelection, 10);
            if (month <= 0) { month += 12; year--; }
            return `${year}年${month}月`;
        }).reverse();

        // Get custom tasks for current year, with automatic inheritance
        if (!clientDetails.custom_tasks_by_year) {
            clientDetails.custom_tasks_by_year = {};
        }
        
        // Auto-inherit from previous year if current year has no tasks
        if (!clientDetails.custom_tasks_by_year[currentYearSelection]) {
            const previousYearTasks = inheritFromPreviousYear(currentYearSelection);
            if (previousYearTasks.length > 0) {
                clientDetails.custom_tasks_by_year[currentYearSelection] = [...previousYearTasks];
                setUnsavedChanges(true); // Mark as needing save
                
                // Show user notification about inheritance
                showNotification(`${currentYearSelection}年度の項目を前年度から自動継承しました`, 'info');
            }
        }
        
        allTaskNames = clientDetails.custom_tasks_by_year[currentYearSelection] || [];

        // Update finalize button text and state
        finalizeYearButton.textContent = isYearFinalized ? 
            `${currentYearSelection}年度の確定を解除` : 
            `${currentYearSelection}年度の項目を確定`;
        
        // Disable edit tasks button for finalized years
        editTasksButton.disabled = isYearFinalized;
        
        renderTaskAndMemoTable(isYearFinalized);
        renderUrlAndMemoTable(isYearFinalized);
    }

    function renderTaskAndMemoTable(isYearFinalized) {
        const taskHeaderRow = detailsTableHead.insertRow();
        const firstHeader = document.createElement('th');
        firstHeader.textContent = '項目';
        taskHeaderRow.appendChild(firstHeader);
        monthsToDisplay.forEach(monthStr => {
            const th = document.createElement('th');
            th.textContent = monthStr;
            th.classList.add('month-header');
            th.addEventListener('click', () => {
                if (hasConflict) return;
                const columnIndex = Array.from(th.parentNode.children).indexOf(th);

                let allChecked = true;
                allTaskNames.forEach((taskName) => {
                    const monthData = findOrCreateMonthlyTask(clientDetails, monthStr);
                    const taskData = findOrCreateTask(monthData, taskName);
                    if (!taskData.checked) {
                        allChecked = false;
                    }
                });

                allTaskNames.forEach((taskName, rowIndex) => {
                    const monthData = findOrCreateMonthlyTask(clientDetails, monthStr);
                    const taskData = findOrCreateTask(monthData, taskName);
                    taskData.checked = !allChecked;
                    const checkbox = detailsTableBody.rows[rowIndex].cells[columnIndex].querySelector('.task-checkbox');
                    if (checkbox) {
                        checkbox.checked = taskData.checked;
                        checkbox.parentNode.classList.toggle('task-completed', checkbox.checked);
                    }
                });

                updateMonthlyStatus(findOrCreateMonthlyTask(clientDetails, monthStr), allTaskNames);
                setUnsavedChanges(true);
            });
            taskHeaderRow.appendChild(th);
        });

        allTaskNames.forEach(taskName => {
            const taskRow = detailsTableBody.insertRow();
            taskRow.insertCell().textContent = taskName;
            monthsToDisplay.forEach(monthStr => {
                const cell = taskRow.insertCell();
                cell.className = 'task-input-cell';

                const monthData = findOrCreateMonthlyTask(clientDetails, monthStr);
                const taskData = findOrCreateTask(monthData, taskName);

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'task-checkbox';
                checkbox.checked = taskData.checked;
                checkbox.disabled = isYearFinalized;
                cell.appendChild(checkbox);

                const memoTextarea = document.createElement('textarea');
                memoTextarea.className = 'task-memo';
                memoTextarea.value = taskData.note || '';
                //memoTextarea.placeholder = 'タスクメモ...';
                memoTextarea.rows = 1;
                memoTextarea.disabled = isYearFinalized;
                cell.appendChild(memoTextarea);

                if (checkbox.checked) cell.classList.add('task-completed');

                checkbox.addEventListener('change', () => {
                    if (hasConflict) return;
                    taskData.checked = checkbox.checked;
                    updateMonthlyStatus(monthData, allTaskNames);
                    cell.classList.toggle('task-completed', checkbox.checked);
                    setUnsavedChanges(true);
                });

                memoTextarea.addEventListener('input', (e) => {
                    if (hasConflict) return;
                    taskData.note = e.target.value;
                    setUnsavedChanges(true);
                });
            });
        });

        const statusRow = detailsTableBody.insertRow();
        statusRow.insertCell().textContent = '月次ステータス';
        monthsToDisplay.forEach(monthStr => {
            const statusCell = statusRow.insertCell();
            statusCell.className = 'monthly-status';
            const monthData = findOrCreateMonthlyTask(clientDetails, monthStr);
            // Calculate and set the initial status, then render the cell
            updateMonthlyStatus(monthData, allTaskNames);
        });
    }

    function renderUrlAndMemoTable(isYearFinalized) {
        const notesHeaderRow = notesTableHead.insertRow();
        const firstHeader = document.createElement('th');
        firstHeader.textContent = '項目';
        notesHeaderRow.appendChild(firstHeader);
        monthsToDisplay.forEach(monthStr => {
            const th = document.createElement('th');
            th.textContent = monthStr;
            th.classList.add('month-header');
            notesHeaderRow.appendChild(th);
        });

        const urlRow = notesTableBody.insertRow();
        urlRow.insertCell().textContent = 'URL';
        monthsToDisplay.forEach(monthStr => {
            const monthData = findOrCreateMonthlyTask(clientDetails, monthStr);
            const urlCell = urlRow.insertCell();
            const urlInput = document.createElement('input');
            urlInput.type = 'text';
            urlInput.value = monthData.url || '';
            //urlInput.placeholder = 'URLを入力';
            urlInput.disabled = isYearFinalized;
            urlInput.addEventListener('input', (e) => {
                if (hasConflict) return;
                monthData.url = e.target.value;
                setUnsavedChanges(true);
            });
            urlCell.appendChild(urlInput);
        });

        const memoRow = notesTableBody.insertRow();
        memoRow.classList.add('memo-row');
        memoRow.insertCell().textContent = 'メモ';
        monthsToDisplay.forEach(monthStr => {
            const monthData = findOrCreateMonthlyTask(clientDetails, monthStr);
            const memoCell = memoRow.insertCell();
            const memoTextarea = document.createElement('textarea');
            memoTextarea.value = monthData.memo || '';
           // memoTextarea.placeholder = '月次のメモを入力';
            memoTextarea.rows = 4;
            memoTextarea.disabled = isYearFinalized;
            memoTextarea.addEventListener('input', (e) => {
                if (hasConflict) return;
                monthData.memo = e.target.value;
                setUnsavedChanges(true);
            });
            memoCell.appendChild(memoTextarea);
        });
    }

    function updateStatusCell(cell, monthData) {
        if (!monthData || !monthData.status) {
            cell.textContent = '-';
            cell.style.backgroundColor = '#f0f0f0';
            return;
        }

        cell.textContent = monthData.status;
        switch (monthData.status) {
            case '月次完了':
                cell.style.backgroundColor = '#ccffcc';
                break;
            case '未入力':
                cell.style.backgroundColor = '#e0e0e0';
                break;
            case '作業中':
                cell.style.backgroundColor = '#ffff99';
                break;
            default:
                cell.style.backgroundColor = '#f0f0f0';
                break;
        }
    }

     function updateMonthlyStatus(monthData, taskNames) {
        const oldStatus = monthData.status; // Get status before calculation

        const totalTasks = taskNames.length;
        if (totalTasks === 0) {
            monthData.status = '-';
        } else {
            const completedTasks = taskNames.filter(task => monthData.tasks[task]?.checked).length;
            if (completedTasks === totalTasks) {
                monthData.status = '月次完了';
            } else if (completedTasks === 0) {
                monthData.status = '未入力';
            } else {
                monthData.status = '作業中';
            }
        }

        const monthIndex = monthsToDisplay.findIndex(m => m === monthData.month);
        if (monthIndex === -1) return;

        const statusRow = detailsTableBody.querySelector('tr:last-child');
        if(!statusRow) return;
        const statusCell = statusRow.cells[monthIndex + 1];
        updateStatusCell(statusCell, monthData);

        // Confetti effect if status changed to '月次完了'
        if (monthData.status === '月次完了' && oldStatus !== '月次完了') {
            // Left cannon
            confetti({
                particleCount: 100,
                angle: 60,
                spread: 55,
                origin: { x: 0 }
            });
            // Right cannon
            confetti({
                particleCount: 100,
                angle: 120,
                spread: 55,
                origin: { x: 1 }
            });
        }
    }

    // --- Helper Functions ---
    function findOrCreateMonthlyTask(clientDetails, monthStr) {
        let monthData = clientDetails.monthly_tasks.find(mt => mt.month === monthStr);
        if (!monthData) {
            monthData = { month: monthStr, tasks: {}, url: '', memo: '' };
            clientDetails.monthly_tasks.push(monthData);
        }
        return monthData;
    }

    function findOrCreateTask(monthData, taskName) {
        if (!monthData.tasks[taskName]) {
            monthData.tasks[taskName] = { checked: false, note: '' };
        }
        return monthData.tasks[taskName];
    }

    // --- Custom Tasks Sync Functions ---
    async function syncCustomTasksToDatabase(year, customTasks) {
        const response = await fetch(`${API_BASE_URL}/clients/${clientNo}/custom-tasks/${year}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                custom_tasks: customTasks
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to sync custom tasks');
        }

        return response.json();
    }

    async function checkCustomTasksSync() {
        const response = await fetch(`${API_BASE_URL}/clients/${clientNo}/custom-tasks/sync-check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                custom_tasks_by_year: clientDetails.custom_tasks_by_year || {}
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to check sync');
        }

        return response.json();
    }

    function showSyncStatus(message, type) {
        const statusDiv = document.createElement('div');
        statusDiv.className = `sync-status ${type}`;
        statusDiv.textContent = message;
        statusDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 10000;
            font-weight: bold;
            ${type === 'success' ? 'background: #4CAF50; color: white;' : 'background: #f44336; color: white;'}
        `;
        
        document.body.appendChild(statusDiv);
        
        setTimeout(() => {
            document.body.removeChild(statusDiv);
        }, 3000);
    }

    async function cleanupDeletedTasks(year, deletedTasks) {
        const response = await fetch(`${API_BASE_URL}/clients/${clientNo}/cleanup-deleted-tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                year: year,
                deleted_tasks: deletedTasks
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to cleanup deleted tasks');
        }

        return response.json();
    }

    async function propagateTasksToDatabase(sourceYear, targetYears = []) {
        const response = await fetch(`${API_BASE_URL}/clients/${clientNo}/propagate-tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                source_year: sourceYear,
                target_years: targetYears
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to propagate tasks');
        }

        return response.json();
    }

    // Add accordion management menu to the UI
    function addManagementButtons() {
        // Hide the original finalize button since it's now in the accordion
        if (finalizeYearButton) {
            finalizeYearButton.style.display = 'none';
        }

        // Create accordion container
        const accordionContainer = document.createElement('div');
        accordionContainer.className = 'accordion-container';
        accordionContainer.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            width: 280px;
            z-index: 1000;
            border: 1px solid #ddd;
            border-radius: 6px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        `;

        // Create accordion header
        const accordionHeader = document.createElement('button');
        accordionHeader.className = 'accordion-header';
        accordionHeader.innerHTML = `
            <span>📋 データ管理メニュー</span>
            <span class="accordion-icon">▼</span>
        `;
        accordionHeader.style.cssText = `
            width: 100%;
            padding: 12px 16px;
            background: #f8f9fa;
            border: none;
            text-align: left;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
            font-weight: bold;
            color: #333;
            transition: background-color 0.2s;
        `;

        // Create accordion content
        const accordionContent = document.createElement('div');
        accordionContent.className = 'accordion-content';
        accordionContent.style.cssText = `
            display: none;
            padding: 16px;
            background: #fff;
            border-top: 1px solid #ddd;
        `;

        // Create buttons container inside accordion
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

        // Data sync check button
        const syncButton = document.createElement('button');
        syncButton.innerHTML = `
            <span>🔄</span>
            <span>データ整合性チェック</span>
        `;
        syncButton.className = 'accordion-button sync-check-button';
        syncButton.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            background: #2196F3;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        `;
        
        syncButton.addEventListener('mouseover', () => {
            syncButton.style.backgroundColor = '#1976D2';
        });
        
        syncButton.addEventListener('mouseout', () => {
            syncButton.style.backgroundColor = '#2196F3';
        });

        syncButton.addEventListener('click', async () => {
            try {
                const result = await checkCustomTasksSync();
                
                if (result.is_synced) {
                    showSyncStatus('データは同期されています', 'success');
                } else {
                    console.log('Sync mismatches found:', result.mismatches);
                    showSyncStatus(`${result.mismatches.length}件の不整合を検出しました`, 'error');
                    
                    // Show detailed mismatch information
                    let details = 'データベースとの不整合:\n';
                    result.mismatches.forEach(mismatch => {
                        details += `\n年度 ${mismatch.year}:`;
                        if (mismatch.missing_in_db.length > 0) {
                            details += `\n  DBに未反映: ${mismatch.missing_in_db.join(', ')}`;
                        }
                        if (mismatch.missing_in_frontend.length > 0) {
                            details += `\n  フロントエンドに未反映: ${mismatch.missing_in_frontend.join(', ')}`;
                        }
                    });
                    
                    if (confirm(details + '\n\nデータベースの内容でフロントエンドを更新しますか？')) {
                        clientDetails.custom_tasks_by_year = result.db_tasks_by_year;
                        renderDetails();
                        showSyncStatus('フロントエンドを更新しました', 'success');
                    }
                }
            } catch (error) {
                console.error('Sync check failed:', error);
                showSyncStatus('整合性チェックに失敗しました', 'error');
            }
        });

        // Propagate to future years button
        const propagateButton = document.createElement('button');
        propagateButton.innerHTML = `
            <span>🔄</span>
            <span>項目を翌期以降に再反映</span>
        `;
        propagateButton.className = 'accordion-button propagate-button';
        propagateButton.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            background: #FF9800;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        `;
        
        propagateButton.addEventListener('mouseover', () => {
            propagateButton.style.backgroundColor = '#F57C00';
        });
        
        propagateButton.addEventListener('mouseout', () => {
            propagateButton.style.backgroundColor = '#FF9800';
        });
        
        propagateButton.addEventListener('click', async () => {
            if (confirm(`${currentYearSelection}年の項目構成を翌期以降の未確定年度にすべて再反映しますか？\n（既に確定済みの年度は変更されません）`)) {
                try {
                    const result = await propagateTasksToDatabase(currentYearSelection);
                    showSyncStatus(`${result.propagated_to.length}年度に項目を再反映しました`, 'success');
                    
                    // Update frontend data
                    result.propagated_to.forEach(year => {
                        if (!clientDetails.custom_tasks_by_year) {
                            clientDetails.custom_tasks_by_year = {};
                        }
                        clientDetails.custom_tasks_by_year[year] = [...result.tasks];
                    });
                    
                    renderDetails();
                } catch (error) {
                    console.error('Failed to propagate tasks:', error);
                    showSyncStatus('項目の再反映に失敗しました', 'error');
                }
            }
        });

        // Finalize year button
        const finalizeButton = document.createElement('button');
        finalizeButton.className = 'accordion-button finalize-button';
        
        // Function to update finalize button display
        function updateFinalizeButton() {
            const isFinalized = clientDetails.finalized_years && 
                               clientDetails.finalized_years.includes(currentYearSelection);
            
            if (isFinalized) {
                finalizeButton.innerHTML = `
                    <span>🔓</span>
                    <span>${currentYearSelection}年度の確定を解除</span>
                `;
                finalizeButton.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 14px;
                    background: #FF5722;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: background-color 0.2s;
                `;
                finalizeButton.onmouseover = () => {
                    finalizeButton.style.backgroundColor = '#D84315';
                };
                finalizeButton.onmouseout = () => {
                    finalizeButton.style.backgroundColor = '#FF5722';
                };
            } else {
                finalizeButton.innerHTML = `
                    <span>🔒</span>
                    <span>${currentYearSelection}年度の項目を確定</span>
                `;
                finalizeButton.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 14px;
                    background: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: background-color 0.2s;
                `;
                finalizeButton.onmouseover = () => {
                    finalizeButton.style.backgroundColor = '#388E3C';
                };
                finalizeButton.onmouseout = () => {
                    finalizeButton.style.backgroundColor = '#4CAF50';
                };
            }
        }
        
        // Initial update
        updateFinalizeButton();

        finalizeButton.addEventListener('click', () => {
            // Use existing finalize functionality
            finalizeYearButton.click();
            // Update button after action
            setTimeout(() => {
                updateFinalizeButton();
            }, 100);
        });
        
        // Store reference for later updates
        window.updateFinalizeButton = updateFinalizeButton;

        // Accordion toggle functionality
        let isOpen = false;
        accordionHeader.addEventListener('click', () => {
            isOpen = !isOpen;
            const icon = accordionHeader.querySelector('.accordion-icon');
            
            if (isOpen) {
                accordionContent.style.display = 'block';
                icon.textContent = '▲';
                accordionHeader.style.backgroundColor = '#e9ecef';
            } else {
                accordionContent.style.display = 'none';
                icon.textContent = '▼';
                accordionHeader.style.backgroundColor = '#f8f9fa';
            }
        });

        accordionHeader.addEventListener('mouseover', () => {
            if (!isOpen) {
                accordionHeader.style.backgroundColor = '#e9ecef';
            }
        });

        accordionHeader.addEventListener('mouseout', () => {
            accordionHeader.style.backgroundColor = isOpen ? '#e9ecef' : '#f8f9fa';
        });

        // Assemble the accordion
        buttonsContainer.appendChild(syncButton);
        buttonsContainer.appendChild(propagateButton);
        buttonsContainer.appendChild(finalizeButton);

        const exportButton = document.createElement('button');
        exportButton.innerHTML = `
            <span>📄</span>
            <span>CSVエクスポート</span>
        `;
        exportButton.className = 'accordion-button export-button';
        exportButton.style.background = '#607D8B';
        exportButton.addEventListener('click', exportClientDataToCSV);
        buttonsContainer.appendChild(exportButton);

        accordionContent.appendChild(buttonsContainer);
        accordionContainer.appendChild(accordionHeader);
        accordionContainer.appendChild(accordionContent);
        
        // Add container to body for absolute positioning
        document.body.appendChild(accordionContainer);
    }

    // --- CSV Export Logic ---
    function exportClientDataToCSV() {
        if (!clientDetails) {
            alert('クライアントデータが読み込まれていません。');
            return;
        }

        const headers = ['No.', '事業者名', '月', 'タスク名', 'チェック状態', 'タスクごとのメモ', '月次URL', '月次メモ'];
        const rows = [];

        // Get all task names for the currently selected year
        const currentTasks = clientDetails.custom_tasks_by_year[currentYearSelection] || [];

        // Iterate over each month displayed on the screen
        monthsToDisplay.forEach(monthStr => {
            const monthData = findOrCreateMonthlyTask(clientDetails, monthStr);
            
            // Iterate over each task defined for the current year
            currentTasks.forEach(taskName => {
                const taskData = findOrCreateTask(monthData, taskName);
                const row = {
                    no: clientDetails.id,
                    name: clientDetails.name,
                    month: monthStr,
                    taskName: taskName,
                    checked: taskData.checked ? 'TRUE' : 'FALSE',
                    taskNote: taskData.note || '',
                    monthlyUrl: monthData.url || '',
                    monthlyMemo: monthData.memo || ''
                };
                rows.push(row);
            });
        });

        if (rows.length === 0) {
            alert('エクスポートするデータがありません。');
            return;
        }

        const csvContent = [headers.join(',')] 
            .concat(rows.map(row => 
                headers.map(header => {
                    // Map header to the correct key in the row object
                    const keyMap = {
                        'No.': 'no',
                        '事業者名': 'name',
                        '月': 'month',
                        'タスク名': 'taskName',
                        'チェック状態': 'checked',
                        'タスクごとのメモ': 'taskNote',
                        '月次URL': 'monthlyUrl',
                        '月次メモ': 'monthlyMemo'
                    };
                    const key = keyMap[header];
                    let cell = row[key] === null || row[key] === undefined ? '' : String(row[key]);
                    // Escape quotes and wrap in quotes if it contains comma, newline or quote
                    if (/[,"\n]/.test(cell)) {
                        cell = '"' + cell.replace(/"/g, '""') + '"';
                    }
                    return cell;
                }).join(',')
            )).join('\n');

        downloadCSV(csvContent);
    }

    function downloadCSV(csvContent) {
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        
        const today = new Date();
        const dateStr = `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
        const filename = `client_${clientDetails.id}_${dateStr}.csv`;

        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- Page Unload Event Handling ---
    window.addEventListener('beforeunload', endEditingSession);
    window.addEventListener('unload', endEditingSession);
    
    // Handle browser tab close / navigation away
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            endEditingSession();
        }
    });

    // Handle navigation to main page
    const backToMainLink = document.getElementById('back-to-main');
    if (backToMainLink) {
        backToMainLink.addEventListener('click', async (e) => {
            e.preventDefault(); // Prevent immediate navigation
            
            // End editing session and wait for completion
            try {
                await endEditingSession();
                console.log('Editing session ended successfully');
            } catch (error) {
                console.error('Error ending session:', error);
            }
            
            // Navigate to main page after session is ended
            window.location.href = 'index.html';
        });
    }

    // --- Run Application ---
    initializeApp().then(() => {
        addManagementButtons();
    });
});
