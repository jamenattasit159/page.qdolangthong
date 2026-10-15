/**
 * Same-Day Completion Report Application
 * รายงานงานเกิดเสร็จวันเดียว
 */

window.samedayReport = {
    // Cache for loaded data
    cache: {},
    currentLogs: [],
    summary: {},
    isLoading: false,

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

        // Set default month to current month
        const today = new Date();
        const yearMonth = today.toISOString().slice(0, 7);
        const monthInput = document.getElementById('filter-month');
        if (monthInput) monthInput.value = yearMonth;

        // If not admin, lock department filter
        if (!isAdmin) {
            const deptSelect = document.getElementById('filter-department');
            if (deptSelect) {
                deptSelect.value = user.department;
                deptSelect.disabled = true;
                deptSelect.classList.add('bg-gray-100', 'cursor-not-allowed');
            }
        }

        // Load initial data
        this.loadReport();
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
            btn.innerHTML = '<i class="fas fa-sync-alt mr-1.5"></i> โหลดข้อมูล';
        }
    },

    /**
     * Load report data from API
     */
    async loadReport() {
        const yearMonth = document.getElementById('filter-month').value;
        const department = document.getElementById('filter-department').value;

        this.showLoading();

        try {
            let url = `api/sameday_logs.php?year_month=${yearMonth}`;
            if (department && department !== 'all') {
                url += `&department=${department}`;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to load report data');

            const data = await response.json();

            if (data.status === 'success') {
                this.currentLogs = data.logs || [];
                this.summary = data.summary || [];
                this.renderReport();
                this.updateSummaryCards();
            } else {
                throw new Error(data.error || 'Unknown error');
            }
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
     * Get department display name
     */
    getDeptName(dept) {
        const names = {
            'survey': 'กลุ่มงานรังวัด',
            'registration': 'กลุ่มงานทะเบียน',
            'academic': 'กลุ่มงานวิชาการ'
        };
        return names[dept] || dept;
    },

    /**
     * Get department badge HTML
     */
    getDeptBadge(dept) {
        const classes = {
            'survey': 'dept-survey',
            'registration': 'dept-registration',
            'academic': 'dept-academic'
        };
        const icons = {
            'survey': 'fas fa-compass',
            'registration': 'fas fa-file-signature',
            'academic': 'fas fa-graduation-cap'
        };
        const badgeClass = classes[dept] || 'bg-gray-100 text-gray-600';
        const icon = icons[dept] || 'fas fa-building';

        return `<span class="dept-badge ${badgeClass}">
            <i class="${icon} mr-1"></i>
            ${this.getDeptName(dept)}
        </span>`;
    },

    /**
     * Format date for display
     */
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    /**
     * Format datetime for display
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Render the report table
     */
    renderReport() {
        const tbody = document.getElementById('logs-tbody');

        if (!this.currentLogs || this.currentLogs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-12 text-gray-400">
                        <i class="fas fa-inbox text-4xl mb-3 block"></i>
                        ไม่พบข้อมูลในช่วงเวลาที่เลือก
                    </td>
                </tr>
            `;
            this.hideLoading();
            return;
        }

        let html = '';
        this.currentLogs.forEach((log, index) => {
            html += `
                <tr>
                    <td class="font-medium text-gray-600">${index + 1}</td>
                    <td class="font-medium">${this.formatDate(log.record_date)}</td>
                    <td>${this.getDeptBadge(log.department)}</td>
                    <td class="font-bold text-emerald-600 text-lg">${parseInt(log.count).toLocaleString()}</td>
                    <td class="text-left text-gray-600 text-sm">${log.notes || '-'}</td>
                    <td class="text-gray-700">${log.created_by || '-'}</td>
                    <td class="text-gray-500 text-sm">${this.formatDateTime(log.created_at)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        this.hideLoading();
    },

    /**
     * Update summary cards
     */
    updateSummaryCards() {
        let totalCount = 0;
        let surveyCount = 0;
        let registrationCount = 0;
        let academicCount = 0;

        // Calculate from summary if available
        if (this.summary && this.summary.length > 0) {
            this.summary.forEach(item => {
                const count = parseInt(item.total_count) || 0;
                totalCount += count;

                switch (item.department) {
                    case 'survey':
                        surveyCount = count;
                        break;
                    case 'registration':
                        registrationCount = count;
                        break;
                    case 'academic':
                        academicCount = count;
                        break;
                }
            });
        } else if (this.currentLogs && this.currentLogs.length > 0) {
            // Calculate from logs if no summary
            this.currentLogs.forEach(log => {
                const count = parseInt(log.count) || 0;
                totalCount += count;

                switch (log.department) {
                    case 'survey':
                        surveyCount += count;
                        break;
                    case 'registration':
                        registrationCount += count;
                        break;
                    case 'academic':
                        academicCount += count;
                        break;
                }
            });
        }

        // Update UI with animation
        this.animateCounter('total-count', totalCount);
        this.animateCounter('survey-count', surveyCount);
        this.animateCounter('registration-count', registrationCount);
        this.animateCounter('academic-count', academicCount);
    },

    /**
     * Animate counter
     */
    animateCounter(elementId, targetValue) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const duration = 500;
        const startValue = parseInt(element.textContent) || 0;
        const startTime = performance.now();

        const updateCounter = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const currentValue = Math.round(startValue + (targetValue - startValue) * easeProgress);

            element.textContent = currentValue.toLocaleString();

            if (progress < 1) {
                requestAnimationFrame(updateCounter);
            }
        };

        requestAnimationFrame(updateCounter);
    },

    /**
     * Export to Excel
     */
    exportToExcel() {
        if (!this.currentLogs || this.currentLogs.length === 0) {
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

        try {
            const yearMonth = document.getElementById('filter-month').value;
            const rows = [
                [`รายงานงานเกิดเสร็จวันเดียว - ${yearMonth}`],
                [],
                ['ลำดับ', 'วันที่บันทึก', 'ฝ่ายงาน', 'จำนวน (ราย)', 'หมายเหตุ', 'ผู้บันทึก', 'วันเวลาบันทึก']
            ];

            this.currentLogs.forEach((log, index) => {
                rows.push([
                    index + 1,
                    this.formatDate(log.record_date),
                    this.getDeptName(log.department),
                    parseInt(log.count) || 0,
                    log.notes || '',
                    log.created_by || '',
                    this.formatDateTime(log.created_at)
                ]);
            });

            // Add summary
            rows.push([]);
            rows.push(['สรุปรวม']);

            let totalCount = 0;
            this.summary.forEach(item => {
                const count = parseInt(item.total_count) || 0;
                totalCount += count;
                rows.push([this.getDeptName(item.department), '', '', count, '', '', '']);
            });
            rows.push(['รวมทั้งหมด', '', '', totalCount, '', '', '']);

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, 'รายงาน');

            const filename = `SameDay_Report_${yearMonth}.xlsx`;
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
        if (!this.currentLogs || this.currentLogs.length === 0) {
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
            text: 'หน้าต่างพิมพ์จะเปิดขึ้น',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const yearMonth = document.getElementById('filter-month').value;

        setTimeout(() => {
            const printContent = document.getElementById('report-data').innerHTML;
            const printWindow = window.open('', '_blank');

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Same Day Report - Ang Thong AABM - ${yearMonth}</title>
                    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
                    <style>
                        body { font-family: 'Sarabun', sans-serif; padding: 20px; margin: 0; }
                        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: center; font-size: 12px; }
                        th { background: #d1fae5; font-weight: bold; color: #065f46; }
                        h2 { margin: 0 0 5px 0; font-size: 16px; color: #065f46; }
                        p { margin: 0 0 15px 0; font-size: 13px; color: #666; }
                        .dept-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
                        .dept-survey { background: #fef3c7; color: #92400e; }
                        .dept-registration { background: #dbeafe; color: #1e40af; }
                        .dept-academic { background: #fce7f3; color: #9d174d; }
                        @media print { body { padding: 10px; } }
                    </style>
                </head>
                <body>
                    <h2>รายงานงานเกิดเสร็จวันเดียว - สำนักงานที่ดินจังหวัดอ่างทอง</h2>
                    <p>ประจำเดือน: ${yearMonth}</p>
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
    samedayReport.init();
});

