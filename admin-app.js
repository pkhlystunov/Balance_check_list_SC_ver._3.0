// Ядро ситуационного центра ОТиПБ
const API_URL = "https://script.google.com/macros/s/AKfycbzc8Bs2D0WvwjlXQBACVEk7QThoCYilHv28mj8EqPtkFsAqBAGHC6dLtcDP98pc6Bcy_Q/exec";

let rawData = [];

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function(el) { el.classList.remove('active'); });
    
    document.getElementById(tabId).classList.add('active');
    if (tabId === 'registry-tab') {
        document.getElementById('btn-registry').classList.add('active');
    } else {
        document.getElementById('btn-analytics').classList.add('active');
    }
}

async function loadData() {
    const statusText = document.getElementById('sync-status');
    try {
        const response = await fetch(API_URL + "?action=getAdminData");
        const res = await response.json();
        if (res.success) {
            rawData = res.data;
            buildFilterOptions();
            applyFilters();
        }
    } catch (e) {
        statusText.textContent = "❌ Ошибка загрузки базы";
        statusText.style.color = "red";
    }
}

function buildFilterOptions() {
    const objects = new Set();
    const contractors = new Set();
    
    rawData.forEach(function(r) {
        if(r.object) objects.add(r.object);
        if(r.contractor) contractors.add(r.contractor);
    });

    const objSelect = document.getElementById('f-object');
    objects.forEach(function(o) { objSelect.add(new Option(o, o)); });

    const contrSelect = document.getElementById('f-contractor');
    contractors.forEach(function(c) { contrSelect.add(new Option(c, c)); });
}

function applyFilters() {
    const objF = document.getElementById('f-object').value;
    const contrF = document.getElementById('f-contractor').value;
    const startF = document.getElementById('f-start').value;
    const endF = document.getElementById('f-end').value;

    const start = startF ? new Date(startF) : null;
    const end = endF ? new Date(endF) : null;

    const filtered = rawData.filter(function(r) {
        const rDate = new Date(r.date);
        if (objF !== "Все" && r.object !== objF) return false;
        if (contrF !== "Все" && r.contractor !== contrF) return false;
        if (start && rDate < start) return false;
        if (end && rDate > end) return false;
        return true;
    });

    renderRegistry(filtered);
    updateAnalyticsWidgets(filtered);
}

function renderRegistry(data) {
    const tbody = document.getElementById('registry-tbody');
    tbody.innerHTML = "";

    if (data.length === 0) {
        tbody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:20px;'>По заданным фильтрам записей не найдено</td></tr>";
        return;
    }

    // Рендерим от свежих к старым актам
    const copyData = data.slice().reverse();
    copyData.forEach(function(r) {
        const tr = document.createElement('tr');
        const isClosed = r.status === "Закрыт";
        const statusClass = isClosed ? "status-closed" : "status-work";
        
        const tdAction = document.createElement('td');
        tdAction.style.textAlign = "center";
        
        if (isClosed) {
            const span = document.createElement('span');
            span.style.color = "#aaa"; span.style.fontStyle = "italic"; span.style.fontSize = "12px";
            span.textContent = "Выполнено";
            tdAction.appendChild(span);
        } else {
            const btn = document.createElement('button');
            btn.className = "action-btn";
            btn.textContent = "Закрыть";
            btn.addEventListener('click', function() { closeViolation(r.rowId); });
            tdAction.appendChild(btn);
        }

        tr.innerHTML = "<td>" + new Date(r.date).toLocaleDateString('ru-RU') + "</td>" +
                       "<td><b>" + r.object + "</b></td>" +
                       "<td>" + r.contractor + "</td>" +
                       "<td style='white-space: pre-wrap; font-size:13px; line-height:1.4;'>" + r.text + "</td>" +
                       "<td style='text-align:center;'><span class='status-badge " + statusClass + "'>" + r.status + "</span></td>";
        
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
    });
}

async function closeViolation(rowId) {
    if (!confirm("Вы подтверждаете устранение нарушений по данному Акту? Предписание будет закрыто.")) return;
    
    const statusText = document.getElementById('sync-status');
    statusText.textContent = "⏳ Сохранение статуса...";
    
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({ action: "updateStatus", rowId: rowId, newStatus: "Закрыт" }),
            headers: { 'Content-Type': 'text/plain' }
        });
        const res = await response.json();
        if (res.success) {
            const record = rawData.find(function(r) { return r.rowId === rowId; });
            if (record) record.status = "Закрыт";
            
            statusText.textContent = "● Данные синхронизированы";
            applyFilters();
        }
    } catch (e) {
        alert("Ошибка сети. Не удалось изменить статус.");
        statusText.textContent = "● База данных подключена";
    }
}

// Запуск приложения при полной загрузке страницы
window.onload = loadData;
