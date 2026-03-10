const noteBtn = document.getElementById("note-btn");
const tabBtn = document.getElementById("tab-btn");
const screenshotBtn = document.getElementById("screenshot-btn");
const voiceBtn = document.getElementById("voice-btn");
const videoBtn = document.getElementById("video-btn");
const resetBtn = document.getElementById("reset-btn");
const noteInput = document.getElementById("note-input");
const notesList = document.getElementById("notes-list");

const activeColor = "papayawhip"
const inActiveColor = "rgb(255, 223, 171)"

let myNotes = JSON.parse(localStorage.getItem("Notes")) || [];
let isRecordingVoice = false;
let isRecordingVideo = false;

render(myNotes);

noteInput.addEventListener("input", () => {
    const hasText = noteInput.value.trim().length > 0;
    const btnColor = hasText ? activeColor : inActiveColor;
    applyBtnStatus(hasText, btnColor);
});

noteBtn.addEventListener("click", () => {
    const noteValue = noteInput.value.trim();
    if (noteValue) {
        saveNote({ 
            type: "note", 
            name: noteValue 
        });
        noteInput.value = "";
        applyBtnStatus(false, inActiveColor);
    }
});

tabBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        saveNote({ 
            type: "tab-link",
            name: tabs[0].url,
            isEditing: true,
        });
    });
});

screenshotBtn.addEventListener("click", () => {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        const defaultName = `screenshot_${Date.now()}.png`;
        saveNote({ 
            type: "image-file",
            name: defaultName, 
            tempUrl: dataUrl,
            isEditing: true
        });
    });
});

videoBtn.addEventListener("click", async () => {
    await ensureOffscreenDocument('DISPLAY_MEDIA', 'Recording screen video');
    isRecordingVideo = !isRecordingVideo;
    
    chrome.runtime.sendMessage({ 
        type: isRecordingVideo ? 'start-video' : 'stop-video', 
        target: 'offscreen' 
    });

    videoBtn.style.backgroundColor = isRecordingVideo ? "red" : inActiveColor;
});

voiceBtn.addEventListener("click", async () => {
    await ensureOffscreenDocument('USER_MEDIA', 'Recording voice notes');
    isRecordingVoice = !isRecordingVoice;

    chrome.runtime.sendMessage({ 
        type: isRecordingVoice ? 'start-recording' : 'stop-recording', 
        target: 'offscreen' 
    });

    voiceBtn.style.backgroundColor = isRecordingVoice ? "red" : inActiveColor;
});

// Получение данных из Offscreen Document
chrome.runtime.onMessage.addListener((message) => {
    const types = {
        'video-recording-stopped': { prefix: 'video', type: 'video-file' },
        'recording-stopped': { prefix: 'voice', type: 'audio-file' }
    };

    const config = types[message.type];
    if (config) {
        const defaultName = `${config.prefix}_${Date.now()}.webm`;
        saveNote({ 
            type: config.type, 
            name: defaultName, 
            tempUrl: message.dataUrl,
            isEditing: true
        });
    }
});

resetBtn.addEventListener("click", () => {
    localStorage.clear();
    myNotes = [];
    render(myNotes);
});

// ---Вспомогательные функции---

function saveNote(noteObj) {
    myNotes.push(noteObj);
    localStorage.setItem("Notes", JSON.stringify(myNotes));
    render(myNotes);
}

async function ensureOffscreenDocument(reason, justification) {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length === 0) {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: [reason],
            justification: justification
        });
    }
}

function render(notes) {
    notesList.innerHTML = notes.map((item, i) => {
        if (!item) return "";
        
        const icons = {
            "video-file": "🎬", "audio-file": "🎤", "image-file": "📸",
            "note": "📝", "tab-link": "🔗"
        };
        const icon = icons[item.type];

        const defaultInput = 
            `<li><div class="tab-item">
                <span>${icon}</span><input class="edit-input" data-index="${i}" value="${item.name}"></input>
            </div></li>`;

        if (["video-file", "audio-file", "image-file"].includes(item.type)) {
            if (item.isEditing){
                return defaultInput;
            }
            else {
                return `<li><div class="file-item">
                    <span>${icon}</span>
                    <span class="open-file-action" data-id="${item.id}" style="cursor:pointer; color: #0000EE;; text-decoration: underline;">
                        ${item.name}
                    </span>
                </div></li>`
            }
        }
        
        if (item.type === "note") {
            return `<li><div class="note-item">
                <span>${icon}</span><p class="note-text">${item.name}</p>
            </div></li>`;
        }

        if (item.type === "tab-link")
        {
            if (item.isEditing){
                return defaultInput;
            }
            else {
                return `<li><div class="tab-item">
                    <span>${icon}</span><a href="${item.name}" target="_blank">${item.name}</a>
                </div></li>`;
            }
        }
    }).join("");
    // Фокус на новый инпут
    const activeInput = notesList.querySelector(".edit-input");
    if (activeInput) {
        activeInput.focus();
        activeInput.setSelectionRange(activeInput.value.length, activeInput.value.length);
    }
}

function applyBtnStatus(disabled, color) {
    [tabBtn, screenshotBtn].forEach(btn => {
        btn.disabled = disabled;
        btn.style.backgroundColor = color;
    });
    if (!isRecordingVoice) {
        voiceBtn.disabled = disabled;
        voiceBtn.style.backgroundColor = color;
    }
    if (!isRecordingVideo) {
        videoBtn.disabled = disabled;
        videoBtn.style.backgroundColor = color;
    }
}

notesList.addEventListener("click", (e) => {
    if (e.target.classList.contains("open-file-action")) {
        const id = parseInt(e.target.dataset.id);
        if (id) chrome.downloads.open(id);
    }
});

// Обработка Enter
notesList.addEventListener("keydown", (e) => {
    if (e.target.classList.contains("edit-input") && e.key === "Enter") {
        confirmEdit(e.target.dataset.index, e.target.value.trim());
    }
});

// Обработка клика вне инпута
notesList.addEventListener("focusout", (e) => {
    if (e.target.classList.contains("edit-input")) {
        const index = e.target.dataset.index;
        if (myNotes[index] && myNotes[index].isEditing) {
            confirmEdit(index, e.target.value.trim());
        }
    }
});

function confirmEdit(index, newValue) {
    const item = myNotes[index];
    if (!item) return;

    if (newValue === "") {
        myNotes.splice(index, 1);
    } else {
        item.name = newValue;
        item.isEditing = false;

        if (["image-file", "video-file", "audio-file"].includes(item.type) && item.tempUrl) {
            chrome.downloads.download({ 
                url: item.tempUrl, 
                filename: item.name 
            }, (id) => {
                item.id = id;
                delete item.tempUrl; 
                localStorage.setItem("Notes", JSON.stringify(myNotes));
                render(myNotes);
            });
        }
    }

    localStorage.setItem("Notes", JSON.stringify(myNotes));
    render(myNotes);
}