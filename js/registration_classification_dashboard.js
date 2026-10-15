const RegistrationClassificationDashboard = {
    detailDataTable: null,
    activeCategory: 'all',

    init() {
        this.bindEvents();
        this.setDefaultDates();
        this.loadData();
    },

    bindEvents() {
        const btnLoad = document.getElementById('btn-load');
        if (btnLoad) {
            btnLoad.addEventListener('click', () => this.loadData());
        }
    },

    setDefaultDates() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

        const start = document.getElementById('start-date');
        const end = document.getElementById('end-date');

        if (start) start.value = this.formatDateInput(firstDay);
        if (end) end.value = this.formatDateInput(now);
    },

    formatDateInput(date) {
        return date.toISOString().slice(0, 10);
    },

    async loadData() {
        const startDate = document.getElementById('start-date')?.value;
        const endDate = document.getElementById('end-date')?.value;

        if (!startDate || !endDate) {
            alert('กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด');
            return;
        }

        if (startDate > endDate) {
            alert('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด');
            return;
        }

        this.renderLoading();

        try {
            const url = `api/registration_classification_stats.php?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;
            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok || data.status !== 'success') {
                throw new Error(data.message || 'ไม่สามารถดึงข้อมูลได้');
            }

            this.renderMeta(data.meta, data.details || []);
            this.renderSummary(data.summary || []);
            this.renderCategoryFilters(data.details || []);
            this.renderDetails(data.details || []);
        } catch (error) {
            this.renderError(error.message || 'เกิดข้อผิดพลาด');
        }
    },

    renderLoading() {
        this.destroyDetailsDataTable();
        document.getElementById('summary-body').innerHTML = '<tr><td colspan="12" class="px-4 py-6 text-center text-slate-400">กำลังโหลดข้อมูล...</td></tr>';
        document.getElementById('details-body').innerHTML = '<tr><td colspan="10" class="px-4 py-6 text-center text-slate-400">กำลังโหลดข้อมูล...</td></tr>';
        document.getElementById('category-filters').innerHTML = '';
        document.getElementById('detail-count').textContent = '';
    },

    renderMeta(meta, details) {
        const metaInfo = document.getElementById('meta-info');
        const detailCount = document.getElementById('detail-count');

        if (metaInfo) {
            metaInfo.textContent = `ข้อมูลช่วงวันที่ ${meta.start_date} ถึง ${meta.end_date} | อัปเดตเมื่อ ${meta.generated_at}`;
        }

        if (detailCount) {
            detailCount.textContent = `จำนวน ${details.length.toLocaleString()} รายการ`;
        }
    },

    renderSummary(summary) {
        const tbody = document.getElementById('summary-body');
        if (!tbody) return;

        const categoryOrder = [
            { order: 1, label: 'งานออกโฉนดที่ดินเฉพาะราย (ไม่รวมงาน ส.ค.๑ ตามข้อ ๑.๔)' },
            { order: 2, label: 'งานแบ่งแยก/ สอบเขต/รวมโฉนด' },
            { order: 3, label: 'งานมรดก' },
            { order: 4, label: 'งานใบแทน' },
            { order: 5, label: 'งานจดทะเบียนสิทธิและนิติกรรมอื่นๆ (ที่ต้องดำเนินการประกาศ) เช่น ขาย/จำนอง/ให้เช่า/งานโรงเรือน ฯลฯ เป็นต้น' }
        ];

        if (!summary.length) {
            tbody.innerHTML = '<tr><td colspan="12" class="px-4 py-6 text-center text-slate-400">ไม่พบข้อมูลในช่วงวันที่ที่เลือก</td></tr>';
            return;
        }

        const mapByOrder = new Map();
        summary.forEach((item) => {
            mapByOrder.set(Number(item.category_order || 0), this.normalizeSummaryItem(item));
        });

        const total = {
            pending_count: 0,
            completed_count: 0,
            carry_forward_count: 0,
            announce_count: 0,
            notice_1_count: 0,
            notice_2_count: 0,
            rights_notice_count: 0,
            appeal_count: 0,
            court_count: 0,
            other_count: 0,
            total_rows: 0
        };

        const totalGroupOne = {
            pending_count: 0,
            completed_count: 0,
            carry_forward_count: 0,
            announce_count: 0,
            notice_1_count: 0,
            notice_2_count: 0,
            rights_notice_count: 0,
            appeal_count: 0,
            court_count: 0,
            other_count: 0,
            total_rows: 0
        };

        const totalGroupTwo = {
            pending_count: 0,
            completed_count: 0,
            carry_forward_count: 0,
            announce_count: 0,
            notice_1_count: 0,
            notice_2_count: 0,
            rights_notice_count: 0,
            appeal_count: 0,
            court_count: 0,
            other_count: 0,
            total_rows: 0
        };

        const addToTotal = (target, source) => {
            Object.keys(target).forEach((key) => {
                target[key] += source[key];
            });
        };

        const rows = categoryOrder.map((categoryItem) => {
            const normalized = mapByOrder.get(categoryItem.order) || this.normalizeSummaryItem({});
            addToTotal(total, normalized);
            if (categoryItem.order === 1) {
                addToTotal(totalGroupOne, normalized);
            } else {
                addToTotal(totalGroupTwo, normalized);
            }

            return `<tr class="hover:bg-slate-50">
                <td class="px-3 py-2 font-semibold text-slate-800">${this.escapeHtml(categoryItem.label)}</td>
                <td class="px-3 py-2 text-center">${normalized.pending_count.toLocaleString()}</td>
                <td class="px-3 py-2 text-center">${normalized.completed_count.toLocaleString()}</td>
                <td class="px-3 py-2 text-center">${normalized.carry_forward_count.toLocaleString()}</td>
                <td class="px-3 py-2 text-center">${normalized.announce_count.toLocaleString()}</td>
                <td class="px-3 py-2 text-center">${normalized.notice_1_count.toLocaleString()}</td>
                <td class="px-3 py-2 text-center">${normalized.notice_2_count.toLocaleString()}</td>
                <td class="px-3 py-2 text-center">${normalized.rights_notice_count.toLocaleString()}</td>
                <td class="px-3 py-2 text-center">${normalized.appeal_count.toLocaleString()}</td>
                <td class="px-3 py-2 text-center">${normalized.court_count.toLocaleString()}</td>
                <td class="px-3 py-2 text-center">${normalized.other_count.toLocaleString()}</td>
                <td class="px-3 py-2 text-center font-bold">${normalized.total_rows.toLocaleString()}</td>
            </tr>`;
        }).join('');

        const groupOneRow = `<tr class="bg-sky-100/70 font-bold text-sky-900">
            <td class="px-3 py-2">รวมงาน ๑</td>
            <td class="px-3 py-2 text-center">${totalGroupOne.pending_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupOne.completed_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupOne.carry_forward_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupOne.announce_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupOne.notice_1_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupOne.notice_2_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupOne.rights_notice_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupOne.appeal_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupOne.court_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupOne.other_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupOne.total_rows.toLocaleString()}</td>
        </tr>`;

        const groupTwoRow = `<tr class="bg-indigo-100/70 font-bold text-indigo-900">
            <td class="px-3 py-2">รวมงาน ๒</td>
            <td class="px-3 py-2 text-center">${totalGroupTwo.pending_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupTwo.completed_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupTwo.carry_forward_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupTwo.announce_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupTwo.notice_1_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupTwo.notice_2_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupTwo.rights_notice_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupTwo.appeal_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupTwo.court_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupTwo.other_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${totalGroupTwo.total_rows.toLocaleString()}</td>
        </tr>`;

        const totalRow = `<tr class="bg-blue-100/70 font-bold text-blue-900">
            <td class="px-3 py-2">รวมงานทั้งสิ้น ๑+๒</td>
            <td class="px-3 py-2 text-center">${total.pending_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${total.completed_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${total.carry_forward_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${total.announce_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${total.notice_1_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${total.notice_2_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${total.rights_notice_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${total.appeal_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${total.court_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${total.other_count.toLocaleString()}</td>
            <td class="px-3 py-2 text-center">${total.total_rows.toLocaleString()}</td>
        </tr>`;

        tbody.innerHTML = rows + groupOneRow + groupTwoRow + totalRow;
    },

    normalizeSummaryItem(item) {
        return {
            pending_count: Number(item.pending_count || 0),
            completed_count: Number(item.completed_count || 0),
            carry_forward_count: Number(item.carry_forward_count || 0),
            announce_count: Number(item.announce_count || 0),
            notice_1_count: Number(item.notice_1_count || 0),
            notice_2_count: Number(item.notice_2_count || 0),
            rights_notice_count: Number(item.rights_notice_count || 0),
            appeal_count: Number(item.appeal_count || 0),
            court_count: Number(item.court_count || 0),
            other_count: Number(item.other_count || 0),
            total_rows: Number(item.total_rows || 0)
        };
    },

    renderDetails(details) {
        const tbody = document.getElementById('details-body');
        if (!tbody) return;

        this.destroyDetailsDataTable();

        if (!details.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="px-4 py-6 text-center text-slate-400">ไม่พบรายละเอียดรายการ</td></tr>';
            return;
        }

        tbody.innerHTML = details.map((item, index) => `
            <tr class="hover:bg-slate-50 align-top">
                <td class="px-3 py-2 text-center text-slate-500">${index + 1}</td>
                <td class="px-3 py-2">${this.escapeHtml(item.category || '-')}</td>
                <td class="px-3 py-2 whitespace-nowrap">
                    <span class="inline-flex px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs">${this.escapeHtml(item.work_state || '-')}</span>
                </td>
                <td class="px-3 py-2">
                    <span class="inline-flex px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-xs">${this.escapeHtml(item.status_group || '-')}</span>
                </td>
                <td class="px-3 py-2 whitespace-nowrap">${this.escapeHtml(item.received_date || '-')}</td>
                <td class="px-3 py-2 whitespace-nowrap">${this.escapeHtml(item.seq_no || '-')}</td>
                <td class="px-3 py-2 max-w-[320px]">${this.escapeHtml(item.subject || '-')}</td>
                <td class="px-3 py-2 max-w-[240px]">${this.escapeHtml(item.related_person || '-')}</td>
                <td class="px-3 py-2 max-w-[260px]">${this.escapeHtml(item.status_text || item.status_cause || item.summary || '-')}</td>
                <td class="px-3 py-2 whitespace-nowrap">${this.escapeHtml(item.completion_date && item.completion_date !== '0000-00-00' ? item.completion_date : '-')}</td>
            </tr>
        `).join('');

        this.initDetailsDataTable();
    },

    renderCategoryFilters(details) {
        const container = document.getElementById('category-filters');
        if (!container) return;

        if (!details.length) {
            container.innerHTML = '';
            this.activeCategory = 'all';
            return;
        }

        const categoryMap = new Map();
        details.forEach((item) => {
            const label = item.category || 'ไม่ระบุประเภท';
            const order = Number(item.category_order || 999);
            if (!categoryMap.has(label) || order < categoryMap.get(label).order) {
                categoryMap.set(label, { label, order });
            }
        });

        const categories = Array.from(categoryMap.values())
            .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'th'))
            .map((item) => item.label);

        if (!categories.includes(this.activeCategory)) {
            this.activeCategory = 'all';
        }

        const allButtonClass = this.activeCategory === 'all' ? ' active' : '';
        container.innerHTML = `
            <button type="button" data-category="all" class="category-filter-btn${allButtonClass} px-3 py-1.5 rounded-full border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-blue-50 transition whitespace-nowrap">ทั้งหมด</button>
            ${categories.map((label) => {
                const isActive = this.activeCategory === label ? ' active' : '';
                return `<button type="button" data-category="${this.escapeHtml(label)}" class="category-filter-btn${isActive} px-3 py-1.5 rounded-full border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-blue-50 transition max-w-full whitespace-normal leading-tight text-left">${this.escapeHtml(label)}</button>`;
            }).join('')}
        `;

        container.querySelectorAll('.category-filter-btn').forEach((button) => {
            button.addEventListener('click', () => {
                this.activeCategory = button.getAttribute('data-category') || 'all';
                container.querySelectorAll('.category-filter-btn').forEach((btn) => {
                    btn.classList.toggle('active', btn === button);
                });
                this.applyCategoryFilter();
            });
        });
    },

    initDetailsDataTable() {
        if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.DataTable) {
            return;
        }

        this.detailDataTable = window.jQuery('#details-table').DataTable({
            pageLength: 25,
            lengthMenu: [10, 25, 50, 100],
            order: [[4, 'desc']],
            autoWidth: false,
            scrollX: true,
            scrollY: '50vh',
            scrollCollapse: true,
            dom: '<"flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3"lf>t<"flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-3"ip>',
            columnDefs: [
                { targets: 0, orderable: false, searchable: false }
            ],
            language: {
                search: 'ค้นหา:',
                lengthMenu: 'แสดง _MENU_ รายการ',
                info: 'แสดง _START_ ถึง _END_ จาก _TOTAL_ รายการ',
                infoEmpty: 'ไม่มีข้อมูล',
                zeroRecords: 'ไม่พบข้อมูลที่ค้นหา',
                paginate: {
                    first: 'หน้าแรก',
                    last: 'หน้าสุดท้าย',
                    next: 'ถัดไป',
                    previous: 'ก่อนหน้า'
                }
            }
        });

        this.detailDataTable.on('draw.dt order.dt search.dt', () => this.updateRowNumbers());
        this.updateRowNumbers();
        this.applyCategoryFilter();
    },

    applyCategoryFilter() {
        if (!this.detailDataTable) return;

        if (this.activeCategory === 'all') {
            this.detailDataTable.column(1).search('').draw();
            return;
        }

        const pattern = `^${this.escapeRegex(this.activeCategory)}$`;
        this.detailDataTable.column(1).search(pattern, true, false).draw();
    },

    updateRowNumbers() {
        if (!this.detailDataTable) return;

        this.detailDataTable.rows({ search: 'applied', order: 'applied' }).every(function (rowIdx) {
            this.cell(rowIdx, 0).data(rowIdx + 1);
        });
    },

    destroyDetailsDataTable() {
        if (this.detailDataTable) {
            this.detailDataTable.destroy();
            this.detailDataTable = null;
        }
    },

    renderError(message) {
        this.destroyDetailsDataTable();
        document.getElementById('summary-body').innerHTML = `<tr><td colspan="12" class="px-4 py-6 text-center text-red-500">${this.escapeHtml(message)}</td></tr>`;
        document.getElementById('details-body').innerHTML = '<tr><td colspan="10" class="px-4 py-6 text-center text-slate-400">ไม่มีข้อมูล</td></tr>';
        document.getElementById('category-filters').innerHTML = '';
    },

    escapeRegex(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};

document.addEventListener('DOMContentLoaded', () => RegistrationClassificationDashboard.init());
