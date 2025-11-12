// api/database.js - Fixed Version
const axios = require('axios');

// Konfigurasi GitHub
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "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";
const NAME_GH = process.env.NAME_GH || "wanz-codename-similarity";
const REPO_GH = process.env.REPO_GH || "xcviv2gen2free";
const CONNECT_PATH = process.env.CONNECT_PATH || "api/connect.js";

// Konfigurasi Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8232068363:AAFaDTDmOCrNmiL1vNu9YYiLeORwNJntwvQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "7950114253";

// Fungsi untuk mengirim notifikasi ke Telegram
async function sendTelegramNotification(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log('Telegram notification sent successfully');
    } catch (error) {
        console.error('Error sending Telegram notification:', error.message);
    }
}

// Fungsi untuk mendapatkan konten file dari GitHub
async function getGitHubFile() {
    try {
        const fileUrl = `https://api.github.com/repos/${NAME_GH}/${REPO_GH}/contents/${CONNECT_PATH}`;
        const headers = {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'User-Agent': 'Node.js',
            'Accept': 'application/vnd.github.v3+json'
        };

        console.log('Fetching file from GitHub:', fileUrl);
        const response = await axios.get(fileUrl, { headers });
        console.log('GitHub response status:', response.status);
        
        return {
            success: true,
            content: response.data.content,
            sha: response.data.sha,
            encoding: response.data.encoding
        };
    } catch (error) {
        console.error('Error fetching from GitHub:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
}

// Fungsi untuk update file di GitHub
async function updateGitHubFile(content, sha, message) {
    try {
        const fileUrl = `https://api.github.com/repos/${NAME_GH}/${REPO_GH}/contents/${CONNECT_PATH}`;
        const headers = {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'User-Agent': 'Node.js',
            'Accept': 'application/vnd.github.v3+json'
        };

        const updateData = {
            message: message,
            content: Buffer.from(content).toString('base64'),
            sha: sha
        };

        console.log('Updating file on GitHub...');
        const response = await axios.put(fileUrl, updateData, { headers });
        console.log('Update successful');
        
        return { success: true, data: response.data };
    } catch (error) {
        console.error('Error updating GitHub file:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.message || error.message
        };
    }
}

// Fungsi untuk parse users array dari konten
function parseUsersFromContent(content) {
    try {
        // Cari let users = [ ... ]
        const usersRegex = /let users\s*=\s*(\[[\s\S]*?\]);/;
        const match = content.match(usersRegex);
        
        if (!match) {
            return { success: false, error: 'Tidak dapat menemukan deklarasi users dalam file' };
        }

        const usersArrayStr = match[1];
        
        // Parse array users dengan evaluasi yang aman
        let usersArray;
        try {
            // Gunakan Function constructor untuk evaluasi yang lebih aman
            usersArray = (new Function('return ' + usersArrayStr))();
        } catch (e) {
            return { success: false, error: 'Gagal memparse array users: ' + e.message };
        }

        return { success: true, users: usersArray, match: match[0] };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Fungsi untuk update users array dalam konten
function updateUsersInContent(content, newUser) {
    try {
        const result = parseUsersFromContent(content);
        if (!result.success) {
            return result;
        }

        const { users, match } = result;

        // Tambahkan user baru
        users.push(newUser);

        // Format ulang array users
        const newUsersArrayStr = JSON.stringify(users, null, 2)
            .replace(/"([^"]+)":/g, '$1:')
            .replace(/"(\d+)"/g, '$1');

        // Ganti array users lama dengan yang baru
        const updatedContent = content.replace(match, `let users = ${newUsersArrayStr};`);

        return { success: true, content: updatedContent };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Main handler function
module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log('Received request:', req.method, req.url);

    try {
        if (req.method === 'GET') {
            // Handle request untuk mendapatkan jumlah total akun
            console.log('Processing GET request for total accounts');
            
            const fileResult = await getGitHubFile();
            if (!fileResult.success) {
                return res.status(200).json({ 
                    success: true, 
                    total: 0,
                    error: fileResult.error
                });
            }

            // Decode konten dari base64
            const currentContent = Buffer.from(fileResult.content, 'base64').toString('utf8');
            
            const parseResult = parseUsersFromContent(currentContent);
            if (!parseResult.success) {
                return res.status(200).json({ 
                    success: true, 
                    total: 0,
                    error: parseResult.error
                });
            }

            return res.status(200).json({ 
                success: true, 
                total: parseResult.users.length
            });

        } else if (req.method === 'POST') {
            // Handle request untuk membuat akun baru
            console.log('Processing POST request to create account');
            
            let body;
            try {
                body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            } catch (e) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid JSON body' 
                });
            }

            const { username, password, role, createdAt, expired } = body;

            if (!username || !password) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Username and password are required' 
                });
            }

            // Step 1: Dapatkan konten file dari GitHub
            const fileResult = await getGitHubFile();
            if (!fileResult.success) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Gagal mengambil file dari GitHub: ' + fileResult.error
                });
            }

            // Decode konten dari base64
            const currentContent = Buffer.from(fileResult.content, 'base64').toString('utf8');

            // Step 2: Parse dan update array users
            const newUser = {
                username,
                password,
                role: role || "premium",
                createdAt: createdAt || Date.now(),
                expired: expired || (Date.now() + (30 * 24 * 60 * 60 * 1000))
            };

            const updateResult = updateUsersInContent(currentContent, newUser);
            if (!updateResult.success) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Gagal mengupdate konten: ' + updateResult.error
                });
            }

            // Step 3: Update file di GitHub
            const updateMessage = `Menambah user ${username}`;
            const updateResultGit = await updateGitHubFile(
                updateResult.content, 
                fileResult.sha, 
                updateMessage
            );

            if (!updateResultGit.success) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Gagal mengupdate file di GitHub: ' + updateResultGit.error
                });
            }

            // Step 4: Kirim notifikasi ke Telegram
            const expiredDate = new Date(newUser.expired);
            const formattedDate = expiredDate.toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            
            const telegramMessage = `
🆕 <b>AKUN BARU DIBUAT</b>

👤 <b>Username:</b> <code>${username}</code>
🔑 <b>Password:</b> <code>${password}</code>
⭐ <b>Role:</b> ${newUser.role}
📅 <b>Kadaluarsa:</b> ${formattedDate}

⏰ <b>Waktu:</b> ${new Date().toLocaleString('id-ID')}
            `;
            
            await sendTelegramNotification(telegramMessage);

            return res.status(200).json({
                success: true,
                message: `Akun ${username} berhasil dibuat`,
                username,
                password,
                role: newUser.role,
                expired: formattedDate
            });

        } else {
            return res.status(405).json({ 
                success: false, 
                error: 'Method not allowed' 
            });
        }

    } catch (error) {
        console.error('Unexpected error in handler:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error: ' + error.message
        });
    }
};
