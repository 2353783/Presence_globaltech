const API_URL = '/api';
const CURRENT_USER_KEY = 'gt_current_user';

export const initStorage = async () => {
  // DB is initialized by json-server using db.json
};

export const getUsers = async () => {
  try {
    const res = await fetch(`${API_URL}/users`);
    return await res.json();
  } catch (e) {
    console.error("Erreur serveur:", e);
    return [];
  }
};

export const addUser = async (user) => {
  await fetch(`${API_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  });
};

export const deleteUser = async (userId) => {
  await fetch(`${API_URL}/users/${userId}`, { method: 'DELETE' });
};

export const getPresence = async () => {
  try {
    const res = await fetch(`${API_URL}/presence`);
    return await res.json();
  } catch (e) {
    console.error("Erreur serveur:", e);
    return [];
  }
};

export const addPresenceRecord = async (record) => {
  await fetch(`${API_URL}/presence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record)
  });
};

export const updatePresenceRecord = async (record) => {
  if (!record.id) return;
  await fetch(`${API_URL}/presence/${record.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record)
  });
};

export const updateUser = async (user) => {
  if (!user.id) return;
  await fetch(`${API_URL}/users/${user.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  });
};

export const getDeviceId = () => {
  let id = localStorage.getItem('gt_device_id');
  if (!id) {
    id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('gt_device_id', id);
  }
  return id;
};

export const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  let browser = "Inconnu";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("SamsungBrowser")) browser = "Samsung Internet";
  else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  let os = "Inconnu";
  if (ua.includes("Win")) os = "Windows";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Mac")) os = "MacOS";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";

  return `${os} - ${browser}`;
};

export const getCurrentUser = () => JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
export const setCurrentUser = (user) => localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
export const logout = () => localStorage.removeItem(CURRENT_USER_KEY);
