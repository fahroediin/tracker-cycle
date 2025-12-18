/* script.js - Final Secure Version (JWT + Avatar + Sort + Password Toggle) */

// ==========================================
// 1. KONFIGURASI
// ==========================================
const APP_CONFIG = {
    LOGIN_URL: "/api/auth",  // Endpoint khusus untuk Login (Create Session)
    DATA_URL: "/api/proxy"   // Endpoint data yang dilindungi Token (Verify Session)
};

// ==========================================
// 2. STATE MANAGEMENT
// ==========================================
const State = {
    // Ambil Token dan User dari LocalStorage
    token: localStorage.getItem('ba_token') || null, 
    user: JSON.parse(localStorage.getItem('ba_user_session')) || null,
    
    allData: [],
    filteredData: [],
    pagination: { page: 1, limit: 10 },
    sort: { column: 0, direction: 'desc' } // Default sort: Tanggal Terbaru
};

// ==========================================
// 3. AUTH MODULE (Login/Logout)
// ==========================================
const Auth = {
    async login(username, password) {
        UI.loading(true);
        try {
            // [CREATE SESSION] Request ke /api/auth
            const res = await fetch(APP_CONFIG.LOGIN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await res.json();
            
            if (result.status === 'success') {
                // Simpan Token (Sesi) dan Info User
                State.token = result.token;
                State.user = { name: result.user, role: result.role };
                
                localStorage.setItem('ba_token', result.token);
                localStorage.setItem('ba_user_session', JSON.stringify(State.user));
                
                UI.init();
            } else {
                Swal.fire('Login Gagal', result.message, 'error');
            }
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Gagal terhubung ke server', 'error');
        }
        UI.loading(false);
    },

    logout() {
        // [DESTROY SESSION] Hapus token dari browser
        localStorage.removeItem('ba_user_session');
        localStorage.removeItem('ba_token'); 
        location.reload();
    }
};

// ==========================================
// 4. DATA MODULE (Fetch/Add/Update)
// ==========================================

// [VERIFY SESSION HELPER]
// Fungsi ini menempelkan Token ke setiap request
async function fetchWithAuth(url, options = {}) {
    if (!options.headers) options.headers = {};
    
    // Tempelkan Token JWT di Header
    if (State.token) {
        options.headers['Authorization'] = `Bearer ${State.token}`;
    }
    options.headers['Content-Type'] = 'application/json';

    const res = await fetch(url, options);
    
    // Jika Server menolak token (401/403), paksa Logout
    if (res.status === 401 || res.status === 403) {
        Auth.logout();
        throw new Error("Sesi kadaluarsa atau tidak valid.");
    }
    
    return res.json();
}

const Data = {
    async fetchDocuments() {
        try {
            // Gunakan fetchWithAuth untuk akses data aman
            const data = await fetchWithAuth(APP_CONFIG.DATA_URL);
            
            if (Array.isArray(data)) {
                State.allData = data;
                State.filteredData = [...State.allData];
                Data.applySort(); // Terapkan sorting default
                UI.renderTable();
            } else {
                throw new Error(data.message || "Gagal memuat data");
            }
        } catch (err) {
            console.error(err);
            // Jangan tampilkan error jika token kosong (karena akan redirect ke login)
            if (State.token) {
                document.getElementById('tableBody').innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${err.message}</td></tr>`;
            }
        }
    },

    async addDocument(num, app, status) {
        UI.loading(true);
        try {
            const result = await fetchWithAuth(APP_CONFIG.DATA_URL, {
                method: 'POST',
                body: JSON.stringify({ 
                    action: 'add', prdNumber: num, appName: app, status: status 
                    // Note: 'user' diambil otomatis dari token di server
                })
            });

            if (result.status === 'success') {
                const d = result.data;
                State.allData.unshift([d.timestamp, d.code, d.appName, d.user, d.status]);
                
                document.getElementById('searchInput').value = '';
                State.filteredData = [...State.allData];
                
                // Reset sort agar data baru terlihat di atas
                State.sort = { column: 0, direction: 'desc' };
                Data.applySort();
                
                State.pagination.page = 1;
                UI.renderTable();
                Swal.fire('Berhasil', result.message, 'success');
                return true; 
            } else {
                Swal.fire('Gagal', result.message, 'error');
                return false;
            }
        } catch (err) {
            Swal.fire('Error', 'Gagal menyimpan data', 'error');
            return false;
        } finally {
            UI.loading(false);
        }
    },

    async updateStatus(prdCode, newStatus) {
        if (State.user.role !== 'admin') return;

        UI.loading(true);
        try {
            const result = await fetchWithAuth(APP_CONFIG.DATA_URL, {
                method: 'POST',
                body: JSON.stringify({ 
                    action: 'updateStatus', prdCode: prdCode, newStatus: newStatus 
                })
            });

            if (result.status === 'success') {
                const item = State.allData.find(row => row[1] === prdCode);
                if (item) item[4] = newStatus;
                UI.renderTable(); 
                Swal.fire('Updated!', 'Status berhasil diubah.', 'success');
            } else {
                Swal.fire('Gagal', result.message, 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Gagal update status', 'error');
        } finally {
            UI.loading(false);
        }
    },

    // --- LOGIKA SORTING ---
    applySort() {
        const colIndex = State.sort.column;
        const direction = State.sort.direction; 

        State.filteredData.sort((a, b) => {
            let valA = a[colIndex];
            let valB = b[colIndex];

            // Kolom Tanggal (Index 0)
            if (colIndex === 0) {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            } 
            // Kolom String
            else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
};

// ==========================================
// 5. UI MODULE
// ==========================================
const UI = {
    init() {
        // Cek apakah ada User DAN Token
        if (State.user && State.token) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('dashboardSection').style.display = 'block';
            document.getElementById('userDisplay').innerHTML = `${State.user.name.toUpperCase()} <span class="badge bg-secondary ms-2">${State.user.role.toUpperCase()}</span>`;
            
            // Logic Sembunyikan Input Status untuk Staff
            const statusContainer = document.getElementById('statusInputContainer');
            if (statusContainer) {
                if (State.user.role === 'admin') {
                    statusContainer.style.display = 'block';
                } else {
                    statusContainer.style.display = 'none';
                    document.getElementById('prdStatus').value = 'On Progress';
                }
            }

            document.getElementById('tableBody').innerHTML = `<tr><td colspan="5" class="text-center py-5"><div class="spinner-border text-primary"></div><br><small class="text-muted">Memuat data...</small></td></tr>`;
            Data.fetchDocuments();
        }
    },

    loading(show) {
        document.getElementById('loading').style.display = show ? 'flex' : 'none';
    },

    // --- SORTING HANDLER ---
    handleSort(columnIndex) {
        if (State.sort.column === columnIndex) {
            State.sort.direction = State.sort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            State.sort.column = columnIndex;
            State.sort.direction = 'asc';
        }
        Data.applySort();
        UI.renderTable();
    },

    updateSortIcons() {
        [0, 1, 2, 3].forEach(idx => {
            const icon = document.getElementById(`sort-icon-${idx}`);
            if (icon) {
                icon.className = 'fas fa-sort';
                icon.parentElement.classList.remove('active');
            }
        });
        const activeCol = State.sort.column;
        const activeDir = State.sort.direction;
        const activeIcon = document.getElementById(`sort-icon-${activeCol}`);
        if (activeIcon) {
            activeIcon.className = activeDir === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            activeIcon.parentElement.classList.add('active');
        }
    },

    // --- RENDER TABLE ---
    renderTable() {
        UI.updateSortIcons(); // Update ikon panah sort

        const tbody = document.getElementById('tableBody');
        const emptyState = document.getElementById('emptyState');
        tbody.innerHTML = '';

        if (State.filteredData.length === 0) {
            emptyState.classList.remove('d-none');
            document.getElementById('paginationControls').innerHTML = '';
            return;
        }
        emptyState.classList.add('d-none');

        const startIndex = (State.pagination.page - 1) * State.pagination.limit;
        const endIndex = startIndex + State.pagination.limit;
        const pageData = State.filteredData.slice(startIndex, endIndex);

        pageData.forEach(row => {
            const [timestamp, code, app, user, status] = row;
            const dateStr = UI.formatDate(timestamp);
            const statusBadge = UI.getStatusBadge(status || 'Pending', code);
            const picHTML = UI.getUserAvatarHTML(user);

            tbody.innerHTML += `
                <tr>
                    <td class="ps-4"><span class="badge bg-light text-primary border badge-prd shadow-sm">${code}</span></td>
                    <td class="fw-bold text-dark">${app}</td>
                    <td>${statusBadge}</td>
                    <td>${picHTML}</td>
                    <td class="text-end pe-4 small text-muted font-monospace">${dateStr}</td>
                </tr>
            `;
        });
        UI.renderPagination();
    },

    // --- AVATAR & COLOR ---
    getUserAvatarHTML(name) {
        if (!name) return '-';
        const initial = name.charAt(0).toUpperCase();
        const color = UI.getColorFromName(name);
        return `<div class="d-flex align-items-center"><div class="avatar-circle me-2" style="background-color: ${color};">${initial}</div><span class="pic-name">${name}</span></div>`;
    },

    getColorFromName(name) {
        const colors = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#6610f2', '#fd7e14', '#20c997', '#d63384', '#6f42c1'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
        return colors[Math.abs(hash % colors.length)];
    },

    // --- STATUS BADGE ---
    getStatusBadge(status, prdCode) {
        let colorClass = 'bg-secondary';
        if (status === 'On Progress') colorClass = 'bg-primary';
        else if (status === 'Done') colorClass = 'bg-success';
        else if (status === 'Pending') colorClass = 'bg-warning text-dark';

        if (State.user && State.user.role === 'admin') {
            return `<span class="badge status-badge ${colorClass} clickable" onclick="UI.promptStatusChange('${prdCode}', '${status}')" title="Klik untuk ubah status">${status}</span>`;
        }
        return `<span class="badge status-badge ${colorClass}">${status}</span>`;
    },

    promptStatusChange(prdCode, currentStatus) {
        Swal.fire({
            title: `Ubah Status ${prdCode}`,
            input: 'select',
            inputValue: currentStatus,
            inputOptions: { 'On Progress': 'On Progress', 'Pending': 'Pending', 'Done': 'Done' },
            showCancelButton: true,
            confirmButtonText: 'Simpan',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33'
        }).then((result) => {
            if (result.isConfirmed && result.value !== currentStatus) {
                Data.updateStatus(prdCode, result.value);
            }
        });
    },

    // --- PAGINATION ---
    renderPagination() {
        const nav = document.getElementById('paginationControls');
        const totalPages = Math.ceil(State.filteredData.length / State.pagination.limit);
        if (totalPages <= 1) { nav.innerHTML = ''; return; }
        
        let html = '';
        const createBtn = (page, text, active = false, disabled = false) => `
            <li class="page-item ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="UI.changePage(${page})">${text}</a>
            </li>`;
        
        html += createBtn(State.pagination.page - 1, 'Previous', false, State.pagination.page === 1);
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= State.pagination.page - 1 && i <= State.pagination.page + 1)) {
                html += createBtn(i, i, i === State.pagination.page);
            } else if (i === State.pagination.page - 2 || i === State.pagination.page + 2) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }
        html += createBtn(State.pagination.page + 1, 'Next', false, State.pagination.page === totalPages);
        nav.innerHTML = html;
    },

    changePage(page) {
        const totalPages = Math.ceil(State.filteredData.length / State.pagination.limit);
        if (page < 1 || page > totalPages) return;
        State.pagination.page = page;
        UI.renderTable();
    },

    formatDate(isoString) {
        if (!isoString) return "-";
        const d = new Date(isoString);
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) + 
               ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
    }
};

// ==========================================
// 6. EVENT LISTENERS
// ==========================================
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;
    if(u && p) Auth.login(u, p);
});

document.getElementById('prdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const modalEl = document.getElementById('addModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    
    const success = await Data.addDocument(
        document.getElementById('prdNumber').value,
        document.getElementById('appName').value,
        document.getElementById('prdStatus').value
    );

    if (success) {
        modalInstance.hide();
        e.target.reset();
    }
});

document.getElementById('searchInput').addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    State.filteredData = State.allData.filter(row => {
        return (row[1] || '').toLowerCase().includes(keyword) || 
               (row[2] || '').toLowerCase().includes(keyword) || 
               (row[3] || '').toLowerCase().includes(keyword) ||
               (row[4] || '').toLowerCase().includes(keyword);
    });
    Data.applySort(); 
    State.pagination.page = 1; 
    UI.renderTable();
});

// ==========================================
// 7. HELPER FUNCTIONS
// ==========================================
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('toggleIcon');
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.replace('fa-eye', 'fa-eye-slash');
        toggleIcon.classList.replace('text-muted', 'text-primary');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.replace('fa-eye-slash', 'fa-eye');
        toggleIcon.classList.replace('text-primary', 'text-muted');
    }
}

// ==========================================
// 8. INITIALIZE APP
// ==========================================
UI.init();