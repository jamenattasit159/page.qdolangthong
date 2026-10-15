window.backlogApp = {
    // Cache for loaded data
    cache: {},
    currentYearMonth: null,
    reportType: 'yearly',
    isLoading: false,
    activeCacheKey: null,

    /**
     * Initialize the report page
     */
    init() {
        // Permission check: allow admins and authorized department staff
        const user = JSON.parse(localStorage.getItem('dol_user'));
        const isAdmin = user && (user.role === 'superadmin' || user.role === 'admin');
        const isAuthorizedStaff = user && user.role === 'staff' && ['survey', 'registration', 'academic'].includes(user.department);

        if (!user || (!isAdmin && !isAuthorizedStaff)) {
            window.location.href = 'index.html';
            return;
        }

        // Initialize AOS animations
        AOS.init({
            duration: 600,
            once: true,
            offset: 50
        });

        // Set current date display
        this.updateDateDisplay();

        // Set default month
        const today = new Date();
        const defaultMonth = today.toISOString().slice(0, 7);
        const monthInput = document.getElementById('report-month');
        const typeInput = document.getElementById('report-type');

        if (monthInput) {
            monthInput.value = defaultMonth;
            this.currentYearMonth = defaultMonth;
        }

        if (typeInput) {
            this.reportType = typeInput.value;
            this.updateRangeUI(this.reportType);
        }

        // Show Initial Selection Message
        this.renderEmptyState();
    },

    /**
     * Change report type
     */
    onReportTypeChange(type) {
        this.reportType = type;
        this.updateRangeUI(type);
        if (type !== 'range') {
            this.updateReport();
        }
    },

    /**
     * Update UI elements based on report type
     */
    updateRangeUI(type) {
        const endMonthContainer = document.getElementById('end-month-container');
        const endMonthInput = document.getElementById('report-end-month');
        const labelStart = document.getElementById('label-start-date');

        if (type === 'range') {
            endMonthContainer.classList.remove('hidden');
            if (labelStart) labelStart.innerHTML = '<i class="fas fa-calendar-alt mr-1"></i>เริ่มต้น:';
            if (endMonthInput && !endMonthInput.value) {
                endMonthInput.value = new Date().toISOString().slice(0, 7);
            }
        } else {
            endMonthContainer.classList.add('hidden');
            if (labelStart) labelStart.innerHTML = '<i class="fas fa-calendar-alt mr-1"></i>ประจำช่วงเวลา:';
        }
    },

    /**
     * Render empty state message
     */
    renderEmptyState() {
        const container = document.getElementById('report-data');
        if (container) {
            container.innerHTML = `
                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center" data-aos="fade-up">
                    <div class="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-clock-rotate-left text-3xl text-orange-500"></i>
                    </div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">กรุณาเลือกช่วงเวลาที่ต้องการรายงานงานค้างเก่า</h3>
                    <p class="text-gray-500 max-w-sm mx-auto">ระบุรูปแบบรายงานและช่วงเวลาด้านบน แล้วกดปุ่ม "อัปเดตข้อมูล" เพื่อแสดงความก้าวหน้างานค้าง</p>
                </div>
            `;
            container.classList.remove('hidden');
            document.getElementById('loading-skeleton').classList.add('hidden');
        }
    },

    /**
     * Update the date display in header
     */
    updateDateDisplay() {
        const dateEl = document.getElementById('current-date');
        if (dateEl) {
            const now = new Date();
            const options = {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            };
            dateEl.textContent = now.toLocaleDateString('th-TH', options);
        }
    },

    /**
     * Update report based on selected timeframe
     */
    updateReport() {
        const monthInput = document.getElementById('report-month');
        const endMonthInput = document.getElementById('report-end-month');
        const selectedMonth = monthInput.value;
        const endMonth = this.reportType === 'range' ? endMonthInput.value : '';

        const cacheKey = `${selectedMonth}_${endMonth}_${this.reportType}`;

        if (selectedMonth === this.currentYearMonth && this.cache[cacheKey]) {
            this.activeCacheKey = cacheKey;
            this.renderReport(this.cache[cacheKey]);
            return;
        }

        this.loadReport(selectedMonth, this.reportType, endMonth);
    },

    /**
     * Show loading state
     */
    showLoading() {
        this.isLoading = true;
        document.getElementById('loading-skeleton').classList.remove('hidden');
        document.getElementById('report-data').classList.add('hidden');

        const btn = document.getElementById('btn-update');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i> กำลังโหลด...';
        }
    },

    /**
     * Hide loading state
     */
    hideLoading() {
        this.isLoading = false;
        document.getElementById('loading-skeleton').classList.add('hidden');
        document.getElementById('report-data').classList.remove('hidden');

        const btn = document.getElementById('btn-update');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt mr-1.5"></i> อัปเดตข้อมูล';
        }
    },

    /**
     * Load report data from API
     */
    async loadReport(yearMonth, reportType, endMonth = '') {
        const cacheKey = `${yearMonth}_${endMonth}_${reportType}`;
        if (this.cache[cacheKey]) {
            this.activeCacheKey = cacheKey;
            this.renderReport(this.cache[cacheKey]);
            return;
        }

        this.showLoading();

        try {
            let url = `api/old_work_backlog.php?start_month=${yearMonth}&report_type=${reportType}`;
            if (endMonth) url += `&end_month=${endMonth}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load report data');

            const data = await response.json();

            // Cache the data
            this.cache[cacheKey] = data;
            this.activeCacheKey = cacheKey;

            this.currentYearMonth = yearMonth;

            // Update total old work display
            const totalEl = document.getElementById('total-old-work');
            if (totalEl) totalEl.textContent = (data.total_old_work || 0).toLocaleString();

            // Render report
            this.renderReport(data);
        } catch (error) {
            console.error('Error loading report:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถโหลดข้อมูลรายงานได้ กรุณาลองใหม่อีกครั้ง',
                confirmButtonColor: '#f97316'
            });
            this.hideLoading();
        }
    },

    /**
     * Render the backlog report
     */
    renderReport(data) {
        const user = JSON.parse(localStorage.getItem('dol_user')) || {};
        const isAdmin = user.role === 'superadmin' || user.role === 'admin';

        const container = document.getElementById('report-data');
        const months = data.months || [];

        let html = '';

        // Iterate through months
        months.forEach((monthItem, index) => {
            let deptEntries = Object.entries(monthItem.departments || {});

            // Filter if not admin
            if (!isAdmin) {
                deptEntries = deptEntries.filter(([key]) => key === user.department);
            }

            const depts = deptEntries.map(([, val]) => val);

            // Skip months with no data
            const hasData = depts.some(d => d.backlog_total > 0 || d.structure_work > 0);
            if (!hasData && index > 2) return; // Show at least first 3 months

            html += `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden month-block mb-6" data-aos="fade-up">
                    <div class="month-header px-6 py-3">
                        <h4 class="font-black text-lg flex items-center">
                            <i class="fas fa-calendar-day mr-2"></i>
                            ${monthItem.month_label}
                        </h4>
                    </div>
                    <div class="overflow-x-auto custom-scrollbar">
                        <table class="report-table">
                            <thead>
                                <tr>
                                    <th rowspan="2" class="w-12 text-center text-xs">ลำดับ</th>
                                    <th rowspan="2" class="min-w-[200px] text-center text-xs">ภารกิจตามโครงสร้าง<br>อำนาจหน้าที่<sup>(1)</sup></th>
                                    <th rowspan="2" class="w-20 text-center text-xs">งานสุดขั้นตอน<sup>(2)</sup></th>
                                    <th rowspan="2" class="w-20 text-center text-xs">งานศาล<sup>(3)</sup></th>
                                    <th colspan="4" class="text-xs">งานค้าง (เป้าหมาย 5% ตามแผนฯ)</th>
                                </tr>
                                <tr>
                                    <th class="w-20 text-center text-xs">จำนวน<sup>(4)</sup></th>
                                    <th colspan="2" class="text-center text-xs">ดำเนินการแล้วเสร็จ<br><span class="text-[10px] font-normal">(เรื่อง / ร้อยละ)</span></th>
                                    <th class="w-20 text-center text-xs">คงเหลือ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.renderDepartmentRows(depts)}
                                <tr class="bg-orange-50 font-bold border-t border-gray-300">
                                    <td colspan="2" class="text-center py-2">รวม</td>
                                    <td class="text-center">${this.sumField(depts, 'final_step').toLocaleString()}</td>
                                    <td class="text-center">${this.sumField(depts, 'court_work').toLocaleString()}</td>
                                    <td class="text-center">${this.sumField(depts, 'backlog_total').toLocaleString()}</td>
                                    <td class="text-center">${this.sumField(depts, 'completed_count').toLocaleString()}</td>
                                    <td class="text-center text-blue-600">${this.calcAvgPercentage(depts)}%</td>
                                    <td class="text-center text-red-600 font-black">${this.sumField(depts, 'remaining').toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="signature-line px-6 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                        <i class="fas fa-user-check mr-1"></i> การตรวจสอบและยืนยันจาก............................ เจ้าพนักงานที่ดิน
                    </div>
                </div>
            `;
        });

        container.innerHTML = html || '<div class="p-8 text-center text-gray-400">ไม่พบข้อมูลในช่วงเวลาที่เลือก</div>';
        this.hideLoading();
    },

    /**
     * Render department rows
     */
    renderDepartmentRows(depts) {
        let html = '';
        let index = 1;

        // Sort by order
        depts.sort((a, b) => a.order - b.order);

        depts.forEach(dept => {
            const pct = dept.completed_percentage || 0;
            const pctClass = pct >= 10 ? 'text-green-600' : (pct >= 5 ? 'text-orange-600' : 'text-red-600');

            html += `
                <tr>
                    <td class="text-center py-2">${index++}</td>
                    <td class="text-left font-medium px-4">${dept.name}</td>
                    <td class="text-center">${dept.final_step.toLocaleString()}</td>
                    <td class="text-center">${dept.court_work.toLocaleString()}</td>
                    <td class="text-center font-bold text-orange-700">${dept.backlog_total ? dept.backlog_total.toLocaleString() : '0'}</td>
                    <td class="text-center font-bold text-blue-600">${dept.completed_count ? dept.completed_count.toLocaleString() : '0'}</td>
                    <td class="text-center ${pctClass} font-bold">${pct.toFixed(2)}%</td>
                    <td class="text-center font-bold ${dept.remaining > 0 ? 'text-red-600' : 'text-green-600'}">
                        ${dept.remaining ? dept.remaining.toLocaleString() : '0'}
                    </td>
                </tr>
            `;
        });

        return html;
    },

    /**
     * Sum a field across departments
     */
    sumField(depts, field) {
        return depts.reduce((sum, d) => sum + (d[field] || 0), 0);
    },

    /**
     * Calculate average percentage
     */
    calcAvgPercentage(depts) {
        const totalBacklog = this.sumField(depts, 'backlog_total');
        const totalCompleted = this.sumField(depts, 'completed_count');
        if (totalBacklog === 0) return 0;
        return ((totalCompleted / totalBacklog) * 100).toFixed(2);
    },

    /**
     * Export to Excel
     */
    exportToExcel() {
        const key = this.activeCacheKey;
        const data = this.cache[key];

        if (!data || !data.months || data.months.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่มีข้อมูล',
                text: 'กรุณาโหลดข้อมูลรายงานก่อนส่งออก',
                confirmButtonColor: '#f97316'
            });
            return;
        }

        Swal.fire({
            title: 'กำลังสร้างไฟล์ Excel...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const year = this.currentYearMonth ? this.currentYearMonth.split('-')[0] : '';
        try {
            const wb = XLSX.utils.book_new();

            data.months.forEach(monthItem => {
                const depts = Object.values(monthItem.departments || {});
                if (depts.length === 0) return;

                const rows = [
                    [`รายงานงานค้างเก่า - ${monthItem.month_label}`],
                    [],
                    ['ลำดับ', 'ภารกิจตามโครงสร้างอำนาจหน้าที่', 'งานสุดขั้นตอน', 'งานศาล',
                        'งานค้าง จำนวน', 'แล้วเสร็จ เรื่อง', 'แล้วเสร็จ %', 'คงเหลือ']
                ];

                let index = 1;
                depts.sort((a, b) => a.order - b.order);
                depts.forEach(dept => {
                    rows.push([
                        index++,
                        dept.name,
                        dept.final_step,
                        dept.court_work,
                        dept.backlog_total,
                        dept.completed_count,
                        dept.completed_percentage + '%',
                        dept.remaining
                    ]);
                });

                // Total row
                rows.push([
                    '', 'รวม',
                    this.sumField(depts, 'final_step'),
                    this.sumField(depts, 'court_work'),
                    this.sumField(depts, 'backlog_total'),
                    this.sumField(depts, 'completed_count'),
                    this.calcAvgPercentage(depts) + '%',
                    this.sumField(depts, 'remaining')
                ]);

                const ws = XLSX.utils.aoa_to_sheet(rows);
                const sheetName = monthItem.month_label.slice(0, 31);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
            });

            const filename = `OldBacklog_Report_${year || 'Range'}.xlsx`;
            XLSX.writeFile(wb, filename);

            Swal.fire({
                icon: 'success',
                title: 'ส่งออกสำเร็จ!',
                text: `ไฟล์ ${filename} ถูกดาวน์โหลดแล้ว`,
                confirmButtonColor: '#f97316'
            });
        } catch (error) {
            console.error('Excel export error:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถสร้างไฟล์ Excel ได้',
                confirmButtonColor: '#f97316'
            });
        }
    },

    /**
     * Export to PDF using browser print
     */
    exportToPDF() {
        const key = this.activeCacheKey;
        const data = this.cache[key];

        if (!data || !data.months || data.months.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่มีข้อมูล',
                text: 'กรุณาโหลดข้อมูลรายงานก่อนส่งออก',
                confirmButtonColor: '#f97316'
            });
            return;
        }

        Swal.fire({
            title: 'กำลังเตรียม PDF...',
            text: 'กรุณารอสักครู่ หน้าต่างพิมพ์จะเปิดขึ้น',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const year = this.currentYearMonth ? this.currentYearMonth.split('-')[0] : '';
        setTimeout(() => {
            const printContent = document.getElementById('report-data').innerHTML;
            const printWindow = window.open('', '_blank');

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Old Backlog Report - Ang Thong AABM - ${year || 'Range'}</title>
                    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
                    <style>
                        body { font-family: 'Sarabun', sans-serif; padding: 5px; margin: 0; }
                        table { border-collapse: collapse; width: 100%; margin-bottom: 3px; }
                        th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: center; font-size: 11px; }
                        th { background: #fef3c7; font-weight: bold; }
                        h2 { margin: 0 0 3px 0; font-size: 14px; }
                        p { margin: 0 0 8px 0; font-size: 12px; }
                        h4 { margin: 5px 0; font-size: 12px; }
                        .month-header { background: #f97316; color: white; padding: 5px 10px; margin-bottom: 3px; font-size: 13px; }
                        .month-block { page-break-inside: avoid; margin-bottom: 10px; border: 1px solid #ddd; }
                        .signature-line { page-break-before: avoid; margin-top: 0; padding: 3px 10px; font-size: 11px; background: #f9f9f9; border-top: 1px solid #ddd; }
                        @media print { 
                            body { padding: 5px; }
                            .month-block { page-break-inside: avoid; }
                            .signature-line { page-break-before: avoid; }
                        }
                    </style>
                </head>
                <body>
                    <h2 style="text-align: center;">รายงานสรุปผลงานค้างเก่า (ยอดยกมา)</h2>
                    <h3 style="text-align: center; margin-top: 5px;">สำนักงานที่ดินจังหวัดอ่างทอง</h3>
                   
                    <hr>
                    ${printContent}
                </body>
                </html>
            `);

            printWindow.document.close();
            printWindow.onload = () => {
                Swal.close();
                printWindow.print();
            };
        }, 500);
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    backlogApp.init();
});

