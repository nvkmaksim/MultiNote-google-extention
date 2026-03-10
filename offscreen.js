let mediaRecorder;
let chunks = [];
let videoRecorder;
let videoChunks = [];

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.target !== 'offscreen') return;
    if (message.type === 'start-video') {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            videoRecorder = new MediaRecorder(stream);
            videoChunks = [];

            videoRecorder.ondataavailable = (e) => videoChunks.push(e.data);
            videoRecorder.onstop = () => {
                const blob = new Blob(videoChunks, { type: 'video/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => {
                    chrome.runtime.sendMessage({
                        type: 'video-recording-stopped',
                        dataUrl: reader.result
                    });
                };
                stream.getTracks().forEach(t => t.stop());
            };
            videoRecorder.start();
        } catch (err) {
            console.error("Ошибка захвата экрана:", err);
        }
    } else if (message.type === 'stop-video') {
        videoRecorder.stop();
    }
    if (message.type === 'start-recording') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        chunks = [];

        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.readAsDataURL(blob); 
            reader.onloadend = () => {
                chrome.runtime.sendMessage({
                    type: 'recording-stopped',
                    dataUrl: reader.result
                });
            };
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
    } else if (message.type === 'stop-recording') {
        mediaRecorder.stop();
    }
});