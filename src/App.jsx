import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { getDistance, OFFICE_COORDS, ALLOWED_RADIUS_METERS } from './utils/geo';
import { initStorage, getUsers, getPresence, addPresenceRecord, updatePresenceRecord, getCurrentUser, setCurrentUser, logout, addUser, deleteUser, getDeviceId, getDeviceInfo, updateUser } from './utils/storage';

const WORK_START = { h: 8, m: 30 };
const WORK_END = { h: 16, m: 30 };

function App() {
  const [user, setUser] = useState(getCurrentUser());
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [presence, setPresence] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState(user?.role === 'admin' ? 'live' : 'tracker');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Admin Form Local State
  const [newUserName, setNewUserName] = useState('');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserRole, setNewUserRole] = useState('agent');
  const [creationError, setCreationError] = useState('');

  // Report Filter State
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());

  const refreshData = async () => {
    const p = await getPresence();
    const u = await getUsers();
    setPresence(p);
    setAllUsers(u);
  };

  useEffect(() => {
    initStorage();
    refreshData();
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    // Auto-refresh data every 30 seconds as requested
    const refreshInterval = setInterval(refreshData, 30000);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      clearInterval(clockInterval);
      clearInterval(refreshInterval);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const users = await getUsers();
    const found = users.find(u => u.pin === pin);
    if (found) {
      const myDeviceId = getDeviceId();
      if (found.role !== 'admin') {
        const otherUser = users.find(u => u.deviceId === myDeviceId && u.id !== found.id && u.role !== 'admin');
        if (otherUser) {
          setError(`Accès refusé: Appareil déjà lié à ${otherUser.name}.`);
          return;
        }

        if (found.deviceId && found.deviceId !== myDeviceId) {
          setError(`Accès refusé: Votre compte est lié à un autre téléphone/ordinateur.`);
          return;
        }

        if (!found.deviceId) {
          const updatedUser = { ...found, deviceId: myDeviceId };
          await updateUser(updatedUser);
          found.deviceId = myDeviceId;
        }
      }

      setUser(found);
      setCurrentUser(found);
      setActiveTab(found.role === 'admin' ? 'live' : 'tracker');
      setIsSidebarOpen(false);
      setPin('');
      setError('');
    } else {
      setError('PIN incorrect');
    }
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setIsSidebarOpen(false);
  };

  const handleCheckIn = () => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const dist = getDistance(latitude, longitude, OFFICE_COORDS.lat, OFFICE_COORDS.lon);

        if (dist <= ALLOWED_RADIUS_METERS) {
          const newRecord = {
            id: Date.now().toString(),
            userId: user.id,
            userName: user.name,
            deviceInfo: getDeviceInfo(),
            date: new Date().toLocaleDateString(),
            checkIn: new Date().toISOString(),
            checkInCoords: { lat: latitude, lon: longitude },
            checkOut: null,
            checkOutCoords: null
          };
          await addPresenceRecord(newRecord);
          await refreshData();
          setError('');
        } else {
          setError("Veuillez vous rendre au bureau de Global Tech pour pointer votre arrivée.");
        }
        setLoading(false);
      },
      () => {
        setError("Erreur de géolocalisation (Veuillez autoriser l'accès à la position dans votre navigateur).");
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const getLocationName = async (lat, lon) => {
    const dist = getDistance(lat, lon, OFFICE_COORDS.lat, OFFICE_COORDS.lon);
    if (dist <= ALLOWED_RADIUS_METERS) {
      return "BUREAU GLOBAL TECH";
    }
    
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      const data = await resp.json();
      if (data && data.address) {
        const addr = data.address;
        const avenue = addr.road || addr.pedestrian || "";
        const quartier = addr.suburb || addr.neighbourhood || addr.village || "";
        const commune = addr.city_district || addr.city || addr.town || "";
        
        const parts = [avenue, quartier, commune].filter(p => p).join(", ");
        if (parts) {
          return `${parts} (à ${Math.round(dist)}m du bureau)`;
        }
      }
      return `À ${Math.round(dist)}m du bureau`;
    } catch {
      return `À ${Math.round(dist)}m du bureau`;
    }
  };

  const getWorkDaysInMonth = (month, year) => {
    const days = [];
    const date = new Date(year, month, 1);
    const now = new Date();
    
    while (date.getMonth() === month) {
      const dayOfWeek = date.getDay();
      // 0 = Sunday, 6 = Saturday
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        if (date <= now) {
          days.push({
            dateObj: new Date(date),
            dateStr: new Date(date).toLocaleDateString()
          });
        }
      }
      date.setDate(date.getDate() + 1);
    }
    return days;
  };

  const getAugmentedPresence = () => {
    const augmented = [];

    // 1. Ajouter tous les enregistrements réels du mois sélectionné
    presence.forEach(p => {
      if (p.checkIn) {
        const d = new Date(p.checkIn);
        if (d.getMonth() === reportMonth && d.getFullYear() === reportYear) {
          augmented.push({ 
            ...p, 
            status: 'Present',
            sortTime: d.getTime() 
          });
        }
      }
    });

    // 2. Déterminer les absences
    const workDays = getWorkDaysInMonth(reportMonth, reportYear);
    
    workDays.forEach(({ dateObj, dateStr }) => {
      // BUG FIX: Exclure les admins des absences dans les rapports
      allUsers.filter(u => u.role !== 'admin').forEach(u => {
        const hasRecord = augmented.some(p => p.userId === u.id && p.date === dateStr);
        if (!hasRecord) {
          augmented.push({
            id: `absent-${u.id}-${dateStr}`,
            userId: u.id,
            userName: u.name,
            date: dateStr,
            status: 'Absent',
            checkIn: null,
            checkOut: null,
            deviceInfo: '---',
            sortTime: dateObj.getTime()
          });
        }
      });
    });

    // Trier les résultats de manière robuste (les plus récents en premier)
    return augmented.sort((a, b) => b.sortTime - a.sortTime);
  };

  const handleExportExcel = () => {
    const dataToExport = getAugmentedPresence().map(rec => {
      let locationText = '---';
      if (rec.status === 'Absent') {
        return {
          "Nom": rec.userName,
          "Date": rec.date,
          "Statut": "ABSENT",
          "Arrivée": "---",
          "Départ": "---",
          "Lieu de Départ": "---",
          "Temps de Travail": "0h 0m",
          "Sortie Zone": "---",
          "Appareil": "---"
        };
      }

      if (rec.checkOutLocationName) {
        locationText = rec.checkOutLocationName;
      } else if (rec.checkOutCoords) {
        const dist = Math.round(getDistance(rec.checkOutCoords.lat, rec.checkOutCoords.lon, OFFICE_COORDS.lat, OFFICE_COORDS.lon));
        locationText = dist <= ALLOWED_RADIUS_METERS ? "BUREAU GLOBAL TECH" : `À ${dist}m du bureau`;
      }
      
      const exitTime = getExitZoneTime(rec.deviceInfo);
      return {
        "Nom": rec.userName,
        "Date": rec.date,
        "Statut": "PRÉSENT",
        "Arrivée": new Date(rec.checkIn).toLocaleTimeString(),
        "Départ": rec.checkOut ? new Date(rec.checkOut).toLocaleTimeString() : '---',
        "Lieu de Départ": locationText,
        "Temps de Travail": calculateTimeSpent(rec),
        "Sortie Zone": exitTime || "Non détectée",
        "Appareil": rec.deviceInfo || "Inconnu"
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Présences");
    XLSX.writeFile(workbook, `Rapport_Presence_GTech_${reportMonth + 1}_${reportYear}.xlsx`);
  };

  const handleCheckOut = () => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const locationName = await getLocationName(latitude, longitude);
        
        const currentRec = presence.find(rec => rec.userId === user.id && rec.date === new Date().toLocaleDateString() && !rec.checkOut);
        
        if (currentRec) {
          const updatedRec = {
            ...currentRec,
            checkOut: new Date().toISOString(),
            checkOutCoords: { lat: latitude, lon: longitude },
            checkOutLocationName: locationName
          };
          await updatePresenceRecord(updatedRec);
          await refreshData();
        }
        setLoading(false);
      },
      () => {
        setError("Erreur de géolocalisation lors du départ.");
        setLoading(false);
      }
    );
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserName || !newUserPin) return;

    // Check for duplicate PIN
    if (allUsers.find(u => u.pin === newUserPin)) {
      setCreationError('Ce code PIN est déjà utilisé par un autre utilisateur.');
      return;
    }

    const newUser = {
      id: Date.now().toString(),
      name: newUserName,
      pin: newUserPin,
      role: newUserRole
    };
    await addUser(newUser);
    setNewUserName('');
    setNewUserPin('');
    setCreationError('');
    await refreshData();
  };

  const handleDeleteUser = async (userId) => {
    if (confirm("Supprimer cet utilisateur ?")) {
      await deleteUser(userId);
      await refreshData();
    }
  };

  const handleResetDevice = async (userId) => {
    if (confirm("Réinitialiser l'appareil de cet utilisateur ? Cela lui permettra de se connecter depuis un nouvel appareil.")) {
      const u = allUsers.find(user => user.id === userId);
      if (u) {
        const updatedUser = { ...u, deviceId: null };
        await updateUser(updatedUser);
        await refreshData();
      }
    }
  };

  const getExitZoneTime = (deviceInfo) => {
    if (!deviceInfo) return null;
    const match = deviceInfo.match(/Sortie zone:\s*([^\s|]+)/);
    return match ? match[1] : null;
  };

  // BUG FIX: currentRecord doit être déclaré AVANT le useEffect qui l'utilise
  // Priorité à l'enregistrement du jour sans checkOut, sinon le dernier du jour
  const currentRecord = (() => {
    const todayStr = new Date().toLocaleDateString();
    const todayRecords = presence.filter(rec => rec.userId === user?.id && rec.date === todayStr);
    return todayRecords.find(rec => !rec.checkOut) || todayRecords[todayRecords.length - 1];
  })();

  useEffect(() => {
    if (!user || !currentRecord || currentRecord.checkOut) {
      return;
    }

    let watchId = null;

    const checkPerimeter = (position) => {
      const { latitude, longitude } = position.coords;
      const dist = getDistance(latitude, longitude, OFFICE_COORDS.lat, OFFICE_COORDS.lon);

      if (dist > ALLOWED_RADIUS_METERS) {
        const hasLeftRecorded = currentRecord.deviceInfo && currentRecord.deviceInfo.includes("Sortie zone");

        if (!hasLeftRecorded) {
          const exitTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const updatedRecord = {
            ...currentRecord,
            deviceInfo: `${currentRecord.deviceInfo || getDeviceInfo()} | Sortie zone: ${exitTime}`
          };
          
          updatePresenceRecord(updatedRecord).then(() => {
            refreshData();
          });
        }
      }
    };

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        checkPerimeter,
        (err) => console.warn("Erreur de suivi géolocalisation:", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [user, currentRecord?.id, currentRecord?.checkOut, currentRecord?.deviceInfo]);

  const calculateTimeSpent = (rec) => {
    if (!rec || !rec.checkIn) return "0h 0m";
    const start = new Date(rec.checkIn);
    const end = rec.checkOut ? new Date(rec.checkOut) : currentTime;
    const diffMs = end - start;
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    return `${diffHrs}h ${diffMins}m`;
  };

  if (!user) {
    return (
      <div className="container animate-fade-in" style={{ maxWidth: '400px', marginTop: '10vh' }}>
        <div className="glass-card" style={{ textAlign: 'center', maxWidth: '400px' }}>
          <img src="/LOGO_GTECH-removebg-preview.png" alt="Global Tech" className="logo-img" style={{ width: '120px', height: '120px', marginBottom: '1rem' }} />
          <h1 className="company-name" style={{ marginBottom: '2rem', fontSize: '2rem' }}>Global Tech Presence</h1>
          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label>Entrez votre code PIN</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="****"
                maxLength="4"
                required
              />
            </div>
            {error && <p style={{ color: 'var(--accent-red)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Se connecter</button>
            {deferredPrompt && (
              <button type="button" onClick={handleInstallClick} className="btn" style={{ width: '100%', marginTop: '1rem', background: 'var(--glass-bg)', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)' }}>
                📱 Installer l'application
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout animate-fade-in">
      {/* Sidebar Overlay (Mobile only) */}
      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/LOGO_GTECH-removebg-preview.png" alt="Global Tech" className="logo-img" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="company-name">Global Tech</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Presence Tracking</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {user.role === 'admin' ? (
            <>
              <button 
                className={`sidebar-item ${activeTab === 'live' ? 'active' : ''}`} 
                onClick={() => { setActiveTab('live'); setIsSidebarOpen(false); }}
              >
                📊 Tableau de bord
              </button>
              <button 
                className={`sidebar-item ${activeTab === 'reports' ? 'active' : ''}`} 
                onClick={() => { setActiveTab('reports'); setIsSidebarOpen(false); }}
              >
                📜 Historique
              </button>
              <button 
                className={`sidebar-item ${activeTab === 'users' ? 'active' : ''}`} 
                onClick={() => { setActiveTab('users'); setIsSidebarOpen(false); }}
              >
                👥 Utilisateurs
              </button>
            </>
          ) : (
            <button 
              className={`sidebar-item ${activeTab === 'tracker' ? 'active' : ''}`} 
              onClick={() => { setActiveTab('tracker'); setIsSidebarOpen(false); }}
            >
              ⏱️ Mon Pointage
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-name">{user.name}</div>
            <div className="user-role">{user.role === 'admin' ? 'Administrateur' : 'Agent'}</div>
          </div>
          <button onClick={handleLogout} className="btn-logout">
            🚪 Déconnexion
          </button>
          {deferredPrompt && (
            <button onClick={handleInstallClick} className="btn-install" style={{ marginTop: '0.5rem' }}>
              📱 Installer App
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Container */}
      <div className="main-container">
        {/* Top bar (Mobile only) */}
        <header className="mobile-header">
          <button className="hamburger-btn" onClick={() => setIsSidebarOpen(true)}>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
          <div className="mobile-brand">
            <img src="/LOGO_GTECH-removebg-preview.png" alt="Global Tech" className="logo-img" style={{ width: '32px', height: '32px' }} />
            <span className="company-name" style={{ fontSize: '1.1rem' }}>Global Tech</span>
          </div>
          <div style={{ width: '40px' }}></div> {/* spacer to center brand */}
        </header>

        {/* Page Content */}
        <main className="main-content">
          {/* Admin Dashboard view */}
          {user.role === 'admin' && activeTab === 'live' && (
            <div className="dashboard-view animate-fade-in">
              <div className="grid-dashboard">
                {/* User Tracker Card */}
                <section className="glass-card">
                  <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Ma Présence Aujourd'hui</h2>
                  <div style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '2rem', color: 'var(--accent-blue)' }}>
                    {calculateTimeSpent(currentRecord)}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {!currentRecord ? (
                      <button onClick={handleCheckIn} className="btn btn-primary" disabled={loading}>
                        {loading ? 'Localisation...' : 'Pointer Arrivée'}
                      </button>
                    ) : !currentRecord.checkOut ? (
                      <button onClick={handleCheckOut} className="btn btn-danger" disabled={loading}>
                        {loading ? 'Localisation...' : 'Fin de Service'}
                      </button>
                    ) : (
                      <div className="status-badge status-offline" style={{ textAlign: 'center', padding: '1rem' }}>
                        Travail terminé pour aujourd'hui
                      </div>
                    )}
                  </div>

                  {error && <p style={{ color: 'var(--accent-red)', marginTop: '1rem', fontSize: '0.875rem' }}>{error}</p>}

                  <div style={{ marginTop: '2rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Arrivée:</span>
                      <span>{currentRecord ? new Date(currentRecord.checkIn).toLocaleTimeString() : '--:--'}</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                      <span>Départ:</span>
                      <span>{currentRecord?.checkOut ? new Date(currentRecord.checkOut).toLocaleTimeString() : '--:--'}</span>
                    </div>
                  </div>
                </section>

                {/* Live Presence Table */}
                <section className="glass-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem' }}>Présence en Temps Réel</h2>
                    <span className="status-badge status-online">Auto-refresh: 30s</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                          <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Nom</th>
                          <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Arrivée</th>
                          <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Temps écoulé</th>
                        </tr>
                      </thead>
                      <tbody>
                        {presence.filter(r => r.date === new Date().toLocaleDateString() && !r.checkOut).map((rec, i) => {
                          const exitTime = getExitZoneTime(rec.deviceInfo);
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                              <td style={{ padding: '0.75rem 0.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: '600' }}>{rec.userName}</span>
                                  {exitTime && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem' }}>
                                      ⚠️ Hors zone depuis {exitTime}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '0.75rem 0.5rem' }}>{new Date(rec.checkIn).toLocaleTimeString()}</td>
                              <td style={{ padding: '0.75rem 0.5rem' }}>{calculateTimeSpent(rec)}</td>
                            </tr>
                          );
                        })}
                        {presence.filter(r => r.date === new Date().toLocaleDateString() && !r.checkOut).length === 0 && (
                          <tr>
                            <td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Personne n'est actuellement au bureau</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* Admin Reports view */}
          {user.role === 'admin' && activeTab === 'reports' && (
            <section className="glass-card animate-fade-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Rapports de Présence</h2>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select 
                      value={reportMonth} 
                      onChange={(e) => setReportMonth(parseInt(e.target.value))}
                      style={{ padding: '0.4rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)' }}
                    >
                      {["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"].map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                      ))}
                    </select>
                    <select 
                      value={reportYear} 
                      onChange={(e) => setReportYear(parseInt(e.target.value))}
                      style={{ padding: '0.4rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)' }}
                    >
                      {[2024, 2025, 2026].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleExportExcel} className="btn" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', border: '1px solid var(--glass-border)', background: 'var(--accent-blue)', color: 'white' }}>Exporter Excel</button>
                  <button onClick={() => window.print()} className="btn" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', border: '1px solid var(--glass-border)' }}>Imprimer</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                      <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Agent</th>
                      <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Date</th>
                      <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Statut</th>
                      <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Arrivée</th>
                      <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Départ</th>
                      <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Temps Travail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getAugmentedPresence().map((rec, i) => {
                      const exitTime = getExitZoneTime(rec.deviceInfo);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)', opacity: rec.status === 'Absent' ? 0.7 : 1 }}>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: '600' }}>{rec.userName}</span>
                              {exitTime && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--accent-red)', fontWeight: '500', marginTop: '0.15rem' }}>
                                  Sortie zone: {exitTime}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>{rec.date}</td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '4px', 
                              fontSize: '0.7rem',
                              background: rec.status === 'Absent' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                              color: rec.status === 'Absent' ? '#ef4444' : '#22c55e',
                              fontWeight: 'bold'
                            }}>
                              {rec.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>{rec.checkIn ? new Date(rec.checkIn).toLocaleTimeString() : '---'}</td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>{rec.checkOut ? new Date(rec.checkOut).toLocaleTimeString() : '---'}</td>
                          <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>{rec.status === 'Absent' ? '---' : calculateTimeSpent(rec)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Admin Users view */}
          {user.role === 'admin' && activeTab === 'users' && (
            <section className="glass-card animate-fade-in">
              <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Gestion des Utilisateurs</h2>
              <form onSubmit={handleCreateUser} className="admin-form">
                <div>
                  <label>Nom complet</label>
                  <input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Ex: Jean Paul" required />
                </div>
                <div>
                  <label>Code PIN (4 chiffres)</label>
                  <input value={newUserPin} onChange={e => setNewUserPin(e.target.value)} placeholder="0000" maxLength="4" required />
                </div>
                <div>
                  <label>Rôle</label>
                  <select
                    value={newUserRole}
                    onChange={e => setNewUserRole(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem', background: '#fff', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '0.5rem' }}
                  >
                    <option value="agent">Agent</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" style={{ gridColumn: 'span 3', marginTop: '1rem' }}>Ajouter l'utilisateur</button>
                {creationError && <p style={{ color: 'var(--accent-red)', gridColumn: 'span 3', marginTop: '1rem', fontSize: '0.875rem' }}>{creationError}</p>}
              </form>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                      <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Nom</th>
                      <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Rôle</th>
                      <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>PIN</th>
                      <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{u.name}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <span className={`status-badge ${u.role === 'admin' ? 'status-online' : 'status-offline'}`}>
                            {u.role === 'admin' ? 'Admin' : 'Agent'}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>****</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {u.role !== 'admin' && u.deviceId && (
                              <button
                                onClick={() => handleResetDevice(u.id)}
                                className="btn"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(37, 99, 235, 0.1)', color: 'var(--accent-blue)' }}
                              >
                                🔄 Réinitialiser
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="btn"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}
                              disabled={u.id === 'admin'} // Protect primary admin
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Non-admin / Agent view */}
          {user.role !== 'admin' && activeTab === 'tracker' && (
            <section className="glass-card animate-fade-in" style={{ maxWidth: '500px', margin: '2rem auto' }}>
              <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Ma Présence Aujourd'hui</h2>
              <div style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '2rem', color: 'var(--accent-blue)' }}>
                {calculateTimeSpent(currentRecord)}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {!currentRecord ? (
                  <button onClick={handleCheckIn} className="btn btn-primary" disabled={loading}>
                    {loading ? 'Localisation...' : 'Pointer Arrivée'}
                  </button>
                ) : !currentRecord.checkOut ? (
                  <button onClick={handleCheckOut} className="btn btn-danger" disabled={loading}>
                    {loading ? 'Localisation...' : 'Fin de Service'}
                  </button>
                ) : (
                  <div className="status-badge status-offline" style={{ textAlign: 'center', padding: '1rem' }}>
                    Travail terminé pour aujourd'hui
                  </div>
                )}
              </div>

              {error && <p style={{ color: 'var(--accent-red)', marginTop: '1rem', fontSize: '0.875rem' }}>{error}</p>}

              <div style={{ marginTop: '2rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Arrivée:</span>
                  <span>{currentRecord ? new Date(currentRecord.checkIn).toLocaleTimeString() : '--:--'}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <span>Départ:</span>
                  <span>{currentRecord?.checkOut ? new Date(currentRecord.checkOut).toLocaleTimeString() : '--:--'}</span>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
