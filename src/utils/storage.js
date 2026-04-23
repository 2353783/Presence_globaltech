import { supabase } from './supabase';

const CURRENT_USER_KEY = 'gt_current_user';

export const initStorage = async () => {
  // Supabase doesn't need explicit initialization here as it's done in supabase.js
};

// --- USERS ---

export const getUsers = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*');
    
    if (error) throw error;
    
    // Map snake_case from DB to camelCase for App
    return (data || []).map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      pin: u.pin,
      deviceId: u.device_id
    }));
  } catch (e) {
    console.error("Erreur Supabase (getUsers):", e);
    return [];
  }
};

export const addUser = async (user) => {
  try {
    const { error } = await supabase
      .from('users')
      .insert([{
        id: user.id,
        name: user.name,
        role: user.role,
        pin: user.pin,
        device_id: user.deviceId
      }]);
    
    if (error) throw error;
  } catch (e) {
    console.error("Erreur Supabase (addUser):", e);
  }
};

export const updateUser = async (user) => {
  if (!user.id) return;
  try {
    const { error } = await supabase
      .from('users')
      .update({
        name: user.name,
        role: user.role,
        pin: user.pin,
        device_id: user.deviceId
      })
      .eq('id', user.id);
    
    if (error) throw error;
  } catch (e) {
    console.error("Erreur Supabase (updateUser):", e);
  }
};

export const deleteUser = async (userId) => {
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);
    
    if (error) throw error;
  } catch (e) {
    console.error("Erreur Supabase (deleteUser):", e);
  }
};

// --- PRESENCE ---

export const getPresence = async () => {
  try {
    const { data, error } = await supabase
      .from('presence')
      .select('*');
    
    if (error) throw error;
    
    // Map snake_case from DB to camelCase for App
    return (data || []).map(p => ({
      id: p.id,
      userId: p.user_id,
      userName: p.user_name,
      date: p.date,
      checkIn: p.check_in,
      checkInCoords: p.check_in_coords,
      checkOut: p.check_out,
      checkOutCoords: p.check_out_coords,
      checkOutLocationName: p.check_out_location_name,
      deviceInfo: p.device_info
    }));
  } catch (e) {
    console.error("Erreur Supabase (getPresence):", e);
    return [];
  }
};

export const addPresenceRecord = async (record) => {
  try {
    const { error } = await supabase
      .from('presence')
      .insert([{
        id: record.id,
        user_id: record.userId,
        user_name: record.userName,
        date: record.date,
        check_in: record.checkIn,
        check_in_coords: record.checkInCoords,
        check_out: record.checkOut,
        check_out_coords: record.checkOutCoords,
        check_out_location_name: record.checkOutLocationName,
        device_info: record.deviceInfo
      }]);
    
    if (error) throw error;
  } catch (e) {
    console.error("Erreur Supabase (addPresenceRecord):", e);
  }
};

export const updatePresenceRecord = async (record) => {
  if (!record.id) return;
  try {
    const { error } = await supabase
      .from('presence')
      .update({
        user_id: record.userId,
        user_name: record.userName,
        date: record.date,
        check_in: record.checkIn,
        check_in_coords: record.checkInCoords,
        check_out: record.checkOut,
        check_out_coords: record.checkOutCoords,
        check_out_location_name: record.checkOutLocationName,
        device_info: record.deviceInfo
      })
      .eq('id', record.id);
    
    if (error) throw error;
  } catch (e) {
    console.error("Erreur Supabase (updatePresenceRecord):", e);
  }
};

// --- LOCAL STORAGE HELPERS ---

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
