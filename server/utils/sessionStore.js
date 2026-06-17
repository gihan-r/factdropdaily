// In-memory active session manager (Single Active Admin Session)
let activeToken = null;
let lastHeartbeat = null;
const HEARTBEAT_TIMEOUT_MS = 25000; // 25 seconds timeout for automatic lease expiry

function setSession(token) {
  activeToken = token;
  lastHeartbeat = Date.now();
}

function clearSession() {
  activeToken = null;
  lastHeartbeat = null;
}

function updateHeartbeat() {
  if (activeToken) {
    lastHeartbeat = Date.now();
  }
}

function isSessionValid(token) {
  if (!activeToken || activeToken !== token) {
    return false;
  }
  
  // Check heartbeat expiry
  if (lastHeartbeat && Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
    clearSession();
    return false;
  }
  
  return true;
}

function hasActiveSession() {
  if (!activeToken) return false;
  
  // If the active session has timed out due to no heartbeat, clear it automatically
  if (lastHeartbeat && Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
    clearSession();
    return false;
  }
  
  return true;
}

module.exports = {
  setSession,
  clearSession,
  updateHeartbeat,
  isSessionValid,
  hasActiveSession
};
