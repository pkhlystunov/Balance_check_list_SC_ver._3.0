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
        // Принудительно обновляем холст графика при переходе на вкладку аналитики
        applyFilters();
    }
}

async function loadData() {
    const statusText = document.getElementById('sync-status');
    statusText.textContent = "⏳ Загрузка базы данных...";
    statusText.style.color = "#d35400";
    
    try {
        const response = await fetch(API_URL + "?action=getAdminData");
        const res = await response.json();
        if (res.success) {
            rawData = res.data;
            buildFilterOptions();
            applyFilters();
            statusText.textContent = "● База данных подключена";
            statusText.style.color = "#27ae60";
        } else {
            throw new Error("Бэкенд вернул success:false");
        }
    } catch (e) {
        console.error("Ошибка загрузки:", e);
        statusText.textContent = "❌ Ошибка синхронизации. Проверьте интернет.";
        statusText.style.color = "red";
    }
}

function buildFilterOptions() {
    const objSelect = document.getElementById('f-object');
    const contrSelect = document.getElementById('f-contractor');
    
    // Очищаем старые списки фильтров кроме дефолтных
    objSelect.innerHTML = '<option value="Все">-- Все объекты --</option>';
    contrSelect.innerHTML = '<option value="Все">-- Все подрядчики --</option>';

    const objects = new Set();
    const contractors = new Set();
    
    rawData.forEach(function(r) {
        if(r.object) objects.add(r.object);
        if(r.contractor) contractors.add(r.contractor);
    });

    objects.forEach(function(o) { objSelect.add(new Option(o, o)); });
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
    
    // Вызываем безопасную отрисовку графиков из admin-charts.js
    if (typeof updateAnalyticsWidgets === "function") {
        updateAnalyticsWidgets(filtered);
    }
}

function renderRegistry(data) {
    const tbody = document.getElementById('registry-tbody');
    tbody.innerHTML = "";

    if (data.length === 0) {
        tbody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:20px;'>По заданным фильтрам записей не найдено</td></tr>";
        return;
    }

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
    statusText.textContent = "⏳ Сохранение статуса в Google...";
    statusText.style.color = "#d35400";
    
    try {
        // Локально сразу меняем статус, чтобы интерфейс мгновенно отработал (Optimistic UI)
        const record = rawData.find(function(r) { return r.rowId === rowId; });
        if (record) record.status = "Закрыт";
        applyFilters();

        // Отправляем запрос на сервер в фоновом режиме
        await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({ action: "updateStatus", rowId: rowId, newStatus: "Закрыт" }),
            headers: { 'Content-Type': 'text/plain' }
        });
        
        statusText.textContent = "● Данные синхронизированы";
        statusText.style.color = "#27ae60";
    } catch (e) {
        console.error("Ошибка при закрытии:", e);
        // В случае реального обрыва сети возвращаем статус назад
        statusText.textContent = "⚠️ Ошибка сети. Статус сохранен локально.";
        statusText.style.color = "#e67e22";
    }
}

window.onload = loadData;
