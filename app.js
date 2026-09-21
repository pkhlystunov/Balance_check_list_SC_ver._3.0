// НА СТРОКЕ 2 УКАЖИТЕ ССЫЛКУ, КОТОРУЮ ВАМ ВЫДАЛ GOOGLE APPS SCRIPT ПРИ ДЕПЛОЕ:
const API_URL = "https://script.google.com/macros/s/AKfycbyLFU7ceVKxS-L8kDjcJwKLZ-AAXXXzOICKNlTypxu_zopUcPtf_e90pzDi6xmbsDy7/exec"; 

let auditSession = { inspector: '', objectName: '', contractor: '', results: [] };
let finalViolationsText = "";

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(function() {
        console.log("Офлайн-модуль PWA активирован");
    });
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

function updateNetworkStatus() {
    const indicator = document.getElementById('net-indicator');
    if (navigator.onLine) {
        indicator.textContent = "🌐 Режим: Онлайн (Данные пишутся в облако)";
        indicator.className = "network-status online-mode";
        syncOfflineQueue();
    } else {
        indicator.textContent = "⚠️ Режим: Офлайн (Данные сохраняются на телефон)";
        indicator.className = "network-status offline-mode";
    }
}

document.addEventListener("DOMContentLoaded", async function() {
    updateNetworkStatus();
    try {
        const response = await fetch(API_URL + "?action=getSetupData", { method: "GET", redirect: "follow" });
        const rawText = await response.text();
        if (rawText.includes("Google Accounts") || rawText.includes("Sign in")) {
            throw new Error("Защита Google заблокировала анонимный доступ.");
        }
        const res = JSON.parse(rawText);
        if (res.success) {
            localStorage.setItem('cached_setup', JSON.stringify(res));
            populateSelects(res);
        }
    } catch (e) {
        const cached = localStorage.getItem('cached_setup');
        if (cached) {
            populateSelects(JSON.parse(cached));
        } else {
            document.getElementById('setup-loading').innerHTML = "<b style='color:red;'>Первый запуск требует интернет-соединения.</b>";
        }
    }
});

function populateSelects(res) {
    const objectSelect = document.getElementById('object-select');
    const contractorSelect = document.getElementById('contractor-select');
    objectSelect.innerHTML = '<option value="">-- Выберите объект --</option>';
    contractorSelect.innerHTML = '<option value="">-- Выберите подрядчика --</option>';
    res.objects.forEach(function(obj) {
        objectSelect.add(new Option(obj.id + " | " + obj.name, obj.name));
    });
    res.contractors.forEach(function(contr) {
        contractorSelect.add(new Option(contr, contr));
    });
    document.getElementById('setup-loading').style.display = 'none';
    document.getElementById('form-fields-wrapper').style.display = 'block';
}

async function startFullAudit() {
    const insp = document.getElementById('inspector').value.trim();
    const obj = document.getElementById('object-select').value;
    const contr = document.getElementById('contractor-select').value;
    if(!insp || !obj || !contr) return alert("Заполните форму первого шага!");
    
    auditSession.inspector = insp; 
    auditSession.objectName = obj; 
    auditSession.contractor = contr; 
    auditSession.results = [];
    
    document.getElementById('pdf-btn').disabled = true;
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('submit-btn').innerText = "1. Сохранить Акт (В реестр) 💾";
    
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
            renderChecklist(result.data);
        }
    } catch (e) {
        const cachedQuestions = localStorage.getItem('cached_checklist');
        if (cachedQuestions) {
            renderChecklist(JSON.parse(cachedQuestions));
        } else {
            container.innerHTML = "Ошибка: чек-лист отсутствует в памяти устройства.";
        }
    }
}

function renderChecklist(data) {
    const container = document.getElementById('questions-container');
    container.innerHTML = "";
    data.forEach(function(q) {
        const card = document.createElement('div');
        card.className = 'card'; 
        card.id = 'q-box-' + q.id;
        
        let cardHtml = '<div class="badge">' + q.category + '</div><p style="margin:5px 0 12px 0; font-size:16px; font-weight:600;">' + q.question + '</p>';
        if(q.normative) {
            cardHtml += '<div class="normative-text"><b>Норматив:</b> <span>' + q.normative + '</span></div>';
        }
        card.innerHTML = cardHtml;
        
        const btnRow = document.createElement('div'); 
        btnRow.className = 'btn-row';
        
        // НАДЁЖНОЕ И БЕЗОПАСНОЕ СОЗДАНИЕ КНОПОК ЧЕРЕЗ DOM ДЛЯ ИСКЛЮЧЕНИЯ ЗАВИСАНИЙ
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'btn btn-success';
        okBtn.textContent = 'Соответствует';
        okBtn.addEventListener('click', function() {
            setResult(q.id, 'Соответствует', q.question, q.category, q.normative);
        });
        
        const failBtn = document.createElement('button');
        failBtn.type = 'button';
        failBtn.className = 'btn btn-danger';
        failBtn.textContent = 'Нарушение';
        failBtn.addEventListener('click', function() {
            setResult(q.id, 'Нарушение', q.question, q.category, q.normative);
        });
        
        btnRow.appendChild(okBtn);
        btnRow.appendChild(failBtn);
        card.appendChild(btnRow);
        
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'comment-' + q.id;
        inp.className = 'comment-box';
        inp.placeholder = 'Опишите детали нарушения...';
        card.appendChild(inp);
        
        const photoContainer = document.createElement('div');
        photoContainer.className = 'photo-input-container';
        photoContainer.id = 'photo-area-' + q.id;
        photoContainer.style.display = 'none';
        photoContainer.innerHTML = '<label style="margin-top:5px; font-size:13px; color:#555;">Прикрепить фото дефекта (до 2-х штук):</label>' +
                                   '<input type="file" id="file-' + q.id + '" accept="image/*" multiple style="font-size:13px;" onchange="handlePhotoUpload(this, ' + q.id + ')">' +
                                   '<div class="photo-preview-grid" id="preview-' + q.id + '"></div>';
        card.appendChild(photoContainer);
        
        container.appendChild(card);
    });
}

function handlePhotoUpload(input, questionId) {
    const previewGrid = document.getElementById('preview-' + questionId);
    previewGrid.innerHTML = "";
    
    let item = auditSession.results.find(function(r) { return r.id === questionId; });
    if (!item) return;
    item.photos = []; 

    const files = Array.from(input.files).slice(0, 2);
    
    files.forEach(function(file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600;
                let width = img.width;
                let height = img.height;
                
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                item.photos.push(compressedBase64);
                
                const prevImg = document.createElement('img');
                prevImg.className = 'photo-preview-item';
                prevImg.src = compressedBase64;
                previewGrid.appendChild(prevImg);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}
function setResult(id, status, question, category, normative) {
    let item = auditSession.results.find(function(r) { return r.id === id; });
    if (!item) {
        item = { id: id, question: question, category: category, normative: normative, status: status, comment: '', photos: [] };
        auditSession.results.push(item);
    } else { 
        item.status = status; 
    }
    
    const comp = document.getElementById('comment-' + id);
    const photoArea = document.getElementById('photo-area-' + id);
    if (comp) {
        comp.style.display = status === 'Нарушение' ? 'block' : 'none';
    }
    if (photoArea) {
        photoArea.style.display = status === 'Нарушение' ? 'block' : 'none';
    }
    document.getElementById('q-box-' + id).style.borderLeftColor = status === 'Соответствует' ? 'var(--success)' : 'var(--danger)';
}

async function submitAuditWithOffline() {
    if (auditSession.results.length === 0) return alert("Вы не ответили ни на один вопрос!");
    
    const violations = [];
    
    auditSession.results.forEach(function(item) {
        const inputField = document.getElementById('comment-' + item.id);
        if (inputField) {
            item.comment = inputField.value.trim() || "не расписано";
        }
        
        if (item.status === 'Нарушение') {
            let line = '• [' + item.category + '] ' + item.question;
            if (item.normative) line += ' (Норматив: ' + item.normative + ')';
            line += '\n  Замечание: ' + item.comment;
            violations.push(line);
        }
    });

    auditSession.aggregatedViolations = violations.length > 0 ? violations.join("\n\n") : "Нарушений в ходе проверки не выявлено.";

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;

    if (navigator.onLine) {
        btn.innerText = "⏳ Отправка в облако...";
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(auditSession), headers: { 'Content-Type': 'text/plain' } });
            btn.innerText = "✅ Успешно сохранено!";
            document.getElementById('pdf-btn').disabled = false;
            alert("Данные успешно сохранены в Google Реестр!");
        } catch (e) {
            saveToOfflineQueue(auditSession);
        }
    } else {
        saveToOfflineQueue(auditSession);
    }
}

function saveToOfflineQueue(session) {
    const queue = JSON.parse(localStorage.getItem('offline_audit_queue') || '[]');
    queue.push(session);
    localStorage.setItem('offline_audit_queue', JSON.stringify(queue));
    
    const btn = document.getElementById('submit-btn');
    btn.innerText = "💾 Сохранено офлайн!";
    document.getElementById('pdf-btn').disabled = false;
    alert("⚠️ Нет связи. Акт сохранен на устройстве. Нажмите кнопку №2 для формирования PDF.");
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
    alert("🔄 Обнаружен интернет: сохраненные офлайн-акты переданы в Google Таблицу!");
}

function downloadChecklistPdf() {
    const currentDateStr = new Date().toLocaleDateString('ru-RU');
    
    document.getElementById('p-date').textContent = currentDateStr;
    document.getElementById('p-inspector').textContent = auditSession.inspector;
    document.getElementById('p-object').textContent = auditSession.objectName;
    document.getElementById('p-contractor').textContent = auditSession.contractor;
    
    const tbody = document.getElementById('p-violations-tbody');
    tbody.innerHTML = ""; 
    
    const violationsOnly = auditSession.results.filter(function(r) { return r.status === 'Нарушение'; });
    
    if (violationsOnly.length === 0) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 4;
        cell.style.padding = "12px";
        cell.style.textAlign = "center";
        cell.style.color = "#27ae60";
        cell.style.fontWeight = "bold";
        cell.textContent = "Нарушений в ходе проверки не выявлено.";
    } else {
        violationsOnly.forEach(function(item, index) {
            const row = tbody.insertRow();
            
            const cNum = row.insertCell();
            cNum.style.border = "1px solid #ddd"; cNum.style.padding = "8px"; cNum.style.textAlign = "center";
            cNum.textContent = index + 1;
            item.pdfIndex = index + 1; 
            
            const cCat = row.insertCell();
            cCat.style.border = "1px solid #ddd"; cCat.style.padding = "8px"; cCat.style.fontWeight = "bold"; cCat.style.fontSize = "13px";
            cCat.textContent = "[" + item.category + "]";
            
            const cQuest = row.insertCell();
            cQuest.style.border = "1px solid #ddd"; cQuest.style.padding = "8px"; cQuest.style.fontSize = "13px";
            if (item.normative) {
                cQuest.innerHTML = item.question + '<br><small style="color:#555;"><i>Норматив: ' + item.normative + '</i></small>';
            } else {
                cQuest.textContent = item.question;
            }
            
            const cComm = row.insertCell();
            cComm.style.border = "1px solid #ddd"; cComm.style.padding = "8px"; cComm.style.fontSize = "13px";
            cComm.style.color = "#b33939"; cComm.style.backgroundColor = "#fdf2f2";
            cComm.textContent = item.comment;
        });
    }

    const galleryWrapper = document.getElementById('pdf-gallery-wrapper');
    galleryWrapper.innerHTML = ""; 
    
    let allUploadedPhotos = [];
    violationsOnly.forEach(function(item) {
        if (item.photos && item.photos.length > 0) {
            item.photos.forEach(function(base64Src) {
                allUploadedPhotos.push({
                    src: base64Src,
                    index: item.pdfIndex,
                    category: item.category
                });
            });
        }
    });

    if (allUploadedPhotos.length > 0) {
        let photosPerPage = 4;
        let totalPhotos = allUploadedPhotos.length;
        
        for (let i = 0; i < totalPhotos; i += photosPerPage) {
            const pageDiv = document.createElement('div');
            pageDiv.className = "pdf-page-break"; 
            
            pageDiv.innerHTML = '<div style="margin-top:20px; font-size:16px; font-weight:bold; color:#2c3e50; border-bottom:1px solid #2c3e50; padding-bottom:5px;">ПРИЛОЖЕНИЕ К АКТУ. ФОТОФИКСАЦИЯ НАРУШЕНИЙ (Лист ' + (Math.floor(i/4) + 1) + ')</div>';
            
            const grid = document.createElement('div');
            grid.className = "pdf-photo-grid";
            
            let pagePhotos = allUploadedPhotos.slice(i, i + photosPerPage);
            pagePhotos.forEach(function(pData) {
                const photoCard = document.createElement('div');
                photoCard.className = "pdf-photo-card";
                photoCard.innerHTML = '<img class="pdf-photo-img" src="' + pData.src + '">' +
                                       '<div class="pdf-photo-desc">Фото к пункту №' + pData.index + ' [' + pData.category + ']</div>';
                grid.appendChild(photoCard);
            });
            
            pageDiv.appendChild(grid);
            galleryWrapper.appendChild(pageDiv);
        }
    }

    window.print();
    
    setTimeout(function() {
        if (confirm("Выгрузка завершена! Очистить чек-лист для нового обхода?")) {
            location.reload();
        }
    }, 1000);
}

function backToStep1() { 
    document.getElementById('step-3-checklist').style.display = 'none'; 
    document.getElementById('step-1-form').style.display = 'block'; 
}
