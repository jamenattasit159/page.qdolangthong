/**
 * Admin Settings Manager
 */
const AdminSettings = {
    async init() {
        console.log('Admin Settings Page Initialized');

        // 1. Load Current Settings
        await this.loadSettings();

        // 2. Event Listeners
        document.getElementById('btn-save-lockdown').addEventListener('click', () => this.saveLockdown());
        document.getElementById('btn-save-progress-assign').addEventListener('click', () => this.saveProgressAssign());

        // 3. Announcement Manager
        this.initAnnouncementManager();

        // 4. Acceptance Report
        this.initAcceptReport();
    },

    async loadSettings() {
        Swal.fire({
            title: 'กำลังโหลด...',
            didOpen: () => Swal.showLoading()
        });

        const settings = await DataManager.getSystemSettings();
        Swal.close();

        if (settings) {
            this.renderSettings(settings);
        } else {
            Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลการตั้งค่าได้', 'error');
        }
    },

    renderSettings(settings) {
        // Lockdown per department
        const depts = ['survey', 'registration', 'academic', 'admin'];
        depts.forEach(dept => {
            const status = settings[`lockdown_status_${dept}`] || settings.lockdown_status || 'auto';
            const selectEl = document.getElementById(`lockdown-${dept}`);
            if (selectEl) {
                selectEl.value = status;
            }
        });

        // Progress Type Assignment - per department
        // ใช้ค่า per-dept ก่อน ถ้าไม่มีให้ fallback ค่า global progress_type_assign
        const assignDepts = ['survey', 'registration', 'academic'];
        assignDepts.forEach(dept => {
            const assignMode = settings[`progress_type_assign_${dept}`] || settings.progress_type_assign || 'restricted';
            const selectEl = document.getElementById(`progress-assign-${dept}`);
            if (selectEl) {
                selectEl.value = assignMode;
            }
        });
    },

    updateProgressAssignBadge(mode) {
        const labels = {
            'allowed': { text: 'อนุญาต (ALLOWED)', class: 'bg-purple-100 text-purple-600' },
            'restricted': { text: 'จำกัดสิทธิ์ (RESTRICTED)', class: 'bg-rose-100 text-rose-600' }
        };
        const config = labels[mode] || labels.restricted;
        ['progress-assign-badge', 'progress-assign-badge-bottom'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = config.text;
                el.className = `px-3 py-1 rounded-full text-xs font-bold ${config.class} uppercase tracking-wider`;
            }
        });
    },

    async saveLockdown() {
        const payload = [
            { key: 'lockdown_status_survey', value: document.getElementById('lockdown-survey').value },
            { key: 'lockdown_status_registration', value: document.getElementById('lockdown-registration').value },
            { key: 'lockdown_status_academic', value: document.getElementById('lockdown-academic').value },
            { key: 'lockdown_status_admin', value: document.getElementById('lockdown-admin').value }
        ];

        Swal.fire({
            title: 'ยืนยันการเปลี่ยนค่า?',
            text: `ต้องการบันทึกการตั้งค่า Lockdown แยกตามฝ่ายหรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#4f46e5',
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
                    // Iterate and save
                    let allSuccess = true;
                    for (const item of payload) {
                        const success = await DataManager.updateSystemSetting(item.key, item.value);
                        if (!success) allSuccess = false;
                    }
                    
                    if (allSuccess) {
                        Swal.fire('สำเร็จ', 'บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success');
                    } else {
                        Swal.fire('Warning', 'บันทึกสำเร็จบางส่วน อาจมีข้อผิดพลาดเครือข่าย', 'warning');
                    }
                } catch (e) {
                    Swal.fire('Error', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
                }
            }
        });
    },

    async saveProgressAssign() {
        const depts = ['survey', 'registration', 'academic'];
        const payload = depts.map(dept => ({
            key: `progress_type_assign_${dept}`,
            value: document.getElementById(`progress-assign-${dept}`)?.value || 'restricted'
        }));

        const deptNames = {
            progress_type_assign_survey: 'ฝ่ายรังวัด',
            progress_type_assign_registration: 'ฝ่ายทะเบียน',
            progress_type_assign_academic: 'กลุ่มงานวิชาการ'
        };

        const summaryHtml = payload.map(p =>
            `<div>• ${deptNames[p.key]}: <strong>${p.value === 'allowed' ? '🔓 อนุญาต' : '🔒 จำกัดสิทธิ์'}</strong></div>`
        ).join('');

        Swal.fire({
            title: 'ยืนยันการเปลี่ยนค่า?',
            icon: 'warning',
            html: `<div class="text-left text-sm text-slate-700 mt-2 p-3 bg-slate-50 rounded-lg">${summaryHtml}</div>`,
            showCancelButton: true,
            confirmButtonColor: '#7c3aed',
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
                    let allSuccess = true;
                    for (const item of payload) {
                        const success = await DataManager.updateSystemSetting(item.key, item.value);
                        if (!success) allSuccess = false;
                    }
                    if (allSuccess) {
                        Swal.fire('สำเร็จ', 'บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success');
                    } else {
                        Swal.fire('Warning', 'บันทึกสำเร็จบางส่วน อาจมีข้อผิดพลาดเครือข่าย', 'warning');
                    }
                } catch (e) {
                    Swal.fire('Error', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
                }
            }
        });
    },

    // === Announcement Manager ===
    initAnnouncementManager() {
        this.loadAnnouncements();

        document.getElementById('btn-save-announcement')?.addEventListener('click', () => this.saveAnnouncement());
        document.getElementById('btn-cancel-announcement')?.addEventListener('click', () => this.cancelEdit());
    },

    // === Acceptance Report ===
    initAcceptReport() {
        this.loadAcceptReport();
        document.getElementById('btn-refresh-accept-report')?.addEventListener('click', () => this.loadAcceptReport());
    },

    async loadAcceptReport() {
        const API_BASE = typeof ApiConfig !== 'undefined' ? ApiConfig.baseUrl : 'api';
        const summaryEl = document.getElementById('accept-summary-container');
        const tbodyEl   = document.getElementById('accept-log-tbody');
        if (!summaryEl || !tbodyEl) return;

        try {
            const res = await fetch(`${API_BASE}/announcement_accept.php`);
            const json = await res.json();
            if (json.status === 'success') {
                this.renderAcceptReport(json.summary || [], json.data || []);
            }
        } catch (e) {
            summaryEl.innerHTML = `<div class="col-span-2 text-center py-6 text-rose-400 text-sm"><i class="fas fa-exclamation-triangle mb-2"></i><p>ไม่สามารถโหลดรายงานได้</p></div>`;
        }
    },

    renderAcceptReport(summary, logs) {
        const summaryEl = document.getElementById('accept-summary-container');
        const tbodyEl   = document.getElementById('accept-log-tbody');

        // Summary Cards
        if (!summary || summary.length === 0) {
            summaryEl.innerHTML = `<div class="col-span-2 text-center py-8 text-slate-400 text-sm"><i class="fas fa-inbox text-3xl mb-3 opacity-30 block"></i>ยังไม่มี User ยอมรับประกาศใด</div>`;
        } else {
            summaryEl.innerHTML = summary.map(s => `
            <div class="p-5 border border-slate-200 rounded-2xl bg-slate-50 hover:border-emerald-300 transition-all">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1 min-w-0 pr-3">
                        <div class="flex items-center gap-2 mb-1">
                            ${this.getDeptBadge(s.target_dept || 'all')}
                        </div>
                        <p class="font-bold text-slate-800 text-sm">${this.escHtml(s.announcement_title || 'ประกาศ')}</p>
                        <p class="text-xs text-slate-400 mt-1">ยอมรับล่าสุด: ${new Date(s.last_accept).toLocaleDateString('th-TH', {year:'numeric',month:'short',day:'numeric'})}</p>
                    </div>
                    <div class="bg-emerald-500 text-white rounded-xl px-3 py-1 text-center flex-shrink-0">
                        <div class="text-xl font-extrabold leading-none">${s.unique_users}</div>
                        <div class="text-[10px] font-semibold opacity-90">คน</div>
                    </div>
                </div>
                <div class="flex flex-wrap gap-1.5">
                    ${(s.user_list || '').split(', ').filter(Boolean).map(u =>
                        `<span class="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">${this.escHtml(u)}</span>`
                    ).join('')}
                </div>
            </div>`).join('');
        }

        // Log Table
        if (!logs || logs.length === 0) {
            tbodyEl.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400 text-sm">ยังไม่มีประวัติการยอมรับ</td></tr>`;
        } else {
            tbodyEl.innerHTML = logs.slice(0, 100).map((log, i) => {
                const dt = new Date(log.accepted_at);
                const dateStr = dt.toLocaleDateString('th-TH', {year:'numeric', month:'short', day:'numeric'});
                const timeStr = dt.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'});
                return `<tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3 text-slate-400 text-xs">${i+1}</td>
                    <td class="px-4 py-3">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            ${this.getDeptBadge(log.target_dept || 'all')}
                            <span class="font-medium text-slate-700 text-xs">${this.escHtml(log.announcement_title || '-')}</span>
                        </div>
                    </td>
                    <td class="px-4 py-3">
                        <span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">${this.escHtml(log.username)}</span>
                    </td>
                    <td class="px-4 py-3 text-slate-600 text-xs">${dateStr}</td>
                    <td class="px-4 py-3 text-slate-400 text-xs">${timeStr}</td>
                </tr>`;
            }).join('');
        }
    },

    async loadAnnouncements() {
        const API_BASE = typeof ApiConfig !== 'undefined' ? ApiConfig.baseUrl : 'api';
        try {
            const res = await fetch(`${API_BASE}/announcement.php`);
            const json = await res.json();
            if (json.status === 'success') {
                this.renderAnnouncements(json.data);
            }
        } catch (e) {
            document.getElementById('announcement-list').innerHTML = `
                <div class="text-center py-8 text-rose-400 text-sm">
                    <i class="fas fa-exclamation-triangle mb-2 text-xl"></i>
                    <p>ไม่สามารถโหลดประกาศได้</p>
                </div>`;
        }
    },

    renderAnnouncements(items) {
        const container = document.getElementById('announcement-list');
        const badge = document.getElementById('announcement-count-badge');

        badge.textContent = `${items.length} ประกาศ`;
        badge.classList.toggle('hidden', items.length === 0);

        if (items.length === 0) {
            container.innerHTML = `
                <div class="text-center py-10 text-slate-400 text-sm">
                    <i class="fas fa-bullhorn text-3xl mb-3 opacity-30"></i>
                    <p>ยังไม่มีประกาศ กรอกแบบฟอร์มด้านบนเพื่อเพิ่มประกาศแรก</p>
                </div>`;
            return;
        }

        container.innerHTML = items.map(item => {
            const isActive = item.is_active == 1;
            const needScroll = item.require_scroll == 1;
            const dateStr = new Date(item.updated_at || item.created_at).toLocaleDateString('th-TH', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            return `
            <div class="announcement-card ${isActive ? 'active' : 'inactive'} bg-white border border-slate-200 rounded-2xl p-5">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                            <span class="font-bold text-slate-800 text-sm">${this.escHtml(item.title)}</span>
                            ${this.getDeptBadge(item.target_dept || 'all')}
                            <span class="px-2 py-0.5 text-xs font-bold rounded-full ${isActive ? 'badge-active' : 'badge-inactive'}">
                                ${isActive ? '🟢 เปิดใช้งาน' : '⚫ ปิดใช้งาน'}
                            </span>
                            ${needScroll ? '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-indigo-100 text-indigo-700">📜 บังคับเลื่อนอ่าน</span>' : ''}
                        </div>
                        <p class="text-slate-500 text-xs leading-relaxed line-clamp-2 mb-2">${this.escHtml(item.content)}</p>
                        <p class="text-slate-400 text-xs"><i class="fas fa-clock mr-1"></i>${dateStr}</p>
                    </div>
                    <div class="flex gap-2 flex-shrink-0">
                        <button onclick="AdminSettings.editAnnouncement(${item.id})" 
                            class="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors text-xs" title="แก้ไข">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="AdminSettings.deleteAnnouncement(${item.id}, '${this.escAttr(item.title)}')" 
                            class="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors text-xs" title="ลบ">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');

        // Store items for edit reference
        this._announcementItems = items;
    },

    async saveAnnouncement() {
        const title   = document.getElementById('announcement-title-input').value.trim();
        const content = document.getElementById('announcement-content-input').value.trim();
        const active  = document.getElementById('announcement-active-checkbox').checked ? 1 : 0;
        const scroll  = document.getElementById('announcement-scroll-checkbox').checked ? 1 : 0;
        const editId  = document.getElementById('announcement-edit-id').value;

        if (!title || !content) {
            Swal.fire('กรุณากรอกข้อมูล', 'โปรดระบุหัวข้อและเนื้อหาประกาศ', 'warning');
            return;
        }

        const API_BASE = typeof ApiConfig !== 'undefined' ? ApiConfig.baseUrl : 'api';
        const targetDept = document.getElementById('announcement-target-dept')?.value || 'all';
        const isEdit = editId !== '';
        const payload = { title, content, target_dept: targetDept, is_active: active, require_scroll: scroll };
        if (isEdit) payload.id = parseInt(editId);

        try {
            Swal.fire({ title: isEdit ? 'กำลังอัปเดต...' : 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
            const res = await fetch(`${API_BASE}/announcement.php`, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.status === 'success') {
                Swal.fire('สำเร็จ! 🎉', isEdit ? 'อัปเดตประกาศเรียบร้อยแล้ว' : 'เพิ่มประกาศใหม่เรียบร้อยแล้ว', 'success');
                this.cancelEdit();
                await this.loadAnnouncements();
            } else {
                throw new Error(json.message);
            }
        } catch (e) {
            Swal.fire('Error', 'ไม่สามารถบันทึกประกาศได้: ' + e.message, 'error');
        }
    },

    editAnnouncement(id) {
        const item = (this._announcementItems || []).find(a => a.id == id);
        if (!item) return;

        document.getElementById('announcement-edit-id').value = item.id;
        document.getElementById('announcement-title-input').value = item.title;
        document.getElementById('announcement-content-input').value = item.content;
        document.getElementById('announcement-active-checkbox').checked = item.is_active == 1;
        document.getElementById('announcement-scroll-checkbox').checked = item.require_scroll == 1;
        this.selectTargetDept(item.target_dept || 'all');
        document.getElementById('announcement-form-label').textContent = '✏️ แก้ไขประกาศ';
        document.getElementById('btn-cancel-announcement').classList.remove('hidden');
        document.getElementById('btn-save-announcement').innerHTML = '<i class="fas fa-check"></i> อัปเดตประกาศ';

        // Scroll to form
        document.getElementById('announcement-title-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('announcement-title-input').focus();
    },

    async deleteAnnouncement(id, titleText) {
        const result = await Swal.fire({
            title: 'ลบประกาศ?',
            html: `คุณต้องการลบประกาศ <strong>"${titleText}"</strong> ออกจากระบบหรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e11d48',
            confirmButtonText: 'ลบเลย',
            cancelButtonText: 'ยกเลิก'
        });
        if (!result.isConfirmed) return;

        const API_BASE = typeof ApiConfig !== 'undefined' ? ApiConfig.baseUrl : 'api';
        try {
            Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
            const res = await fetch(`${API_BASE}/announcement.php`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const json = await res.json();
            if (json.status === 'success') {
                Swal.fire('ลบสำเร็จ', 'ประกาศถูกลบออกจากระบบแล้ว', 'success');
                await this.loadAnnouncements();
            } else {
                throw new Error(json.message);
            }
        } catch (e) {
            Swal.fire('Error', 'ไม่สามารถลบประกาศได้: ' + e.message, 'error');
        }
    },

    cancelEdit() {
        document.getElementById('announcement-edit-id').value = '';
        document.getElementById('announcement-title-input').value = '';
        document.getElementById('announcement-content-input').value = '';
        document.getElementById('announcement-active-checkbox').checked = true;
        document.getElementById('announcement-scroll-checkbox').checked = true;
        this.selectTargetDept('all');
        document.getElementById('announcement-form-label').textContent = 'เพิ่มประกาศใหม่';
        document.getElementById('btn-cancel-announcement').classList.add('hidden');
        document.getElementById('btn-save-announcement').innerHTML = '<i class="fas fa-save"></i> บันทึกประกาศ';
    },

    selectTargetDept(dept) {
        const input = document.getElementById('announcement-target-dept');
        if (input) input.value = dept;

        const deptConfigs = {
            'all': 'bg-amber-500 text-white border-amber-500 shadow-sm',
            'survey': 'bg-indigo-600 text-white border-indigo-600 shadow-sm',
            'registration': 'bg-blue-600 text-white border-blue-600 shadow-sm',
            'academic': 'bg-orange-600 text-white border-orange-600 shadow-sm',
            'admin': 'bg-teal-600 text-white border-teal-600 shadow-sm'
        };

        const defaultClass = ['bg-white', 'text-slate-600', 'border-slate-200'];

        document.querySelectorAll('#announcement-dept-btn-group .dept-select-btn').forEach(btn => {
            const btnDept = btn.getAttribute('data-dept');
            // Remove all active classes
            Object.values(deptConfigs).forEach(classes => {
                classes.split(' ').forEach(c => btn.classList.remove(c));
            });
            defaultClass.forEach(c => btn.classList.remove(c));

            if (btnDept === dept) {
                const active = (deptConfigs[dept] || deptConfigs['all']).split(' ');
                btn.classList.add(...active);
            } else {
                btn.classList.add(...defaultClass);
            }
        });
    },

    getDeptBadge(dept) {
        switch (dept) {
            case 'survey':
                return '<span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200"><i class="fas fa-map-marked-alt mr-1"></i>เฉพาะฝ่ายรังวัด</span>';
            case 'registration':
                return '<span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200"><i class="fas fa-folder-open mr-1"></i>เฉพาะฝ่ายทะเบียน</span>';
            case 'academic':
                return '<span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-orange-50 text-orange-700 border border-orange-200"><i class="fas fa-book-reader mr-1"></i>เฉพาะกลุ่มงานวิชาการ</span>';
            case 'admin':
                return '<span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-teal-50 text-teal-700 border border-teal-200"><i class="fas fa-building mr-1"></i>เฉพาะฝ่ายอำนวยการ</span>';
            default:
                return '<span class="px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-200"><i class="fas fa-globe mr-1"></i>ทุกฝ่าย (ทุกคน)</span>';
        }
    },

    escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    },

    escAttr(str) {
        return String(str).replace(/'/g, '\'').replace(/"/g, '&quot;');
    }
};

document.addEventListener('DOMContentLoaded', () => AdminSettings.init());
