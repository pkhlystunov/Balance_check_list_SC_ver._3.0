// НА СТРОКЕ 2 УКАЖИТЕ ССЫЛКУ, КОТОРУЮ ВАМ ВЫДАЛ GOOGLE APPS SCRIPT ПРИ ДЕПЛОЕ:
const API_URL = "https://script.google.com/macros/s/AKfycbyLFU7ceVKxS-L8kDjcJwKLZ-AAXXXzOICKNlTypxu_zopUcPtf_e90pzDi6xmbsDy7/exec"; 

let auditSession = { inspector: '', objectName: '', contractor: '', results: [] };
let finalViolationsText = "";

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(function() {
        console.log("Офлайн PWA активен");
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
            renderGroupedChecklist(result.data);
        }
    } catch (e) {
        const cachedQuestions = localStorage.getItem('cached_checklist');
        if (cachedQuestions) {
            renderGroupedChecklist(JSON.parse(cachedQuestions));
        } else {
            container.innerHTML = "Ошибка: чек-лист отсутствует в памяти устройства.";
        }
    }
}

function renderGroupedChecklist(data) {
    const container = document.getElementById('questions-container');
    container.innerHTML = "";
    
    const categoriesMap = {};
    data.forEach(function(q) {
        const blockName = q.category ? q.category : "Общий раздел";
        if (!categoriesMap[blockName]) {
            categoriesMap[blockName] = [];
        }
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
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = catIndex + '. ' + catName;
        
        const counterSpan = document.createElement('span');
        counterSpan.className = 'category-counter';
        counterSpan.id = 'cat-counter-' + catIndex;
        counterSpan.textContent = '0 / ' + questionsList.length;
        
        headerDiv.appendChild(titleSpan);
        headerDiv.appendChild(counterSpan);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'category-content';
        contentDiv.id = 'cat-content-' + catIndex;
        
        (function(currentId) {
            headerDiv.addEventListener('click', function() {
                const content = document.getElementById('cat-content-' + currentId);
                const isVisible = content.style.display === 'block';
                content.style.display = isVisible ? 'none' : 'block';
            });
        })(catIndex);

        questionsList.forEach(function(q) {
            const card = document.createElement('div');
            card.className = 'card'; 
            card.id = 'q-box-' + q.id;
            
            const qTxt = document.createElement('p');
            qTxt.style.margin = '5px 0 12px 0';
            qTxt.style.fontSize = '16px';
            qTxt.style.fontWeight = '600';
            qTxt.textContent = q.question;
            card.appendChild(qTxt);
            
            if(q.normative) {
                const normDiv = document.createElement('div');
                normDiv.className = 'normative-text';
                normDiv.innerHTML = '<b>Норматив:</b> ';
                const normSpan = document.createElement('span');
                normSpan.textContent = q.normative;
                normDiv.appendChild(normSpan);
                card.appendChild(normDiv);
            }
            
            const btnRow = document.createElement('div'); 
            btnRow.className = 'btn-row';
            
            const okBtn = document.createElement('button');
            okBtn.type = 'button'; okBtn.className = 'btn btn-success'; okBtn.textContent = 'Соответствует';
            okBtn.addEventListener('click', function() {
                setResult(q.id, 'Соответствует', q.question, catName, q.normative, 'cat-counter-' + catIndex, questionsList.length);
            });
            
            const failBtn = document.createElement('button');
            failBtn.type = 'button'; failBtn.className = 'btn btn-danger'; failBtn.textContent = 'Нарушение';
            failBtn.addEventListener('click', function() {
                setResult(q.id, 'Нарушение', q.question, catName, q.normative, 'cat-counter-' + catIndex, questionsList.length);
            });
            
            btnRow.appendChild(okBtn);
            btnRow.appendChild(failBtn);
            card.appendChild(btnRow);
            
            const commentInp = document.createElement('input');
            commentInp.type = 'text';
            commentInp.id = 'comment-' + q.id;
            commentInp.className = 'comment-box';
            commentInp.placeholder = 'Опишите детали нарушения...';
            card.appendChild(commentInp);
            
            const photoContainer = document.createElement('div');
            photoContainer.className = 'photo-input-container';
            photoContainer.id = 'photo-area-' + q.id;
            photoContainer.style.display = 'none';
            
            const photoLabel = document.createElement('label');
            photoLabel.style.marginTop = '5px'; photoLabel.style.fontSize = '13px'; photoLabel.style.color = '#555';
            photoLabel.textContent = 'Прикрепить photo дефекта (до 2-х штук):';
            
            const fileInp = document.createElement('input');
            fileInp.type = 'file'; fileInp.id = 'file-' + q.id; fileInp.accept = 'image/*'; fileInp.multiple = true; fileInp.style.fontSize = '13px';
            fileInp.addEventListener('change', function() { handlePhotoUpload(this, q.id); });
            
            const previewDiv = document.createElement('div');
            previewDiv.className = 'photo-preview-grid'; previewDiv.id = 'preview-' + q.id;
            
            photoContainer.appendChild(photoLabel);
            photoContainer.appendChild(fileInp);
            photoContainer.appendChild(previewDiv);
            card.appendChild(photoContainer);
            
            contentDiv.appendChild(card);
        });

        blockDiv.appendChild(headerDiv);
        blockDiv.appendChild(contentDiv);
        container.appendChild(blockDiv);
    }
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
                const MAX_WIDTH = 800; 
                let width = img.width; let height = img.height;
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
                item.photos.push(compressedBase64);
                
                const prevImg = document.createElement('img');
                prevImg.className = 'photo-preview-item'; prevImg.src = compressedBase64;
                previewGrid.appendChild(prevImg);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}
function setResult(id, status, question, category, normative, counterId, totalCount) {
    let item = auditSession.results.find(function(r) { return r.id === id; });
    if (!item) {
        item = { id: id, question: question, category: category, normative: normative, status: status, comment: '', photos: [] };
        auditSession.results.push(item);
    } else { 
        item.status = status; 
    }
    
    const comp = document.getElementById('comment-' + id);
    const photoArea = document.getElementById('photo-area-' + id);
    if (comp) comp.style.display = status === 'Нарушение' ? 'block' : 'none';
    if (photoArea) photoArea.style.display = status === 'Нарушение' ? 'block' : 'none';
    
    document.getElementById('q-box-' + id).style.borderLeftColor = status === 'Соответствует' ? 'var(--success)' : 'var(--danger)';

    const checkedInCategory = auditSession.results.filter(function(r) { return r.category === category; }).length;
    const counterSpan = document.getElementById(counterId);
    if (counterSpan) {
        counterSpan.textContent = checkedInCategory + " / " + totalCount;
        if (checkedInCategory === totalCount) {
            counterSpan.className = "category-counter completed";
        }
    }
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
            alert("Данные успешно занесены в Google Реестр!");
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
    alert("⚠️ Нет связи. Акт сохранен на устройстве. Нажмите кнопку №2 для скачивания PDF.");
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
    alert("🔄 Найдена сеть: накопленные офлайн-акты синхронизированы с Google!");
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
        cell.colSpan = 4; cell.style.padding = "12px"; cell.style.textAlign = "center";
        cell.style.color = "#27ae60"; cell.style.fontWeight = "bold";
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
                cQuest.textContent = item.question;
                const sm = document.createElement('small');
                sm.style.color = '#555'; sm.style.display = 'block'; sm.style.marginTop = '4px';
                sm.textContent = 'Норматив: ' + item.normative;
                cQuest.appendChild(sm);
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
            
            const titleDiv = document.createElement('div');
            titleDiv.style.marginTop = '20px'; titleDiv.style.fontSize = '16px'; titleDiv.style.fontWeight = 'bold'; titleDiv.style.color = '#2c3e50'; titleDiv.style.borderBottom = '1px solid #2c3e50'; titleDiv.style.paddingBottom = '5px'; titleDiv.style.textTransform = 'uppercase';
            titleDiv.textContent = 'Приложение к Акту. Фотофиксация нарушений (Лист ' + (Math.floor(i/4) + 1) + ')';
            pageDiv.appendChild(titleDiv);
            
            const grid = document.createElement('div');
            grid.className = "pdf-photo-grid";
            
            let pagePhotos = allUploadedPhotos.slice(i, i + photosPerPage);
            pagePhotos.forEach(function(pData) {
                const photoCard = document.createElement('div');
                photoCard.className = "pdf-photo-card";
                
                const imgContainer = document.createElement('div');
                imgContainer.className = "pdf-photo-container-img";
                
                const htmlImg = document.createElement('img');
                htmlImg.className = "pdf-photo-img";
                htmlImg.src = pData.src;
                
                imgContainer.appendChild(htmlImg);
                photoCard.appendChild(imgContainer);
                
                const descDiv = document.createElement('div');
                descDiv.className = "pdf-photo-desc";
                descDiv.textContent = 'Фото к пункту №' + pData.index + ' ' + pData.category;
                photoCard.appendChild(descDiv);
                
                grid.appendChild(photoCard);
            });
            
            pageDiv.appendChild(grid);
            galleryWrapper.appendChild(pageDiv);
        }
    }

    const printElement = document.getElementById('print-blank-zone');
    printElement.style.display = 'block';

    const pdfOptions = {
        margin: 10,
        filename: 'Акт_ОТ_' + auditSession.objectName.replace(/[^a-zA-Z0-9а-яА-Я_]/g, "_") + '_' + currentDateStr + '.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 1.5, useCORS: true, logging: false }, 
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(pdfOptions).from(printElement).save().then(function() {
        printElement.style.display = 'none';
        document.getElementById('pdf-btn').disabled = false;
        if (confirm("Акт сохранен на ваше устройство! Очистить форму для новой проверки?")) {
            location.reload();
        }
    }).catch(function(err) {
        console.error(err);
        printElement.style.display = 'none';
        alert("Ошибка сборки PDF. Попробуйте нажать кнопку еще раз.");
    });
}

function backToStep1() { 
document.getElementById('step-3-checklist').style.display = 'none';
document.getElementById('step-1-form').style.display = 'block';
}
