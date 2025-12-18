import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
    const JWT_SECRET = process.env.JWT_SECRET;

    // 1. CEK TOKEN (VERIFIKASI SESI)
    // Ambil token dari Header "Authorization: Bearer <token>"
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'Akses Ditolak: Token tidak ditemukan (Silakan Login ulang)' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verifikasi tanda tangan Token
        // Jika hacker mengubah isi token (misal role: admin), verifikasi ini akan GAGAL.
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // (Opsional) Anda bisa menyisipkan data user asli dari token ke body request
        // untuk memastikan username yang dikirim ke Google adalah username asli pemilik token
        if (req.method === 'POST') {
             // Pastikan body ada
             if (!req.body) req.body = {};
             // Paksa user/role dari token yang valid, abaikan inputan hacker dari frontend
             req.body.user = decoded.user;
             req.body.role = decoded.role;
        }

    } catch (err) {
        return res.status(403).json({ status: 'error', message: 'Sesi Tidak Valid atau Kadaluarsa. Hacker terdeteksi.' });
    }

    // 2. JIKA TOKEN VALID, LANJUT KE GOOGLE
    try {
        const method = req.method;
        let options = {
            method: method,
            headers: { "Content-Type": "application/json" },
            redirect: "follow",
        };

        if (method === 'POST') {
            options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        const response = await fetch(GOOGLE_SCRIPT_URL, options);
        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ status: 'error', message: 'Gagal koneksi ke database' });
    }
}