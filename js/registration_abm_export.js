/**
 * Registration ABM Export Application
 * Logic for fetching and exporting detailed registration data
 */

const RegistrationExport = {
    currentYearMonth: null,
    currentFilter: 'all',

    init() {
        // Set default month to current
        const today = new Date();
        const defaultMonth = today.toISOString().slice(0, 7);
        const monthInput = document.getElementById('export-month');

        if (monthInput) {
            monthInput.value = defaultMonth;
            this.currentYearMonth = defaultMonth;
        }

        // Event Listeners
        document.getElementById('btn-update').addEventListener('click', () => this.loadData());
        document.getElementById('btn-excel').addEventListener('click', () => this.exportExcel());
        document.getElementById('btn-pdf').addEventListener('click', () => window.print());

        // Filter Group Listeners
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.type;
                this.loadData();
            });
        });

        // Initial Load
        this.loadData();
    },

    async loadData() {
        const monthInput = document.getElementById('export-month');
        const yearMonth = monthInput.value;
        this.currentYearMonth = yearMonth;

        if (!yearMonth) {
            Swal.fire('แจ้งเตือน', 'กรุณาเลือกเดือน', 'warning');
            return;
        }

        Swal.fire({
            title: 'กำลังโหลดข้อมูล...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            // 1. Fetch Summary Data (to get manual overrides like Sameday)
            const summaryResp = await fetch(`api/abm_report.php?years_month=${yearMonth}`);
            const summaryData = await summaryResp.json();

            // 2. Fetch Detailed Data from Database based on Filter
            const detailsResp = await fetch(`api/abm_details.php?department=registration&year_month=${yearMonth}&type=${this.currentFilter}`);
            const detailsData = await detailsResp.json();

            if (summaryData.status === 'success' && detailsData.status === 'success') {
                this.renderUI(summaryData, detailsData);
                this.updateTableTitle();
                Swal.close();
            } else {
                throw new Error('Data fetch unsuccessful');
            }
        } catch (error) {
            console.error('Error loading data:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลได้', 'error');
        }
    },

    renderUI(summary, details) {
        // Find registration data in trend
        const regSummary = summary.trend[0].depts.registration;
        const list = details.data || [];

        // Update Stats (Always show raw totals from summary)
        document.getElementById('stat-intake').textContent = regSummary.intake.toLocaleString();
        document.getElementById('stat-30').textContent = regSummary.comp30.toLocaleString();
        document.getElementById('stat-60').textContent = regSummary.comp60.toLocaleString();
        document.getElementById('stat-pending').textContent = regSummary.pending.toLocaleString();

        // Render Table
        const tbody = document.getElementById('table-body');
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-12 text-center text-slate-400">ไม่พบข้อมูล "${this.getFilterName()}" สำหรับเดือนนี้</td></tr>`;
            return;
        }

        let html = '';
        list.forEach((item, index) => {
            const receivedDate = new Date(item.received_date);
            const completionDate = item.completion_date && item.completion_date !== '0000-00-00' ? new Date(item.completion_date) : null;

            let days = '-';
            let statusBadge = '';

            if (completionDate) {
                const diffTime = Math.abs(completionDate - receivedDate);
                days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (days <= 30) {
                    statusBadge = '<span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">30 วัน</span>';
                } else if (days <= 60) {
                    statusBadge = '<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">60 วัน</span>';
                } else {
                    statusBadge = '<span class="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">เกิน 60 วัน</span>';
                }
            } else {
                statusBadge = '<span class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">ค้างดำเนินการ</span>';
            }

            html += `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="px-6 py-4 text-center text-xs font-medium text-slate-400">${index + 1}</td>
                    <td class="px-6 py-4 text-xs font-bold text-slate-700">${item.received_date}</td>
                    <td class="px-6 py-4 text-xs text-indigo-600 font-mono">${item.seq_no || '-'}</td>
                    <td class="px-6 py-4 text-xs max-w-xs truncate" title="${item.work_name}">${item.work_name}</td>
                    <td class="px-6 py-4 text-xs font-medium">${item.applicant_name}</td>
                    <td class="px-6 py-4 text-center text-xs">${item.completion_date && item.completion_date !== '0000-00-00' ? item.completion_date : '-'}</td>
                    <td class="px-6 py-4 text-center text-xs font-bold ${days !== '-' && days > 60 ? 'text-rose-600' : ''}">${days}</td>
                    <td class="px-6 py-4 text-center">${statusBadge}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    updateTableTitle() {
        const titleEl = document.querySelector('h2.text-xl.font-bold');
        if (titleEl) {
            titleEl.textContent = `รายละเอียดรายการรับเรื่อง - ภารกิจ ${this.getFilterName()}`;
        }
    },

    getFilterName() {
        const names = {
            'all': 'รับเรื่องทั้งหมด (Intake)',
            'comp30': 'งานเสร็จภายใน 30 วัน',
            'comp60': 'งานเสร็จภายใน 60 วัน',
            'pending': 'งานค้างดำเนินการ'
        };
        return names[this.currentFilter] || 'ข้อมูลทะเบียน';
    },

    exportExcel() {
        const table = document.getElementById('export-table');
        const wb = XLSX.utils.table_to_book(table, { sheet: "Registration_ABM" });
        const fileName = `Registration_${this.currentFilter}_${this.currentYearMonth}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }
};

document.addEventListener('DOMContentLoaded', () => RegistrationExport.init());
