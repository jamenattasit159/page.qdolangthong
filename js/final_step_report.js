window.finalStepReport = {
    rows: [],
    filteredRows: [],
    user: null,
    selectedDept: 'all',
    searchTerm: '',
    scope: 'actionPlan2026',
    startDate: new Date(2026, 0, 1),
    departments: {
        survey: { label: 'ฝ่ายรังวัด', icon: 'fa-drafting-compass', badge: 'bg-amber-50 text-amber-700 border-amber-100' },
        registration: { label: 'ฝ่ายทะเบียน', icon: 'fa-file-signature', badge: 'bg-sky-50 text-sky-700 border-sky-100' },
        academic: { label: 'กลุ่มงานวิชาการ', icon: 'fa-graduation-cap', badge: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100' },
        admin: { label: 'ฝ่ายอำนวยการ', icon: 'fa-layer-group', badge: 'bg-teal-50 text-teal-700 border-teal-100' }
    },

    init() {
        this.user = JSON.parse(localStorage.getItem('dol_user') || 'null');
        const isAdmin = this.user && (this.user.role === 'superadmin' || this.user.role === 'admin');
        const allowedDept = ['survey', 'registration', 'academic', 'admin'];
        const isStaff = this.user && this.user.role === 'staff' && allowedDept.includes(this.user.department);

        if (!this.user || (!isAdmin && !isStaff)) {
            window.location.href = 'index.html';
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const requestedDept = params.get('dept') || 'all';
        this.selectedDept = allowedDept.includes(requestedDept) ? requestedDept : 'all';
        this.scope = params.get('scope') === 'dashboard' ? 'dashboard' : 'actionPlan2026';

        if (!isAdmin && this.user.department) {
            this.selectedDept = this.user.department;
        }

        this.updateDateDisplay();
        this.updateScopeText();
        this.bindControls(isAdmin);
        this.reload();
    },

    bindControls(isAdmin) {
        const deptFilter = document.getElementById('dept-filter');
        const searchInput = document.getElementById('search-input');

        if (deptFilter) {
            deptFilter.value = this.selectedDept;
            if (!isAdmin) {
                deptFilter.disabled = true;
                deptFilter.classList.add('cursor-not-allowed', 'opacity-70');
            }
            deptFilter.addEventListener('change', () => {
                this.selectedDept = deptFilter.value;
                this.applyFilters();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.searchTerm = searchInput.value.trim().toLowerCase();
                this.applyFilters();
            });
        }
    },

    updateDateDisplay() {
        const dateEl = document.getElementById('current-date');
        if (!dateEl) return;

        dateEl.textContent = new Date().toLocaleDateString('th-TH', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    async reload() {
        this.setLoading(true);

        try {
            const [surveyItems, registrationItems, academicItems, adminItems] = await Promise.all([
                DataManager.getSurveyItems(),
                DataManager.getRegistrationItems(),
                DataManager.getAcademicItems(),
                DataManager.getAdminItems()
            ]);

            this.rows = [
                ...this.normalizeDepartmentItems(surveyItems, 'survey'),
                ...this.normalizeDepartmentItems(registrationItems, 'registration'),
                ...this.normalizeDepartmentItems(academicItems, 'academic'),
                ...this.normalizeDepartmentItems(adminItems, 'admin')
            ].filter(row => this.isFinalStepActionPlan(row))
                .sort((a, b) => this.compareRows(a, b));

            this.applyFilters();
        } catch (error) {
            console.error('Load final step report error:', error);
            Swal.fire({
                icon: 'error',
                title: 'โหลดข้อมูลไม่สำเร็จ',
                text: 'ไม่สามารถโหลดรายงานงานสุดขั้นตอนได้ กรุณาลองใหม่อีกครั้ง',
                confirmButtonColor: '#7c3aed'
            });
            this.setLoading(false);
        }
    },

    normalizeDepartmentItems(items, dept) {
        const list = Array.isArray(items) ? items : [];
        const deptInfo = this.departments[dept];
        return list.map(item => ({
            ...item,
            _sourceDept: dept,
            _departmentLabel: deptInfo?.label || dept
        }));
    },

    isFinalStepActionPlan(row) {
        if (parseInt(row.progress_type, 10) !== 2) return false;
        if (!DataManager.isPending(row)) return false;

        if (this.scope === 'dashboard') return true;

        const receivedDate = this.parseDate(row.received_date);
        if (!receivedDate) return false;
        return receivedDate >= this.startDate;
    },

    compareRows(a, b) {
        const deptOrder = { survey: 1, registration: 2, academic: 3, admin: 4 };
        const deptDiff = (deptOrder[a._sourceDept] || 99) - (deptOrder[b._sourceDept] || 99);
        if (deptDiff !== 0) return deptDiff;

        return this.getDateValue(b.received_date) - this.getDateValue(a.received_date);
    },

    applyFilters() {
        const visibleRows = this.rows.filter(row => {
            if (this.selectedDept !== 'all' && row._sourceDept !== this.selectedDept) return false;
            if (!this.searchTerm) return true;

            const searchableText = [
                row._departmentLabel,
                row.received_date,
                this.getSubject(row),
                this.getRelatedPerson(row),
                row.status_cause,
                row.updated_at,
                row.update_at,
                this.getNote(row)
            ].join(' ').toLowerCase();

            return searchableText.includes(this.searchTerm);
        });

        this.filteredRows = visibleRows;
        this.render();
    },

    render() {
        this.setLoading(false);
        this.updateSummary();
        this.updateDeptLabel();
        this.updateScopeText();
        this.renderTable();
    },

    renderTable() {
        const tbody = document.getElementById('report-tbody');
        const tableWrap = document.getElementById('table-wrap');
        const emptyState = document.getElementById('empty-state');
        const resultSummary = document.getElementById('result-summary');

        if (!tbody || !tableWrap || !emptyState) return;

        if (resultSummary) {
            const scopeText = this.scope === 'dashboard' ? 'ข้อมูลทั้งหมดตามตัวเลข Dashboard' : 'ข้อมูลตั้งแต่ 1 ม.ค. 2569';
            resultSummary.textContent = `แสดง ${this.filteredRows.length.toLocaleString()} รายการ จากทั้งหมด ${this.rows.length.toLocaleString()} รายการ (${scopeText})`;
        }

        if (this.filteredRows.length === 0) {
            tbody.innerHTML = '';
            tableWrap.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        tableWrap.classList.remove('hidden');
        tbody.innerHTML = this.filteredRows.map((row, index) => this.buildRow(row, index)).join('');
    },

    buildRow(row, index) {
        const dept = this.departments[row._sourceDept] || {};
        const badgeClass = dept.badge || 'bg-slate-50 text-slate-700 border-slate-100';
        const icon = dept.icon || 'fa-building';

        return `
            <tr class="bg-white">
                <td>
                    <span class="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-extrabold ${badgeClass}">
                        <i class="fas ${icon}"></i>
                        ${this.escape(row._departmentLabel)}
                    </span>
                </td>
                <td class="text-center font-black text-slate-600">${index + 1}</td>
                <td class="font-bold text-slate-700">${this.escape(row.received_date || '-')}</td>
                <td class="font-bold text-slate-900">${this.escape(this.getSubject(row))}</td>
                <td>
                    <span class="inline-flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-extrabold text-violet-700">
                        <i class="fas fa-flag-checkered"></i>
                        งานสุดขั้นตอน
                    </span>
                </td>
                <td class="font-medium text-slate-700">${this.escape(this.getRelatedPerson(row))}</td>
                <td class="font-medium text-slate-700">${this.escape(row.status_cause || row.summary || row.status || '-')}</td>
                <td class="font-medium text-slate-600">${this.escape(this.getUpdatedAt(row))}</td>
                <td class="font-medium text-slate-600">${this.escape(this.getNote(row))}</td>
            </tr>
        `;
    },

    updateSummary() {
        const counts = {
            survey: 0,
            registration: 0,
            academic: 0,
            admin: 0
        };

        this.rows.forEach(row => {
            if (counts[row._sourceDept] !== undefined) counts[row._sourceDept] += 1;
        });

        this.setText('total-count', this.rows.length.toLocaleString());
        this.setText('survey-count', counts.survey.toLocaleString());
        this.setText('registration-count', counts.registration.toLocaleString());
        this.setText('academic-count', counts.academic.toLocaleString());
        this.setText('admin-count', counts.admin.toLocaleString());
    },

    updateDeptLabel() {
        const deptLabel = document.getElementById('dept-label');
        if (!deptLabel) return;
        deptLabel.textContent = this.selectedDept === 'all' ? 'ทุกฝ่าย' : this.departments[this.selectedDept]?.label || 'ทุกฝ่าย';
    },

    updateScopeText() {
        const description = document.getElementById('scope-description');
        const badge = document.getElementById('scope-badge');
        const title = document.getElementById('report-title');

        if (description) {
            description.textContent = this.scope === 'dashboard'
                ? 'แสดงงานสุดขั้นตอนทั้งหมดตามตัวเลขบน Dashboard'
                : 'แสดงเฉพาะงานสุดขั้นตอนที่รับเรื่องตั้งแต่วันที่ 1 มกราคม 2569 เป็นต้นไป';
        }

        if (badge) {
            badge.innerHTML = this.scope === 'dashboard'
                ? '<i class="fas fa-chart-pie"></i> all dashboard records'
                : '<i class="fas fa-calendar-day"></i> received_date >= 2026-01-01';
        }

        if (title) {
            title.textContent = this.scope === 'dashboard'
                ? 'บัญชีรายละเอียดงานสุดขั้นตอนทั้งหมด'
                : 'บัญชีรายละเอียดงานสุดขั้นตอน';
        }
    },

    setLoading(isLoading) {
        const loadingState = document.getElementById('loading-state');
        const tableWrap = document.getElementById('table-wrap');
        const emptyState = document.getElementById('empty-state');
        const exportBtn = document.getElementById('export-btn');

        if (loadingState) loadingState.classList.toggle('hidden', !isLoading);
        if (tableWrap && isLoading) tableWrap.classList.add('hidden');
        if (emptyState && isLoading) emptyState.classList.add('hidden');
        if (exportBtn) exportBtn.disabled = isLoading;
    },

    setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    },

    getSubject(row) {
        return row.subject || row.survey_type || row.title || row.work_subject || '-';
    },

    getRelatedPerson(row) {
        return row.related_person || row.related_preson || row.applicant || row.applicant_name || row.sender_name || row.owner_name || '-';
    },

    getUpdatedAt(row) {
        return row.updated_at || row.update_at || row.modified_at || row.completion_date || '-';
    },

    getNote(row) {
        return row.note || row.notes || row.remark || row.remarks || '-';
    },

    parseDate(value) {
        if (!value) return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

        const text = String(value).slice(0, 10);
        const parts = text.split('-').map(Number);
        if (parts.length === 3 && parts.every(Boolean)) {
            return new Date(parts[0], parts[1] - 1, parts[2]);
        }

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    },

    getDateValue(value) {
        const date = this.parseDate(value);
        return date ? date.getTime() : 0;
    },

    escape(value) {
        return String(value ?? '-')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    exportExcel() {
        if (!window.XLSX) {
            Swal.fire({
                icon: 'error',
                title: 'ไม่พบระบบ Export',
                text: 'ไม่สามารถโหลดไลบรารี Excel ได้',
                confirmButtonColor: '#7c3aed'
            });
            return;
        }

        const rows = this.filteredRows.length ? this.filteredRows : this.rows;
        if (!rows.length) {
            Swal.fire({
                icon: 'info',
                title: 'ไม่มีข้อมูลสำหรับ Export',
                confirmButtonColor: '#7c3aed'
            });
            return;
        }

        const titleScope = this.scope === 'dashboard' ? 'ข้อมูลทั้งหมดตามตัวเลข Dashboard' : 'ข้อมูลตั้งแต่วันที่ 1 ม.ค. 2569';
        const title = `บัญชีรายละเอียดงานสุดขั้นตอน/งานศาล ตามแผนปฏิบัติการ (Action Plan) มาตรฐานกลาง เพื่อการบริหารจัดการงานค้างและงานเกิดใหม่ พ.ศ. 2569 (${titleScope}) (งานเกิดใหม่)`;
        const aoa = [
            [title],
            ['(ชื่อสำนัก/กอง/สำนักงาน)'],
            ['ภารกิจ*', 'ที่', 'วันที่รับเรื่อง', 'เรื่อง', 'ประเภทงาน (งานศาล/งานสุดขั้นตอน)', 'ผู้ที่เกี่ยวข้อง (คู่กรณี)', 'ความสำคัญของเรื่อง (โดยสรุป)', 'การดำเนินการ (วันที่ดำเนินการ)', 'หมายเหตุ']
        ];

        rows.forEach((row, index) => {
            aoa.push([
                row._departmentLabel,
                index + 1,
                row.received_date || '',
                this.getSubject(row),
                'งานสุดขั้นตอน',
                this.getRelatedPerson(row),
                row.status_cause || row.summary || row.status || '',
                this.getUpdatedAt(row) === '-' ? '' : this.getUpdatedAt(row),
                this.getNote(row) === '-' ? '' : this.getNote(row)
            ]);
        });

        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        worksheet['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }
        ];
        worksheet['!cols'] = [
            { wch: 22 },
            { wch: 8 },
            { wch: 16 },
            { wch: 34 },
            { wch: 34 },
            { wch: 38 },
            { wch: 46 },
            { wch: 30 },
            { wch: 34 }
        ];

        const range = XLSX.utils.decode_range(worksheet['!ref']);
        for (let r = range.s.r; r <= range.e.r; r += 1) {
            for (let c = range.s.c; c <= range.e.c; c += 1) {
                const cellAddress = XLSX.utils.encode_cell({ r, c });
                if (!worksheet[cellAddress]) continue;

                worksheet[cellAddress].s = {
                    font: { name: 'TH Sarabun New', sz: r < 2 ? 16 : 14, bold: r <= 2 },
                    alignment: { vertical: 'center', horizontal: r < 2 ? 'center' : 'left', wrapText: true },
                    border: {
                        top: { style: 'thin', color: { rgb: '000000' } },
                        bottom: { style: 'thin', color: { rgb: '000000' } },
                        left: { style: 'thin', color: { rgb: '000000' } },
                        right: { style: 'thin', color: { rgb: '000000' } }
                    }
                };

                if (r === 0 || r === 1) {
                    worksheet[cellAddress].s.fill = { fgColor: { rgb: 'BDD7EE' } };
                } else if (r === 2) {
                    worksheet[cellAddress].s.fill = { fgColor: { rgb: 'F8FAFC' } };
                }
            }
        }

        worksheet['!rows'] = [
            { hpt: 28 },
            { hpt: 22 },
            { hpt: 34 },
            ...rows.map(() => ({ hpt: 24 }))
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Action Plan Details');
        const date = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `งานสุดขั้นตอน_${date}.xlsx`);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.finalStepReport.init();
});
