import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Home, Users, Settings, Upload, Trash2, ArrowUpRight, ArrowDownLeft, Lock, LogOut, FileText,
  Loader2, CheckCircle2, XCircle, TrendingUp, TrendingDown, CreditCard, 
  Sun, Moon, Monitor, Plus, Save
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const API_URL = 'http://127.0.0.1:5001';

// --- API HELPER ---
const apiCall = async (endpoint, method = 'GET', body = null, token = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body instanceof FormData) delete headers['Content-Type']; 

  const config = { method, headers };
  if (body) config.body = body instanceof FormData ? body : JSON.stringify(body);

  try {
    const res = await fetch(`${API_URL}${endpoint}`, config);
    if (res.status === 401) {
      localStorage.removeItem('token'); 
      window.location.reload(); 
      return { error: 'Unauthorized' };
    }
    return res.json();
  } catch (e) {
    console.error("API Error:", e);
    return { error: "Server error" };
  }
};

// --- THEME HOOK ---
const useTheme = () => {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'system');

  useEffect(() => {
    const root = window.document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      root.classList.remove('dark', 'light');
      const isDark = theme === 'dark' || (theme === 'system' && mq.matches);
      if (isDark) root.classList.add('dark');
    };
    apply();
    localStorage.setItem('theme', theme);
    if (theme === 'system') {
      const handler = () => apply();
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    return undefined;
  }, [theme]);

  return { theme, setTheme };
};

// --- ADMIN PANEL ---
const AdminPanel = ({ token }) => {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', password: '' });

  const loadUsers = useCallback(async () => {
    const data = await apiCall('/list-users', 'GET', null, token);
    if (Array.isArray(data)) setUsers(data);
  }, [token]);
  useEffect(() => { loadUsers(); }, [loadUsers]);
  const createUser = async () => {
    if (!newUser.username || !newUser.password) return alert("Completeaza campurile!");
    const res = await apiCall('/create-user', 'POST', newUser, token);
    if (res.status === 'success') { alert("User creat!"); setNewUser({ username: '', password: '' }); loadUsers(); } 
    else alert(res.error || "Eroare");
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Administrare Utilizatori</h2>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-8 max-w-2xl">
        <h3 className="font-bold mb-4 text-gray-700 dark:text-gray-200">Adaugă Utilizator Nou</h3>
        <div className="flex gap-4">
          <input type="text" placeholder="Username" className="flex-1 p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none text-gray-800 dark:text-white" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
          <input type="text" placeholder="Parola" className="flex-1 p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none text-gray-800 dark:text-white" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
          <button onClick={createUser} className="bg-black dark:bg-white dark:text-black text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold"><Plus className="w-4 h-4"/> Creează</button>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600">
            <tr><th className="p-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Username</th><th className="p-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Rol</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="p-4 font-bold text-gray-800 dark:text-white">{u.username}</td><td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${u.role==='admin'?'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200':'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-200'}`}>{u.role.toUpperCase()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- SETTINGS PANEL ---
const SettingsPanel = ({ token }) => {
  const [pass, setPass] = useState('');
  const changePass = async () => {
    const res = await apiCall('/change-password', 'POST', { new_password: pass }, token);
    if (res.status === 'success') { alert("Parola schimbata!"); setPass(''); } else alert("Eroare");
  };
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Setări Cont</h2>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-md">
        <h3 className="font-bold mb-4 text-gray-700 dark:text-gray-200">Schimbă Parola</h3>
        <input type="password" placeholder="Noua parolă" className="w-full p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl mb-4 outline-none text-gray-800 dark:text-white" value={pass} onChange={e => setPass(e.target.value)} />
        <button onClick={changePass} className="bg-black dark:bg-white dark:text-black text-white w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold"><Save className="w-4 h-4"/> Salvează</button>
      </div>
    </div>
  );
};

// --- LOGIN ---
const LoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(localStorage.getItem('rememberMe') === '1');
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/login`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('rememberMe', rememberMe ? '1' : '0');
        onLogin(data, rememberMe);
      } else setError(data.message || 'Date incorecte');
    } catch { setError('Eroare server.'); } finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 transition-colors duration-300">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-black dark:bg-white text-white dark:text-black rounded-2xl mx-auto flex items-center justify-center mb-4"><Lock className="w-8 h-8" /></div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Acces Trezorerie</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Utilizator</label><input type="text" value={username} onChange={e=>setUsername(e.target.value)} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"/></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Parolă</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"/></div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)} className="rounded" />
              Reamintire parolă
            </label>
          </div>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-black dark:bg-white text-white dark:text-black py-3 rounded-xl font-bold hover:opacity-90 transition">{loading ? '...' : 'Autentificare'}</button>
        </form>
      </div>
    </div>
  );
};

// --- DASHBOARD ---
const DashboardContent = ({ token, userData }) => {
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0); 
  const [uploadQueue, setUploadQueue] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const chartRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [dateFilter, setDateFilter] = useState('all');

  const fetchData = useCallback(async () => {
    const data = await apiCall('/transactions', 'GET', null, token);
    if (!data.transactions) return;
    setTransactions(data.transactions);
    setBalance(data.balance); 
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!chartRef.current) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      const w = entry.contentRect.width;
      setChartWidth(w);
    });
    ro.observe(chartRef.current);
    return () => ro.disconnect();
  }, []);

  const filteredTransactions = useMemo(() => {
    if (dateFilter === 'all') return transactions;
    const now = new Date();
    let start = new Date(now);
    if (dateFilter === '7d') {
      start.setDate(now.getDate() - 7);
    } else if (dateFilter === '1m') {
      start.setMonth(now.getMonth() - 1);
    } else if (dateFilter === '3m') {
      start.setMonth(now.getMonth() - 3);
    } else if (dateFilter === '6m') {
      start.setMonth(now.getMonth() - 6);
    } else if (dateFilter === '1y') {
      start.setFullYear(now.getFullYear() - 1);
    }
    const startIso = start.toISOString().slice(0,10);
    return transactions.filter(t => t.date_iso >= startIso);
  }, [dateFilter, transactions]);

  const displayTotals = useMemo(() => {
    let inc = 0, exp = 0;
    filteredTransactions.forEach(t => {
      if (t.type === 'credit') inc += t.amount;
      else if (t.type === 'debit') exp += t.amount;
    });
    return { inc, exp };
  }, [filteredTransactions]);

  const chartData = useMemo(() => {
    const stats = {};
    filteredTransactions.forEach(t => {
      const iso = t.date_iso || '1900-01-01';
      if (!stats[iso]) stats[iso] = { iso, day: `${iso.slice(8,10)}.${iso.slice(5,7)}`, income: 0 };
      if (t.type === 'credit') stats[iso].income += t.amount;
    });
    const arr = Object.values(stats);
    arr.sort((a,b) => a.iso.localeCompare(b.iso));
    return arr.map(({ day, income }) => ({ day, income }));
  }, [filteredTransactions]);

  const handleFiles = async (files) => {
    if (!files.length) return;
    const newFiles = Array.from(files).map(f => ({ file: f, id: Math.random().toString(36), name: f.name, status: 'pending', added: 0 }));
    setUploadQueue(prev => [...newFiles, ...prev]);
    for (const fileObj of newFiles) {
      setUploadQueue(current => current.map(item => item.id === fileObj.id ? { ...item, status: 'processing' } : item));
      const formData = new FormData();
      formData.append('file', fileObj.file);
      try {
        const res = await apiCall('/upload', 'POST', formData, token);
        if (res.status === 'success') {
          setUploadQueue(current => current.map(item => item.id === fileObj.id ? { ...item, status: 'success', added: res.added } : item));
          fetchData(); 
        } else throw new Error();
      } catch {
        setUploadQueue(current => current.map(item => item.id === fileObj.id ? { ...item, status: 'error' } : item));
      }
    }
  };

  const handleDelete = async (filename) => {
    if(confirm('Stergi?')) { await apiCall('/delete-file', 'POST', {filename}, token); fetchData(); }
  };

  return (
    <div className="p-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-1">
           <div className="bg-gradient-to-r from-gray-900 to-gray-800 dark:from-black dark:to-gray-900 p-8 rounded-[2rem] text-white shadow-xl h-full flex flex-col justify-between border border-gray-800">
              <div><span className="text-gray-400 font-medium uppercase text-sm">Sold Cont</span><h2 className="text-4xl font-bold mt-2">{balance.toLocaleString('ro-RO', {minimumFractionDigits: 2})} <span className="text-xl text-gray-400 font-normal">RON</span></h2></div>
              <div className="pt-8"><p className="font-bold text-lg">BUN VENIT, {userData.username.toUpperCase()}</p><p className="text-gray-400 text-sm font-mono break-all">RO68 TREZ 2915 069X XX02 3911</p></div>
           </div>
        </div>
        <div className="lg:col-span-2 flex flex-col gap-4">
          <label onDragOver={e=>{e.preventDefault();setIsDragging(true)}} onDragLeave={()=>setIsDragging(false)} onDrop={e=>{e.preventDefault();setIsDragging(false);handleFiles(e.dataTransfer.files)}} 
            className={`flex-1 p-6 border-2 border-dashed rounded-2xl flex justify-between items-center bg-white dark:bg-gray-800 transition-colors cursor-pointer relative shadow-sm block ${isDragging ? 'border-blue-500 dark:border-blue-400' : 'border-gray-300 dark:border-gray-700 hover:border-black dark:hover:border-gray-500'}`}>
            <div className="flex items-center gap-4 pointer-events-none">
               <div className={`p-4 rounded-2xl transition ${isDragging?'bg-blue-200':'bg-gray-50 dark:bg-gray-700'}`}><Upload className={`w-6 h-6 ${isDragging ? 'text-blue-600' : 'text-black dark:text-white'}`}/></div>
               <div><h3 className="font-bold text-lg text-gray-800 dark:text-white">Încarcă Extrase</h3><p className="text-sm text-gray-500 dark:text-gray-400">Trage PDF-urile aici</p></div>
            </div>
            <input type="file" onChange={e=>handleFiles(e.target.files)} className="hidden" multiple accept=".pdf"/>
          </label>
          {uploadQueue.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 max-h-48 overflow-y-auto space-y-2 custom-scrollbar">
              {uploadQueue.map(item=>(
                <div key={item.id} className="flex justify-between text-sm p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-200">
                  <span className="truncate">{item.name}</span>
                  <div className="flex items-center gap-2">
                    {item.status==='processing' && <Loader2 className="w-3 h-3 animate-spin"/>}
                    {item.status==='success' && <CheckCircle2 className="w-4 h-4 text-green-500"/>}
                    {item.status==='error' && <XCircle className="w-4 h-4 text-red-500"/>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Tranzacții ({filteredTransactions.length})</h2>
            <select value={dateFilter} onChange={e=>setDateFilter(e.target.value)} className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
              <option value="7d">Ultimele 7 zile</option>
              <option value="1m">Ultima lună</option>
              <option value="3m">Ultimele 3 luni</option>
              <option value="6m">Ultimele 6 luni</option>
              <option value="1y">Ultimul an</option>
              <option value="all">Toate</option>
            </select>
          </div>
          <div className="space-y-3 h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredTransactions.map((t, idx) => (
              <div key={idx} className="flex justify-between items-center p-4 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-2xl transition group border border-transparent dark:border-transparent">
                <div className="flex items-center gap-4 flex-1">
                  <div className={`p-3 rounded-2xl ${t.type==='debit'?'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400':'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'}`}>{t.type==='debit'?<ArrowUpRight className="w-5 h-5"/>:<ArrowDownLeft className="w-5 h-5"/>}</div>
                  <div className="flex-1 min-w-0 pr-4">
                    <h4 className="font-bold text-sm whitespace-normal leading-tight text-gray-800 dark:text-gray-200">{t.partner}</h4>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-500 dark:text-gray-400">{t.date}</span>
                      {t.ref_number && <span className="text-xs font-mono bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 font-bold">{t.ref_number}</span>}
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all">{t.details}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right flex items-center gap-4">
                  <div className={`font-bold text-lg ${t.type==='debit'?'text-red-600 dark:text-red-400':'text-green-600 dark:text-green-400'}`}>{t.type==='debit'?'-':'+'}{t.amount.toLocaleString('ro-RO',{minimumFractionDigits:2})}</div>
                  <button onClick={()=>handleDelete(t.filename)} className="p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 min-w-0">
           <div className="grid grid-cols-2 gap-4 min-w-0">
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800 text-green-800 dark:text-green-400 font-bold">+{displayTotals.inc.toLocaleString()} Lei</div>
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-2xl border border-red-100 dark:border-red-800 text-red-800 dark:text-red-400 font-bold">-{displayTotals.exp.toLocaleString()} Lei</div>
           </div>
           
           <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex-1 flex flex-col">
             <h3 className="text-gray-800 dark:text-white font-bold mb-4">Evoluție</h3>
             <div ref={chartRef} style={{ width: '100%', height: 300 }}>
               {chartWidth > 0 && (
               <ResponsiveContainer width={chartWidth} height={300} minWidth={0} minHeight={300}>
                 <AreaChart data={chartData} margin={{ left: 40, right: 10, top: 10, bottom: 10 }}>
                   <defs><linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8884d8" stopOpacity={0.3}/><stop offset="95%" stopColor="#8884d8" stopOpacity={0}/></linearGradient></defs>
                   <Area type="monotone" dataKey="income" stroke="#8884d8" fillOpacity={1} fill="url(#colorIncome)"/>
                   <YAxis tickFormatter={(v)=>v.toLocaleString('ro-RO',{maximumFractionDigits:0})} />
                   <XAxis dataKey="day" tickMargin={8} />
                   <Tooltip contentStyle={{backgroundColor: '#1f2937', color: '#fff', border: 'none', borderRadius: '8px'}}/>
                 </AreaChart>
               </ResponsiveContainer>
               )}
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

// --- APP ROOT ---
export default function App() {
  const { theme, setTheme } = useTheme();
  const [token, setToken] = useState(localStorage.getItem('token') || sessionStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user') || sessionStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [view, setView] = useState('dashboard');
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleLogin = (data, remember) => {
    setToken(data.token);
    if (remember) {
      localStorage.setItem('token', data.token);
    } else {
      sessionStorage.setItem('token', data.token);
    }
    const userInfo = { username: data.username, role: data.role };
    setUser(userInfo);
    if (remember) {
      localStorage.setItem('user', JSON.stringify(userInfo));
    } else {
      sessionStorage.setItem('user', JSON.stringify(userInfo));
    }
  };
  const handleLogout = () => { setToken(null); setUser(null); setView('dashboard'); localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.removeItem('token'); sessionStorage.removeItem('user'); };

  if (!token) return <LoginPage onLogin={handleLogin} />;

  return (
    <div className={`${isDark ? 'dark' : ''} flex h-screen bg-gray-50 dark:bg-gray-900 font-sans text-gray-800 dark:text-gray-100 transition-colors duration-300`}>
      <div className="w-20 bg-white dark:bg-gray-800 flex flex-col items-center py-8 border-r border-gray-200 dark:border-gray-700 justify-between transition-colors duration-300 z-50">
        <div className="flex flex-col gap-8 items-center">
          <div className="h-10 w-10 bg-black dark:bg-white rounded-xl flex items-center justify-center mb-4 shadow-lg"><div className="w-4 h-4 bg-white dark:bg-black rounded-sm"></div></div>
          <nav className="flex flex-col gap-6 text-gray-400">
            <button onClick={()=>setView('dashboard')} className={`p-2 rounded-xl transition ${view==='dashboard'?'text-black dark:text-white bg-gray-100 dark:bg-gray-700':'hover:text-black dark:hover:text-white'}`}><Home /></button>
            {user?.role === 'admin' && <button onClick={()=>setView('admin')} className={`p-2 rounded-xl transition ${view==='admin'?'text-black dark:text-white bg-gray-100 dark:bg-gray-700':'hover:text-black dark:hover:text-white'}`}><Users /></button>}
            <button onClick={()=>setView('settings')} className={`p-2 rounded-xl transition ${view==='settings'?'text-black dark:text-white bg-gray-100 dark:bg-gray-700':'hover:text-black dark:hover:text-white'}`}><Settings /></button>
          </nav>
        </div>
        <div className="flex flex-col gap-4 items-center">
          <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-xl flex flex-col gap-1">
            <button onClick={()=>setTheme('light')} className={`p-1.5 rounded-lg transition ${theme==='light' ? 'bg-white dark:bg-gray-600 shadow text-amber-500' : 'text-gray-400'}`}><Sun className="w-4 h-4"/></button>
            <button onClick={()=>setTheme('system')} className={`p-1.5 rounded-lg transition ${theme==='system' ? 'bg-white dark:bg-gray-600 shadow text-blue-500' : 'text-gray-400'}`}><Monitor className="w-4 h-4"/></button>
            <button onClick={()=>setTheme('dark')} className={`p-1.5 rounded-lg transition ${theme==='dark' ? 'bg-white dark:bg-gray-600 shadow text-indigo-400' : 'text-gray-400'}`}><Moon className="w-4 h-4"/></button>
          </div>
          <button onClick={handleLogout} className="mb-4 text-red-400 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl"><LogOut /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-gray-900">
        {view === 'dashboard' && <DashboardContent token={token} userData={user || {username: 'User'}} />}
        {view === 'admin' && <AdminPanel token={token} />}
        {view === 'settings' && <SettingsPanel token={token} />}
      </div>
    </div>
  );
}
