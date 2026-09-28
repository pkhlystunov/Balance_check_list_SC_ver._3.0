// Ядро ситуационного центра ОТиПБ v12. Защита от CORS ограничений.
const API_URL = "https://script.google.com/macros/s/AKfycbzc8Bs2D0WvwjlXQBACVEk7QThoCYilHv28mj8EqPtkFsAqBAGHC6dLtcDP98pc6Bcy_Q/exec";

let rawData = [];

async function loadData() {
    const statusText = document.getElementById('sync-status');
    statusText.textContent = "⏳ Синхронизация с сервером Google...";
    statusText.style.color = "#d35400";
    
    try {
        // Вызываем проверенный, стабильный метод получения истории проверок с автоматическим редиректом
        const response = await fetch(API_URL + "?action=getAnalytics", { method: "GET", redirect: "follow" });
        const res = await response.json();
        
        if (res && res.success) {
            rawData = res.data;
            buildFilterOptions();
            applyFilters();
            statusText.textContent = "● Мониторинг активен";
            statusText.style.color = "#27ae60";
        } else {
            throw new Error("Неверный формат ответа бэкенда");
        }
    } catch (e) {
        console.error("Ошибка загрузки аналитики:", e);
        statusText.textContent = "❌ Ошибка сети. Проверьте деплой бэкенда.";
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
    
    // Передаем отфильтрованные данные в графический модуль admin-charts.js
    if (typeof updateAnalyticsWidgets === "function") {
        updateAnalyticsWidgets(filtered);
    }
}

function renderRegistry(data) {
    const tbody = document.getElementById('registry-tbody');
    tbody.innerHTML = "";

    if (data.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:20px;'>По заданным фильтрам проверок не найдено</td></tr>";
        return;
    }

    // Выводим журнал от самых свежих проверок к старым
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

// Запуск загрузки данных при старте панели аналитики
window.onload = loadData;
