// Ядро ситуационного центра ОТиПБ v12. Защита от CORS ограничений.
const API_URL = "https://script.google.com/macros/s/AKfycbzc8Bs2D0WvwjlXQBACVEk7QThoCYilHv28mj8EqPtkFsAqBAGHC6dLtcDP98pc6Bcy_Q/exec";

let rawData = [];
let shortObjectsMap = {}; // Карта сопоставления: "Полное имя" -> "Короткий ID (Колонка А)"

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function(el) { el.classList.remove('active'); });
    
    document.getElementById(tabId).classList.add('active');
    if (tabId === 'registry-tab') {
        document.getElementById('btn-registry').classList.add('active');
    } else {
        document.getElementById('btn-analytics').classList.add('active');
    }
    applyFilters(); 
}

async function loadData() {
    const statusText = document.getElementById('sync-status');
    try {
        // Шаг 1: Сначала подтягиваем справочник 1_Объекты, чтобы узнать короткие имена из колонки А
        const setupResponse = await fetch(API_URL + "?action=getSetupData", { method: "GET", redirect: "follow" });
        const setupRes = await setupResponse.json();
        
        if (setupRes && setupRes.success) {
            setupRes.objects.forEach(function(obj) {
                // Запоминаем: связку id (Колонка А) и name (Колонка B)
                shortObjectsMap[obj.name] = obj.id;
            });
        }

        // Шаг 2: Скачиваем реестр проверок инспекторов
        const response = await fetch(API_URL + "?action=getAnalytics&client=admin", { method: "GET", redirect: "follow" });
        const res = await response.json();
        
        if (res && res.success) {
            rawData = res.data;
            buildFilterOptions();
            applyFilters();
            statusText.textContent = "● Оперативный центр подключен к облаку";
            statusText.style.color = "#27ae60";
        }
    } catch (e) {
        console.error(e);
        statusText.textContent = "❌ Ошибка синхронизации шлюза";
        statusText.style.color = "red";
    }
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
        if (!r.date) return false;
        const rDate = new Date(r.date);
        
        if (objF !== "Все" && r.object !== objF) return false;
        if (contrF !== "Все" && r.contractor !== contrF) return false;
        if (start && rDate < start) return false;
        if (end && rDate > end) return false;
        return true;
    });

    renderRegistry(filtered);
    renderDoubleCharts(filtered);
}

function renderRegistry(data) {
    const tbody = document.getElementById('registry-tbody');
    tbody.innerHTML = "";

    if (data.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:20px;'>По заданным фильтрам проверок не найдено</td></tr>";
        return;
    }

    const copyData = data.slice().reverse();
    copyData.forEach(function(r) {
        const tr = document.createElement('tr');
        let formattedDate = "Акт";
        try { if(r.date) formattedDate = new Date(r.date).toLocaleDateString('ru-RU'); } catch(e) {}

        tr.innerHTML = "<td>" + formattedDate + "</td>" +
                       "<td><b>" + r.object + "</b></td>" +
                       "<td>" + r.contractor + "</td>" +
                       "<td style='white-space: pre-wrap; font-size:13px; line-height:1.4; color:#2c3e50;'>" + (r.text || "Нарушений не выявлено") + "</td>";
        tbody.appendChild(tr);
    });
}

// СБОР СТАТИСТИКИ И ОТРИСОВКА ДВУХ ГИСТОГРАММ
function renderDoubleCharts(data) {
    let totalViolations = 0;
    
    const objectsMap = {};     // Карта для Объектов
    const contractorsMap = {}; // Карта для Подрядчиков

    data.forEach(function(r) {
        totalViolations += r.vCount;
        if (r.vCount > 0) {
            // Считаем дефекты по Объектам
            if (!objectsMap[r.object]) objectsMap[r.object] = 0;
            objectsMap[r.object] += r.vCount;

            // Вычисляем короткое имя объекта из справочника (Колонка А), если не нашли - пишем "Акт"
            let shortPrefix = shortObjectsMap[r.object] || "Акт";
            
            // Уникальный ключ для группировки: "[Короткий_Объект] Название Подрядчика"
            let uniqueContractorKey = "[" + shortPrefix + "] " + r.contractor;
            
            if (!contractorsMap[uniqueContractorKey]) contractorsMap[uniqueContractorKey] = 0;
            contractorsMap[uniqueContractorKey] += r.vCount;
        }
    });

    document.getElementById('w-checks').textContent = data.length;
    document.getElementById('w-violations').textContent = totalViolations;

    // --- ОТРИСОВКА ГИСТОГРАММЫ №1: ОБЪЕКТЫ ---
    const objChartBody = document.getElementById('objects-chart-body');
    objChartBody.innerHTML = "";
    
    const sortedObjects = Object.keys(objectsMap).map(function(name) {
        return { name: name, count: objectsMap[name] };
    }).sort(function(a, b) { return b.count - a.count; });

    if (sortedObjects.length === 0) {
        objChartBody.innerHTML = "<div style='text-align:center; color:#27ae60; font-weight:bold; padding:15px;'>Нарушений на объектах не зафиксировано!</div>";
    } else {
        let maxObjCount = 0;
        sortedObjects.forEach(function(item) { if(item.count > maxObjCount) maxObjCount = item.count; });
        
        sortedObjects.forEach(function(item) {
            const percent = maxObjCount > 0 ? (item.count / maxObjCount) * 100 : 0;
            const row = document.createElement('div');
            row.className = "chart-row";
            row.innerHTML = '<div class="chart-label" title="' + item.name + '">' + item.name + '</div>' +
                            '<div class="chart-bar-wrapper">' +
                                '<div class="chart-bar-fill" style="width: ' + percent + '%; background:#3498db;"></div>' +
                            '</div>' +
                            '<div class="chart-value">' + item.count + ' шт.</div>';
            objChartBody.appendChild(row);
        });
    }

    // --- ОТРИСОВКА ГИСТОГРАММЫ №2: ПОДРЯДЧИКИ [ОБЪЕКТ | ПОДРЯДЧИК] ---
    const contrChartBody = document.getElementById('contractors-chart-body');
    contrChartBody.innerHTML = "";

    const sortedContractors = Object.keys(contractorsMap).map(function(key) {
        return { label: key, count: contractorsMap[key] };
    }).sort(function(a, b) { return b.count - a.count; });

    if (sortedContractors.length === 0) {
        contrChartBody.innerHTML = "<div style='text-align:center; color:#27ae60; font-weight:bold; padding:15px;'>Нарушений подрядных организаций не зафиксировано!</div>";
    } else {
        let maxContrCount = 0;
        sortedContractors.forEach(function(item) { if(item.count > maxContrCount) maxContrCount = item.count; });
        
        sortedContractors.forEach(function(item) {
            const percent = maxContrCount > 0 ? (item.count / maxContrCount) * 100 : 0;
            const row = document.createElement('div');
            row.className = "chart-row";
            row.innerHTML = '<div class="chart-label" title="' + item.label + '">' + item.label + '</div>' +
                            '<div class="chart-bar-wrapper">' +
                                '<div class="chart-bar-fill" style="width: ' + percent + '%; background:#e74c3c;"></div>' +
                            '</div>' +
                            '<div class="chart-value">' + item.count + ' шт.</div>';
            contrChartBody.appendChild(row);
        });
    }
}

window.onload = loadData;

