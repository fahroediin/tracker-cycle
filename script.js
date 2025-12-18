/* script.js - Final Version with Avatar & Password Toggle */

// ==========================================
// 1. KONFIGURASI
// ==========================================
const APP_CONFIG = {
    // Menggunakan Proxy Vercel agar URL Google Script aman/tersembunyi
    API_URL: "/api/proxy"
};

// ==========================================
// 2. STATE MANAGEMENT (Penyimpanan Data Lokal)
// ==========================================
const State = {
    user: JSON.parse(localStorage.getItem('ba_user_session')) || null, // Simpan Nama & Role
    allData: [],
    filteredData: [],
    pagination: {
        page: 1,
        limit: 10
    }
};

// ==========================================
// 3. AUTH MODULE (Login/Logout)
// ==========================================
const Auth = {
    async login(username, password) {
        UI.loading(true);
        try {
            const res = await fetch(APP_CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'login', username, password })
            });
            const result = await res.json();
            
            if (result.status === 'success') {
                // Simpan user & role ke localStorage
                State.user = { name: result.user, role: result.role };
                localStorage.setItem('ba_user_session', JSON.stringify(State.user));
                UI.init();
            } else {
                Swal.fire('Login Gagal', result.message, 'error');
            }
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Gagal terhubung ke server (Cek Proxy/Internet)', 'error');
        }
        UI.loading(false);
    },

    logout() {
        localStorage.removeItem('ba_user_session');
        location.reload();
    }
};

// ==========================================
// 4. DATA MODULE (Fetch/Add/Update)
// ==========================================
const Data = {
    async fetchDocuments() {
        try {
            // Fetch GET ke Proxy
            const res = await fetch(APP_CONFIG.API_URL);
            const data = await res.json();
            
            // Validasi data
            if (Array.isArray(data)) {
                State.allData = data;
                State.filteredData = [...State.allData];
                UI.renderTable();
            } else {
                throw new Error(data.message || "Format data salah");
            }
        } catch (err) {
            console.error(err);
            document.getElementById('tableBody').innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Gagal mengambil data. <br><small>${err.message}</small></td></tr>`;
        }
    },

    async addDocument(num, app, status) {
        UI.loading(true);
        try {
            const res = await fetch(APP_CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'add', 
                    prdNumber: num, 
                    appName: app, 
                    status: status, 
                    user: State.user.name 
                })
            });
            const result = await res.json();

            if (result.status === 'success') {
                const d = result.data;
                // Update optimis ke memori (tambah di paling atas)
                State.allData.unshift([d.timestamp, d.code, d.appName, d.user, d.status]);
                
                // Reset search & filter agar data baru terlihat
                document.getElementById('searchInput').value = '';
                State.filteredData = [...State.allData];
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
        // Double check di frontend: Staff tidak boleh update
        if (State.user.role !== 'admin') return;

        UI.loading(true);
        try {
            const res = await fetch(APP_CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'updateStatus', 
                    prdCode: prdCode, 
                    newStatus: newStatus,
                    role: State.user.role, 
                    user: State.user.name  // PENTING: Kirim user untuk Audit Trail
                })
            });
            const result = await res.json();

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
    }
};

// ==========================================
// 5. UI MODULE (Render/Interaksi)
// ==========================================
const UI = {
    init() {
        if (State.user) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('dashboardSection').style.display = 'block';
            document.getElementById('userDisplay').innerHTML = `${State.user.name.toUpperCase()} <span class="badge bg-secondary ms-2">${State.user.role.toUpperCase()}</span>`;
            document.getElementById('tableBody').innerHTML = `<tr><td colspan="5" class="text-center py-5"><div class="spinner-border text-primary"></div><br><small class="text-muted">Memuat data...</small></td></tr>`;
            Data.fetchDocuments();
        }
    },

    loading(show) {
        document.getElementById('loading').style.display = show ? 'flex' : 'none';
    },

    // --- FUNGSI RENDER TABLE UTAMA ---
    renderTable() {
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
            // [0]Time, [1]Code, [2]App, [3]User, [4]Status
            const [timestamp, code, app, user, status] = row;
            const dateStr = UI.formatDate(timestamp);
            const statusBadge = UI.getStatusBadge(status || 'Pending', code);
            
            // Generate Avatar untuk PIC
            const picHTML = UI.getUserAvatarHTML(user);

            tbody.innerHTML += `
                <tr>
                    <td class="ps-4"><span class="badge bg-light text-primary border badge-prd shadow-sm">${code}</span></td>
                    <td class="fw-bold text-dark">${app}</td>
                    <td>${statusBadge}</td>
                    <td>${picHTML}</td> <!-- Kolom PIC dengan Avatar -->
                    <td class="text-end pe-4 small text-muted font-monospace">${dateStr}</td>
                </tr>
            `;
        });
        UI.renderPagination();
    },

    // --- HELPER: Generate Avatar HTML ---
    getUserAvatarHTML(name) {
        if (!name) return '-';
        const initial = name.charAt(0).toUpperCase();
        const color = UI.getColorFromName(name);

        return `
            <div class="d-flex align-items-center">
                <div class="avatar-circle me-2" style="background-color: ${color};">
                    ${initial}
                </div>
                <span class="pic-name">${name}</span>
            </div>
        `;
    },

    // --- HELPER: Generate Consistent Color ---
    getColorFromName(name) {
        const colors = [
            '#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', 
            '#6610f2', '#fd7e14', '#20c997', '#d63384', '#6f42c1'
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash % colors.length);
        return colors[index];
    },

    // --- HELPER: Status Badge ---
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
            inputOptions: {
                'On Progress': 'On Progress',
                'Pending': 'Pending',
                'Done': 'Done'
            },
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

// Login
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;
    if(u && p) Auth.login(u, p);
});

// Add Document
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

// Search
document.getElementById('searchInput').addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    State.filteredData = State.allData.filter(row => {
        return (row[1] || '').toLowerCase().includes(keyword) || 
               (row[2] || '').toLowerCase().includes(keyword) || 
               (row[3] || '').toLowerCase().includes(keyword) ||
               (row[4] || '').toLowerCase().includes(keyword);
    });
    State.pagination.page = 1; 
    UI.renderTable();
});

// ==========================================
// 7. HELPER FUNCTIONS (PASSWORD TOGGLE)
// ==========================================

// Fungsi ini dipanggil dari HTML onclick="togglePasswordVisibility()"
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('toggleIcon');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
        toggleIcon.classList.remove('text-muted');
        toggleIcon.classList.add('text-primary'); 
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
        toggleIcon.classList.add('text-muted');
        toggleIcon.classList.remove('text-primary');
    }
}

// ==========================================
// 8. INITIALIZE APP
// ==========================================
UI.init();