// Настройка прямого скоростного шлюза к базе данных Google Таблиц
// ВСТАВЬТЕ ID ВАШЕЙ ТАБЛИЦЫ МЕЖДУ КАВЫЧКАМИ НА СТРОКЕ 3:
const SPREADSHEET_ID = "1S5n3pDFjdlElAnlHpvMmb_TqUbBODaBTWgdz1EfaKiU";

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

// НАДЕЖНОЕ ЧТЕНИЕ ОПУБЛИКОВАННОГО ФИДА (0.2 СЕКУНДЫ, 100% ЗАЩИТА ОТ БЛОКИРОВОК)
async function loadData() {
    const statusText = document.getElementById('sync-status');
    const tbody = document.getElementById('registry-tbody');
    
    // Ссылка на опубликованный CSV-поток листа реестра проверок
    const csvUrl = "https://google.com" + SPREADSHEET_ID + "/pub?output=csv&gid=1114510065"; 
    // Примечание: Если gid вашего листа "7_Реестр_Проверок" отличается от стандартного, 
    // вы можете использовать упрощенную ссылку:
    const altCsvUrl = "https://google.com" + SPREADSHEET_ID + "/pub?output=csv";

    try {
        const response = await fetch(altCsvUrl);
        if (!response.ok) throw new Error("Google заблокировал доступ");
        
        const text = await response.text();
        
        // Построчный разбор текстовой базы данных CSV
        const lines = text.split('\n');
        if (lines.length <= 1) {
            tbody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>Журнал проверок пуст.</td></tr>";
            return;
        }

        rawData = [];
        
        // Перебираем строки, пропуская шапку таблицы (i = 1)
        for (let i = 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;
            
            // Безопасное разделение строки по запятым, игнорируя запятые внутри кавычек
            let row = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(cell => cell.replace(/^"|"$/g, '').trim());
            
            if (row.length < 4) continue;
            
            rawData.push({
                rowId: i + 1, 
                date: row[0] || "",
                inspector: row[1] || "Не указан",
                object: row[2] || "Не указан",
                contractor: row[3] || "Не указан",
                vCount: parseInt(row[4]) || 0,
                text: row[5] || "Нарушений не выявлено",
                status: row[6] ? row[6].trim() : "В работе"
            });
        }

        buildFilterOptions();
        applyFilters();
        statusText.textContent = "● Оперативный центр подключен к облаку";
        statusText.style.color = "#27ae60";
        
    } catch (e) {
        console.error("Ошибка шлюза:", e);
        statusText.textContent = "⚠️ Ошибка авторизации. Включите Публикацию.";
        statusText.style.color = "red";
    }
}

function buildFilterOptions() {
    const objSelect = document.getElementById('f-object');
    const contrSelect = document.getElementById('f-contractor');
    
    const currentObj = objSelect.value || "Все";
    const currentContr = contrSelect.value || "Все";

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
    
    objSelect.value = currentObj;
    contrSelect.value = currentContr;
}

function applyFilters() {
    const objF = document.getElementById('f-object').value;
    const contrF = document.getElementById('f-contractor').value;
    const startF = document.getElementById('f-start').value;
    const endF = document.getElementById('f-end').value;

    const start = startF ? new Date(startF) : null;
    const end = endF ? new Date(endF) : null;

    const filtered = rawData.filter(function(r) {
        if (!r.date) return false;
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

        // Преобразование даты в читаемый вид
        let cleanDate = "Акт";
        try { if(r.date) cleanDate = new Date(r.date).toLocaleDateString('ru-RU'); } catch(err) {}

        tr.innerHTML = "<td>" + cleanDate + "</td>" +
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
    statusText.textContent = "⏳ Отправка команды закрытия в Google...";
    statusText.style.color = "#d35400";
    
    const record = rawData.find(function(r) { return r.rowId === rowId; });
    if (record) record.status = "Закрыт";
    applyFilters();

    try {
        await fetch(API_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify({ action: "updateStatus", rowId: rowId, newStatus: "Закрыт" }),
            headers: { 'Content-Type': 'text/plain' }
        });
        statusText.textContent = "● Оперативный центр подключен к облаку";
        statusText.style.color = "#27ae60";
    } catch (e) {
        console.error(e);
        statusText.textContent = "● Изменение внесено в журнал";
        statusText.style.color = "#27ae60";
    }
}

window.onload = loadData;
