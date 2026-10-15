window.pendingReport = {
    rows: [],
    filteredRows: [],
    monthlyCombinedSummary: [],
    user: null,
    selectedDept: 'all',
    selectedMonth: 'all',
    workScope: 'all',
    progressFilter: 'all',
    searchTerm: '',
    sortKey: null,
    sortAsc: true,
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
        const requestedMonth = params.get('month') || 'all';
        const requestedScope = params.get('scope') || 'all';
        this.selectedMonth = requestedMonth;
        this.workScope = ['all', 'new', 'old'].includes(requestedScope) ? requestedScope : 'all';
        this.selectedDept = allowedDept.includes(requestedDept) ? requestedDept : 'all';

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
        const scopeFilter = document.getElementById('scope-filter');
        const monthFilter = document.getElementById('month-filter');

        if (scopeFilter) {
            scopeFilter.value = this.workScope;
            scopeFilter.addEventListener('change', () => {
                this.workScope = scopeFilter.value;
                this.applyFilters();
            });
        }

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

        if (monthFilter) {
            monthFilter.value = this.selectedMonth;
            monthFilter.addEventListener('change', () => {
                this.selectedMonth = monthFilter.value;
                this.reload();
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
            const [surveyItems, registrationItems, academicItems, adminItems, summaryRes] = await Promise.all([
                DataManager.getSurveyItems(),
                DataManager.getRegistrationItems(),
                DataManager.getAcademicItems(),
                DataManager.getAdminItems(),
                fetch('api/combined_pending_report.php').then(r => r.json()).catch(err => {
                    console.warn('Failed to load combined pending summary API:', err);
                    return null;
                })
            ]);

            if (summaryRes && summaryRes.status === 'success') {
                this.monthlyCombinedSummary = summaryRes.months || [];
            }

            this.rows = [
                ...this.normalizeDepartmentItems(surveyItems, 'survey'),
                ...this.normalizeDepartmentItems(registrationItems, 'registration'),
                ...this.normalizeDepartmentItems(academicItems, 'academic'),
                ...this.normalizeDepartmentItems(adminItems, 'admin')
            ].filter(row => this.isReportItem(row))
                .sort((a, b) => this.compareRows(a, b));

            this.updateMonthFilterOptions();
            this.applyFilters();
        } catch (error) {
            console.error('Load pending report error:', error);
            Swal.fire({
                icon: 'error',
                title: 'โหลดข้อมูลไม่สำเร็จ',
                text: 'ไม่สามารถโหลดรายงานงานค้างทั้งหมดได้ กรุณาลองใหม่อีกครั้ง',
                confirmButtonColor: '#e11d48'
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

    isReportItem(row) {
        const isOldWork = row.received_date < '2026-01-01';
        const nowStr = new Date().toISOString().substring(0, 10);

        if (row.status_cause && row.status_cause.includes('ถอนจ่าย')) {
            return false;
        }

        if (this.selectedMonth !== 'all') {
            const [y, m] = this.selectedMonth.split('-').map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            const endDate = `${this.selectedMonth}-${String(lastDay).padStart(2, '0')}`;

            const cd = row.completion_date;
            if (cd && cd !== '0000-00-00' && cd !== '0000-00-00 00:00:00' && cd <= endDate) {
                return false;
            }

            if (isOldWork) {
                return true;
            } else {
                if (row._sourceDept === 'survey') {
                    return !!(row.survey_date && row.survey_date !== '0000-00-00' && row.survey_date <= endDate);
                } else {
                    return row.received_date >= '2026-01-01' && row.received_date <= endDate;
                }
            }
        } else {
            if (!DataManager.isPending(row)) return false;

            if (isOldWork) {
                return true;
            } else {
                if (row._sourceDept === 'survey') {
                    return !!(row.survey_date && row.survey_date !== '0000-00-00' && row.survey_date <= nowStr);
                } else {
                    return row.received_date >= '2026-01-01' && row.received_date <= nowStr;
                }
            }
        }
    },

    compareRows(a, b) {
        const deptOrder = { survey: 1, registration: 2, academic: 3, admin: 4 };
        const deptDiff = (deptOrder[a._sourceDept] || 99) - (deptOrder[b._sourceDept] || 99);
        if (deptDiff !== 0) return deptDiff;

        const categoryOrder = { over30: 1, over60: 2, final: 3, court: 4, other: 5 };
        const categoryDiff = categoryOrder[this.getCategoryKey(a)] - categoryOrder[this.getCategoryKey(b)];
        if (categoryDiff !== 0) return categoryDiff;

        return this.getDateValue(b.received_date) - this.getDateValue(a.received_date);
    },

    setProgressFilter(filter) {
        this.progressFilter = filter || 'all';
        this.updateProgressTabsUI();
        this.applyFilters();
    },

    setScopeFilter(scope) {
        const scopeFilter = document.getElementById('scope-filter');
        this.workScope = scope || 'all';
        if (scopeFilter) scopeFilter.value = this.workScope;
        this.applyFilters();
    },

    updateProgressTabsUI() {
        const tabs = ['all', 'backlog', 'type2', 'type3'];
        const activeStyles = {
            all: 'bg-white text-violet-700 shadow-sm border border-slate-200 font-black',
            backlog: 'bg-white text-amber-700 shadow-sm border border-amber-200 font-black',
            type2: 'bg-purple-600 text-white shadow-sm border border-purple-600 font-black',
            type3: 'bg-rose-600 text-white shadow-sm border border-rose-600 font-black'
        };

        const inactiveStyles = {
            all: 'text-slate-600 hover:text-slate-900 hover:bg-white/50 font-bold',
            backlog: 'text-slate-600 hover:text-amber-700 hover:bg-amber-50/50 font-bold',
            type2: 'text-slate-600 hover:text-purple-700 hover:bg-purple-50/50 font-bold',
            type3: 'text-slate-600 hover:text-rose-700 hover:bg-rose-50/50 font-bold'
        };

        tabs.forEach(tab => {
            const btn = document.getElementById(`tab-progress-${tab}`);
            if (!btn) return;
            const baseClass = 'progress-tab-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all';
            if (this.progressFilter === tab) {
                btn.className = `${baseClass} ${activeStyles[tab]}`;
            } else {
                btn.className = `${baseClass} ${inactiveStyles[tab]}`;
            }
        });
    },

    sortBy(key) {
        if (this.sortKey === key) {
            this.sortAsc = !this.sortAsc;
        } else {
            this.sortKey = key;
            this.sortAsc = !(key === 'age' || key === 'received_date');
        }
        this.updateTableHeaderSortIcons();
        this.applyFilters();
    },

    updateTableHeaderSortIcons() {
        const columns = ['dept', 'received_date', 'subject', 'progress', 'age', 'related_person', 'status', 'updated_at', 'note'];
        columns.forEach(col => {
            const icon = document.getElementById(`sort-icon-${col}`);
            if (!icon) return;
            if (this.sortKey === col) {
                icon.className = this.sortAsc
                    ? 'fas fa-sort-up text-violet-600 text-xs font-bold'
                    : 'fas fa-sort-down text-violet-600 text-xs font-bold';
            } else {
                icon.className = 'fas fa-sort text-slate-400 text-xs';
            }
        });
    },

    sortRows(rows) {
        if (!this.sortKey) {
            return rows.sort((a, b) => this.compareRows(a, b));
        }
        const key = this.sortKey;
        const asc = this.sortAsc ? 1 : -1;

        return rows.sort((a, b) => {
            let valA, valB;
            switch (key) {
                case 'dept':
                    valA = a._departmentLabel || '';
                    valB = b._departmentLabel || '';
                    return valA.localeCompare(valB, 'th') * asc;
                case 'received_date':
                    valA = this.getDateValue(a.received_date);
                    valB = this.getDateValue(b.received_date);
                    return (valA - valB) * asc;
                case 'subject':
                    valA = this.getSubject(a) || '';
                    valB = this.getSubject(b) || '';
                    return valA.localeCompare(valB, 'th') * asc;
                case 'progress':
                    valA = parseInt(a.progress_type, 10) || 0;
                    valB = parseInt(b.progress_type, 10) || 0;
                    return (valA - valB) * asc;
                case 'age':
                    valA = this.getAgeDays(a) ?? -1;
                    valB = this.getAgeDays(b) ?? -1;
                    return (valA - valB) * asc;
                case 'related_person':
                    valA = this.getRelatedPerson(a) || '';
                    valB = this.getRelatedPerson(b) || '';
                    return valA.localeCompare(valB, 'th') * asc;
                case 'status':
                    valA = a.status_cause || a.summary || a.status || '';
                    valB = b.status_cause || b.summary || b.status || '';
                    return valA.localeCompare(valB, 'th') * asc;
                case 'updated_at':
                    valA = this.getUpdatedAt(a) || '';
                    valB = this.getUpdatedAt(b) || '';
                    return valA.localeCompare(valB, 'th') * asc;
                case 'note':
                    valA = this.getNote(a) || '';
                    valB = this.getNote(b) || '';
                    return valA.localeCompare(valB, 'th') * asc;
                default:
                    return 0;
            }
        });
    },

    applyFilters() {
        const visibleRows = this.rows.filter(row => {
            if (this.selectedDept !== 'all' && row._sourceDept !== this.selectedDept) return false;

            const isOldWork = row.received_date < '2026-01-01';
            if (this.workScope === 'new' && isOldWork) return false;
            if (this.workScope === 'old' && !isOldWork) return false;

            const progressType = parseInt(row.progress_type, 10);
            if (this.progressFilter === 'backlog' && (progressType === 2 || progressType === 3)) return false;
            if (this.progressFilter === 'type2' && progressType !== 2) return false;
            if (this.progressFilter === 'type3' && progressType !== 3) return false;

            if (!this.searchTerm) return true;

            const searchableText = [
                row._departmentLabel,
                row.received_date,
                this.getSubject(row),
                this.getProgressLabel(row.progress_type),
                this.getAgeBucketLabel ? this.getAgeBucketLabel(row) : '',
                this.getRelatedPerson(row),
                row.status_cause,
                row.updated_at,
                row.update_at,
                this.getNote(row)
            ].join(' ').toLowerCase();

            return searchableText.includes(this.searchTerm);
        });

        this.filteredRows = this.sortRows(visibleRows);
        this.render();
    },

    render() {
        this.setLoading(false);
        this.renderMonthlySummaryTable();
        this.updateSummary();
        this.updateDeptLabel();
        this.updateScopeText();
        this.renderTable();
    },

    renderMonthlySummaryTable() {
        const container = document.getElementById('summary-table-container');
        const titleEl = document.getElementById('summary-month-title');
        if (!container) return;

        const months = this.monthlyCombinedSummary || [];
        if (months.length === 0) {
            container.innerHTML = `<div class="p-6 text-center text-slate-400 font-bold">ไม่พบข้อมูลสรุปรายงานค้างรวม</div>`;
            return;
        }

        let selectedMonthData = null;
        if (this.selectedMonth !== 'all') {
            selectedMonthData = months.find(m => m.month === this.selectedMonth);
        }

        const displayData = selectedMonthData || months[months.length - 1];

        if (titleEl && displayData) {
            titleEl.textContent = `ข้อมูลสรุปยอดคงเหลือประจำเดือน${displayData.month_label} (เปรียบเทียบยอดค้างเก่าก่อนปี 2569 และยอดค้างใหม่ปี 2569)`;
        }

        if (!displayData) {
            container.innerHTML = `<div class="p-6 text-center text-slate-400 font-bold">ไม่พบข้อมูลสรุปในเดือนที่เลือก</div>`;
            return;
        }

        const deptsOrder = ['survey', 'registration', 'academic', 'admin'];
        const deptNames = {
            survey: 'ฝ่ายรังวัด',
            registration: 'ฝ่ายทะเบียน',
            academic: 'กลุ่มงานวิชาการที่ดิน',
            admin: 'ฝ่ายอำนวยการ'
        };

        const deptIcons = {
            survey: 'fa-drafting-compass text-amber-500',
            registration: 'fa-file-signature text-sky-500',
            academic: 'fa-graduation-cap text-fuchsia-500',
            admin: 'fa-layer-group text-teal-500'
        };

        let rowsHtml = '';
        deptsOrder.forEach(deptKey => {
            const d = displayData.depts[deptKey] || { old_pending: 0, new_pending: 0, total_pending: 0 };
            const oldP = d.old_pending || 0;
            const newP = d.new_pending || 0;
            const totalP = d.total_pending || 0;

            const isSelected = this.selectedDept === 'all' || this.selectedDept === deptKey;
            const rowStyle = isSelected ? 'bg-white font-semibold' : 'bg-slate-50/50 opacity-60';

            rowsHtml += `
                <tr class="hover:bg-slate-100/80 transition-colors ${rowStyle}">
                    <td class="px-4 py-3 border-b font-bold text-slate-800">
                        <div class="flex items-center gap-2">
                            <i class="fas ${deptIcons[deptKey]} w-4 text-center"></i>
                            <span>${deptNames[deptKey]}</span>
                            ${this.selectedDept === deptKey ? '<span class="ml-1 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-black">กำลังเลือก</span>' : ''}
                        </div>
                    </td>
                    <!-- งานค้างเก่า -->
                    <td class="px-4 py-3 border-b text-center font-bold text-amber-700 bg-amber-50/40">
                        ${oldP.toLocaleString()}
                    </td>
                    <!-- งานค้างใหม่ -->
                    <td class="px-4 py-3 border-b text-center font-bold text-emerald-700 bg-emerald-50/40">
                        ${newP.toLocaleString()}
                    </td>
                    <!-- รวมงานค้างคงเหลือทั้งสิ้น -->
                    <td class="px-4 py-3 border-b text-center font-black text-violet-800 bg-violet-50/60 text-base">
                        ${totalP.toLocaleString()}
                    </td>
                    <td class="px-4 py-3 border-b text-center text-xs">
                        <button onclick="pendingReport.filterByDeptSummary('${deptKey}')" 
                                class="inline-flex items-center gap-1 px-2.5 py-1 rounded border ${this.selectedDept === deptKey ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 bg-white hover:bg-violet-50 text-slate-700 hover:text-violet-700'} font-bold transition shadow-sm">
                            <i class="fas fa-filter text-[10px]"></i> ${this.selectedDept === deptKey ? 'เลือกแล้ว' : 'กรองฝ่าย'}
                        </button>
                    </td>
                </tr>
            `;
        });

        const totals = displayData.totals || { old_pending: 0, new_pending: 0, total_pending: 0 };
        const isAllSelected = this.selectedDept === 'all';

        const summaryHtml = `
            <table class="w-full text-sm border-collapse rounded-lg overflow-hidden border border-slate-200">
                <thead>
                    <tr class="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                        <th class="px-4 py-3 text-left w-64">ฝ่าย / หน่วยงาน</th>
                        <th class="px-4 py-3 text-center w-48 text-amber-800 bg-amber-100/50">
                            <i class="fas fa-history mr-1"></i> ยอดงานค้างเก่าคงเหลือ
                        </th>
                        <th class="px-4 py-3 text-center w-48 text-emerald-800 bg-emerald-100/50">
                            <i class="fas fa-sparkles mr-1"></i> ยอดงานค้างใหม่คงเหลือ
                        </th>
                        <th class="px-4 py-3 text-center w-56 text-violet-900 bg-violet-100/70">
                            <i class="fas fa-calculator mr-1"></i> รวมงานค้างคงเหลือทั้งสิ้น
                        </th>
                        <th class="px-4 py-3 text-center w-36">การจัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    <!-- Row รวมทุกฝ่าย -->
                    <tr class="bg-slate-200/80 font-black text-slate-900 border-t-2 border-slate-300">
                        <td class="px-4 py-3.5 text-left font-black text-slate-900">รวมทุกฝ่าย</td>
                        <td class="px-4 py-3.5 text-center text-amber-900 text-base">${totals.old_pending.toLocaleString()}</td>
                        <td class="px-4 py-3.5 text-center text-emerald-900 text-base">${totals.new_pending.toLocaleString()}</td>
                        <td class="px-4 py-3.5 text-center text-violet-950 text-lg bg-violet-200/80 shadow-inner">
                            ${totals.total_pending.toLocaleString()}
                        </td>
                        <td class="px-4 py-3.5 text-center">
                            <button onclick="pendingReport.filterByDeptSummary('all')" 
                                    class="inline-flex items-center gap-1 px-3 py-1 rounded ${isAllSelected ? 'bg-slate-700 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white'} font-bold text-xs transition shadow-sm">
                                ${isAllSelected ? 'แสดงทั้งหมดอยู่' : 'แสดงทั้งหมด'}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        `;

        container.innerHTML = summaryHtml;
    },

    filterByDeptSummary(dept) {
        const deptFilter = document.getElementById('dept-filter');
        this.selectedDept = dept;
        if (deptFilter) deptFilter.value = dept;
        this.applyFilters();
    },

    renderTable() {
        const tbody = document.getElementById('report-tbody');
        const tableWrap = document.getElementById('table-wrap');
        const emptyState = document.getElementById('empty-state');
        const resultSummary = document.getElementById('result-summary');

        if (!tbody || !tableWrap || !emptyState) return;

        if (resultSummary) {
            const shownCount = (this.progressFilter === 'all' && !this.searchTerm) ? (this.currentTotalDisplay || this.filteredRows.length) : this.filteredRows.length;
            const totalCount = this.currentGrandTotalDisplay || this.rows.length;
            resultSummary.textContent = `แสดง ${shownCount.toLocaleString()} รายการ จากทั้งหมด ${totalCount.toLocaleString()} รายการ (งานค้างใหม่ ${this.currentNewDisplay.toLocaleString()} / งานค้างเก่า ${this.currentOldDisplay.toLocaleString()})`;
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
        const ageDays = this.getAgeDays(row);
        const ageClass = ageDays > 60
            ? 'bg-rose-50 text-rose-700'
            : ageDays > 30
                ? 'bg-amber-50 text-amber-700'
                : 'bg-emerald-50 text-emerald-700';

        let dateCell = this.escape(row.received_date || '-');
        if (row._sourceDept === 'survey' && row.survey_date && row.survey_date !== '0000-00-00') {
            dateCell += `<br><span class="text-[11px] text-emerald-700 font-bold">นัด: ${this.escape(row.survey_date)}</span>`;
        }

        const isOldWork = row.received_date < '2026-01-01';
        const workTypeTag = isOldWork
            ? `<span class="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-extrabold text-amber-800"><i class="fas fa-history text-[10px]"></i> งานเก่า (ก่อนปี 69)</span>`
            : `<span class="mt-1 inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800"><i class="fas fa-sparkles text-[10px]"></i> งานใหม่ (ปี 69)</span>`;

        return `
            <tr class="bg-white">
                <td>
                    <div class="flex flex-col items-start gap-1">
                        <span class="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-extrabold ${badgeClass}">
                            <i class="fas ${icon}"></i>
                            ${this.escape(row._departmentLabel)}
                        </span>
                        ${workTypeTag}
                    </div>
                </td>
                <td class="text-center font-black text-slate-600">${index + 1}</td>
                <td class="font-bold text-slate-700">${dateCell}</td>
                <td class="font-bold text-slate-900">${this.escape(this.getSubject(row))}</td>
                <td>
                    <span class="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-slate-700">
                        <i class="fas ${this.getProgressIcon(row.progress_type)}"></i>
                        ${this.escape(this.getProgressLabel(row.progress_type))}
                    </span>
                </td>
                <td class="text-center">
                    <span class="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-extrabold ${ageClass}">
                        ${ageDays === null ? '-' : `${ageDays.toLocaleString()} วัน`}
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
        const months = this.monthlyCombinedSummary || [];
        let selectedMonthData = null;
        if (this.selectedMonth !== 'all') {
            selectedMonthData = months.find(m => m.month === this.selectedMonth);
        }
        const displayData = selectedMonthData || months[months.length - 1];

        // 1. Calculate raw row counts from baseFiltered (for search/tabs and fallback)
        let countAll = 0;
        let countBacklog = 0;
        let countType2 = 0;
        let countType3 = 0;
        let countNew = 0;
        let countOld = 0;
        let over30Count = 0;
        let over60Count = 0;

        const baseFiltered = this.rows.filter(row => {
            if (this.selectedDept !== 'all' && row._sourceDept !== this.selectedDept) return false;
            const isOldWork = row.received_date < '2026-01-01';
            if (this.workScope === 'new' && isOldWork) return false;
            if (this.workScope === 'old' && !isOldWork) return false;
            if (this.searchTerm) {
                const searchableText = [
                    row._departmentLabel,
                    row.received_date,
                    this.getSubject(row),
                    this.getProgressLabel(row.progress_type),
                    this.getAgeBucketLabel ? this.getAgeBucketLabel(row) : '',
                    this.getRelatedPerson(row),
                    row.status_cause,
                    row.updated_at,
                    row.update_at,
                    this.getNote(row)
                ].join(' ').toLowerCase();
                if (!searchableText.includes(this.searchTerm)) return false;
            }
            return true;
        });

        baseFiltered.forEach(row => {
            countAll += 1;
            const isOldWork = row.received_date < '2026-01-01';
            if (isOldWork) countOld += 1;
            else countNew += 1;

            const pt = parseInt(row.progress_type, 10);
            if (pt === 2) countType2 += 1;
            else if (pt === 3) countType3 += 1;
            else countBacklog += 1;

            const ageDays = this.getAgeDays(row);
            if (pt !== 2 && pt !== 3) {
                if (ageDays !== null && ageDays > 60) over60Count += 1;
                else if (ageDays !== null && ageDays > 30) over30Count += 1;
            }
        });

        // 2. Determine display numbers for KPI Cards matching the middle summary table
        let totalDisplay = 0;
        let newDisplay = 0;
        let oldDisplay = 0;
        let type2Display = countType2;
        let type3Display = countType3;

        if (displayData && !this.searchTerm) {
            let deptData = null;
            if (this.selectedDept === 'all') {
                deptData = displayData.totals || {};
            } else {
                deptData = displayData.depts[this.selectedDept] || {};
            }

            const officialOld = deptData.old_pending || 0;
            const officialNew = deptData.new_pending || 0;
            const officialTotal = deptData.total_pending !== undefined ? deptData.total_pending : (officialOld + officialNew);

            if (this.workScope === 'new') {
                totalDisplay = officialNew;
                newDisplay = officialNew;
                oldDisplay = 0;
            } else if (this.workScope === 'old') {
                totalDisplay = officialOld;
                newDisplay = 0;
                oldDisplay = officialOld;
            } else {
                totalDisplay = officialTotal;
                newDisplay = officialNew;
                oldDisplay = officialOld;
            }

            if (deptData.type2_total !== undefined) type2Display = deptData.type2_total;
            else if (deptData.final_step !== undefined) type2Display = deptData.final_step;

            if (deptData.type3_total !== undefined) type3Display = deptData.type3_total;
            else if (deptData.court_work !== undefined) type3Display = deptData.court_work;
        } else {
            // Fallback when search term is active or displayData missing
            if (this.workScope === 'new') {
                totalDisplay = countNew;
                newDisplay = countNew;
                oldDisplay = 0;
            } else if (this.workScope === 'old') {
                totalDisplay = countOld;
                newDisplay = 0;
                oldDisplay = countOld;
            } else {
                totalDisplay = countAll;
                newDisplay = countNew;
                oldDisplay = countOld;
            }
        }

        this.currentTotalDisplay = totalDisplay;
        this.currentNewDisplay = newDisplay;
        this.currentOldDisplay = oldDisplay;
        this.currentGrandTotalDisplay = displayData ? (displayData.totals?.total_pending || 1035) : countAll;

        this.setText('total-count', totalDisplay.toLocaleString());
        this.setText('newwork-count', newDisplay.toLocaleString());
        this.setText('oldwork-count', oldDisplay.toLocaleString());
        this.setText('over30-count', over30Count.toLocaleString());
        this.setText('over60-count', over60Count.toLocaleString());
        this.setText('type2-count', type2Display.toLocaleString());
        this.setText('type3-count', type3Display.toLocaleString());

        // Tab Badges
        this.setText('tab-count-all', (this.workScope === 'new' ? newDisplay : (this.workScope === 'old' ? oldDisplay : totalDisplay)).toLocaleString());
        this.setText('tab-count-backlog', (this.workScope === 'new' ? newDisplay : (this.workScope === 'old' ? oldDisplay : totalDisplay) - type2Display - type3Display).toLocaleString());
        this.setText('tab-count-type2', type2Display.toLocaleString());
        this.setText('tab-count-type3', type3Display.toLocaleString());
    },

    updateDeptLabel() {
        const deptLabel = document.getElementById('dept-label');
        if (!deptLabel) return;
        deptLabel.textContent = this.selectedDept === 'all' ? 'ทุกฝ่าย' : this.departments[this.selectedDept]?.label || 'ทุกฝ่าย';
    },

    getItemYearMonth(row) {
        const dateStr = row.received_date;
        if (!dateStr || dateStr.length < 7) return 'before2026';
        const ym = dateStr.substring(0, 7);
        if (ym < '2026-01') return 'before2026';
        return ym;
    },

    formatMonthYearLabel(ym) {
        if (ym === 'all') return 'ทุกเดือน (รวมทั้งหมด)';
        if (ym === 'before2026') return 'งานก่อนปี 2569 (2025)';
        const parts = ym.split('-');
        if (parts.length !== 2) return ym;
        const yearStr = parts[0];
        const monthStr = parts[1];
        const monthNames = {
            '01': 'มกราคม', '02': 'กุมภาพันธ์', '03': 'มีนาคม', '04': 'เมษายน',
            '05': 'พฤษภาคม', '06': 'มิถุนายน', '07': 'กรกฎาคม', '08': 'สิงหาคม',
            '09': 'กันยายน', '10': 'ตุลาคม', '11': 'พฤศจิกายน', '12': 'ธันวาคม'
        };
        const yearBE = parseInt(yearStr, 10) + 543;
        return `${monthNames[monthStr] || monthStr} ${yearBE}`;
    },

    updateMonthFilterOptions() {
        const monthFilter = document.getElementById('month-filter');
        if (!monthFilter) return;

        let months = [];
        if (this.monthlyCombinedSummary && this.monthlyCombinedSummary.length > 0) {
            months = this.monthlyCombinedSummary.map(m => m.month).reverse();
        } else {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1;
            for (let y = currentYear; y >= 2026; y--) {
                const maxM = (y === currentYear) ? currentMonth : 12;
                for (let m = maxM; m >= 1; m--) {
                    months.push(`${y}-${String(m).padStart(2, '0')}`);
                }
            }
        }

        let html = '<option value="all">ข้อมูลปัจจุบัน (ล่าสุด)</option>';
        months.forEach(ym => {
            html += `<option value="${ym}">ประจำเดือน ${this.formatMonthYearLabel(ym)}</option>`;
        });

        monthFilter.innerHTML = html;
        if (Array.from(monthFilter.options).some(opt => opt.value === this.selectedMonth)) {
            monthFilter.value = this.selectedMonth;
        } else {
            monthFilter.value = 'all';
            this.selectedMonth = 'all';
        }
    },

    updateScopeText() {
        const description = document.getElementById('scope-description');
        const badge = document.getElementById('scope-badge');
        const title = document.getElementById('report-title');

        if (description) {
            const scopeNames = { all: 'งานค้างทั้งหมด (ใหม่+เก่า)', new: 'เฉพาะงานค้างใหม่ (ปี 2569)', old: 'เฉพาะงานค้างเก่า (ก่อนปี 2569)' };
            const monthLabel = this.selectedMonth !== 'all' ? ` [ประจำเดือน ${this.formatMonthYearLabel(this.selectedMonth)}]` : '';
            description.textContent = `แสดง${scopeNames[this.workScope] || 'งานค้าง'}${monthLabel}`;
        }

        if (badge) {
            const badgeTexts = { all: 'งานค้างรวม (ใหม่+เก่า)', new: 'งานค้างใหม่ (ปี 2569)', old: 'งานค้างเก่า (ก่อนปี 2569)' };
            badge.innerHTML = `<i class="fas fa-list-check"></i> ${badgeTexts[this.workScope] || 'งานค้าง'}`;
        }

        if (title) {
            const titleTexts = { all: 'บัญชีรายละเอียดงานค้างทั้งหมด', new: 'บัญชีรายละเอียดงานค้างใหม่ (ปี 2569)', old: 'บัญชีรายละเอียดงานค้างเก่า (ก่อนปี 2569)' };
            title.textContent = titleTexts[this.workScope] || 'บัญชีรายละเอียดงานค้าง';
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

    getProgressLabel(progressType) {
        const labels = {
            2: 'งานสุดขั้นตอน',
            3: 'งานศาล',
            4: 'งานค้าง'
        };
        return labels[parseInt(progressType, 10)] || 'งานปกติ/อื่นๆ';
    },

    getProgressIcon(progressType) {
        const icons = {
            2: 'fa-flag-checkered',
            3: 'fa-gavel',
            4: 'fa-clock'
        };
        return icons[parseInt(progressType, 10)] || 'fa-clipboard-list';
    },

    getCategoryKey(row) {
        const progressType = parseInt(row.progress_type, 10);
        const ageDays = this.getAgeDays(row);

        if (progressType === 2) return 'final';
        if (progressType === 3) return 'court';
        if (ageDays !== null && ageDays > 60) return 'over60';
        if (ageDays !== null && ageDays > 30) return 'over30';
        return 'other';
    },

    getAgeDays(row) {
        let dateStr = row.received_date;
        const isSurvey = row._sourceDept === 'survey' || row.survey_type !== undefined || row.rv_12 !== undefined;
        if (isSurvey && row.received_date >= '2026-01-01' && row.survey_date && row.survey_date !== '0000-00-00') {
            dateStr = row.survey_date;
        }
        const startDate = this.parseDate(dateStr);
        if (!startDate) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startDate.setHours(0, 0, 0, 0);
        const days = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
        return days >= 0 ? days : null;
    },

    getAgeBucketLabel(row) {
        const ageDays = this.getAgeDays(row);
        if (ageDays === null) return 'ไม่ทราบอายุงาน';
        if (ageDays > 60) return 'ค้างเกิน 60 วัน';
        return 'ค้าง 31-60 วัน';
    },

    parseDate(value) {
        if (!value) return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

        if (typeof DataManager !== 'undefined' && DataManager.getSafeDate) {
            const safeDate = DataManager.getSafeDate(value);
            if (safeDate) return safeDate;
        }

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

        const workbook = XLSX.utils.book_new();

        // Sheet 1: Summary Sheet
        if (this.monthlyCombinedSummary && this.monthlyCombinedSummary.length > 0) {
            const selectedMonthData = this.selectedMonth !== 'all' 
                ? this.monthlyCombinedSummary.find(m => m.month === this.selectedMonth)
                : this.monthlyCombinedSummary[this.monthlyCombinedSummary.length - 1];

            const summaryTitle = `สรุปปริมาณงานค้างคงเหลือรวมประจำเดือน ${selectedMonthData ? selectedMonthData.month_label : ''} (งานค้างเก่า + งานค้างใหม่)`;
            const summaryAoa = [
                [summaryTitle],
                [],
                ['ฝ่าย / หน่วยงาน', 'ยอดงานค้างเก่าคงเหลือ (ก่อนปี 69)', 'ยอดงานค้างใหม่คงเหลือ (ปี 69)', 'รวมงานค้างคงเหลือทั้งสิ้น']
            ];

            const deptsOrder = ['survey', 'registration', 'academic', 'admin'];
            const deptNames = { survey: 'ฝ่ายรังวัด', registration: 'ฝ่ายทะเบียน', academic: 'กลุ่มงานวิชาการที่ดิน', admin: 'ฝ่ายอำนวยการ' };

            if (selectedMonthData && selectedMonthData.depts) {
                deptsOrder.forEach(deptKey => {
                    const d = selectedMonthData.depts[deptKey] || {};
                    summaryAoa.push([
                        deptNames[deptKey],
                        d.old_pending || 0,
                        d.new_pending || 0,
                        d.total_pending || 0
                    ]);
                });

                const totals = selectedMonthData.totals || {};
                summaryAoa.push([
                    'รวมทุกฝ่าย',
                    totals.old_pending || 0,
                    totals.new_pending || 0,
                    totals.total_pending || 0
                ]);
            }

            const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa);
            summaryWs['!cols'] = [{ wch: 28 }, { wch: 32 }, { wch: 32 }, { wch: 32 }];
            XLSX.utils.book_append_sheet(workbook, summaryWs, 'สรุปงานค้างรวม');
        }

        // Sheet 2: Details Sheet
        const rows = (this.filteredRows && this.filteredRows.length > 0) ? this.filteredRows : [];
        if (rows.length > 0) {
            let title = 'บัญชีรายละเอียดงานค้างทั้งหมด ตามแผนปฏิบัติการ (Action Plan) พ.ศ. 2569';
            if (this.workScope === 'new') title = 'บัญชีรายละเอียดงานค้างใหม่ (ปี 2569)';
            else if (this.workScope === 'old') title = 'บัญชีรายละเอียดงานค้างเก่า (ก่อนปี 2569)';

            const detailAoa = [
                [title],
                ['สำนักงานที่ดินจังหวัดอ่างทอง'],
                ['ภารกิจ*', 'ที่', 'วันที่รับเรื่อง', 'เรื่อง', 'ประเภทงาน', 'อายุงาน (วัน)', 'ผู้ที่เกี่ยวข้อง (คู่กรณี)', 'ความสำคัญของเรื่อง (โดยสรุป)', 'การดำเนินการ (วันที่ดำเนินการ)', 'หมายเหตุ']
            ];

            rows.forEach((row, index) => {
                detailAoa.push([
                    row._departmentLabel,
                    index + 1,
                    row.received_date || '',
                    this.getSubject(row),
                    this.getProgressLabel(row.progress_type),
                    this.getAgeDays(row) ?? '',
                    this.getRelatedPerson(row),
                    row.status_cause || row.summary || row.status || '',
                    this.getUpdatedAt(row) === '-' ? '' : this.getUpdatedAt(row),
                    this.getNote(row) === '-' ? '' : this.getNote(row)
                ]);
            });

            const detailWs = XLSX.utils.aoa_to_sheet(detailAoa);
            detailWs['!cols'] = [
                { wch: 22 }, { wch: 8 }, { wch: 16 }, { wch: 34 }, { wch: 22 },
                { wch: 14 }, { wch: 38 }, { wch: 46 }, { wch: 30 }, { wch: 34 }
            ];
            XLSX.utils.book_append_sheet(workbook, detailWs, 'รายละเอียดงานค้าง');
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่มีข้อมูลส่งออก',
                text: 'ไม่พบรายการข้อมูลตามเงื่อนไขที่เลือก',
                confirmButtonColor: '#7c3aed'
            });
            return;
        }

        const date = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `รายงานสรุปงานค้างรวม_สำนักงานที่ดิน_${date}.xlsx`);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.pendingReport.init();
});
