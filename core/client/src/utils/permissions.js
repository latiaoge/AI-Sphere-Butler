export async function requestMicrophonePermission() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch {
      alert('请允许麦克风权限以继续');
      return false;
    }
  }
  