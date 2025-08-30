// uiUtils.js

export function showErrorModal(message) {
    const modal = document.getElementById('errorModal');
    if (!modal) return;
    const modalBody = modal.querySelector('.modal-body');
    modalBody.textContent = message;
    modal.style.display = 'block';
}

export function showSuccessModal(message) {
    const modal = document.getElementById('successModal');
    if (!modal) return;
    const modalBody = modal.querySelector('.modal-body');
    modalBody.textContent = message;
    modal.style.display = 'block';
}

export function updateChatBubble(text, className) {
    const chatArea = document.querySelector('.chat-area');
    if (!chatArea) return;

    chatArea.innerHTML = '';

    const chatBubble = document.createElement('div');
    chatBubble.className = `chat-bubble ${className}`;
    chatBubble.textContent = text;
    chatArea.appendChild(chatBubble);

    setTimeout(() => {
        chatBubble.remove();
    }, 5000);
}
