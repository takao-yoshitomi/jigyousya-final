import { SupabaseAPI, handleSupabaseError } from './supabase-client.js';

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
    const loadingIndicator = document.getElementById('loading-indicator');
    const connectionStatus = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');

    // --- Task Edit Modal Elements ---
    const taskEditModal = document.getElementById('task-edit-modal');
    const taskListContainer = document.getElementById('task-list-container');
    const newTaskInput = document.getElementById('new-task-input');
    const addTaskButton = document.getElementById('add-task-button');
    const saveTasksButton = document.getElementById('save-tasks-button');
    const cancelTasksButton = document.getElementById('cancel-tasks-button');
    const closeModalButton = taskEditModal.querySelector('.close-button');

    // --- Zoom Slider Elements ---
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomValue = document.getElementById('zoom-value');
    const mainContainer = document.querySelector('.container');

    // --- State Variables ---
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id') || urlParams.get('no'); // Support both parameters
    let clientDetails = null;
    let currentYearSelection = new Date().getFullYear().toString();
    let monthsToDisplay = [];
    let allTaskNames = [];
    let isSaving = false;
    let hasUnsavedChanges = false;
    let saveStatusTimeout;

    // --- Editing Session Variables ---
    let isEditingMode = true;
    let currentUserId = null;
    let sessionCheckInterval = null;

    // --- Utility Functions ---
    function showStatus(message, type = 'info') {
        connectionStatus.className = type;
        connectionStatus.style.display = 'block';
        statusText.textContent = message;
    }

    function hideStatus() {
        connectionStatus.style.display = 'none';
    }

    function showLoading() {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
        }
    }

    function hideLoading() {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }

    function setUnsavedChanges(isDirty) {
        hasUnsavedChanges = isDirty;
        saveChangesButton.disabled = !isDirty || isSaving;
    }

    function showNotification(message, type = 'info') {
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

        const colors = {
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FF9800',
            error: '#f44336'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        notification.textContent = message;

        notification.style.transform = 'translateX(0)';
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
        }, 3000);
    }

    // --- Data Loading Functions ---
    async function loadClientDetails() {
        try {
            showLoading();
            showStatus('クライアントデータを読み込み中...', 'warning');

            clientDetails = await SupabaseAPI.getClient(clientId);
            
            if (!clientDetails) {
                throw new Error('クライアントが見つかりません');
            }

            console.log('Client details loaded:', clientDetails);
            
            // Initialize data structures if missing
            if (!clientDetails.custom_tasks_by_year) {
                clientDetails.custom_tasks_by_year = {};
            }
            if (!clientDetails.finalized_years) {
                clientDetails.finalized_years = [];
            }

            // Check if client needs initial task setup
            await checkAndSetupInitialTasks();

            showStatus('✅ データ読み込み完了', 'success');
            setTimeout(hideStatus, 2000);

        } catch (error) {
            console.error('Error loading client details:', error);
            showStatus('❌ データ読み込みエラー: ' + handleSupabaseError(error), 'error');
            throw error;
        } finally {
            hideLoading();
        }
    }

    async function checkAndSetupInitialTasks() {
        try {
            const setupCheck = await SupabaseAPI.checkIfClientNeedsInitialSetup(clientId);
            
            if (setupCheck.needs) {
                showStatus('初期タスクを設定中...', 'warning');
                
                const setupResult = await SupabaseAPI.setupInitialTasksForClient(clientId);
                
                // Update local client details
                clientDetails.custom_tasks_by_year = setupResult.client.custom_tasks_by_year;
                
                showNotification(`${clientDetails.accounting_method}の初期タスクを設定しました`, 'success');
                console.log('Initial tasks setup completed:', setupResult.tasks);
            } else {
                console.log('Initial tasks setup not needed:', setupCheck.reason);
            }
        } catch (error) {
            console.error('Error setting up initial tasks:', error);
            showNotification('初期タスク設定でエラーが発生しました', 'error');
        }
    }

    // --- Year Management Functions ---
    function determineOptimalYear() {
        if (!clientDetails || !clientDetails.finalized_years) {
            return new Date().getFullYear().toString();
        }

        const finalizedYears = clientDetails.finalized_years.map(year => parseInt(year)).sort((a, b) => b - a);
        
        if (finalizedYears.length === 0) {
            return new Date().getFullYear().toString();
        }

        const latestFinalizedYear = finalizedYears[0];
        const nextYear = latestFinalizedYear + 1;
        
        console.log(`Latest finalized year: ${latestFinalizedYear}, selecting: ${nextYear}`);
        return nextYear.toString();
    }

    function inheritFromPreviousYear(targetYear) {
        if (!clientDetails.custom_tasks_by_year) return [];
        
        const targetYearNum = parseInt(targetYear);
        let tasksToInherit = [];
        
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
        const endYear = Math.max(currentYear + 10, fromYearNum + 10);
        
        let propagatedCount = 0;
        
        for (let year = fromYearNum + 1; year <= endYear; year++) {
            const yearStr = year.toString();
            
            if (clientDetails.finalized_years.includes(yearStr)) {
                continue;
            }
            
            if (clientDetails.custom_tasks_by_year[yearStr]) {
                clientDetails.custom_tasks_by_year[yearStr] = [...newTasks];
                propagatedCount++;
            }
        }
        
        if (propagatedCount > 0) {
            console.log(`Propagated tasks from ${fromYear} to ${propagatedCount} future years`);
            showNotification(`タスク変更を${propagatedCount}つの未完了年度にも適用しました`, 'info');
        }
    }

    // --- Year Finalization Functions ---
    async function finalizeYear(year, shouldFinalize) {
        try {
            showStatus('年度確定処理中...', 'warning');

            if (!clientDetails.finalized_years) {
                clientDetails.finalized_years = [];
            }

            if (shouldFinalize) {
                if (!clientDetails.finalized_years.includes(year)) {
                    clientDetails.finalized_years.push(year);
                }
            } else {
                clientDetails.finalized_years = clientDetails.finalized_years.filter(y => y !== year);
            }

            // Update client in database
            await SupabaseAPI.updateClient(clientId, {
                finalized_years: clientDetails.finalized_years
            });

            const action = shouldFinalize ? '確定' : '確定解除';
            showNotification(`${year}年度を${action}しました`, 'success');
            showStatus(`✅ ${year}年度${action}完了`, 'success');
            
            setTimeout(hideStatus, 2000);

            // Update UI
            updateFinalizeButtonState();
            updateEditingInterface();

        } catch (error) {
            console.error('Error finalizing year:', error);
            showStatus('❌ 年度確定エラー: ' + handleSupabaseError(error), 'error');
            showNotification('年度確定でエラーが発生しました', 'error');
        }
    }

    function updateFinalizeButtonState() {
        if (!finalizeYearButton) return;

        const isYearFinalized = clientDetails.finalized_years && 
                               clientDetails.finalized_years.includes(currentYearSelection);

        finalizeYearButton.textContent = isYearFinalized ? 
            `${currentYearSelection}年度の確定を解除` : 
            `${currentYearSelection}年度のタスクを確定`;

        finalizeYearButton.style.backgroundColor = isYearFinalized ? '#FF5722' : '#4CAF50';
    }

    function updateEditingInterface() {
        const isYearFinalized = clientDetails.finalized_years && 
                               clientDetails.finalized_years.includes(currentYearSelection);

        // Disable editing for finalized years
        editTasksButton.disabled = isYearFinalized;
        editTasksButton.textContent = isYearFinalized ? '確定済み (編集不可)' : 'タスクの編集';

        // Update table editing capabilities
        updateTableEditingState(!isYearFinalized);
    }

    function updateTableEditingState(canEdit) {
        // Enable/disable checkboxes and inputs based on editing state
        const checkboxes = document.querySelectorAll('#details-table input[type="checkbox"]');
        const textInputs = document.querySelectorAll('#notes-table input[type="text"], #notes-table textarea');

        checkboxes.forEach(checkbox => {
            checkbox.disabled = !canEdit;
        });

        textInputs.forEach(input => {
            input.disabled = !canEdit;
        });
    }

    // --- Task Management Functions ---
    function getCurrentYearTasks() {
        if (!clientDetails.custom_tasks_by_year) return [];
        
        let tasks = clientDetails.custom_tasks_by_year[currentYearSelection];
        
        if (!tasks || tasks.length === 0) {
            tasks = inheritFromPreviousYear(currentYearSelection);
            if (tasks.length > 0) {
                clientDetails.custom_tasks_by_year[currentYearSelection] = [...tasks];
            }
        }
        
        return tasks || [];
    }

    async function saveCustomTasks(newTasks) {
        try {
            showStatus('タスクを保存中...', 'warning');

            // Update local state
            clientDetails.custom_tasks_by_year[currentYearSelection] = newTasks;
            
            // Propagate to future years
            propagateTasksToFutureYears(currentYearSelection, newTasks);

            // Update client in database
            await SupabaseAPI.updateClient(clientId, {
                custom_tasks_by_year: clientDetails.custom_tasks_by_year
            });

            showNotification('タスクが保存されました', 'success');
            showStatus('✅ タスク保存完了', 'success');
            setTimeout(hideStatus, 2000);

            return true;
        } catch (error) {
            console.error('Error saving custom tasks:', error);
            showStatus('❌ タスク保存エラー: ' + handleSupabaseError(error), 'error');
            showNotification('タスク保存でエラーが発生しました', 'error');
            throw error;
        }
    }

    // --- Month Data Management ---
    async function loadMonthlyData(year) {
        try {
            monthsToDisplay = [];
            
            if (!clientDetails.fiscal_month) {
                console.warn('Fiscal month not set for client');
                return;
            }

            const fiscalMonth = clientDetails.fiscal_month;
            
            // Generate months for the fiscal year
            for (let i = 0; i < 12; i++) {
                let month = fiscalMonth + i;
                let displayYear = parseInt(year);
                
                if (month > 12) {
                    month -= 12;
                    displayYear += 1;
                }
                
                const monthKey = `${displayYear}-${month.toString().padStart(2, '0')}`;
                monthsToDisplay.push({
                    key: monthKey,
                    display: `${displayYear}/${month}`,
                    year: displayYear,
                    month: month
                });
            }

            console.log('Months to display:', monthsToDisplay);

        } catch (error) {
            console.error('Error loading monthly data:', error);
            showNotification('月次データの読み込みでエラーが発生しました', 'error');
        }
    }

    async function getMonthlyTask(clientId, monthKey) {
        try {
            const task = await SupabaseAPI.getMonthlyTasks(clientId, monthKey);
            return task || { tasks: {}, status: '', url: '', memo: '' };
        } catch (error) {
            console.error(`Error getting monthly task for ${monthKey}:`, error);
            return { tasks: {}, status: '', url: '', memo: '' };
        }
    }

    async function saveMonthlyTask(clientId, monthKey, taskData) {
        try {
            await SupabaseAPI.upsertMonthlyTask(clientId, monthKey, taskData);
        } catch (error) {
            console.error(`Error saving monthly task for ${monthKey}:`, error);
            throw error;
        }
    }

    // --- UI Rendering Functions ---
    async function renderClientInfo() {
        if (!clientDetails) return;

        const staffName = clientDetails.staffs?.name || clientDetails.staff_name || '-';
        const fiscalMonth = clientDetails.fiscal_month ? `${clientDetails.fiscal_month}月` : '-';
        const accountingMethod = clientDetails.accounting_method || '-';

        clientInfoArea.innerHTML = `
            <table class="client-info-table">
                <tr>
                    <th>事業所名</th>
                    <td>${clientDetails.name}</td>
                    <th>決算月</th>
                    <td>${fiscalMonth}</td>
                </tr>
                <tr>
                    <th>担当者</th>
                    <td>${staffName}</td>
                    <th>会計方式</th>
                    <td>${accountingMethod}</td>
                </tr>
            </table>
        `;
    }

    async function renderYearFilter() {
        if (!yearFilter) return;

        yearFilter.innerHTML = '';
        
        const currentYear = new Date().getFullYear();
        for (let year = currentYear - 5; year <= currentYear + 10; year++) {
            const option = document.createElement('option');
            option.value = year.toString();
            option.textContent = `${year}年度`;
            
            if (year.toString() === currentYearSelection) {
                option.selected = true;
            }
            
            yearFilter.appendChild(option);
        }

        // Update custom dropdown display
        const customTrigger = yearFilter.parentElement.querySelector('.custom-select-trigger');
        if (customTrigger) {
            customTrigger.textContent = `${currentYearSelection}年度`;
        }
    }

    async function renderDetailsTable() {
        if (!detailsTableHead || !detailsTableBody) return;

        const tasks = getCurrentYearTasks();
        allTaskNames = [...tasks];

        if (tasks.length === 0) {
            detailsTableHead.innerHTML = '<tr><th>月次データがありません</th></tr>';
            detailsTableBody.innerHTML = '<tr><td>タスクが設定されていません</td></tr>';
            return;
        }

        // Generate table header - 月を列として表示
        let headerHtml = '<tr><th>タスク</th>';
        monthsToDisplay.forEach(monthInfo => {
            headerHtml += `<th>${monthInfo.display}</th>`;
        });
        headerHtml += '<th>完了月数</th></tr>';
        detailsTableHead.innerHTML = headerHtml;

        // Collect all month data first
        const allMonthData = {};
        for (const monthInfo of monthsToDisplay) {
            allMonthData[monthInfo.key] = await getMonthlyTask(clientId, monthInfo.key);
        }

        // Generate table body - タスクを行として表示
        let bodyHtml = '';
        
        tasks.forEach(taskName => {
            let rowHtml = `<tr><td><strong>${taskName}</strong></td>`;
            
            let completedMonthCount = 0;
            monthsToDisplay.forEach(monthInfo => {
                const monthData = allMonthData[monthInfo.key];
                const isChecked = monthData.tasks[taskName] === true;
                if (isChecked) completedMonthCount++;
                
                rowHtml += `
                    <td style="text-align: center;">
                        <input type="checkbox" 
                               data-month="${monthInfo.key}" 
                               data-task="${taskName}"
                               ${isChecked ? 'checked' : ''}
                               ${!isEditingMode ? 'disabled' : ''}>
                    </td>
                `;
            });
            
            // Progress column - 完了月数/総月数
            const totalMonths = monthsToDisplay.length;
            const progressText = `${completedMonthCount}/${totalMonths}`;
            const progressClass = completedMonthCount === totalMonths ? 'progress-complete' : '';
            rowHtml += `<td class="${progressClass}" style="text-align: center;">${progressText}</td>`;
            
            rowHtml += '</tr>';
            bodyHtml += rowHtml;
        });
        
        detailsTableBody.innerHTML = bodyHtml;

        // Add event listeners to checkboxes
        addCheckboxEventListeners();
    }

    async function renderNotesTable() {
        if (!notesTableHead || !notesTableBody) return;

        notesTableHead.innerHTML = '<tr><th>月</th><th>URL</th><th>メモ</th></tr>';

        let bodyHtml = '';
        for (const monthInfo of monthsToDisplay) {
            const monthData = await getMonthlyTask(clientId, monthInfo.key);
            
            bodyHtml += `
                <tr>
                    <td>${monthInfo.display}</td>
                    <td>
                        <input type="text" 
                               data-month="${monthInfo.key}" 
                               data-field="url"
                               value="${monthData.url || ''}"
                               placeholder="URL"
                               ${!isEditingMode ? 'disabled' : ''}>
                    </td>
                    <td>
                        <textarea data-month="${monthInfo.key}" 
                                  data-field="memo"
                                  placeholder="メモ"
                                  ${!isEditingMode ? 'disabled' : ''}>${monthData.memo || ''}</textarea>
                    </td>
                </tr>
            `;
        }
        
        notesTableBody.innerHTML = bodyHtml;

        // Add event listeners
        addNotesEventListeners();
    }

    // --- Event Listeners ---
    function addCheckboxEventListeners() {
        const checkboxes = detailsTableBody.querySelectorAll('input[type="checkbox"]');
        
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                setUnsavedChanges(true);
                updateProgressDisplay();
            });
        });
    }

    function addNotesEventListeners() {
        const inputs = notesTableBody.querySelectorAll('input, textarea');
        
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                setUnsavedChanges(true);
            });
        });
    }

    function updateProgressDisplay() {
        const rows = detailsTableBody.querySelectorAll('tr');
        
        rows.forEach(row => {
            const checkboxes = row.querySelectorAll('input[type="checkbox"]');
            const progressCell = row.querySelector('td:last-child');
            
            if (checkboxes.length > 0 && progressCell) {
                let completedCount = 0;
                checkboxes.forEach(checkbox => {
                    if (checkbox.checked) completedCount++;
                });
                
                const total = checkboxes.length;
                const progressText = `${completedCount}/${total}`;
                const isComplete = completedCount === total && total > 0;
                
                progressCell.textContent = progressText;
                progressCell.className = isComplete ? 'progress-complete' : '';
            }
        });
    }

    // --- Task Edit Modal Functions ---
    function openTaskEditModal() {
        const currentTasks = getCurrentYearTasks();
        renderTaskEditModal(currentTasks);
        taskEditModal.style.display = 'block';
    }

    function renderTaskEditModal(tasks) {
        taskListContainer.innerHTML = '';
        
        tasks.forEach((task, index) => {
            const taskItem = document.createElement('div');
            taskItem.className = 'task-item';
            taskItem.innerHTML = `
                <input type="text" value="${task}" data-index="${index}">
                <button type="button" class="delete-task-button" data-index="${index}">削除</button>
            `;
            taskListContainer.appendChild(taskItem);
        });

        // Add event listeners
        addTaskEditEventListeners();
    }

    function addTaskEditEventListeners() {
        // Delete button listeners
        taskListContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-task-button')) {
                const taskItem = e.target.closest('.task-item');
                taskItem.remove();
            }
        });
    }

    function addNewTask() {
        const newTaskName = newTaskInput.value.trim();
        if (!newTaskName) return;

        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        taskItem.innerHTML = `
            <input type="text" value="${newTaskName}">
            <button type="button" class="delete-task-button">削除</button>
        `;
        taskListContainer.appendChild(taskItem);
        
        newTaskInput.value = '';
        addTaskEditEventListeners();
    }

    async function saveTaskChanges() {
        try {
            const taskInputs = taskListContainer.querySelectorAll('.task-item input');
            const newTasks = Array.from(taskInputs).map(input => input.value.trim()).filter(task => task);

            await saveCustomTasks(newTasks);
            
            taskEditModal.style.display = 'none';
            
            // Re-render the details table with new tasks
            await renderDetailsTable();
            
        } catch (error) {
            console.error('Error saving task changes:', error);
            showNotification('タスクの保存でエラーが発生しました', 'error');
        }
    }

    function closeTaskEditModal() {
        taskEditModal.style.display = 'none';
        newTaskInput.value = '';
    }

    // --- Save Changes Function ---
    async function saveAllChanges() {
        if (isSaving) return;

        try {
            isSaving = true;
            setUnsavedChanges(false);
            showStatus('保存中...', 'warning');

            const savePromises = [];

            // Save checkbox data
            const checkboxes = detailsTableBody.querySelectorAll('input[type="checkbox"]');
            const monthlyTasks = {};

            checkboxes.forEach(checkbox => {
                const month = checkbox.dataset.month;
                const task = checkbox.dataset.task;
                const isChecked = checkbox.checked;

                if (!monthlyTasks[month]) {
                    monthlyTasks[month] = { tasks: {} };
                }
                monthlyTasks[month].tasks[task] = isChecked;
            });

            // Save URL and memo data
            const urlInputs = notesTableBody.querySelectorAll('input[data-field="url"]');
            const memoInputs = notesTableBody.querySelectorAll('textarea[data-field="memo"]');

            urlInputs.forEach(input => {
                const month = input.dataset.month;
                if (!monthlyTasks[month]) {
                    monthlyTasks[month] = { tasks: {} };
                }
                monthlyTasks[month].url = input.value;
            });

            memoInputs.forEach(input => {
                const month = input.dataset.month;
                if (!monthlyTasks[month]) {
                    monthlyTasks[month] = { tasks: {} };
                }
                monthlyTasks[month].memo = input.value;
            });

            // Save all monthly tasks
            for (const [month, taskData] of Object.entries(monthlyTasks)) {
                savePromises.push(saveMonthlyTask(clientId, month, taskData));
            }

            await Promise.all(savePromises);

            showNotification('変更が保存されました', 'success');
            showStatus('✅ 保存完了', 'success');
            setTimeout(hideStatus, 2000);

        } catch (error) {
            console.error('Error saving changes:', error);
            showStatus('❌ 保存エラー: ' + handleSupabaseError(error), 'error');
            showNotification('保存でエラーが発生しました', 'error');
            setUnsavedChanges(true);
        } finally {
            isSaving = false;
        }
    }

    // --- Zoom Functionality ---
    function initializeZoom() {
        if (!zoomSlider || !zoomValue || !mainContainer) return;

        zoomSlider.addEventListener('input', (e) => {
            const zoomLevel = e.target.value;
            zoomValue.textContent = `${zoomLevel}%`;
            mainContainer.style.transform = `scale(${zoomLevel / 100})`;
            mainContainer.style.transformOrigin = 'top left';
        });
    }

    // --- Main Event Listeners ---
    function addMainEventListeners() {
        // Year filter change
        if (yearFilter) {
            yearFilter.addEventListener('change', async (e) => {
                currentYearSelection = e.target.value;
                await loadMonthlyData(currentYearSelection);
                await renderDetailsTable();
                await renderNotesTable();
                updateFinalizeButtonState();
                updateEditingInterface();
            });
        }

        // Edit tasks button
        if (editTasksButton) {
            editTasksButton.addEventListener('click', openTaskEditModal);
        }

        // Save changes button
        if (saveChangesButton) {
            saveChangesButton.addEventListener('click', saveAllChanges);
        }

        // Finalize year button
        if (finalizeYearButton) {
            finalizeYearButton.addEventListener('click', async () => {
                const isCurrentlyFinalized = clientDetails.finalized_years && 
                                           clientDetails.finalized_years.includes(currentYearSelection);
                
                const action = isCurrentlyFinalized ? '確定解除' : '確定';
                if (confirm(`${currentYearSelection}年度を${action}しますか？`)) {
                    await finalizeYear(currentYearSelection, !isCurrentlyFinalized);
                }
            });
        }

        // Task edit modal events
        if (addTaskButton) {
            addTaskButton.addEventListener('click', addNewTask);
        }

        if (saveTasksButton) {
            saveTasksButton.addEventListener('click', saveTaskChanges);
        }

        if (cancelTasksButton) {
            cancelTasksButton.addEventListener('click', closeTaskEditModal);
        }

        if (closeModalButton) {
            closeModalButton.addEventListener('click', closeTaskEditModal);
        }

        if (newTaskInput) {
            newTaskInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addNewTask();
                }
            });
        }

        // Modal background click
        window.addEventListener('click', (e) => {
            if (e.target === taskEditModal) {
                closeTaskEditModal();
            }
        });

        // Before unload warning
        window.addEventListener('beforeunload', (e) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

// --- CSV Export Logic (Supabase version needs rework) ---
function exportClientDataToCSV() {
    if (!clientDetails) {
        alert('クライアントデータが読み込まれていません。');
        return;
    }
    
    alert('CSVエクスポート機能は現在再実装中です。');
    console.log("Attempting to export data for client:", clientDetails.id);
    // The actual implementation will require async data fetching and is non-trivial.
    // For now, we just show a message.
}

function downloadCSV(csvContent) {
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
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


// Add accordion management menu to the UI
function addManagementButtons() {
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

    const accordionHeader = document.createElement('button');
    accordionHeader.className = 'accordion-header';
    accordionHeader.innerHTML = `
        <span>⚙️ データ管理メニュー</span>
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

    const accordionContent = document.createElement('div');
    accordionContent.className = 'accordion-content';
    accordionContent.style.cssText = `
        display: none;
        padding: 16px;
        background: #fff;
        border-top: 1px solid #ddd;
    `;

    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 12px;
    `;

    const syncButton = document.createElement('button');
    syncButton.innerHTML = `<span>🔄</span> <span>データ整合性チェック (準備中)</span>`;
    syncButton.className = 'accordion-button';
    syncButton.disabled = true;
    syncButton.style.cssText = 'padding: 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; text-align: left; display: flex; align-items: center; gap: 8px;';


    const propagateButton = document.createElement('button');
    propagateButton.innerHTML = `<span>🚀</span> <span>タスクを将来年度に伝播 (準備中)</span>`;
    propagateButton.className = 'accordion-button';
    propagateButton.disabled = true;
    propagateButton.style.cssText = 'padding: 10px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; text-align: left; display: flex; align-items: center; gap: 8px;';


    const exportButton = document.createElement('button');
    exportButton.innerHTML = `<span>📄</span> <span>CSVエクスポート</span>`;
    exportButton.className = 'accordion-button export-button';
    exportButton.addEventListener('click', exportClientDataToCSV);
    exportButton.style.cssText = 'padding: 10px; background: #607D8B; color: white; border: none; border-radius: 4px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;';


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
        if (!isOpen) accordionHeader.style.backgroundColor = '#e9ecef';
    });
    accordionHeader.addEventListener('mouseout', () => {
        if (!isOpen) accordionHeader.style.backgroundColor = '#f8f9fa';
    });

    buttonsContainer.appendChild(syncButton);
    buttonsContainer.appendChild(propagateButton);
    buttonsContainer.appendChild(exportButton);

    accordionContent.appendChild(buttonsContainer);
    accordionContainer.appendChild(accordionHeader);
    accordionContainer.appendChild(accordionContent);
    
    document.body.appendChild(accordionContainer);
}

    // --- Initialization ---
    async function initialize() {
        try {
            if (!clientId) {
                throw new Error('クライアントIDが指定されていません');
            }

            showStatus('アプリケーションを初期化中...', 'warning');

            // Load client data
            await loadClientDetails();

            // Determine optimal year
            currentYearSelection = determineOptimalYear();

            // Load monthly data for selected year
            await loadMonthlyData(currentYearSelection);

            // Render all components
            await Promise.all([
                renderClientInfo(),
                renderYearFilter(),
                renderDetailsTable(),
                renderNotesTable()
            ]);

            // Update UI states
            updateFinalizeButtonState();
            updateEditingInterface();

            // Initialize zoom
            initializeZoom();

            // Add event listeners
            addMainEventListeners();

            showStatus('✅ 初期化完了', 'success');
            setTimeout(hideStatus, 2000);

        } catch (error) {
            console.error('Error initializing application:', error);
            showStatus('❌ 初期化エラー: ' + handleSupabaseError(error), 'error');
            
            // Show error message to user
            if (clientInfoArea) {
                clientInfoArea.innerHTML = `
                    <div style="color: red; padding: 20px; text-align: center;">
                        <h3>エラーが発生しました</h3>
                        <p>${handleSupabaseError(error)}</p>
                        <button onclick="location.reload()">再読み込み</button>
                    </div>
                `;
            }
        }
    }

    // Start the application
    initialize().then(() => {
        addManagementButtons();
    });
});
