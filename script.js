/* script.js - Final Version */

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
                // Jika respons bukan array (misal error object)
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
                return true; // Return true untuk menutup modal
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
                    role: State.user.role, // Kirim role untuk validasi backend
                    user: State.user.name  // PENTING: Kirim user untuk Audit Trail
                })
            });
            const result = await res.json();

            if (result.status === 'success') {
                // Update data di memori lokal agar tabel berubah tanpa refresh
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
            // Sembunyikan Login, Tampilkan Dashboard
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('dashboardSection').style.display = 'block';
            
            // Set User Info & Role Badge
            document.getElementById('userDisplay').innerHTML = `${State.user.name.toUpperCase()} <span class="badge bg-secondary ms-2">${State.user.role.toUpperCase()}</span>`;
            
            // Tampilkan Loading di tabel lalu fetch data
            document.getElementById('tableBody').innerHTML = `<tr><td colspan="5" class="text-center py-5"><div class="spinner-border text-primary"></div><br><small class="text-muted">Memuat data...</small></td></tr>`;
            
            Data.fetchDocuments();
        }
    },

    loading(show) {
        document.getElementById('loading').style.display = show ? 'flex' : 'none';
    },

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

        // Logic Paginasi
        const startIndex = (State.pagination.page - 1) * State.pagination.limit;
        const endIndex = startIndex + State.pagination.limit;
        const pageData = State.filteredData.slice(startIndex, endIndex);

        pageData.forEach(row => {
            // Struktur Data dari Spreadsheet: [0]Time, [1]Code, [2]App, [3]User, [4]Status
            const [timestamp, code, app, user, status] = row;
            const dateStr = UI.formatDate(timestamp);
            
            // Render Badge Status (Admin clickable, Staff plain)
            const statusBadge = UI.getStatusBadge(status || 'Pending', code);

            tbody.innerHTML += `
                <tr>
                    <td class="ps-4"><span class="badge bg-light text-primary border badge-prd shadow-sm">${code}</span></td>
                    <td class="fw-bold text-dark">${app}</td>
                    <td>${statusBadge}</td>
                    <td><span class="badge bg-info bg-opacity-10 text-dark border border-info border-opacity-25 px-2 py-1">${user}</span></td>
                    <td class="text-end pe-4 small text-muted font-monospace">${dateStr}</td>
                </tr>
            `;
        });
        UI.renderPagination();
    },

    getStatusBadge(status, prdCode) {
        let colorClass = 'bg-secondary';
        if (status === 'On Progress') colorClass = 'bg-primary';
        else if (status === 'Done') colorClass = 'bg-success';
        else if (status === 'Pending') colorClass = 'bg-warning text-dark';

        // Jika ADMIN, tambah class clickable dan event onclick
        if (State.user && State.user.role === 'admin') {
            return `<span class="badge status-badge ${colorClass} clickable" onclick="UI.promptStatusChange('${prdCode}', '${status}')" title="Klik untuk ubah status">${status}</span>`;
        }
        // Jika STAFF, badge biasa (tidak bisa diklik)
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
        // Helper untuk tombol pagination
        const createBtn = (page, text, active = false, disabled = false) => `
            <li class="page-item ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="UI.changePage(${page})">${text}</a>
            </li>`;

        // Tombol Previous
        html += createBtn(State.pagination.page - 1, 'Previous', false, State.pagination.page === 1);

        // Tombol Angka
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= State.pagination.page - 1 && i <= State.pagination.page + 1)) {
                html += createBtn(i, i, i === State.pagination.page);
            } else if (i === State.pagination.page - 2 || i === State.pagination.page + 2) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }

        // Tombol Next
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
// 6. EVENT LISTENERS (Menghubungkan HTML ke JS)
// ==========================================

// A. Login Form
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;
    
    if(u && p) Auth.login(u, p);
});

// B. Add Document Form
document.getElementById('prdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const modalEl = document.getElementById('addModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    
    const num = document.getElementById('prdNumber').value;
    const app = document.getElementById('appName').value;
    const status = document.getElementById('prdStatus').value;

    // Panggil fungsi Data.addDocument
    const success = await Data.addDocument(num, app, status);

    if (success) {
        modalInstance.hide();
        e.target.reset(); // Reset form jika berhasil
    }
});

// C. Search Input (Realtime Filtering)
document.getElementById('searchInput').addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    
    // Filter array lokal
    State.filteredData = State.allData.filter(row => {
        // row[1]=Code, row[2]=App, row[3]=User, row[4]=Status
        return (row[1] || '').toLowerCase().includes(keyword) || 
               (row[2] || '').toLowerCase().includes(keyword) || 
               (row[3] || '').toLowerCase().includes(keyword) ||
               (row[4] || '').toLowerCase().includes(keyword);
    });
    
    State.pagination.page = 1; // Reset ke halaman 1 hasil pencarian
    UI.renderTable();
});

// ==========================================
// 7. HELPER FUNCTIONS
// ==========================================

// Fungsi Toggle Show/Hide Password
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('toggleIcon');

    if (passwordInput.type === 'password') {
        // Ubah jadi Text (Password terlihat)
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash'); // Ikon mata dicoret
        toggleIcon.classList.remove('text-muted');
        toggleIcon.classList.add('text-primary'); // Ubah warna jadi biru agar terlihat aktif
    } else {
        // Ubah jadi Password (Password tersembunyi)
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye'); // Ikon mata biasa
        toggleIcon.classList.add('text-muted');
        toggleIcon.classList.remove('text-primary');
    }
}

// ==========================================
// 8. INITIALIZE APP
// ==========================================
// Jalankan pengecekan sesi saat file dimuat
UI.init();