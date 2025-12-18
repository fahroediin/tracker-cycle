/* script.js */

// ==========================================
// api/proxy.js
export default async function handler(req, res) {
    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

    if (!GOOGLE_SCRIPT_URL) {
        return res.status(500).json({ status: 'error', message: 'GOOGLE_SCRIPT_URL tidak ditemukan di Environment Variables' });
    }

    try {
        const method = req.method;
        
        // Konfigurasi fetch
        let options = {
            method: method,
            headers: {
                "Content-Type": "application/json",
            },
            redirect: "follow", // PENTING: Ikuti redirect Google (302)
        };

        if (method === 'POST') {
            // Pastikan body dikirim sebagai string
            const bodyData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            options.body = bodyData;
        }

        // Request ke Google
        const response = await fetch(GOOGLE_SCRIPT_URL, options);

        // Ambil text mentah dulu (karena jika error, Google kirim HTML, bukan JSON)
        const responseText = await response.text();

        // Coba parse ke JSON
        try {
            const data = JSON.parse(responseText);
            return res.status(200).json(data);
        } catch (jsonError) {
            // Jika gagal parse JSON, berarti Google mengirim HTML (biasanya Error Permission)
            console.error("Bukan JSON:", responseText); // Cek Logs di Vercel Dashboard jika error
            return res.status(500).json({ 
                status: 'error', 
                message: 'Google Script mengembalikan respons yang bukan JSON. Cek permission "Anyone".',
                raw_response: responseText.substring(0, 200) // Tampilkan potongan error untuk debug
            });
        }

    } catch (error) {
        return res.status(500).json({ 
            status: 'error', 
            message: 'Gagal menghubungi Google Script', 
            error: error.message 
        });
    }
}

// ==========================================
// 1. STATE MANAGEMENT (Penyimpanan Data Lokal)
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
// 2. AUTH MODULE (Login/Logout)
// ==========================================
const Auth = {
    async login(username, password) {
        UI.loading(true);
        try {
            const res = await fetch(APP_CONFIG.API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'login', username, password })
            });
            const result = await res.json();
            
            if (result.status === 'success') {
                // Simpan user & role
                State.user = { name: result.user, role: result.role };
                localStorage.setItem('ba_user_session', JSON.stringify(State.user));
                UI.init();
            } else {
                Swal.fire('Login Gagal', result.message, 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Gagal terhubung ke server', 'error');
        }
        UI.loading(false);
    },

    logout() {
        localStorage.removeItem('ba_user_session');
        location.reload();
    }
};

// ==========================================
// 3. DATA MODULE (Fetch/Add/Update)
// ==========================================
const Data = {
    async fetchDocuments() {
        try {
            const res = await fetch(APP_CONFIG.API_URL);
            const data = await res.json();
            State.allData = data || [];
            State.filteredData = [...State.allData];
            UI.renderTable();
        } catch (err) {
            console.error(err);
            document.getElementById('tableBody').innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Gagal mengambil data.</td></tr>`;
        }
    },

    async addDocument(num, app, status) {
        UI.loading(true);
        try {
            const res = await fetch(APP_CONFIG.API_URL, {
                method: 'POST',
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
                // Update optimis ke memori
                State.allData.unshift([d.timestamp, d.code, d.appName, d.user, d.status]);
                
                // Reset search & filter
                document.getElementById('searchInput').value = '';
                State.filteredData = [...State.allData];
                State.pagination.page = 1;
                
                UI.renderTable();
                Swal.fire('Berhasil', result.message, 'success');
                return true; // Sinyal sukses untuk tutup modal
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
            const res = await fetch(APP_CONFIG.API_URL, {
                method: 'POST',
                body: JSON.stringify({ 
                    action: 'updateStatus', 
                    prdCode: prdCode, 
                    newStatus: newStatus,
                    role: State.user.role,
                    user: State.user.name // <--- TAMBAHAN: Kirim Nama User untuk Audit Trail
                })
            });
            const result = await res.json();

            if (result.status === 'success') {
                // Update lokal
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
// 4. UI MODULE (Render/Interaksi)
// ==========================================
const UI = {
    init() {
        if (State.user) {
            // Sembunyikan Login, Tampilkan Dashboard
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('dashboardSection').style.display = 'block';
            
            // Set User Info & Role Badge
            document.getElementById('userDisplay').innerHTML = `${State.user.name.toUpperCase()} <span class="badge bg-secondary ms-2">${State.user.role}</span>`;
            
            // Tampilkan Loading di tabel lalu fetch data
            document.getElementById('tableBody').innerHTML = `<tr><td colspan="5" class="text-center py-5"><div class="spinner-border text-primary"></div></td></tr>`;
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

        // Paginasi Logic
        const startIndex = (State.pagination.page - 1) * State.pagination.limit;
        const endIndex = startIndex + State.pagination.limit;
        const pageData = State.filteredData.slice(startIndex, endIndex);

        pageData.forEach(row => {
            const [timestamp, code, app, user, status] = row;
            const dateStr = UI.formatDate(timestamp);
            const statusBadge = UI.getStatusBadge(status, code);

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
        // Jika STAFF, badge biasa
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
            cancelButtonText: 'Batal'
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
        // Helper function untuk tombol
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
        const d = new Date(isoString);
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) + 
               ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
    }
};

// ==========================================
// 5. EVENT LISTENERS (Menghubungkan HTML ke JS)
// ==========================================

// Login Form
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    Auth.login(
        document.getElementById('username').value.trim(), 
        document.getElementById('password').value
    );
});

// Add Document Form
document.getElementById('prdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const modalEl = document.getElementById('addModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    
    // Panggil fungsi Data.add
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

// Search Input
document.getElementById('searchInput').addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    
    State.filteredData = State.allData.filter(row => {
        // row[1]=Code, row[2]=App, row[3]=User, row[4]=Status
        return (row[1] || '').toLowerCase().includes(keyword) || 
               (row[2] || '').toLowerCase().includes(keyword) || 
               (row[3] || '').toLowerCase().includes(keyword) ||
               (row[4] || '').toLowerCase().includes(keyword);
    });
    
    State.pagination.page = 1;
    UI.renderTable();
});

// Start App Check
UI.init();