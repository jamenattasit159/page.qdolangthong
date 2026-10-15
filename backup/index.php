<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Backup Manager | Emerald Solstice</title>
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Prompt:wght@300;400;500;600&display=swap" rel="stylesheet">
    <!-- Lucide Icons -->
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        :root {
            --primary: #22C55E;
            --primary-dark: #16A34A;
            --secondary: #3b82f6;
            --soft-green: #DCFCE7;
            --bg-page: #FFFFFF;
            --bg-card: #FFFFFF;
            --border: #E5E7EB;
            --text-main: #1F2937;
            --text-muted: #6B7280;
            --shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', 'Prompt', sans-serif;
            background-color: var(--bg-page);
            color: var(--text-main);
            min-height: 100vh;
            line-height: 1.6;
            overflow-x: hidden;
        }

        .container {
            max-width: 1100px;
            margin: 0 auto;
            padding: 40px 20px;
        }

        /* Nav */
        .nav-back {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--text-muted);
            text-decoration: none;
            font-weight: 500;
            margin-bottom: 30px;
            transition: all 0.2s ease;
            font-size: 0.95rem;
        }

        .nav-back:hover {
            color: var(--primary);
            transform: translateX(-4px);
        }

        /* Dashboard Header */
        .dashboard-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 40px;
            padding-bottom: 24px;
            border-bottom: 1px solid var(--border);
        }

        .title-section h1 {
            font-size: 2rem;
            font-weight: 700;
            letter-spacing: -0.025em;
            color: var(--text-main);
            margin-bottom: 4px;
        }

        .title-section p {
            color: var(--text-muted);
            font-size: 1rem;
        }

        /* System Health Cards */
        .health-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }

        .health-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
            display: flex;
            align-items: center;
            gap: 20px;
            transition: all 0.3s ease;
            box-shadow: var(--shadow);
        }

        .health-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-lg);
            border-color: var(--primary);
        }

        .health-icon {
            width: 52px;
            height: 52px;
            background: var(--soft-green);
            color: var(--primary-dark);
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .health-info h3 {
            font-size: 0.8125rem;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
        }

        .health-info p {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--text-main);
        }

        /* Content Grid */
        .main-content {
            display: grid;
            grid-template-columns: 1fr 340px;
            gap: 30px;
        }

        @media (max-width: 992px) {
            .main-content {
                grid-template-columns: 1fr;
            }
        }

        .card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 20px;
            overflow: hidden;
            box-shadow: var(--shadow);
        }

        .card-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #FAFAFA;
        }

        .card-header h2 {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .card-body {
            padding: 24px;
        }

        /* List Styling */
        .backup-list {
            list-style: none;
        }

        .backup-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px;
            border-bottom: 1px solid var(--border);
            transition: background 0.2s ease;
        }

        .backup-item:last-child {
            border-bottom: none;
        }

        .backup-item:hover {
            background: #F9FAFB;
        }

        .file-info {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .file-icon {
            color: var(--primary);
            background: var(--soft-green);
            padding: 8px;
            border-radius: 10px;
        }

        .file-name {
            font-weight: 600;
            font-size: 0.95rem;
            color: var(--text-main);
            margin-bottom: 2px;
        }

        .file-meta {
            font-size: 0.8rem;
            color: var(--text-muted);
            display: flex;
            gap: 12px;
        }

        .file-actions {
            display: flex;
            gap: 8px;
        }

        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px 18px;
            border-radius: 10px;
            font-weight: 600;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s ease;
            border: 1px solid transparent;
            font-family: inherit;
        }

        .btn-primary {
            background: var(--primary);
            color: #fff;
        }

        .btn-primary:hover {
            background: var(--primary-dark);
            transform: translateY(-1px);
            box-shadow: 0 4px 6px -1px rgba(34, 197, 94, 0.2);
        }

        .btn-outline {
            background: #fff;
            border-color: var(--border);
            color: var(--text-main);
        }

        .btn-outline:hover {
            background: #F9FAFB;
            border-color: var(--text-muted);
        }

        .btn-danger-outline {
            background: #fff;
            border-color: #FECACA;
            color: #EF4444;
        }

        .btn-danger-outline:hover {
            background: #FEF2F2;
            border-color: #EF4444;
        }

        .btn-icon {
            padding: 8px;
            border-radius: 8px;
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
        }

        /* Inputs */
        .form-group {
            margin-bottom: 20px;
        }

        .form-label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            font-size: 0.875rem;
            color: var(--text-main);
        }

        .form-control {
            width: 100%;
            background: #FFFFFF;
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 12px 16px;
            color: var(--text-main);
            font-family: inherit;
            transition: all 0.2s;
        }

        .form-control:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
        }

        /* Toast notifications */
        .toast-container {
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .toast {
            background: #FFFFFF;
            border: 1px solid var(--border);
            border-left: 4px solid var(--primary);
            padding: 16px 20px;
            border-radius: 12px;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 300px;
            box-shadow: var(--shadow-lg);
            animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        /* Progress Steps */
        .steps {
            margin-top: 20px;
            border-top: 1px solid var(--border);
            padding-top: 20px;
        }

        .step {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
            font-size: 0.9rem;
            color: var(--text-muted);
        }

        .step.done { color: var(--text-main); }
        .step-icon {
            width: 20px; height: 20px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 10px;
        }

        .step.done .step-icon { background: var(--primary); color: #fff; }
        .step.pending .step-icon { background: #F3F4F6; color: var(--text-muted); }

        /* Spinner */
        .spinner {
            animation: rotate 2s linear infinite;
        }
        @keyframes rotate {
            100% { transform: rotate(360deg); }
        }

        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 60px 40px;
            background: #FAFAFA;
            border-radius: 12px;
        }

        .empty-icon {
            color: var(--text-muted);
            margin-bottom: 20px;
            opacity: 0.4;
        }
    </style>
</head>
<body>
    <div class="container" id="app">
        <a href="../index.html" class="nav-back">
            <i data-lucide="arrow-left"></i> กลับหน้าหลัก
        </a>

        <header class="dashboard-header">
            <div class="title-section">
                <h1>Backup Management</h1>
                <p>ศูนย์ควบคุมการสำรองข้อมูลและความปลอดภัยระบบ</p>
            </div>
            <div id="lastSync" style="color: var(--text-muted); font-size: 0.9rem;">
                <i data-lucide="clock" style="width: 14px; margin-bottom: -2px;"></i> อัปเดตล่าสุด: <span id="syncTime">-</span>
            </div>
        </header>

        <!-- System Status Summary -->
        <div class="health-grid">
            <div class="health-card">
                <div class="health-icon"><i data-lucide="database"></i></div>
                <div class="health-info">
                    <h3>Database Size</h3>
                    <p id="dbSize">...</p>
                </div>
            </div>
            <div class="health-card">
                <div class="health-icon"><i data-lucide="files"></i></div>
                <div class="health-info">
                    <h3>Backups Stored</h3>
                    <p id="totalBackups">...</p>
                </div>
            </div>
            <div class="health-card">
                <div class="health-icon"><i data-lucide="server"></i></div>
                <div class="health-info">
                    <h3>PHP Version</h3>
                    <p><?php echo PHP_VERSION; ?></p>
                </div>
            </div>
        </div>

        <div class="main-content">
            <!-- Left Side: Backup History -->
            <section class="card">
                <div class="card-header">
                    <h2><i data-lucide="archive"></i> รายการสำรองข้อมูลล่าสุด</h2>
                    <button class="btn btn-primary" onclick="runBackup(true)" id="btnBackupMain">
                        <i data-lucide="shield-check"></i> สร้างการสำรองข้อมูลใหม่
                    </button>
                </div>
                <div class="card-body">
                    <div id="backupList">
                        <!-- Loaded via JS -->
                        <div class="empty-state">
                            <i data-lucide="loader-2" class="spinner" style="width: 40px; height: 40px;"></i>
                            <p>กำลังโหลดข้อมูล...</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Right Side: Settings & Quick Actions -->
            <aside>
                <div class="card" style="margin-bottom: 30px;">
                    <div class="card-header">
                        <h2><i data-lucide="settings"></i> การกำหนดค่า</h2>
                    </div>
                    <div class="card-body">
                        <form id="settingsForm">
                            <div class="form-group">
                                <label class="form-label">Discord Webhook</label>
                                <input type="url" id="webhookUrl" class="form-control" placeholder="URL จาก Discord">
                                <span style="font-size: 0.75rem; color: var(--text-muted);">ใช้สำหรับส่งสำรองข้อมูลไปภายนอก</span>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <button type="submit" class="btn btn-outline" style="width: 100%;">
                                    <i data-lucide="save"></i> บันทึก
                                </button>
                                <button type="button" class="btn btn-outline" style="width: 100%;" onclick="testWebhook()">
                                    <i data-lucide="send"></i> ทดสอบการเชื่อมต่อ
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h2><i data-lucide="cpu"></i> จัดการระบบ</h2>
                    </div>
                    <div class="card-body">
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <button class="btn btn-outline" style="width: 100%;" onclick="runBackup(false)" id="btnBackupLocal">
                                <i data-lucide="download"></i> สำรองข้อมูลเข้าเครื่อง
                            </button>
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 10px;">
                                * แนะนำให้ส่งไป Discord เพื่อความปลอดภัยสูงสุดหากเซิร์ฟเวอร์มีปัญหา
                            </p>
                        </div>
                    </div>
                </div>
            </aside>
        </div>

        <!-- Result/Progress UI -->
        <div id="backupResult" style="display:none; margin-top: 40px;"></div>
    </div>

    <!-- Notifications Container -->
    <div id="toastContainer" class="toast-container"></div>

    <script>
        // Init Lucide Icons
        lucide.createIcons();

        const API_BASE = 'api.php';

        document.addEventListener('DOMContentLoaded', () => {
            loadSettings();
            loadBackupList();
            document.getElementById('syncTime').textContent = new Date().toLocaleTimeString();
        });

        // Toast Helper
        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.style.borderLeftColor = type === 'success' ? '#22C55E' : '#EF4444';
            
            const icon = type === 'success' ? 'check-circle' : 'alert-circle';
            toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
            
            container.appendChild(toast);
            lucide.createIcons();

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 300);
            }, 5000);
        }

        async function loadSettings() {
            try {
                const response = await fetch(`${API_BASE}?action=getSettings`);
                const data = await response.json();
                if (data.webhook_url) {
                    document.getElementById('webhookUrl').value = data.webhook_url;
                }
            } catch (error) {}
        }

        document.getElementById('settingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const webhookUrl = document.getElementById('webhookUrl').value;
            try {
                const response = await fetch(API_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'saveSettings', webhook_url: webhookUrl })
                });
                const data = await response.json();
                if (data.success) showToast('บันทึกการตั้งค่าแล้ว');
                else showToast(data.message, 'error');
            } catch (e) { showToast('เกิดข้อผิดพลาด', 'error'); }
        });

        async function testWebhook() {
            const webhookUrl = document.getElementById('webhookUrl').value;
            if (!webhookUrl) return showToast('กรุณาระบุ Webhook URL', 'error');

            showToast('กำลังส่งข้อมูลทดสอบ...', 'success');
            try {
                const response = await fetch(API_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'testWebhook', webhook_url: webhookUrl })
                });
                const data = await response.json();
                if (data.success) showToast('เชื่อมต่อ Discord สำเร็จ');
                else showToast('การเชื่อมต่อล้มเหลว', 'error');
            } catch (e) { showToast('เกิดข้อผิดพลาด', 'error'); }
        }

        async function runBackup(sendToDiscord) {
            const btn = document.getElementById(sendToDiscord ? 'btnBackupMain' : 'btnBackupLocal');
            if (btn) btn.disabled = true;

            showToast('กำลังเริ่มต้นการสำรองข้อมูล...');
            const resultDiv = document.getElementById('backupResult');
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = `
                <div class="card">
                    <div class="card-header"><h2>สถานะการทำงาน</h2></div>
                    <div class="card-body">
                        <div class="steps" id="progressSteps">
                            <div class="step pending"><i data-lucide="circle" style="width:16px;"></i> กำลังประมวลผล...</div>
                        </div>
                    </div>
                </div>
            `;
            lucide.createIcons();

            try {
                const response = await fetch(API_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'backup', sendToDiscord })
                });
                const data = await response.json();
                
                if (data.success) {
                    showToast('สำรองข้อมูลสำเร็จ');
                    let stepsHtml = '';
                    data.steps.forEach(s => {
                        stepsHtml += `
                            <div class="step done">
                                <div class="step-icon"><i data-lucide="check" style="width:12px;"></i></div>
                                <div><strong>${s.step}</strong>: ${s.details}</div>
                            </div>
                        `;
                    });
                    document.getElementById('progressSteps').innerHTML = stepsHtml;
                    lucide.createIcons();
                    loadBackupList();
                } else {
                    showToast(data.message, 'error');
                }
            } catch (e) { showToast('การสำรองข้อมูลล้มเหลว', 'error'); }

            if (btn) btn.disabled = false;
        }

        async function loadBackupList() {
            const listDiv = document.getElementById('backupList');
            try {
                const response = await fetch(`${API_BASE}?action=getBackupList`);
                const data = await response.json();
                
                if (data.files && data.files.length > 0) {
                    let html = '<ul class="backup-list">';
                    data.files.forEach(f => {
                        html += `
                            <li class="backup-item">
                                <div class="file-info">
                                    <div class="file-icon"><i data-lucide="file-archive"></i></div>
                                    <div>
                                        <div class="file-name">${f.filename}</div>
                                        <div class="file-meta">
                                            <span><i data-lucide="database" style="width:10px;"></i> ${f.size_formatted}</span>
                                            <span><i data-lucide="calendar" style="width:10px;"></i> ${f.created}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="file-actions">
                                    <a href="download.php?file=${encodeURIComponent(f.filename)}" class="btn btn-outline btn-icon" title="Download">
                                        <i data-lucide="download"></i>
                                    </a>
                                    <button class="btn btn-danger-outline btn-icon" title="Delete" onclick="deleteBackup('${f.filename}')">
                                        <i data-lucide="trash-2"></i>
                                    </button>
                                </div>
                            </li>
                        `;
                    });
                    html += '</ul>';
                    listDiv.innerHTML = html;
                    lucide.createIcons();

                    // Update summary
                    document.getElementById('totalBackups').textContent = data.files.length + ' ไฟล์';
                    document.getElementById('dbSize').textContent = data.files[0].size_formatted;
                    document.getElementById('syncTime').textContent = new Date().toLocaleTimeString();
                } else {
                    listDiv.innerHTML = `
                        <div class="empty-state">
                            <i data-lucide="ghost" class="empty-icon" style="width:48px; height:48px;"></i>
                            <p>ยังไม่มีประวัติการสำรองข้อมูล</p>
                        </div>
                    `;
                    lucide.createIcons();
                }
            } catch (e) {}
        }

        async function deleteBackup(filename) {
            if (!confirm(`ต้องการลบไฟล์สำรองข้อมูล ${filename} ใช่หรือไม่?`)) return;
            try {
                const response = await fetch(API_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'deleteBackup', filename })
                });
                const data = await response.json();
                if (data.success) {
                    showToast('ลบไฟล์เรียบร้อยแล้ว');
                    loadBackupList();
                }
            } catch (e) { showToast('เกิดข้อผิดพลาด', 'error'); }
        }
    </script>
</body>
</html>
