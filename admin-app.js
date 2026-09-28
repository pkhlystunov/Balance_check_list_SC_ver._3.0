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
    }
    applyFilters(); // Пересчитываем данные и графики при переключении
}

async function loadData() {
    const statusText = document.getElementById('sync-status');
    try {
        const response = await fetch(API_URL + "?action=getAnalytics&client=admin", { method: "GET", redirect: "follow" });
        const res = await response.json();
        
        if (res && res.success) {
            rawData = res.data;
            buildFilterOptions();
            applyFilters();
            statusText.textContent = "● Оперативный мониторинг активен";
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
    renderNativeChart(filtered);
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

// ВСТРОЕННЫЙ СВЕРХБЫСТРЫЙ РЕНДЕРЕР ГИСТОГРАММ НА CSS
function renderNativeChart(data) {
    let totalViolations = 0;
    const contractorMap = {};

    data.forEach(function(r) {
        totalViolations += r.vCount;
        if (r.vCount > 0) {
            if (!contractorMap[r.contractor]) contractorMap[r.contractor] = 0;
            contractorMap[r.contractor] += r.vCount;
        }
    });

    document.getElementById('w-checks').textContent = data.length;
    document.getElementById('w-violations').textContent = totalViolations;

    const chartBody = document.getElementById('native-chart-body');
    chartBody.innerHTML = "";

    const sorted = Object.keys(contractorMap).map(function(name) {
        return { name: name, count: contractorMap[name] };
    }).sort(function(a, b) { return b.count - a.count; });

    if (sorted.length === 0) {
        chartBody.innerHTML = "<div style='text-align:center; color:#27ae60; font-weight:bold; padding:20px;'>Нарушений за выбранный период не зафиксировано!</div>";
        return;
    }

    // Вычисляем максимальный показатель для масштабирования полос
    let maxCount = 0;
    sorted.forEach(function(item) { if(item.count > maxCount) maxCount = item.count; });

    sorted.forEach(function(item) {
        const percent = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
        const row = document.createElement('div');
        row.className = "chart-row";
        
        row.innerHTML = '<div class="chart-label" title="' + item.name + '">' + item.name + '</div>' +
                        '<div class="chart-bar-wrapper">' +
                            '<div class="chart-bar-fill" style="width: ' + percent + '%;"></div>' +
                        '</div>' +
                        '<div class="chart-value">' + item.count + ' шт.</div>';
                        
        chartBody.appendChild(row);
    });
}

window.onload = loadData;
