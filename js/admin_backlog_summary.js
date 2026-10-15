window.adminBacklogSummaryApp = {
    state: {
        user: null,
        report: null,
        reportYear: null,
        endMonth: null,
        isLoading: false,
        tableZoomIndex: 0
    },

    tableZoomLevels: [
        { key: 'compact', label: '90%' },
        { key: 'normal', label: '100%' },
        { key: 'expanded', label: '110%' }
    ],

    deptAccentMap: {
        amber: {
            badge: 'bg-amber-100 text-amber-800',
            title: 'text-amber-700',
            soft: 'bg-amber-50'
        },
        sky: {
            badge: 'bg-sky-100 text-sky-800',
            title: 'text-sky-700',
            soft: 'bg-sky-50'
        },
        rose: {
            badge: 'bg-rose-100 text-rose-800',
            title: 'text-rose-700',
            soft: 'bg-rose-50'
        }
    },

    init() {
        this.state.user = this.getCurrentUser();
        if (!this.isAdminUser(this.state.user)) {
            this.blockUnauthorized();
            return;
        }

        const now = new Date();
        this.state.reportYear = now.getFullYear();
        this.state.endMonth = now.getMonth() + 1;

        this.populateYearOptions();
        this.populateMonthOptions();
        this.bindEvents();
        this.updateTableZoom();
        this.loadReport();
    },

    getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem('dol_user') || 'null');
        } catch (error) {
            return null;
        }
    },

    isAdminUser(user) {
        return !!user && (user.role === 'superadmin' || user.role === 'admin');
    },

    async blockUnauthorized() {
        document.body.innerHTML = '';
        await Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์เข้าถึง',
            text: 'หน้านี้สำหรับผู้ดูแลระบบเท่านั้น',
            confirmButtonColor: '#0f766e'
        });
        window.location.href = 'index.html';
    },

    populateYearOptions() {
        const select = document.getElementById('report-year');
        if (!select) return;

        const currentYear = new Date().getFullYear();
        const startYear = 2026;
        const endYear = currentYear + 1;

        let options = '';
        for (let year = endYear; year >= startYear; year--) {
            const selected = year === this.state.reportYear ? 'selected' : '';
            options += `<option value="${year}" ${selected}>${year + 543}</option>`;
        }

        select.innerHTML = options;
    },

    populateMonthOptions() {
        const select = document.getElementById('report-end-month');
        if (!select) return;

        const months = [
            'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
            'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
            'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
        ];

        select.innerHTML = months.map((label, index) => {
            const month = index + 1;
            const selected = month === this.state.endMonth ? 'selected' : '';
            return `<option value="${month}" ${selected}>${label}</option>`;
        }).join('');
    },

    bindEvents() {
        document.getElementById('btn-refresh')?.addEventListener('click', () => {
            this.state.reportYear = parseInt(document.getElementById('report-year').value, 10);
            this.state.endMonth = parseInt(document.getElementById('report-end-month').value, 10);
            this.loadReport();
        });

        document.getElementById('btn-export-excel')?.addEventListener('click', () => this.exportExcel());
        document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.adjustTableZoom(-1));
        document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.adjustTableZoom(1));
    },

    setLoading(isLoading) {
        this.state.isLoading = isLoading;
        document.getElementById('loading-state')?.classList.toggle('hidden', !isLoading);
        const sections = document.getElementById('report-sections');
        if (sections) {
            sections.classList.toggle('opacity-40', isLoading);
        }
    },

    adjustTableZoom(direction) {
        const nextIndex = Math.max(
            0,
            Math.min(this.tableZoomLevels.length - 1, this.state.tableZoomIndex + direction)
        );

        if (nextIndex === this.state.tableZoomIndex) {
            return;
        }

        this.state.tableZoomIndex = nextIndex;
        this.updateTableZoom();
    },

    updateTableZoom() {
        const currentZoom = this.tableZoomLevels[this.state.tableZoomIndex] || this.tableZoomLevels[1];
        const sections = document.getElementById('report-sections');
        const zoomLabel = document.getElementById('table-zoom-label');
        const zoomOutButton = document.getElementById('btn-zoom-out');
        const zoomInButton = document.getElementById('btn-zoom-in');

        if (sections) {
            sections.classList.remove('zoom-compact', 'zoom-normal', 'zoom-expanded');
            sections.classList.add(`zoom-${currentZoom.key}`);
        }

        if (zoomLabel) {
            zoomLabel.textContent = currentZoom.label;
        }

        if (zoomOutButton) {
            zoomOutButton.disabled = this.state.tableZoomIndex === 0;
        }

        if (zoomInButton) {
            zoomInButton.disabled = this.state.tableZoomIndex === this.tableZoomLevels.length - 1;
        }
    },

    async loadReport() {
        this.setLoading(true);

        try {
            const url = `api/admin_backlog_summary.php?report_year=${this.state.reportYear}&end_month=${this.state.endMonth}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('ไม่สามารถโหลดรายงานได้');
            }

            const report = await response.json();
            if (report.error) {
                throw new Error(report.error);
            }

            this.state.report = report;
            this.render();
        } catch (error) {
            console.error(error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: error.message || 'ไม่สามารถโหลดรายงานได้',
                confirmButtonColor: '#0f766e'
            });
        } finally {
            this.setLoading(false);
        }
    },

    render() {
        if (!this.state.report) return;
        this.renderMeta();
        this.renderSummaryCards();
        this.renderSections();
        this.syncDepartmentOverviewCards();
        this.syncWorkbookTableLayout();
        this.updateTableZoom();
    },

    renderMeta() {
        const meta = this.state.report.meta || {};
        const baselineEl = document.getElementById('baseline-label');
        if (baselineEl) {
            baselineEl.textContent = meta.baseline_label || '-';
        }

        const metaEl = document.getElementById('report-meta');
        if (!metaEl) return;

        metaEl.classList.remove('hidden');
        metaEl.innerHTML = `
            <div class="glass-panel rounded-[2rem] p-5">
                <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p class="display-font text-xl font-semibold text-slate-900">สรุปรายงานปี ${meta.report_year_be || '-'}</p>
                        <p class="mt-1 text-sm text-slate-600">
                            คำนวณสะสมถึงเดือน ${this.getThaiMonthName(meta.end_month)} และอัปเดตข้อมูล ณ ${this.formatDateTime(meta.generated_at)}
                        </p>
                    </div>
                    <div class="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                        <span class="rounded-full bg-white px-3 py-2 shadow-sm">Baseline: ${meta.baseline_date || '-'}</span>
                        <span class="rounded-full bg-white px-3 py-2 shadow-sm">สิ้นงวด: ${meta.selected_end_date || '-'}</span>
                    </div>
                </div>
            </div>
        `;
    },

    renderSummaryCards() {
        const summary = this.state.report.summary || {};
        const cards = [
            {
                label: 'ยอดยกมาเก่า',
                value: this.formatNumber(summary.old_baseline_total),
                note: 'จำนวนงานค้างเก่าต้นปี',
                icon: 'fa-box-archive',
                theme: 'from-amber-500/15 to-orange-500/5'
            },
            {
                label: 'รับใหม่สะสม',
                value: this.formatNumber(summary.new_received_total),
                note: 'งานใหม่ที่เกิดในปีรายงาน',
                icon: 'fa-folder-plus',
                theme: 'from-sky-500/15 to-cyan-500/5'
            },
            {
                label: 'เสร็จรวมสะสม',
                value: this.formatNumber(summary.all_completed_total),
                note: `${this.formatPercent(summary.all_completed_pct)} ของยอดรวม`,
                icon: 'fa-circle-check',
                theme: 'from-emerald-500/15 to-teal-500/5'
            },
            {
                label: 'ค้างรวม',
                value: this.formatNumber(summary.all_remaining_total),
                note: `${this.formatPercent(summary.all_remaining_pct)} ของยอดรวม`,
                icon: 'fa-hourglass-half',
                theme: 'from-rose-500/15 to-pink-500/5'
            }
        ];

        const container = document.getElementById('summary-cards');
        if (!container) return;

        container.innerHTML = cards.map(card => `
            <article class="glass-panel rounded-[2rem] p-5">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">${card.label}</p>
                        <p class="mt-3 display-font text-4xl font-semibold text-slate-900">${card.value}</p>
                        <p class="mt-2 text-sm text-slate-600">${card.note}</p>
                    </div>
                    <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${card.theme} text-slate-700">
                        <i class="fas ${card.icon} text-xl"></i>
                    </div>
                </div>
            </article>
        `).join('');
    },

    renderSections() {
        const container = document.getElementById('report-sections');
        if (!container) return;

        const departments = this.state.report.departments || [];
        container.innerHTML = departments.map(dept => this.renderDepartmentSection(dept)).join('');
    },

    syncDepartmentOverviewCards() {
        const departments = this.state.report.departments || [];
        const sections = document.querySelectorAll('#report-sections > section');

        sections.forEach((section, index) => {
            const dept = departments[index];
            if (!dept) return;

            const headerGrid = section.querySelector('.mb-5 .grid');
            if (!headerGrid) return;

            const totals = dept.totals || {};
            const oldRemainingTotal = Math.max(0, Number(dept.old_baseline || 0) - Number(totals.old_completed_total || 0));
            const oldRemainingPct = this.calculatePercent(oldRemainingTotal, dept.old_baseline);
            const newRemainingTotal = Math.max(0, Number(totals.new_received_total || 0) - Number(totals.new_completed_total || 0));
            const newRemainingPct = this.calculatePercent(newRemainingTotal, totals.new_received_total);
            const activeRows = (dept.rows || []).filter(row => row.is_active_month);
            const currentRow = activeRows.length ? activeRows[activeRows.length - 1] : null;
            const previousRow = activeRows.length > 1 ? activeRows[activeRows.length - 2] : null;
            const newCarryFromPrevious = currentRow
                ? Math.max(0, Number(previousRow?.new_remaining || 0) - Number(currentRow.new_completed_60 || 0))
                : 0;
            const newCarryFromCurrentMonth = currentRow
                ? Math.max(0, Number(currentRow.new_received || 0) - Number(currentRow.new_completed_30 || 0))
                : 0;

            headerGrid.className = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-5';
            headerGrid.innerHTML = `
                <div class="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200/80">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">งานค้างเก่าเหลือ</p>
                    <p class="mt-2 text-2xl font-bold text-slate-900">${this.formatNumber(oldRemainingTotal)}</p>
                    <p class="mt-1 text-xs font-medium text-amber-700">${this.formatPercent(oldRemainingPct)} ของยกมา</p>
                </div>
                <div class="rounded-2xl ${this.deptAccentMap[dept.accent]?.soft || 'bg-slate-50'} px-4 py-3">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">รับใหม่สะสม</p>
                    <p class="mt-2 text-2xl font-bold text-slate-900">${this.formatNumber(totals.new_received_total)}</p>
                    <p class="mt-1 text-xs font-medium text-slate-500">งานใหม่ทั้งหมดของปีรายงาน</p>
                </div>
                <div class="rounded-2xl bg-orange-50 px-4 py-3 ring-1 ring-orange-200/80">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">งานค้างใหม่เหลือ</p>
                    <p class="mt-2 text-2xl font-bold text-slate-900">${this.formatNumber(newRemainingTotal)}</p>
                    <p class="mt-1 text-xs font-medium text-orange-700">${this.formatPercent(newRemainingPct)} ของงานใหม่</p>
                </div>
                <div class="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">เสร็จรวม</p>
                    <p class="mt-2 text-2xl font-bold text-slate-900">${this.formatNumber(totals.all_completed_total)}</p>
                    <p class="mt-1 text-xs font-medium text-slate-500">${this.formatPercent(totals.all_completed_pct)} ของยอดรวม</p>
                </div>
                <div class="rounded-2xl bg-slate-900 px-4 py-3 text-white">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">ค้างรวม</p>
                    <p class="mt-2 text-2xl font-bold">${this.formatNumber(totals.all_remaining_total)}</p>
                    <p class="mt-1 text-xs font-medium text-slate-300">${this.formatPercent(totals.all_remaining_pct)} ของยอดรวม</p>
                </div>
            `;

            const newRemainingCard = headerGrid.children[2];
            if (newRemainingCard) {
                newRemainingCard.innerHTML = `
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">งานค้างใหม่เหลือ</p>
                    <p class="mt-2 text-2xl font-bold text-slate-900">${this.formatNumber(newRemainingTotal)}</p>
                    <p class="mt-1 text-xs font-medium text-orange-700">ก่อนหน้า ${this.formatNumber(newCarryFromPrevious)} + เดือนนี้ ${this.formatNumber(newCarryFromCurrentMonth)}</p>
                    <p class="text-[11px] font-medium text-orange-600">${this.formatPercent(newRemainingPct)} ของงานใหม่</p>
                `;
            }
        });
    },

    syncWorkbookTableLayout() {
        const departments = this.state.report.departments || [];
        const tables = document.querySelectorAll('#report-sections .summary-table');

        tables.forEach((table, index) => {
            const dept = departments[index];
            if (!dept) return;

            this.syncWorkbookTableHeader(table, dept);
            this.syncWorkbookTableBody(table);
        });
    },

    syncWorkbookTableHeader(table, dept) {
        if (!table.tHead) return;

        table.tHead.innerHTML = `
            <tr class="table-title-row">
                <th colspan="19">${dept.label}</th>
            </tr>
            <tr>
                <th class="carry-head">ยกมา</th>
                <th colspan="3" class="group-head">เก่า</th>
                <th colspan="2" class="backlog-head">งานค้างเก่า</th>
                <th colspan="6" class="group-head">ใหม่</th>
                <th colspan="2" class="backlog-head">งานค้างใหม่</th>
                <th colspan="3" class="group-head">รวมเก่าใหม่</th>
                <th rowspan="2" class="backlog-head">ค้างรวม</th>
                <th rowspan="2" class="backlog-head">ร้อยละ</th>
            </tr>
            <tr class="text-xs">
                <th class="carry-base">${this.formatNumber(dept.old_baseline)}</th>
                <th class="subhead">เสร็จ</th>
                <th class="subhead">เสร็จสะสม</th>
                <th class="subhead">ร้อยละ</th>
                <th class="backlog-head">ค้างคงเหลือ</th>
                <th class="backlog-head">ร้อยละ</th>
                <th class="subhead">เกิด</th>
                <th class="subhead">เสร็จ 30</th>
                <th class="subhead">เสร็จ 60</th>
                <th class="subhead">เกิดสะสม</th>
                <th class="subhead">เสร็จสะสม</th>
                <th class="subhead">ร้อยละ</th>
                <th class="backlog-head">ค้างคงเหลือ</th>
                <th class="backlog-head">ร้อยละ</th>
                <th class="subhead">เกิดรวม</th>
                <th class="subhead">เสร็จรวม</th>
                <th class="subhead">ร้อยละรวม</th>
            </tr>
        `;
    },

    syncWorkbookTableBody(table) {
        const tbody = table.tBodies[0];
        if (!tbody) return;

        Array.from(tbody.rows).forEach(row => {
            if (row.cells.length === 20) {
                row.deleteCell(1);
            }
        });
    },

    renderDepartmentSection(dept) {
        const accent = this.deptAccentMap[dept.accent] || this.deptAccentMap.amber;
        const totals = dept.totals || {};

        return `
            <section class="glass-panel rounded-[2rem] p-4 sm:p-6">
                <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <div class="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${accent.badge}">
                            <i class="fas fa-building-columns"></i>
                            ${dept.short_label}
                        </div>
                        <h3 class="display-font text-2xl font-semibold text-slate-900">${dept.label}</h3>
                        <p class="mt-2 text-sm text-slate-600">
                            ยอดยกมาต้นปี <span class="font-semibold text-slate-900">${this.formatNumber(dept.old_baseline)}</span>
                            และคำนวณสะสมถึงเดือน <span class="font-semibold text-slate-900">${this.getThaiMonthName(this.state.report.meta.end_month)}</span>
                        </p>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-3">
                        <div class="rounded-2xl ${accent.soft} px-4 py-3">
                            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">รับใหม่สะสม</p>
                            <p class="mt-2 text-2xl font-bold text-slate-900">${this.formatNumber(totals.new_received_total)}</p>
                        </div>
                        <div class="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80">
                            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">เสร็จรวม</p>
                            <p class="mt-2 text-2xl font-bold text-slate-900">${this.formatNumber(totals.all_completed_total)}</p>
                        </div>
                        <div class="rounded-2xl bg-slate-900 px-4 py-3 text-white">
                            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">ค้างรวม</p>
                            <p class="mt-2 text-2xl font-bold">${this.formatNumber(totals.all_remaining_total)}</p>
                        </div>
                    </div>
                </div>

                <div class="table-shell">
                    <table class="summary-table">
                        <thead>
                            <tr class="bg-slate-100/90">
                                <th rowspan="2">เดือน</th>
                                <th rowspan="2">ยกมา</th>
                                <th colspan="5" class="${accent.title}">งานเก่า</th>
                                <th colspan="8" class="text-teal-700">งานใหม่</th>
                                <th colspan="5" class="text-slate-900">รวมเก่าใหม่</th>
                            </tr>
                            <tr class="bg-white/85 text-xs">
                                <th>เสร็จ</th>
                                <th>เสร็จสะสม</th>
                                <th>ร้อยละ</th>
                                <th>คงเหลือ</th>
                                <th>ร้อยละ</th>
                                <th>เกิด</th>
                                <th>เสร็จ 30</th>
                                <th>เสร็จ 60</th>
                                <th>เกิดสะสม</th>
                                <th>เสร็จสะสม</th>
                                <th>ร้อยละ</th>
                                <th>คงเหลือ</th>
                                <th>ร้อยละ</th>
                                <th>เกิดรวม</th>
                                <th>เสร็จรวม</th>
                                <th>ร้อยละรวม</th>
                                <th>ค้างรวม</th>
                                <th>ร้อยละค้าง</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dept.rows.map(row => this.renderDepartmentRow(row, dept.old_baseline)).join('')}
                            ${this.renderTotalRow(totals)}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    },

    renderDepartmentRow(row, oldBaseline) {
        const rowClass = row.is_active_month ? 'bg-white/65' : 'future-row';

        return `
            <tr class="${rowClass}">
                <td class="month-cell">${row.month_label}</td>
                <td>${this.formatNumber(oldBaseline)}</td>
                <td>${this.displayMaybeNumber(row.old_completed)}</td>
                <td>${this.formatNumber(row.old_completed_cum)}</td>
                <td>${this.formatPercent(row.old_completed_pct)}</td>
                <td>${this.formatNumber(row.old_remaining)}</td>
                <td>${this.formatPercent(row.old_remaining_pct)}</td>
                <td>${this.displayMaybeNumber(row.new_received)}</td>
                <td>${this.displayMaybeNumber(row.new_completed_30)}</td>
                <td>${this.displayMaybeNumber(row.new_completed_60)}</td>
                <td>${this.formatNumber(row.new_received_cum)}</td>
                <td>${this.formatNumber(row.new_completed_cum)}</td>
                <td>${this.formatPercent(row.new_completed_pct)}</td>
                <td>${this.formatNumber(row.new_remaining)}</td>
                <td>${this.formatPercent(row.new_remaining_pct)}</td>
                <td>${this.formatNumber(row.all_received_cum)}</td>
                <td>${this.formatNumber(row.all_completed_cum)}</td>
                <td>${this.formatPercent(row.all_completed_pct)}</td>
                <td>${this.formatNumber(row.all_remaining)}</td>
                <td>${this.formatPercent(row.all_remaining_pct)}</td>
            </tr>
        `;
    },

    renderTotalRow(totals) {
        return `
            <tr class="total-row">
                <td class="month-cell">รวม</td>
                <td>-</td>
                <td>${this.formatNumber(totals.old_completed_total)}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>${this.formatNumber(totals.new_received_total)}</td>
                <td>${this.formatNumber(totals.new_completed_30_total)}</td>
                <td>${this.formatNumber(totals.new_completed_60_total)}</td>
                <td>-</td>
                <td>${this.formatNumber(totals.new_completed_total)}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>${this.formatNumber(totals.all_received_total)}</td>
                <td>${this.formatNumber(totals.all_completed_total)}</td>
                <td>${this.formatPercent(totals.all_completed_pct)}</td>
                <td>${this.formatNumber(totals.all_remaining_total)}</td>
                <td>${this.formatPercent(totals.all_remaining_pct)}</td>
            </tr>
        `;
    },

    displayMaybeNumber(value) {
        return value === null || value === undefined ? '-' : this.formatNumber(value);
    },

    calculatePercent(numerator, denominator) {
        const safeDenominator = Number(denominator || 0);
        if (safeDenominator <= 0) {
            return 0;
        }

        return (Number(numerator || 0) / safeDenominator) * 100;
    },

    formatNumber(value) {
        const number = Number(value || 0);
        return number.toLocaleString('th-TH');
    },

    formatPercent(value) {
        const number = Number(value || 0);
        return `${number.toLocaleString('th-TH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}%`;
    },

    getThaiMonthName(month) {
        const months = [
            '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
            'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
            'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
        ];
        return months[month] || '-';
    },

    formatDateTime(dateTime) {
        if (!dateTime) return '-';
        const date = new Date(dateTime.replace(' ', 'T'));
        if (Number.isNaN(date.getTime())) return dateTime;
        return date.toLocaleString('th-TH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    exportExcel() {
        const report = this.state.report;
        if (!report || !report.departments?.length) {
            Swal.fire({
                icon: 'warning',
                title: 'ยังไม่มีข้อมูล',
                text: 'กรุณาโหลดรายงานก่อนส่งออก Excel',
                confirmButtonColor: '#0f766e'
            });
            return;
        }

        try {
            const rows = [];
            const merges = [];
            let currentRow = 0;

            report.departments.forEach((dept, index) => {
                const section = this.buildExcelSection(dept, currentRow + 1);
                rows.push(...section.rows);
                merges.push(...section.merges);
                currentRow += section.rows.length;

                if (index < report.departments.length - 1) {
                    rows.push([]);
                    currentRow += 1;
                }
            });

            const worksheet = XLSX.utils.aoa_to_sheet(rows);
            worksheet['!cols'] = [
                { wch: 8 }, { wch: 9 }, { wch: 11 }, { wch: 9 }, { wch: 12 },
                { wch: 9 }, { wch: 11 }, { wch: 12 }, { wch: 11 }, { wch: 11 },
                { wch: 11 }, { wch: 9 }, { wch: 12 }, { wch: 9 }, { wch: 11 },
                { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 9 }
            ];
            worksheet['!merges'] = merges;

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'สรุปงานค้าง');

            const fileName = `admin_backlog_summary_${report.meta.report_year}_${String(report.meta.end_month).padStart(2, '0')}.xlsx`;
            XLSX.writeFile(workbook, fileName);

            Swal.fire({
                icon: 'success',
                title: 'ส่งออกสำเร็จ',
                text: `สร้างไฟล์ ${fileName} เรียบร้อยแล้ว`,
                confirmButtonColor: '#0f766e'
            });
        } catch (error) {
            console.error(error);
            Swal.fire({
                icon: 'error',
                title: 'ส่งออกไม่สำเร็จ',
                text: 'เกิดข้อผิดพลาดระหว่างสร้างไฟล์ Excel',
                confirmButtonColor: '#0f766e'
            });
        }
    },

    buildExcelSection(dept, startRowNumber) {
        const rows = [];
        const merges = [];
        const startIndex = startRowNumber - 1;

        rows.push([dept.label]);
        merges.push({ s: { r: startIndex, c: 0 }, e: { r: startIndex, c: 18 } });

        rows.push([
            'ยกมา',
            'เก่า', null, null,
            'งานค้างเก่า', null,
            'ใหม่', null, null, null, null, null,
            'งานค้างใหม่', null,
            'รวมเก่าใหม่', null, null,
            'ค้างรวม',
            'ร้อยละ'
        ]);

        merges.push(
            { s: { r: startIndex + 1, c: 1 }, e: { r: startIndex + 1, c: 3 } },
            { s: { r: startIndex + 1, c: 4 }, e: { r: startIndex + 1, c: 5 } },
            { s: { r: startIndex + 1, c: 6 }, e: { r: startIndex + 1, c: 11 } },
            { s: { r: startIndex + 1, c: 12 }, e: { r: startIndex + 1, c: 13 } },
            { s: { r: startIndex + 1, c: 14 }, e: { r: startIndex + 1, c: 16 } }
        );

        rows.push([
            dept.old_baseline,
            'เสร็จ',
            'เสร็จสะสม',
            'ร้อยละ',
            'ค้างคงเหลือ',
            'ร้อยละ',
            'เกิด',
            'เสร็จ 30',
            'เสร็จ60',
            'เกิดสะสม',
            'เสร็จสะสม',
            'ร้อยละ',
            'ค้างคงเหลือ',
            'ร้อยละ',
            'เกิดรวม',
            'เสร็จรวม',
            'ร้อยละรวม',
            null,
            null
        ]);

        dept.rows.forEach(row => {
            rows.push([
                row.month_label,
                row.old_completed,
                row.old_completed_cum,
                this.formatPercentPlain(row.old_completed_pct),
                row.old_remaining,
                this.formatPercentPlain(row.old_remaining_pct),
                row.new_received,
                row.new_completed_30,
                row.new_completed_60,
                row.new_received_cum,
                row.new_completed_cum,
                this.formatPercentPlain(row.new_completed_pct),
                row.new_remaining,
                this.formatPercentPlain(row.new_remaining_pct),
                row.all_received_cum,
                row.all_completed_cum,
                this.formatPercentPlain(row.all_completed_pct),
                row.all_remaining,
                this.formatPercentPlain(row.all_remaining_pct)
            ]);
        });

        rows.push([
            null,
            dept.totals.old_completed_total,
            null,
            null,
            null,
            null,
            dept.totals.new_received_total,
            dept.totals.new_completed_30_total,
            dept.totals.new_completed_60_total,
            null,
            dept.totals.new_completed_total,
            null,
            null,
            null,
            dept.totals.all_received_total,
            dept.totals.all_completed_total,
            this.formatPercentPlain(dept.totals.all_completed_pct),
            dept.totals.all_remaining_total,
            this.formatPercentPlain(dept.totals.all_remaining_pct)
        ]);

        return { rows, merges };
    },

    formatPercentPlain(value) {
        return `${Number(value || 0).toFixed(2)}%`;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    adminBacklogSummaryApp.init();
});
