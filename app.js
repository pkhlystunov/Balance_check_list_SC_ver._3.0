// НА СТРОКЕ 2 УКАЖИТЕ ССЫЛКУ, КОТОРУЮ ВАМ ВЫДАЛ GOOGLE APPS SCRIPT ПРИ ДЕПЛОЕ:
const API_URL = "https://script.google.com/macros/s/AKfycbzc8Bs2D0WvwjlXQBACVEk7QThoCYilHv28mj8EqPtkFsAqBAGHC6dLtcDP98pc6Bcy_Q/exec"; 

let auditSession = { inspector: '', objectName: '', contractor: '', results: [] };
let historyRecords = []; // Массив записей из реестра для аналитики

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

function updateNetworkStatus() {
    const indicator = document.getElementById('net-indicator');
    if (navigator.onLine) {
        indicator.textContent = "🌐 Режим: Онлайн (Данные пишутся в облако)";
        indicator.className = "network-status online-mode";
        syncOfflineQueue();
        loadAnalyticsData(); // Подгружаем историю для статистики
    } else {
        indicator.textContent = "⚠️ Режим: Офлайн (Данные сохраняются на телефон)";
        indicator.className = "network-status offline-mode";
    }
}

document.addEventListener("DOMContentLoaded", async function() {
    updateNetworkStatus();
    try {
        const response = await fetch(API_URL + "?action=getSetupData", { method: "GET", redirect: "follow" });
        const res = await response.json();
        if (res.success) {
            localStorage.setItem('cached_setup', JSON.stringify(res));
            populateSelects(res);
        }
    } catch (e) {
        const cached = localStorage.getItem('cached_setup');
        if (cached) populateSelects(JSON.parse(cached));
    }
});

function populateSelects(res) {
    const objectSelect = document.getElementById('object-select');
    const contractorSelect = document.getElementById('contractor-select');
    const filterObject = document.getElementById('filter-object');
    
    objectSelect.innerHTML = '<option value="">-- Выберите объект --</option>';
    contractorSelect.innerHTML = '<option value="">-- Выберите подрядчика --</option>';
    
    res.objects.forEach(obj => {
        objectSelect.add(new Option(obj.id + " | " + obj.name, obj.name));
        filterObject.add(new Option(obj.name, obj.name));
    });
    res.contractors.forEach(contr => contractorSelect.add(new Option(contr, contr)));
    
    document.getElementById('setup-loading').style.display = 'none';
    document.getElementById('form-fields-wrapper').style.display = 'block';
}

function toggleMenu() {
    document.getElementById('analytics-sidebar').classList.toggle('active');
    document.getElementById('menu-overlay').classList.toggle('active');
}

// Загрузка исторических записей для построения рейтингов
async function loadAnalyticsData() {
    if (!navigator.onLine) return;
    try {
        const response = await fetch(API_URL + "?action=getAnalytics");
        const res = await response.json();
        if (res.success) {
            historyRecords = res.data;
            calculateAnalytics();
        }
    } catch (e) { console.log("Ошибка аналитики: ", e); }
}

function calculateAnalytics() {
    if (historyRecords.length === 0) return;
    
    const startVal = document.getElementById('filter-start-date').value;
    const endVal = document.getElementById('filter-end-date').value;
    const objFilter = document.getElementById('filter-object').value;
    
    const start = startVal ? new Date(startVal) : null;
    const end = endVal ? new Date(endVal) : null;
    
    let totalChecks = 0;
    let totalViolations = 0;
    let contractorMap = {};

    historyRecords.forEach(r => {
        const rDate = new Date(r.date);
        if (start && rDate < start) return;
        if (end && rDate > end) return;
        if (objFilter !== "Все" && r.object !== objFilter) return;

        totalChecks++;
        totalViolations += r.vCount;

        if (!contractorMap[r.contractor]) contractorMap[r.contractor] = 0;
        contractorMap[r.contractor] += r.vCount;
    });

    document.getElementById('stat-total-checks').textContent = totalChecks;
    document.getElementById('stat-total-violations').textContent = totalViolations;

    // Сортировка антирейтинга подрядчиков
    const sortedContractors = Object.keys(contractorMap).map(name => {
        return { name: name, count: contractorMap[name] };
    }).sort((a, b) => b.count - a.count);

    const tbody = document.getElementById('contractor-rating-body');
    tbody.innerHTML = "";
    
    if(sortedContractors.length === 0) {
        tbody.innerHTML = "<tr><td colspan='2' style='text-align:center; color:green;'>Нарушений нет</td></tr>";
    } else {
        sortedContractors.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${c.name}</td><td style='text-align:center; font-weight:bold; color:red;'>${c.count}</td>`;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('analytics-loading').style.display = 'none';
    document.getElementById('analytics-content').style.display = 'block';
}

async function startFullAudit() {
    const insp = document.getElementById('inspector').value.trim();
    const obj = document.getElementById('object-select').value;
    const contr = document.getElementById('contractor-select').value;
    if(!insp || !obj || !contr) return alert("Заполните форму первого шага!");
    
    auditSession.inspector = insp; auditSession.objectName = obj; auditSession.contractor = contr; auditSession.results = [];
    document.getElementById('pdf-btn').disabled = true;
    document.getElementById('submit-btn').disabled = false;
    
    const container = document.getElementById('questions-container');
    container.innerHTML = "⏳ Загрузка вопросов чек-листа...";
    document.getElementById('step-3-checklist').style.display = 'block';
    document.getElementById('step-1-form').style.display = 'none';
    
    document.getElementById('audit-meta-insp').textContent = insp;
    document.getElementById('audit-meta-obj').textContent = obj;
    document.getElementById('audit-meta-contr').textContent = contr;
    document.getElementById('audit-meta-date').textContent = new Date().toLocaleDateString('ru-RU');

    try {
        const response = await fetch(API_URL + "?action=getChecklist", { method: "GET", redirect: "follow" });
        const result = await response.json();
        if (result.success) {
            localStorage.setItem('cached_checklist', JSON.stringify(result.data));
            renderGroupedChecklist(result.data);
        }
    } catch (e) {
        const cachedQuestions = localStorage.getItem('cached_checklist');
        if (cachedQuestions) renderGroupedChecklist(JSON.parse(cachedQuestions));
    }
}

// Группировка вопросов строго по Разделам (Колонка B листа 3_Чек_лист)
function renderGroupedChecklist(data) {
    const container = document.getElementById('questions-container');
    container.innerHTML = "";
    
    const categoriesMap = {};
    data.forEach(q => {
        const blockName = q.category ? q.category : "Общий раздел";
        if (!categoriesMap[blockName]) categoriesMap[blockName] = [];
        categoriesMap[blockName].push(q);
    });

    let catIndex = 0;
    for (let catName in categoriesMap) {
        catIndex++;
        const questionsList = categoriesMap[catName];
        
        const blockDiv = document.createElement('div');
        blockDiv.className = 'category-block';
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'category-header';
        headerDiv.id = 'cat-header-' + catIndex;
        headerDiv.innerHTML = `<span>${catIndex}. ${catName}</span><span class="category-counter" id="cat-counter-${catIndex}">0 / ${questionsList.length}</span>`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'category-content';
        contentDiv.id = 'cat-content-' + catIndex;
        
        (function(cId) {
            headerDiv.addEventListener('click', function() {
                const content = document.getElementById('cat-content-' + cId);
                content.style.display = content.style.display === 'block' ? 'none' : 'block';
            });
        })(catIndex);

        questionsList.forEach(q => {
            const card = document.createElement('div');
            card.className = 'card'; card.id = 'q-box-' + q.id;
            card.innerHTML = `<p style="margin:5px 0 12px 0; font-size:16px; font-weight:600;">${q.question}</p>`;
            if(q.normative) card.innerHTML += `<div class="normative-text"><b>Норматив:</b> <span>${q.normative}</span></div>`;
            
            const btnRow = document.createElement('div'); btnRow.className = 'btn-row';
            
            const okBtn = document.createElement('button');
            okBtn.type = 'button'; okBtn.className = 'btn btn-success'; okBtn.textContent = 'Соответствует';
            okBtn.addEventListener('click', function() { setResult(q.id, 'Соответствует', q.question, catName, q.normative, 'cat-counter-' + catIndex, questionsList.length); });
            
            const failBtn = document.createElement('button');
            failBtn.type = 'button'; failBtn.className = 'btn btn-danger'; failBtn.textContent = 'Нарушение';
            failBtn.addEventListener('click', function() { setResult(q.id, 'Нарушение', q.question, catName, q.normative, 'cat-counter-' + catIndex, questionsList.length); });
            
            btnRow.appendChild(okBtn); btnRow.appendChild(failBtn); card.appendChild(btnRow);
            card.innerHTML += `<input type="text" id="comment-${q.id}" class="comment-box" placeholder="Опишите детали нарушения...">`;
            contentDiv.appendChild(card);
        });

        blockDiv.appendChild(headerDiv); blockDiv.appendChild(contentDiv); container.appendChild(blockDiv);
    }
}
function setResult(id, status, question, category, normative, counterId, totalCount) {
    let item = auditSession.results.find(r => r.id === id);
    if (!item) {
        item = { id: id, question: question, category: category, normative: normative, status: status, comment: '' };
        auditSession.results.push(item);
    } else { item.status = status; }
    
    const comp = document.getElementById('comment-' + id);
    if (comp) comp.style.display = status === 'Нарушение' ? 'block' : 'none';
    document.getElementById('q-box-' + id).style.borderLeftColor = status === 'Соответствует' ? 'var(--success)' : 'var(--danger)';

    const checkedInCategory = auditSession.results.filter(r => r.category === category).length;
    const counterSpan = document.getElementById(counterId);
    if (counterSpan) {
        counterSpan.textContent = checkedInCategory + " / " + totalCount;
        if (checkedInCategory === totalCount) counterSpan.className = "category-counter completed";
    }
}

async function submitAuditWithOffline() {
    if (auditSession.results.length === 0) return alert("Вы не ответили ни на один вопрос!");
    
    const violations = [];
    auditSession.results.forEach(item => {
        const inputField = document.getElementById('comment-' + item.id);
        if (inputField) item.comment = inputField.value.trim() || "не расписано";
        
        if (item.status === 'Нарушение') {
            let line = `• [${item.category}] ${item.question}`;
            if (item.normative) line += ` (Норматив: ${item.normative})`;
            line += `\n  Замечание: ${item.comment}`;
            violations.push(line);
        }
    });

    finalViolationsText = violations.length > 0 ? violations.join("\n\n") : "Нарушений в ходе проверки не выявлено. Объект соответствует нормам ОТиПБ.";
    auditSession.aggregatedViolations = finalViolationsText;

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;

    if (navigator.onLine) {
        btn.innerText = "⏳ Отправка в облако...";
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(auditSession), headers: { 'Content-Type': 'text/plain' } });
            btn.innerText = "Aкт сохранен!";
            document.getElementById('pdf-btn').disabled = false;
            alert("Данные успешно сохранены в реестр Google!");
            loadAnalyticsData(); // Обновляем боковую аналитику свежими данными
        } catch (e) { saveToOfflineQueue(auditSession); }
    } else { saveToOfflineQueue(auditSession); }
}

function saveToOfflineQueue(session) {
    const queue = JSON.parse(localStorage.getItem('offline_audit_queue') || '[]');
    queue.push(session);
    localStorage.setItem('offline_audit_queue', JSON.stringify(queue));
    
    const btn = document.getElementById('submit-btn');
    btn.innerText = "💾 Сохранено офлайн!";
    document.getElementById('pdf-btn').disabled = false;
    alert("⚠️ Данные сохранены на телефон и выгрузятся при появлении сети.");
}

async function syncOfflineQueue() {
    const queue = JSON.parse(localStorage.getItem('offline_audit_queue') || '[]');
    if (queue.length === 0) return;
    for (let i = 0; i < queue.length; i++) {
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(queue[i]), headers: { 'Content-Type': 'text/plain' } });
        } catch (e) { return; }
    }
    localStorage.removeItem('offline_audit_queue');
    alert("🔄 Обнаружен интернет: офлайн-акты успешно переданы в Google!");
    loadAnalyticsData();
}

// НАША ИДЕАЛЬНАЯ И НЕУЯЗВИМАЯ НА ТИВНАЯ ПЕЧАТЬ ОТ 18.09.2026
function downloadChecklistPdf() {
    document.getElementById('p-date').textContent = new Date().toLocaleDateString('ru-RU');
    document.getElementById('p-inspector').textContent = auditSession.inspector;
    document.getElementById('p-object').textContent = auditSession.objectName;
    document.getElementById('p-contractor').textContent = auditSession.contractor;
    document.getElementById('p-violations').textContent = finalViolationsText;
    
    window.print();
    
    setTimeout(function() {
        if (confirm("Выгрузка завершена! Очистить чек-лист для нового обхода?")) location.reload();
    }, 1000);
}

function backToStep1() { document.getElementById('step-3-checklist').style.display = 'none'; document.getElementById('step-1-form').style.display = 'block'; }
