/**
 * Report Page Application
 * Separate JavaScript for the ABM Report page to improve performance
 */

window.reportApp = {
    // Cache for loaded data
    cache: {},
    currentYearMonth: null,
    reportType: 'yearly',
    isLoading: false,
    activeCacheKey: null,
    updateDebounceTimer: null,

    /**
     * Initialize the report page
     */
    init() {
        // Permission check: allow admins and authorized department staff
        const user = JSON.parse(localStorage.getItem('dol_user'));
        const isAdmin = user && (user.role === 'superadmin' || user.role === 'admin');
        const isAuthorizedStaff = user && user.role === 'staff' && ['survey', 'registration', 'academic', 'admin'].includes(user.department);

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

        // Set current date to current month
        const today = new Date();
        const defaultMonth = today.toISOString().slice(0, 7);
        const monthInput = document.getElementById('abm-report-month');
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
        // Only trigger update if it's Monthly or Yearly (Range needs end date)
        if (type !== 'range') {
            this.updateReport();
        }
    },

    /**
     * Update UI elements based on report type
     */
    updateRangeUI(type) {
        const endMonthContainer = document.getElementById('end-month-container');
        const endMonthInput = document.getElementById('abm-report-end-month');
        const labelStart = document.getElementById('label-start-date');

        if (type === 'range') {
            endMonthContainer.classList.remove('hidden');
            if (labelStart) labelStart.innerHTML = '<i class="fas fa-calendar-alt mr-1"></i>เริ่มต้น:';
            // Set default end month to today if empty
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
                    <div class="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-calendar-check text-3xl text-emerald-500"></i>
                    </div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">กรุณาเลือกช่วงเวลาที่ต้องการรายงาน</h3>
                    <p class="text-gray-500 max-w-sm mx-auto">ระบุรูปแบบรายงานและช่วงเวลาด้านบน แล้วกดปุ่ม "อัปเดตข้อมูล" เพื่อแสดงผลงานสรุปผลการดำเนินงาน</p>
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
     * Update report based on selected month (with debounce)
     */
    updateReport() {
        const monthInput = document.getElementById('abm-report-month');
        const endMonthInput = document.getElementById('abm-report-end-month');

        if (!monthInput) {
            console.error('Month input element not found: abm-report-month');
            return;
        }

        const selectedMonth = monthInput.value;
        const endMonth = (this.reportType === 'range' && endMonthInput) ? endMonthInput.value : '';

        const cacheKey = `${selectedMonth}_${endMonth}_${this.reportType}`;

        if (selectedMonth === this.currentYearMonth && this.cache[cacheKey]) {
            // Already loaded, just re-render
            this.activeCacheKey = cacheKey;
            this.renderReport(this.cache[cacheKey]);
            return;
        }

        // Debounce rapid updates
        clearTimeout(this.updateDebounceTimer);
        this.updateDebounceTimer = setTimeout(() => {
            this.currentYearMonth = selectedMonth;
            this.loadReport(selectedMonth, this.reportType, endMonth);
        }, 300);
    },

    /**
     * Show loading state
     */
    showLoading() {
        this.isLoading = true;
        document.getElementById('loading-skeleton').classList.remove('hidden');
        document.getElementById('report-data').classList.add('hidden');

        // Disable update button
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

        // Enable update button
        const btn = document.getElementById('btn-update');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt mr-1.5"></i> อัปเดตข้อมูล';
        }
    },

    /**
     * Load ABM report data from API
     */
    async loadReport(yearMonth, reportType, endMonth = '') {
        const cacheKey = `${yearMonth}_${endMonth}_${reportType}`;
        // Check cache first
        if (this.cache[cacheKey]) {
            this.activeCacheKey = cacheKey;
            this.renderReport(this.cache[cacheKey]);
            return;
        }

        this.showLoading();

        try {
            let url = `api/abm_report.php?years_month=${yearMonth}&report_type=${reportType}`;
            if (endMonth) url += `&end_month=${endMonth}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load report data');

            const data = await response.json();

            // Cache the data
            this.cache[cacheKey] = data;
            this.activeCacheKey = cacheKey;

            // Render report
            this.renderReport(data);
        } catch (error) {
            console.error('Error loading report:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถโหลดข้อมูลรายงานได้ กรุณาลองใหม่อีกครั้ง',
                confirmButtonColor: '#10b981'
            });
            this.hideLoading();
        }
    },

    /**
     * Render the ABM report
     */
    renderReport(abmReport) {
        const user = JSON.parse(localStorage.getItem('dol_user')) || {};
        const isAdmin = user.role === 'superadmin' || user.role === 'admin';

        const container = document.getElementById('report-data');
        const trend = abmReport.trend || [];
        let depts = [
            { id: 'academic', label: 'กลุ่มงานวิชาการ' },
            { id: 'registration', label: 'ฝ่ายทะเบียน' },
            { id: 'survey', label: 'ฝ่ายรังวัด' },
            { id: 'admin', label: 'ฝ่ายอำนวยการ' }
        ];

        // Filter depts if not admin
        if (!isAdmin) {
            depts = depts.filter(d => d.id === user.department);
        }

        // Track running balances
        // ใช้ initial_balances จาก API (PHP คำนวณจากเดือนก่อนหน้า)
        // เพื่อให้โหมดรายเดือน/ช่วงเวลา แสดงยอดค้างก่อนหน้าถูกต้อง
        const initBal = abmReport.initial_balances || {};
        let deptBalances = {
            academic: initBal.academic || 0,
            registration: initBal.registration || 0,
            survey: initBal.survey || 0,
            admin: initBal.admin || 0
        };
        let deptBalancesType2 = { academic: 0, registration: 0, survey: 0, admin: 0 };
        let deptBalancesType3 = { academic: 0, registration: 0, survey: 0, admin: 0 };

        let html = `<div class="space-y-8">`;

        // Header


        // Iterate months
        trend.forEach((monthItem, index) => {
            const date = new Date(monthItem.month + '-01');
            const monthLabel = date.toLocaleDateString('th-TH', { month: 'long' });
            const isFirstMonth = index === 0;

            // Snapshot prevBal and comp60 per dept BEFORE the map() updates deptBalances
            const prevBalSnapshot = {};
            const comp60Snapshot = {};
            depts.forEach(dept => {
                prevBalSnapshot[dept.id] = deptBalances[dept.id];
                const _d = monthItem.depts[dept.id] || {};
                comp60Snapshot[dept.id] = _d.comp60 || 0;
            });

            let rowHtml = depts.map(dept => {
                const dData = monthItem.depts[dept.id] || { intake: 0, comp30: 0, comp60: 0, pending: 0, notes: '' };
                const intake = dData.intake || 0;
                const comp30 = dData.comp30 || 0;
                const comp60 = dData.comp60 || 0;
                const pendingMonth = dData.pending || 0; // This month's new pending

                const pct30 = intake > 0 ? ((comp30 / intake) * 100).toFixed(2) : "0.00";

                const prevBal = deptBalances[dept.id];
                // ยอดก่อนหน้าที่เหลือจริง = prevBal - comp60 (หักงานที่เสร็จใน 60 วันออกก่อน)
                const prevBalNet = Math.max(0, prevBal - comp60);
                // % งานเสร็จ 60 วัน = comp60 / max(prevBal, comp60) × 100 (cap ที่ 100%)
                const pct60Denom = Math.max(prevBal, comp60);
                const pct60 = pct60Denom > 0 ? Math.min(100, (comp60 / pct60Denom) * 100).toFixed(2) : "0.00";
                // รวมทั้งหมด = ยอดเก่าที่เหลือ (prevBalNet) + งานค้างเดือนนี้
                const currentBal = prevBalNet + pendingMonth;
                deptBalances[dept.id] = currentBal;

                // Track breakdown balances (Cumulative)
                const pType2 = dData.pending_type2 || 0;
                const pType3 = dData.pending_type3 || 0;
                deptBalancesType2[dept.id] = (deptBalancesType2[dept.id] || 0) + pType2;
                deptBalancesType3[dept.id] = (deptBalancesType3[dept.id] || 0) + pType3;

                const currentBalType2 = deptBalancesType2[dept.id];
                const currentBalType3 = deptBalancesType3[dept.id];

                const surveyReg = dData.survey_reg || 0;
                let intakeDisplay = intake.toLocaleString();

                return `
                    <tr class="hover:bg-gray-50 transition-colors">
                        <td class="px-3 py-3 border font-bold text-gray-700 bg-gray-50/50">${dept.label}</td>
                        <!-- รับใหม่ -->
                        <td class="px-3 py-3 border text-center font-bold text-gray-800">${intakeDisplay}</td>
                        <!-- (7) 30 วัน -->
                        <td class="px-3 py-3 border text-center font-bold text-blue-600">${comp30.toLocaleString()}</td>
                        <td class="px-3 py-3 border text-center font-medium text-gray-600">${pct30} %</td>
                        <!-- (8) 60 วัน -->
                        <td class="px-3 py-3 border text-center font-bold text-indigo-600">${comp60.toLocaleString()}</td>
                        <td class="px-3 py-3 border text-center font-medium text-gray-600">${pct60} %</td>
                        
                        <!-- งานไม่แล้วเสร็จ breakdown -->
                        <!-- ก่อนหน้า (ยอดค้างเก่า หักงานที่เสร็จ 60 วันแล้ว) -->
                        <td class="px-3 py-3 border text-center font-bold text-gray-500 bg-gray-50/30">${prevBalNet.toLocaleString()}</td>
                        <!-- เดือนนี้ -->
                        <td class="px-3 py-3 border text-center font-bold text-blue-500 bg-blue-50/10">${pendingMonth.toLocaleString()}</td>

                        <!-- (12) รวมทั้งหมด -->
                        <td class="px-3 py-3 border text-center font-black text-emerald-600 bg-emerald-50/30 cursor-pointer hover:underline" 
                            title="คลิกเพื่อดูรายละเอียดงานค้าง"
                            onclick="reportApp.showPendingDetails('${dept.id}', '${monthItem.month}', ${currentBal})">
                            ${currentBal.toLocaleString()}
                        </td>
                        <!-- งานรับเรื่องจากทะเบียน -->
                        <td class="px-3 py-3 border text-center font-bold text-blue-700 bg-blue-50/10">
                            ${dept.id === 'survey' ? (surveyReg > 0 ? surveyReg.toLocaleString() : '-') : '-'}
                        </td>
                        <!-- หมายเหตุ -->
                        <td class="px-3 py-3 border text-xs text-gray-500 min-w-[150px]">
                            <input type="text" 
                                class="w-full bg-transparent border-none focus:ring-0 text-xs text-gray-600 placeholder-gray-300 p-0" 
                                placeholder="ระบุสาเหตุ..." 
                                value="${dData.notes || ''}" 
                                onchange="reportApp.saveABMNote('${monthItem.month}', '${dept.id}', this.value)">
                        </td>
                    </tr>
                `;
            }).join('');

            // Calculate totals for all departments in this month
            let totalComp30 = 0, totalIntake = 0, totalComp60 = 0, totalPendingMonth = 0;
            // totalPrevBalDisplay = sum ของ prevBalNet (สำหรับแสดงผลคอลัมน์ "ก่อนหน้า")
            // totalPrevBalForPct = sum ของ prevBal ก่อนหัก comp60 (สำหรับคำนวณ % 60 วัน)
            let totalPrevBalDisplay = 0, totalPrevBalForPct = 0;
            let totalCurType2 = 0, totalCurType3 = 0, totalCurTotal = 0, totalSurveyReg = 0;

            depts.forEach(dept => {
                const dData = monthItem.depts[dept.id] || {};
                const intake = (dData.intake || 0);
                const comp60 = (dData.comp60 || 0);
                const pendingMonth = (dData.pending || 0);
                totalIntake += intake;
                totalComp30 += (dData.comp30 || 0);
                totalComp60 += comp60;
                totalPendingMonth += pendingMonth;
                if (dept.id === 'survey') totalSurveyReg += (dData.survey_reg || 0);

                // For totals, we need to track cumulative balances correctly
                // The balances are already updated in the map() above for each dept
                totalCurType2 += deptBalancesType2[dept.id];
                totalCurType3 += deptBalancesType3[dept.id];
                totalCurTotal += deptBalances[dept.id];
                // คอลัมน์ "ก่อนหน้า" = sum ของ prevBalNet (หลังหัก comp60 แล้ว)
                totalPrevBalDisplay += Math.max(0, prevBalSnapshot[dept.id] - comp60Snapshot[dept.id]);
                // ฐาน % 60 วัน = sum ของ prevBal จริงๆ ก่อนหัก comp60
                totalPrevBalForPct += prevBalSnapshot[dept.id];
            });

            const totalPct30 = totalIntake > 0 ? ((totalComp30 / totalIntake) * 100).toFixed(2) : "0.00";
            // % งานเสร็จ 60 วัน แถวรวม: ฐาน = totalPrevBalForPct (sum ของ prevBal จริงๆ ก่อนหัก comp60), cap ที่ 100%
            const totalPct60 = totalPrevBalForPct > 0 ? Math.min(100, (totalComp60 / totalPrevBalForPct) * 100).toFixed(2) : "0.00";

            const totalHtml = `
                <tr class="bg-gray-100/80 font-black text-gray-800 border-t-2 border-gray-300">
                    <td class="px-3 py-3 border text-center bg-gray-200">รวมทุกฝ่าย</td>
                    <td class="px-3 py-3 border text-center">${totalIntake.toLocaleString()}</td>
                    <td class="px-3 py-3 border text-center text-blue-700">${totalComp30.toLocaleString()}</td>
                    <td class="px-3 py-3 border text-center">${totalPct30} %</td>
                    <td class="px-3 py-3 border text-center text-indigo-700">${totalComp60.toLocaleString()}</td>
                    <td class="px-3 py-3 border text-center">${totalPct60} %</td>
                    <td class="px-3 py-3 border text-center text-gray-600">${totalPrevBalDisplay.toLocaleString()}</td>
                    <td class="px-3 py-3 border text-center text-blue-600">${totalPendingMonth.toLocaleString()}</td>

                    <td class="px-3 py-3 border text-center text-emerald-700">${totalCurTotal.toLocaleString()}</td>
                    <td class="px-3 py-3 border text-center text-blue-700 font-black bg-blue-50/20">${totalSurveyReg > 0 ? totalSurveyReg.toLocaleString() : '-'}</td>
                    <td class="px-3 py-3 border bg-gray-200"></td>
                </tr>
            `;

            html += `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                    <div class="bg-gray-100/50 px-6 py-3 border-b border-gray-200">
                        <h4 class="font-black text-gray-800">เดือน${monthLabel} ${isFirstMonth ? '(เดือนเริ่มต้น)' : ''}</h4>
                    </div>
                    <div class="overflow-x-auto custom-scrollbar">
                        <table class="w-full text-sm border-collapse">
                            <thead>
                                <!-- Row 1 -->
                                <tr class="bg-blue-100/50 text-gray-800 font-bold">
                                    <th rowspan="3" class="px-4 py-3 border text-center w-32">ฝ่าย</th>
                                    <th colspan="8" class="px-2 py-2 border text-center bg-blue-200/30 font-black">ปริมาณงานเกิดใหม่<sup>(5)</sup> ประจำเดือน</th>
                                    <th rowspan="3" class="px-4 py-3 border text-center w-32">งานรับเรื่องจากทะเบียน</th>
                                    <th rowspan="3" class="px-4 py-3 border text-center w-48">หมายเหตุ</th>
                                </tr>
                                <!-- Row 2 -->
                                <tr class="bg-blue-50/50 text-gray-700 font-bold text-[11px]">
                                    <th rowspan="2" class="px-2 py-2 border text-center w-16">รับใหม่</th>
                                    <th colspan="2" class="px-2 py-2 border text-center">งานที่ดำเนินการแล้วเสร็จภายใน 30 วัน <sup>(7)</sup><br><span class="text-blue-600 font-medium text-[10px]">(เป้าหมาย > 80%)</span></th>
                                    <th colspan="2" class="px-2 py-2 border text-center">งานที่ดำเนินการแล้วเสร็จภายใน 60 วัน <sup>(8)</sup><br><span class="text-indigo-600 font-medium text-[10px]">(เป้าหมาย = 100%)</span></th>
                                    <th colspan="3" class="px-2 py-2 border text-center bg-blue-50">งานที่อยู่ระหว่างดำเนินการ (สะสม)</th>
                                </tr>
                                <!-- Row 3 -->
                                <tr class="bg-blue-50/30 text-[10px] font-bold text-gray-600">
                                    <th class="px-1 py-2 border text-center w-14">เรื่อง</th>
                                    <th class="px-1 py-2 border text-center w-14">ร้อยละ</th>
                                    <th class="px-1 py-2 border text-center w-14">เรื่อง</th>
                                    <th class="px-1 py-2 border text-center w-14">ร้อยละ</th>
                                    <th class="px-1 py-2 border text-center w-16 bg-blue-50/50">ก่อนหน้า</th>
                                    <th class="px-1 py-2 border text-center w-16 text-blue-600">เดือนนี้</th>

                                    <th class="px-1 py-2 border text-center w-16 bg-emerald-50 text-emerald-700 font-black">รวมทั้งหมด</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                ${rowHtml}
                                ${totalHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
                <!-- Verification text moved inside table or handled per month -->
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
        this.hideLoading();
    },

    /**
     * Save ABM Note
     */
    async saveABMNote(yearMonth, dept, note) {
        try {
            const response = await fetch('api/abm_report.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    years_month: yearMonth,
                    department: dept,
                    notes: note
                })
            });

            if (!response.ok) throw new Error('Failed to save note');

            // Update cache if exists
            if (this.cache[yearMonth]) {
                const trend = this.cache[yearMonth].trend || [];
                const monthData = trend.find(m => m.month === yearMonth);
                if (monthData && monthData.depts[dept]) {
                    monthData.depts[dept].notes = note;
                }
            }

            // Show subtle success indicator
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'บันทึกหมายเหตุแล้ว',
                showConfirmButton: false,
                timer: 1500
            });
        } catch (error) {
            console.error('Error saving note:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถบันทึกหมายเหตุได้',
                confirmButtonColor: '#10b981'
            });
        }
    },

    /**
     * Show detailed list of pending work (Drill-down)
     */
    async showPendingDetails(dept, yearMonth, total) {
        const deptNames = {
            survey: 'ฝ่ายรังวัด',
            registration: 'ฝ่ายทะเบียน',
            academic: 'กลุ่มงานวิชาการ'
        };
        const deptLabel = deptNames[dept] || dept;

        // Show loading
        Swal.fire({
            title: `กำลังโหลดรายละเอียด...`,
            html: `<div class="p-4 text-center"><i class="fas fa-spinner fa-spin fa-2x text-emerald-500"></i><p class="mt-2">กำลังดึงข้อมูลงานค้างของ ${deptLabel}</p></div>`,
            showConfirmButton: false,
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const response = await fetch(`api/abm_details.php?department=${dept}&year_month=${yearMonth}&type=pending`);
            const result = await response.json();

            if (result.status !== 'success') throw new Error(result.error || 'Failed to load details');

            const data = result.data || [];
            const rows = data.length > 0
                ? data.map((item, idx) => {
                    let progressBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${item.progress_type == 3 ? 'bg-orange-100 text-orange-700' :
                        item.progress_type == 2 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                    }">
                                ${item.progress_type == 3 ? 'งานศาล' : item.progress_type == 2 ? 'สุดขั้นตอน' : 'ปกติ'}
                            </span>`;

                    // If it has completion_date, it means it was completed but > 60 days (or > 1 month for survey)
                    let statusLabel = '';
                    if (item.completion_date && item.completion_date !== '0000-00-00') {
                        statusLabel = `<div class="mt-1"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                <i class="fas fa-exclamation-circle text-[9px]"></i> เสร็จ ${item.completion_date} (เกินกำหนด)
                            </span></div>`;
                    }

                    return `
                    <tr class="border-b border-gray-100 hover:bg-gray-50 text-xs text-left">
                        <td class="px-2 py-2 text-center text-gray-500">${idx + 1}</td>
                        <td class="px-2 py-2 text-gray-700 whitespace-nowrap">${item.received_date || '-'}</td>
                        <td class="px-2 py-2 text-gray-900 font-medium">${item.applicant_name ? String(item.applicant_name).replace(/</g, '&lt;') : '-'}</td>
                        <td class="px-2 py-2 text-gray-600">${item.work_name ? String(item.work_name).replace(/</g, '&lt;') : '-'}</td>
                        <td class="px-2 py-2 text-center">
                            ${progressBadge}
                            ${statusLabel}
                        </td>
                    </tr>
                    `;
                }).join('')
                : `<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">ไม่พบรายการงานค้าง</td></tr>`;

            const date = new Date(yearMonth + '-01');
            const monthLabel = date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

            Swal.fire({
                title: `<div class="text-left text-lg font-black border-b pb-2">รายละเอียดงานค้างสะสม</div>`,
                width: 800,
                html: `
                    <div class="text-left mt-4">
                        <div class="flex justify-between items-center mb-4">
                            <div class="text-sm">
                                <span class="text-gray-500">หน่วยงาน:</span> <span class="font-bold text-gray-800">${deptLabel}</span>
                                <span class="mx-2 text-gray-300">|</span>
                                <span class="text-gray-500">ข้อมูล ณ เดือน:</span> <span class="font-bold text-gray-800">${monthLabel}</span>
                            </div>
                            <div class="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-lg text-sm font-black">
                                ทั้งหมด ${data.length.toLocaleString()} รายการ
                            </div>
                        </div>
                        <div class="overflow-y-auto max-h-[50vh] border rounded-xl custom-scrollbar">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-gray-50 sticky top-0 shadow-sm">
                                    <tr class="text-[11px] uppercase text-gray-500 font-black">
                                        <th class="px-2 py-3 text-center w-10">#</th>
                                        <th class="px-2 py-3 w-28">วันที่รับเรื่อง</th>
                                        <th class="px-2 py-3 w-40">ชื่อผู้ขอ/เจ้าของ</th>
                                        <th class="px-2 py-3">รายละเอียดงาน</th>
                                        <th class="px-2 py-3 text-center w-24">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows}
                                </tbody>
                            </table>
                        </div>
                        <div class="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700 flex items-start gap-2">
                            <i class="fas fa-info-circle mt-0.5"></i>
                            <p>รายการที่แสดงคือรายการที่ยังไม่บันทึกความสำเร็จ หรือเสร็จช้ากว่า 60 วัน นับตั้งแต่วันเริ่มต้นปีงบประมาณถึงสิ้นเดือนสัปดาห์นี้</p>
                        </div>
                    </div>
                `,
                showCloseButton: true,
                showConfirmButton: true,
                confirmButtonText: 'ปิดหน้าต่าง',
                confirmButtonColor: '#6B7280'
            });

        } catch (error) {
            console.error('Drill-down error:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถโหลดข้อมูลรายละเอียดได้',
                confirmButtonColor: '#EF4444'
            });
        }
    },

    /**
     * Export to Excel
     */
    exportToExcel() {
        const key = this.activeCacheKey;
        const data = this.cache[key];

        if (!data || !data.trend || data.trend.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่มีข้อมูล',
                text: 'กรุณาโหลดข้อมูลรายงานก่อนส่งออก',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        Swal.fire({
            title: 'กำลังสร้างไฟล์ Excel...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const yearMonth = this.currentYearMonth || 'Report';
        try {
            const wb = XLSX.utils.book_new();
            const depts = [
                { id: 'academic', label: 'ฝ่ายวิชาการ' },
                { id: 'registration', label: 'ฝ่ายทะเบียน' },
                { id: 'survey', label: 'ฝ่ายรังวัด' },
                { id: 'admin', label: 'ฝ่ายอำนวยการ' }
            ];

            data.trend.forEach(monthItem => {
                const date = new Date(monthItem.month + '-01');
                const monthLabel = date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

                const rows = [
                    ['รายงานสรุปผลการดำเนินงาน ABM - ' + monthLabel],
                    [],
                    ['ฝ่าย', 'เสร็จภายใน 30 วัน', '%', 'เสร็จภายใน 60 วัน', '%', 'ยังไม่แล้วเสร็จ', '%', 'หมายเหตุ']
                ];

                depts.forEach(dept => {
                    const dData = monthItem.depts[dept.id] || {};
                    const intake = dData.intake || 0;
                    const comp30 = dData.comp30 || 0;
                    const comp60 = dData.comp60 || 0;
                    const pending = dData.pending || 0;

                    rows.push([
                        dept.label,
                        comp30,
                        intake > 0 ? ((comp30 / intake) * 100).toFixed(2) + '%' : '0%',
                        comp60,
                        intake > 0 ? ((comp60 / intake) * 100).toFixed(2) + '%' : '0%',
                        pending,
                        intake > 0 ? ((pending / intake) * 100).toFixed(2) + '%' : '0%',
                        dData.notes || ''
                    ]);
                });

                const ws = XLSX.utils.aoa_to_sheet(rows);
                XLSX.utils.book_append_sheet(wb, ws, monthLabel.slice(0, 31));
            });

            const filename = `ABM_Report_${yearMonth}.xlsx`;
            XLSX.writeFile(wb, filename);

            Swal.fire({
                icon: 'success',
                title: 'ส่งออกสำเร็จ!',
                text: `ไฟล์ ${filename} ถูกดาวน์โหลดแล้ว`,
                confirmButtonColor: '#10b981'
            });
        } catch (error) {
            console.error('Excel export error:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถสร้างไฟล์ Excel ได้',
                confirmButtonColor: '#10b981'
            });
        }
    },

    /**
     * Export to PDF using browser print
     */
    exportToPDF() {
        const key = this.activeCacheKey;
        const data = this.cache[key];
        const yearMonth = this.currentYearMonth || 'Report';

        if (!data || !data.trend || data.trend.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่มีข้อมูล',
                text: 'กรุณาโหลดข้อมูลรายงานก่อนส่งออก',
                confirmButtonColor: '#10b981'
            });
            return;
        }

        Swal.fire({
            title: 'กำลังเตรียม PDF...',
            text: 'กรุณารอสักครู่ หน้าต่างพิมพ์จะเปิดขึ้น',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        setTimeout(() => {
            // Open print dialog
            const printContent = document.getElementById('report-data').innerHTML;
            const printWindow = window.open('', '_blank');

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>ABM Report - Ang Thong AABM - ${yearMonth}</title>
                    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
                    <style>
                        body { font-family: 'Sarabun', sans-serif; padding: 20px; }
                        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 12px; }
                        th { background: #f3f4f6; font-weight: bold; }
                        h2, h4 { margin: 10px 0; }
                        @media print { body { padding: 0; } }
                    </style>
                </head>
                <body>
                    <h2>รายงานสรุปผลการดำเนินงานตามโครงการงานค้างและงานเกิดใหม่ สำนักงานที่ดินจังหวัดอ่างทอง</h2>
                    <br>
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
    reportApp.init();
});

