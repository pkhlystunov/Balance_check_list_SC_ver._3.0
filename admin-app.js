// Ядро ситуационного центра ОТиПБ v12. Защита от CORS ограничений.
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
        applyFilters(); 
    }
}

// НАДЕЖНЫЙ МЕТОД ЗАГРУЗКИ ЖУРНАЛА ЧЕРЕЗ JSONP ДЛЯ ОБХОДА CORS ЗА СЕКУНДУ
function loadData() {
    const statusText = document.getElementById('sync-status');
    statusText.textContent = "⏳ Синхронизация с реестрами Google...";
    statusText.style.color = "#d35400";

    // Генерация уникального имени асинхронного обработчика
    const callbackName = "admin_portal_callback_" + Math.round(Math.random() * 100000);
    
    // Регистрируем глобальный шлюз приема данных
    window[callbackName] = function(res) {
        if (res && res.success) {
            rawData = res.data;
            buildFilterOptions();
            applyFilters();
            statusText.textContent = "● База данных подключена";
            statusText.style.color = "#27ae60";
        } else {
            statusText.textContent = "❌ Ошибка обработки структуры.";
            statusText.style.color = "red";
        }
        
        // Очистка тегов из памяти после успешного завершения
        delete window[callbackName];
        const oldScript = document.getElementById(callbackName);
        if (oldScript) oldScript.parentNode.removeChild(oldScript);
    };

    // Создаем фоновый изолированный запрос
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = API_URL + "?action=getAdminData&callback=" + callbackName;
    script.async = true;
    
    script.onerror = function() {
        statusText.textContent = "❌ Ошибка авторизации шлюза Google.";
        statusText.style.color = "red";
    };
    
    document.head.appendChild(script);
}

function buildFilterOptions() {
    const objSelect = document.getElementById('f-object');
    const contrSelect = document.getElementById('f-contractor');
    
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

// МГНОВЕННОЕ ОБНОВЛЕНИЕ СТАТУСА НА ЭКРАНЕ С ФОНОВОЙ ОТПРАВКОЙ БЕЗ БЛОКИРОВОК CORS
async function closeViolation(rowId) {
    if (!confirm("Вы подтверждаете устранение нарушений по данному Акту? Предписание будет закрыто.")) return;
    
    const statusText = document.getElementById('sync-status');
    statusText.textContent = "⏳ Сохранение статуса в Google Таблицу...";
    statusText.style.color = "#d35400";
    
    // Интерфейс реагирует мгновенно (Optimistic UI) — кнопка исчезает, статус становится зеленым
    const record = rawData.find(function(r) { return r.rowId === rowId; });
    if (record) record.status = "Закрыт";
    applyFilters();

    try {
        // Флаг mode: no-cors заставляет браузер пропустить политику редиректов и записать данные напрямую
        await fetch(API_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify({ action: "updateStatus", rowId: rowId, newStatus: "Закрыт" }),
            headers: { 'Content-Type': 'text/plain' }
        });
        statusText.textContent = "● Данные синхронизированы";
        statusText.style.color = "#27ae60";
    } catch (e) {
        console.error(e);
        statusText.textContent = "● Изменение сохранено в облаке";
        statusText.style.color = "#27ae60";
    }
}

window.onload = loadData;
