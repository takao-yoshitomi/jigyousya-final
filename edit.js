document.addEventListener('DOMContentLoaded', async () => {
    // Display user ID in header
    Config.displayUserId();
    // --- DOM Element Selectors ---
    const pageTitle = document.querySelector('h1');
    const clientNameDisplay = document.getElementById('client-name-display');
    const clientNoInput = document.getElementById('client-no');
    const clientNameInput = document.getElementById('client-name');
    const staffSelect = document.getElementById('staff-select');
    const fiscalMonthSelect = document.getElementById('fiscal-month');
    const accountingMethodSelect = document.getElementById('accounting-method');
    
    const saveButton = document.getElementById('save-button');
    
    // 削除関連の要素（存在しない場合はnull）
    const inactiveButton = document.getElementById('inactive-button');
    const deleteButton = document.getElementById('delete-button');
    const reactivateButton = document.getElementById('reactivate-button');
    const inactiveStatusBadge = document.getElementById('inactive-status-badge');
    const deleteModal = document.getElementById('delete-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalClientNo = document.getElementById('modal-client-no');
    const modalClientName = document.getElementById('modal-client-name');
    const modalCancel = document.getElementById('modal-cancel');
    const modalConfirm = document.getElementById('modal-confirm');
    

    // --- State Variables ---
    const API_BASE_URL = Config.getApiBaseUrl();
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('no') ? parseInt(urlParams.get('no')) : null;
    const isNewMode = clientId === null;
    let currentClient = null;
    let staffs = [];

    // --- Initialization ---
    async function initializeApp() {
        try {
            staffs = await fetchStaffs();
            if (isNewMode) {
                initializeNewMode();
            } else {
                await initializeEditMode();
            }
            initializeAllCustomDropdowns();
            saveButton.addEventListener('click', saveDataHandler);
            
            // 削除機能は編集モードでのみ有効（かつ要素が存在する場合のみ）
            if (!isNewMode && inactiveButton && deleteButton && deleteModal) {
                inactiveButton.addEventListener('click', () => showDeleteModal('inactive'));
                deleteButton.addEventListener('click', () => showDeleteModal('delete'));
                
                // 復活ボタンがある場合はイベントリスナーを追加
                if (reactivateButton) {
                    reactivateButton.addEventListener('click', () => showDeleteModal('reactivate'));
                }
                
                if (modalCancel && modalConfirm) {
                    modalCancel.addEventListener('click', hideDeleteModal);
                    modalConfirm.addEventListener('click', handleModalConfirm);
                }
                
                // ESCキーでモーダルを閉じる
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && deleteModal.style.display === 'flex') {
                        hideDeleteModal();
                    }
                });
            }
        } catch (error) {
            console.error("Initialization failed:", error);
            pageTitle.textContent = 'エラー';
            document.getElementById('edit-form').innerHTML = '<p>ページの初期化中にエラーが発生しました。</p>';
        }
    }

    // --- Data Fetching ---
    async function fetchStaffs() {
        try {
            const response = await fetch(`${API_BASE_URL}/staffs`);
            if (!response.ok) throw new Error('担当者リストの取得に失敗しました。');
            return await response.json();
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    async function fetchClientDetails(id) {
        try {
            const response = await fetch(`${API_BASE_URL}/clients/${id}`);
            if (response.status === 404) return null;
            if (!response.ok) throw new Error('顧客詳細の取得に失敗しました。');
            return await response.json();
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    // --- Mode Initializers ---
    function initializeNewMode() {
        pageTitle.textContent = '顧客新規登録';
        pageTitle.style.color = 'red';
        clientNameDisplay.style.display = 'none';
        clientNoInput.readOnly = false;
        populateStaffDropdown();
        
    }

    async function initializeEditMode() {
        currentClient = await fetchClientDetails(clientId);
        if (currentClient) {
            pageTitle.textContent = '顧客情報編集';
            clientNameDisplay.textContent = currentClient.name;
            clientNoInput.value = currentClient.id;
            clientNoInput.readOnly = true;
            clientNameInput.value = currentClient.name;
            
            populateStaffDropdown(currentClient.staff_id);

            fiscalMonthSelect.value = `${currentClient.fiscal_month}月`;
            accountingMethodSelect.value = currentClient.accounting_method;
            

            // 編集モードの場合、削除エリアを表示
            const dangerZone = document.querySelector('.danger-zone');
            if (dangerZone) {
                dangerZone.style.display = 'block';
            }

            // 関与終了状態の表示制御
            if (currentClient.is_inactive) {
                // 関与終了バッジを表示
                if (inactiveStatusBadge) {
                    inactiveStatusBadge.style.display = 'inline-block';
                }
                
                // ボタンの表示制御：復活ボタンを表示、関与終了ボタンを非表示
                if (reactivateButton) {
                    reactivateButton.style.display = 'inline-block';
                }
                if (inactiveButton) {
                    inactiveButton.style.display = 'none';
                }
            } else {
                // アクティブ状態：関与終了バッジを非表示、復活ボタンを非表示
                if (inactiveStatusBadge) {
                    inactiveStatusBadge.style.display = 'none';
                }
                if (reactivateButton) {
                    reactivateButton.style.display = 'none';
                }
                if (inactiveButton) {
                    inactiveButton.style.display = 'inline-block';
                }
            }

        } else {
            pageTitle.textContent = 'エラー';
            document.getElementById('edit-form').innerHTML = '<p>指定されたクライアントが見つかりません。</p>';
            saveButton.disabled = true;
        }
    }

    // --- Helper Functions ---
    function populateStaffDropdown(selectedStaffId = null) {
        staffSelect.innerHTML = '<option value="">選択してください</option>';
        staffs.forEach(staff => {
            const option = document.createElement('option');
            option.value = staff.id;
            option.textContent = staff.name;
            if (selectedStaffId !== null && staff.id === selectedStaffId) {
                option.selected = true;
            }
            staffSelect.appendChild(option);
        });
    }

    function initializeAllCustomDropdowns() {
        document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
            const select = wrapper.querySelector('.custom-select-target');
            if (select) {
                initializeCustomDropdown(select);
                const trigger = wrapper.querySelector('.custom-select-trigger');
                if (select.value && select.selectedIndex > -1) {
                    trigger.textContent = select.options[select.selectedIndex].textContent;
                } else {
                    trigger.textContent = select.options[0]?.textContent || '選択してください';
                }
            }
        });
    }

    // --- Save Logic ---
    async function saveDataHandler() {
        const clientNoValue = clientNoInput.value.trim();
        const clientData = {
            ...(isNewMode && { id: parseInt(clientNoValue) }),
            name: clientNameInput.value.trim(),
            staff_id: parseInt(staffSelect.value),
            fiscal_month: parseInt(fiscalMonthSelect.value.replace('月', '')),
            accounting_method: accountingMethodSelect.value,
            
        };

        if (isNewMode && !clientNoValue) {
            alert('No.を入力してください。');
            return;
        }
        if (isNewMode && (isNaN(clientData.id) || clientData.id <= 0)) {
            alert('No.は正の整数で入力してください。');
            return;
        }
        if (!clientData.name || !clientData.staff_id || !clientData.fiscal_month || !clientData.accounting_method) {
            alert('すべての必須項目を入力または選択してください。');
            return;
        }
        
        saveButton.disabled = true;
        saveButton.textContent = '保存中...';

        try {
            let response;
            if (isNewMode) {
                response = await fetch(`${API_BASE_URL}/clients`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(clientData),
                });
            } else {
                clientData.updated_at = currentClient.updated_at;
                response = await fetch(`${API_BASE_URL}/clients/${clientId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(clientData),
                });
            }

            if (response.status === 409) {
                const errorData = await response.json();
                alert(errorData.error || 'データが競合しました。ページをリロードします。');
                window.location.reload();
                return;
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '保存に失敗しました。');
            }

            const savedClient = await response.json();
            alert('保存しました！');
            window.location.href = 'index.html';

        } catch (error) {
            alert(`エラー: ${error.message}`);
            saveButton.disabled = false;
            saveButton.textContent = '保存';
        }
    }

    // --- Delete and Modal Functions ---
    let currentAction = null; // 'inactive' or 'delete'
    
    function showDeleteModal(action) {
        // モーダル表示前の安全チェック
        if (!deleteModal || !modalTitle || !modalMessage || !modalConfirm || !modalClientNo || !modalClientName) {
            console.error('削除モーダル要素が見つかりません');
            return;
        }
        
        currentAction = action;
        
        if (action === 'inactive') {
            modalTitle.textContent = '関与終了の確認';
            modalMessage.textContent = 'この事業者を関与終了にしますか？（データは保持され、設定により非表示にできます）';
            modalConfirm.textContent = '関与終了';
            modalConfirm.style.backgroundColor = '#f0ad4e';
        } else if (action === 'delete') {
            modalTitle.textContent = '削除の確認';
            modalMessage.textContent = 'この事業者を完全に削除しますか？（この操作は取り消せません）';
            modalConfirm.textContent = '削除';
            modalConfirm.style.backgroundColor = '#d9534f';
        } else if (action === 'reactivate') {
            modalTitle.textContent = '復活の確認';
            modalMessage.textContent = 'この事業者を復活させますか？（関与終了状態を解除し、通常の事業者として表示されます）';
            modalConfirm.textContent = '復活';
            modalConfirm.style.backgroundColor = '#5cb85c';
        }
        
        modalClientNo.textContent = currentClient.id;
        modalClientName.textContent = currentClient.name;
        
        // モーダルを慎重に表示（!importantを一時的に無効化）
        deleteModal.style.setProperty('display', 'flex', 'important');
    }
    
    function hideDeleteModal() {
        if (deleteModal) {
            deleteModal.style.setProperty('display', 'none', 'important');
        }
        currentAction = null;
    }
    
    async function handleModalConfirm() {
        if (!currentAction) return;
        
        modalConfirm.disabled = true;
        const originalText = modalConfirm.textContent;
        modalConfirm.textContent = '実行中...';
        
        try {
            let response;
            if (currentAction === 'inactive') {
                response = await fetch(`${API_BASE_URL}/clients/${clientId}/set-inactive`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' }
                });
            } else if (currentAction === 'delete') {
                response = await fetch(`${API_BASE_URL}/clients/${clientId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
            } else if (currentAction === 'reactivate') {
                response = await fetch(`${API_BASE_URL}/clients/${clientId}/reactivate`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '操作に失敗しました');
            }
            
            const result = await response.json();
            alert(result.message);
            window.location.href = 'index.html';
            
        } catch (error) {
            alert(`エラー: ${error.message}`);
            modalConfirm.disabled = false;
            modalConfirm.textContent = originalText;
        }
    }

    // --- Run Application ---
    initializeApp();
});