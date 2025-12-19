/* script.js - Final Project Management Version */

const APP_CONFIG = { LOGIN_URL: "/api/auth", DATA_URL: "/api/proxy" };

const State = {
    token: localStorage.getItem('ba_token') || null, 
    user: JSON.parse(localStorage.getItem('ba_user_session')) || null,
    allData: [], filteredData: [], pagination: { page: 1, limit: 10 }, sort: { column: 0, direction: 'desc' }
};

function escapeHtml(text) {
    if (!text) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// --- AUTH ---
const Auth = {
    async login(u, p) {
        UI.loading(true);
        try {
            const res = await fetch(APP_CONFIG.LOGIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
            const result = await res.json();
            if (result.status === 'success') {
                State.token = result.token; State.user = { name: result.user, role: result.role };
                localStorage.setItem('ba_token', result.token); localStorage.setItem('ba_user_session', JSON.stringify(State.user));
                UI.init();
            } else { Swal.fire('Login Gagal', result.message, 'error'); }
        } catch (err) { Swal.fire('Error', 'Gagal koneksi server', 'error'); }
        UI.loading(false);
    },
    logout() { localStorage.removeItem('ba_user_session'); localStorage.removeItem('ba_token'); location.reload(); }
};

// --- DATA ---
async function fetchWithAuth(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (State.token) options.headers['Authorization'] = `Bearer ${State.token}`;
    options.headers['Content-Type'] = 'application/json';
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) { Auth.logout(); throw new Error("Sesi habis."); }
    return res.json();
}

const Data = {
    async fetchDocuments() {
        try {
            const data = await fetchWithAuth(APP_CONFIG.DATA_URL);
            if (Array.isArray(data)) {
                State.allData = data; State.filteredData = [...State.allData];
                Data.applySort(); UI.renderTable();
            }
        } catch (err) { if (State.token) console.error(err); }
    },
    async addDocument(num, app, status) {
        UI.loading(true);
        try {
            const result = await fetchWithAuth(APP_CONFIG.DATA_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'add', prdNumber: num, appName: app, status: status })
            });
            if (result.status === 'success') {
                const d = result.data;
                State.allData.unshift([d.timestamp, d.code, d.appName, d.user, d.status]);
                Data.refreshLocal(); return true; 
            } else { Swal.fire('Gagal', result.message, 'error'); return false; }
        } catch (err) { Swal.fire('Error', err.message, 'error'); return false; } finally { UI.loading(false); }
    },
    async updateStatus(prdCode, newStatus, comment) {
        UI.loading(true);
        try {
            const result = await fetchWithAuth(APP_CONFIG.DATA_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'updateStatus', prdCode, newStatus, comment })
            });
            if (result.status === 'success') {
                const item = State.allData.find(row => row[1] === prdCode);
                if (item) item[4] = newStatus;
                Data.refreshLocal();
                
                // Refresh Modal Detail if Open
                UI.openDetailModal(item);
                
                Swal.fire('Updated', 'Status berhasil diperbarui.', 'success');
            } else { Swal.fire('Gagal', result.message, 'error'); }
        } catch (err) { Swal.fire('Error', err.message, 'error'); } finally { UI.loading(false); }
    },
    async getHistory(prdCode) {
        try {
            const result = await fetchWithAuth(APP_CONFIG.DATA_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'getHistory', prdCode })
            });
            return result.data || [];
        } catch (e) { return []; }
    },
    refreshLocal() {
        document.getElementById('searchInput').value = '';
        State.filteredData = [...State.allData];
        Data.applySort();
        UI.renderTable();
    },
    applySort() {
        const {column, direction} = State.sort;
        State.filteredData.sort((a, b) => {
            let valA = a[column], valB = b[column];
            if (column === 0) { valA = new Date(valA).getTime(); valB = new Date(valB).getTime(); }
            else if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
            return (valA < valB ? -1 : 1) * (direction === 'asc' ? 1 : -1);
        });
    }
};

// --- UI ---
const UI = {
    init() {
        if (State.user && State.token) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('dashboardSection').style.display = 'block';
            document.getElementById('userDisplay').innerHTML = `${escapeHtml(State.user.name)} <span class="badge bg-secondary">${State.user.role}</span>`;
            if(document.getElementById('statusInputContainer')) {
                document.getElementById('statusInputContainer').style.display = State.user.role === 'admin' ? 'block' : 'none';
                document.getElementById('prdStatus').value = 'Open';
            }
            Data.fetchDocuments();
        }
    },
    loading(show) { document.getElementById('loading').style.display = show ? 'flex' : 'none'; },
    
    // --- RENDER TABLE ---
    renderTable() {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '';
        if (State.filteredData.length === 0) {
            document.getElementById('emptyState').classList.remove('d-none');
            document.getElementById('paginationControls').innerHTML = ''; return;
        }
        document.getElementById('emptyState').classList.add('d-none');
        
        const start = (State.pagination.page - 1) * State.pagination.limit;
        const pageData = State.filteredData.slice(start, start + State.pagination.limit);

        pageData.forEach(row => {
            const [timestamp, code, app, user, status] = row;
            // Gunakan array untuk passing data ke onclick
            const rowDataStr = encodeURIComponent(JSON.stringify(row));
            
            tbody.innerHTML += `
                <tr onclick="UI.handleClickRow('${rowDataStr}')">
                    <td class="ps-4"><span class="badge bg-light text-primary border">${escapeHtml(code)}</span></td>
                    <td class="fw-bold">${escapeHtml(app)}</td>
                    <td>${UI.getStatusBadge(status)}</td>
                    <td>${UI.getUserAvatarHTML(user)}</td>
                    <td class="text-end pe-4 small text-muted">${UI.formatDate(timestamp)}</td>
                </tr>`;
        });
        UI.renderPagination();
    },

    // --- DETAIL & HISTORY MODAL ---
    async handleClickRow(rowDataStr) {
        const rowData = JSON.parse(decodeURIComponent(rowDataStr));
        UI.openDetailModal(rowData);
    },

    async openDetailModal(rowData) {
        const [timestamp, code, app, user, status] = rowData;
        
        document.getElementById('detailAppName').textContent = app;
        document.getElementById('detailCode').textContent = code;
        document.getElementById('detailStatusBadge').innerHTML = UI.getStatusBadge(status, true); // true = large badge
        
        // Render Action Button based on Role & Status
        const actionContainer = document.getElementById('actionButtonContainer');
        actionContainer.innerHTML = '';

        if (State.user.role === 'staff') {
            // Staff Logic: Hanya bisa submit review jika Open, On Progress, atau Need Revise
            if (['Open', 'On Progress', 'Need Revise'].includes(status)) {
                actionContainer.innerHTML = `<button class="btn btn-purple text-white btn-sm" onclick="UI.promptStatusChange('${code}', 'Need Review', 'Ajukan Review')"><i class="fas fa-paper-plane me-2"></i>Submit for Review</button>`;
            }
        } else if (State.user.role === 'admin') {
            // Admin Logic: Bisa ubah ke apa saja
            actionContainer.innerHTML = `<button class="btn btn-outline-primary btn-sm" onclick="UI.adminStatusChange('${code}', '${status}')"><i class="fas fa-edit me-2"></i>Ubah Status</button>`;
        }

        // Show Modal
        const modal = new bootstrap.Modal(document.getElementById('detailModal'));
        modal.show();

        // Fetch & Render History
        const historyContainer = document.getElementById('historyTimeline');
        historyContainer.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> Memuat...</div>';
        
        const history = await Data.getHistory(code);
        historyContainer.innerHTML = '';
        
        if(history.length === 0) {
            historyContainer.innerHTML = '<p class="text-muted text-center small">Belum ada riwayat.</p>';
        } else {
            history.forEach(h => {
                historyContainer.innerHTML += `
                    <div class="timeline-item">
                        <div class="timeline-date">${UI.formatDate(h.timestamp)}</div>
                        <div class="timeline-content">
                            <div class="d-flex justify-content-between">
                                <span class="timeline-user">${escapeHtml(h.user)}</span>
                                <small class="text-muted">${escapeHtml(h.activity)}</small>
                            </div>
                            <div class="timeline-text">${escapeHtml(h.details)}</div>
                            ${h.comment ? `<div class="timeline-comment"><i class="fas fa-quote-left me-2 text-warning"></i>${escapeHtml(h.comment)}</div>` : ''}
                        </div>
                    </div>
                `;
            });
        }
    },

    // --- CHANGE STATUS FLOW ---
    promptStatusChange(prdCode, targetStatus, title) {
        Swal.fire({
            title: title,
            input: 'textarea',
            inputLabel: 'Tuliskan catatan/komentar (Wajib)',
            inputPlaceholder: 'Contoh: Sudah selesai dikerjakan, mohon dicek...',
            showCancelButton: true,
            confirmButtonText: 'Kirim',
            cancelButtonText: 'Batal',
            preConfirm: (comment) => {
                if (!comment) Swal.showValidationMessage('Komentar wajib diisi!');
                return comment;
            }
        }).then((result) => {
            if (result.isConfirmed) {
                // Sembunyikan modal detail dulu
                const modalEl = document.getElementById('detailModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();
                
                Data.updateStatus(prdCode, targetStatus, result.value);
            }
        });
    },

    adminStatusChange(prdCode, currentStatus) {
        Swal.fire({
            title: 'Ubah Status',
            html: `
                <select id="swal-status" class="form-select mb-3">
                    <option value="Open" ${currentStatus==='Open'?'selected':''}>Open</option>
                    <option value="On Progress" ${currentStatus==='On Progress'?'selected':''}>On Progress</option>
                    <option value="Need Revise" ${currentStatus==='Need Revise'?'selected':''}>Need Revise</option>
                    <option value="Done" ${currentStatus==='Done'?'selected':''}>Done</option>
                </select>
                <textarea id="swal-comment" class="form-control" placeholder="Komentar (Wajib)"></textarea>
            `,
            showCancelButton: true,
            confirmButtonText: 'Simpan',
            preConfirm: () => {
                const status = document.getElementById('swal-status').value;
                const comment = document.getElementById('swal-comment').value;
                if (!comment) Swal.showValidationMessage('Komentar wajib diisi!');
                return { status, comment };
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const modalEl = document.getElementById('detailModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();
                Data.updateStatus(prdCode, result.value.status, result.value.comment);
            }
        });
    },

    // --- HELPERS ---
    getStatusBadge(status, isLarge = false) {
        let cls = 'bg-secondary';
        if (status === 'Open') cls = 'bg-secondary bg-opacity-75';
        else if (status === 'On Progress') cls = 'bg-primary';
        else if (status === 'Need Review') cls = 'bg-info text-dark'; // Ungu/Biru muda
        else if (status === 'Need Revise') cls = 'bg-warning text-dark';
        else if (status === 'Done') cls = 'bg-success';
        
        const sizeCls = isLarge ? 'fs-6 px-3 py-2' : 'status-badge';
        return `<span class="badge ${cls} ${sizeCls}">${escapeHtml(status)}</span>`;
    },
    getUserAvatarHTML(name) {
        if (!name) return '-';
        const initial = name.charAt(0).toUpperCase();
        // Hashing warna
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        const colors = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#6f42c1'];
        const color = colors[Math.abs(hash % colors.length)];
        return `<div class="d-flex align-items-center"><div class="avatar-circle me-2" style="background-color: ${color};">${initial}</div><span class="pic-name">${escapeHtml(name)}</span></div>`;
    },
    formatDate(iso) {
        if (!iso) return "-";
        const d = new Date(iso);
        return d.toLocaleDateString('id-ID', {day:'numeric', month:'short'}) + ', ' + d.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
    },
    handleSort(idx) {
        if(State.sort.column === idx) State.sort.direction = State.sort.direction === 'asc' ? 'desc' : 'asc';
        else { State.sort.column = idx; State.sort.direction = 'asc'; }
        Data.applySort(); UI.renderTable();
    },
    renderPagination() { /* ... Logic pagination sama spt sebelumnya ... */ 
        const total = Math.ceil(State.filteredData.length / State.pagination.limit);
        const nav = document.getElementById('paginationControls'); nav.innerHTML = '';
        if(total<=1) return;
        for(let i=1; i<=total; i++) nav.innerHTML += `<li class="page-item ${State.pagination.page===i?'active':''}"><a class="page-link" href="#" onclick="State.pagination.page=${i}; UI.renderTable()">${i}</a></li>`;
    }
};

// --- EVENTS ---
document.getElementById('loginForm').addEventListener('submit', (e) => { e.preventDefault(); Auth.login(document.getElementById('username').value, document.getElementById('password').value); });
document.getElementById('prdForm').addEventListener('submit', async (e) => { e.preventDefault(); const m=bootstrap.Modal.getInstance(document.getElementById('addModal')); if(await Data.addDocument(document.getElementById('prdNumber').value, document.getElementById('appName').value, document.getElementById('prdStatus').value)) { m.hide(); e.target.reset(); } });
document.getElementById('searchInput').addEventListener('input', (e) => { const k=e.target.value.toLowerCase(); State.filteredData=State.allData.filter(r=>r.some(v=>String(v).toLowerCase().includes(k))); Data.applySort(); UI.renderTable(); });
function togglePasswordVisibility() { const p = document.getElementById('password'); const i = document.getElementById('toggleIcon'); if(p.type==='password'){p.type='text';i.className='fas fa-eye-slash text-primary'}else{p.type='password';i.className='fas fa-eye text-muted'} }

UI.init();