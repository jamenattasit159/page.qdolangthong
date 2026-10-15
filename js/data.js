const DataManager = {
    systemSettings: null,

    /**
     * ตรวจสอบว่างานถือว่าเสร็จหรือไม่
     * ใช้ Logic เดียวกันทั้งระบบ - ตรวจสอบจาก completion_date เป็นหลัก
     * @param {Object} item - รายการงาน
     * @returns {boolean} - true ถ้างานเสร็จแล้ว
     */
    isCompleted(item) {
        const cd = item.completion_date;
        // ถ้ามี completion_date ที่ valid ถือว่าเสร็จ
        if (cd && cd !== '0000-00-00' && cd !== '0000-00-00 00:00:00' && cd !== null && cd !== '') {
            return true;
        }
        return false;
    },

    /**
     * ตรวจสอบว่างานยังค้างอยู่หรือไม่
     * @param {Object} item - รายการงาน
     * @returns {boolean} - true ถ้างานยังค้าง
     */
    isPending(item) {
        return !this.isCompleted(item);
    },

    /**
     * ตรวจสอบว่าระบบอยู่ในช่วง Lockdown หรือไม่ (ห้ามแก้วันที่เสร็จงานย้อนหลังเดือนก่อน)
     * เงื่อนไข: ทุกวันที่ 5 เวลา 01:00 น. เป็นต้นไป จะล็อคไม่ให้บันทึกงานของเดือนก่อนหน้า
     * @param {string} completionDateStr - วันที่เสร็จงานที่จะบันทึก
     * @param {string} [dept] - ฝ่าย ('survey'|'registration'|'academic'|'admin') เพื่อเช็คค่า lockdown แยกตามฝ่าย
     * @returns {Promise<boolean>} - true ถ้าถูกล็อค
     */
    async isLockdownActive(completionDateStr, dept = null) {
        if (!completionDateStr) return false;

        // Use cached settings (5 min TTL) to avoid redundant API calls
        await this.getSystemSettings();

        // ตรวจสอบ lockdown แยกตามฝ่ายก่อน (ถ้ามี dept ระบุมา)
        // ถ้าไม่มี per-dept key ให้ใช้ค่า global 'lockdown_status'
        const deptKey = dept ? `lockdown_status_${dept}` : null;
        const deptStatus = deptKey ? (this.systemSettings?.[deptKey] || null) : null;
        const lockdownStatus = deptStatus || this.systemSettings?.lockdown_status || 'auto';

        if (lockdownStatus === 'unlocked') return false; // ปลดล็อคตลอดเวลา
        if (lockdownStatus === 'locked') {
            // ล็อคตลอดเวลา (เช็คปี/เดือนด้วยเพื่อให้ล็อคเฉพาะงานย้อนหลัง)
            const now = new Date();
            const targetDate = this.getSafeDate(completionDateStr);
            if (!targetDate) return false;

            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            const targetMonth = targetDate.getMonth();
            const targetYear = targetDate.getFullYear();

            if (targetYear < currentYear) return true;
            if (targetYear === currentYear && targetMonth < currentMonth) return true;
            return false;
        }

        const now = new Date();
        const currentDay = now.getDate();
        const currentHour = now.getHours();

        // ตรวจสอบว่าเข้าเงื่อนไข Lockdown หรือยัง (วันที่ 5 เวลา 01:00 เป็นต้นไป)
        const isLockdownTime = currentDay > 5 || (currentDay === 5 && currentHour >= 1);

        if (!isLockdownTime) return false;

        const targetDate = this.getSafeDate(completionDateStr);
        if (!targetDate) return false;

        // ถ้าวันที่ที่จะบันทึก อยู่ในเดือนก่อนหน้า (หรือปีที่แล้ว) ถือว่าถูกล็อค
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();

        if (targetYear < currentYear) return true;
        if (targetYear === currentYear && targetMonth < currentMonth) return true;

        return false;
    },

    async getSystemSettings(forceRefresh = false) {
        const now = Date.now();
        // Use cache if fresh enough (5 min TTL) and not forced
        if (!forceRefresh && this._cache.settings && (now - this._cache.settingsTime < this._cache.settingsTtl)) {
            return this._cache.settings;
        }
        try {
            const baseUrl = window.API_CONFIG?.getBaseUrl() || 'api';
            const settingsUrl = `${baseUrl}/settings${baseUrl.includes('localhost') ? '' : '.php'}${forceRefresh ? `?_=${Date.now()}` : ''}`;
            const response = await fetch(settingsUrl, { cache: forceRefresh ? 'no-store' : 'default' });
            const result = await response.json();
            if (result.status === 'success') {
                this.systemSettings = result.data;
                this._cache.settings = result.data;
                this._cache.settingsTime = now;
                return result.data;
            }
            return null;
        } catch (error) {
            console.error('Error fetching settings:', error);
            return null;
        }
    },

    async updateSystemSetting(key, value) {
        try {
            const baseUrl = window.API_CONFIG?.getBaseUrl() || 'api';
            if (result.status === 'success') {
                this.systemSettings = result.data;
                this._cache.settings = result.data;
                this._cache.settingsTime = now;
                return result.data;
            }
            return null;
        } catch (error) {
            console.error('Error fetching settings:', error);
            return null;
        }
    },

    async updateSystemSetting(key, value) {
        try {
            const baseUrl = window.API_CONFIG?.getBaseUrl() || 'api';
            const response = await fetch(`${baseUrl}/settings${baseUrl.includes('localhost') ? '' : '.php'}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value })
            });
            const result = await response.json();
            if (result.status === 'success') {
                if (!this.systemSettings) this.systemSettings = {};
                this.systemSettings[key] = value;
                // Invalidate settings cache after update
                this._cache.settings = null;
                this._cache.settingsTime = 0;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error updating setting:', error);
            return false;
        }
    },

    /**
     * Invalidate in-memory item cache for a department (and stats cache).
     * Call this after any mutation (progress_type change, status save, etc.)
     * so the next read fetches fresh data from the server.
     * @param {string} workType - 'survey' | 'registration' | 'academic' | 'admin' | 'all'
     */
    clearItemCache(workType) {
        if (workType === 'survey' || workType === 'all') {
            this._cache.surveyItems = null;
            this._cache.surveyItemsTime = 0;
        }
        if (workType === 'registration' || workType === 'all') {
            this._cache.regItems = null;
            this._cache.regItemsTime = 0;
        }
        if (workType === 'academic' || workType === 'all') {
            this._cache.acadItems = null;
            this._cache.acadItemsTime = 0;
        }
        if (workType === 'admin' || workType === 'all') {
            this._cache.adminItems = null;
            this._cache.adminItemsTime = 0;
        }
        // Always clear stats so dashboard re-computes
        this._cache.lastStats = null;
        this._cache.lastStatsTime = 0;
    },

    _cache: {
        lastStats: null,
        lastStatsTime: 0,
        surveyItems: null,
        surveyItemsTime: 0,
        regItems: null,
        regItemsTime: 0,
        acadItems: null,
        acadItemsTime: 0,
        adminItems: null,
        adminItemsTime: 0,
        settings: null,
        settingsTime: 0,
        ttl: 60000, // 60 seconds TTL for data
        settingsTtl: 300000 // 5 minutes TTL for settings
    },

    async getStats() {
        const now = Date.now();
        // Check cache
        if (this._cache.lastStats && (now - this._cache.lastStatsTime < this._cache.ttl)) {
            console.log('Using cached stats');
            return this._cache.lastStats;
        }

        try {
            const baseUrl = window.API_CONFIG?.getBaseUrl() || 'api';
            const response = await fetch(`${baseUrl}/stats${baseUrl.includes('localhost') ? '' : '.php'}`);
            if (!response.ok) throw new Error('Stats API failed');
            const stats = await response.json();

            // Update cache
            this._cache.lastStats = stats;
            this._cache.lastStatsTime = now;

            return stats;
        } catch (error) {
            console.error('Stats API error, falling back to manual calculation:', error);
            // Fallback to manual calculation if API fails
            return this.getStatsManual();
        }
    },

    async getStatsManual() {
        const [surveyItems, regItems, acadItems, adminItems] = await Promise.all([
            this.getSurveyItems(),
            this.getRegistrationItems(),
            this.getAcademicItems(),
            this.getAdminItems()
        ]);

        const allItems = [
            ...surveyItems.map(i => ({ ...i, source: 'survey', department: 'ฝ่ายรังวัด' })),
            ...regItems.map(i => ({ ...i, source: 'registration', department: 'ฝ่ายทะเบียน' })),
            ...acadItems.map(i => ({ ...i, source: 'academic', department: 'กลุ่มงานวิชาการ' })),
            ...adminItems.map(i => ({ ...i, source: 'admin', department: 'ฝ่ายอำนวยการ' }))
        ];

        const total = allItems.length;
        const pending = allItems.filter(i => this.isPending(i)).length;
        const completed = allItems.filter(i => this.isCompleted(i)).length;

        const now = new Date();
        let over30 = 0;
        let over60 = 0;
        let type2 = 0;
        let type3 = 0;
        let type4 = 0;

        allItems.forEach(item => {
            if (this.isCompleted(item)) return;

            const pType = parseInt(item.progress_type);
            if (pType === 2) type2++;
            else if (pType === 3) type3++;
            else if (pType === 4) type4++;

            let startDateStr = item.received_date;
            const isSurvey = item.source === 'survey' || item.department === 'ฝ่ายรังวัด' || item.survey_type !== undefined || item.rv_12 !== undefined;
            if (isSurvey && item.received_date >= '2026-01-01' && item.survey_date && item.survey_date !== '0000-00-00') {
                startDateStr = item.survey_date;
            }
            const receivedDate = this.getSafeDate(startDateStr);
            if (!receivedDate) return;

            const diffTime = Math.abs(now - receivedDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (pType !== 2 && pType !== 3) {
                if (diffDays > 60) over60++;
                else if (diffDays > 30) over30++;
            }
        });

        const pendingByDept = {};
        const pendingBreakdown = {};
        allItems.forEach(item => {
            if (this.isCompleted(item)) return;

            const dept = item.department;
            pendingByDept[dept] = (pendingByDept[dept] || 0) + 1;

            if (!pendingBreakdown[dept]) {
                pendingBreakdown[dept] = { type2: 0, type3: 0, type4: 0, other: 0 };
            }
            const pType = parseInt(item.progress_type);
            if (pType === 2) pendingBreakdown[dept].type2++;
            else if (pType === 3) pendingBreakdown[dept].type3++;
            else if (pType === 4) pendingBreakdown[dept].type4++;
            else pendingBreakdown[dept].other++;
        });

        // Add monthly reduction KPI (Old Work)
        const oldWorkBaselineDate = new Date('2025-12-31');
        const oldWorkItems = allItems.filter(i => {
            const d = this.getSafeDate(i.received_date);
            return d && d <= oldWorkBaselineDate;
        });
        const oldWorkPending = oldWorkItems.filter(i => this.isPending(i)).length;
        const oldWorkCompleted = oldWorkItems.filter(i => this.isCompleted(i)).length;
        const totalOldWork = oldWorkItems.length;
        const reductionPercent = totalOldWork > 0 ? (oldWorkCompleted / totalOldWork) * 100 : 0;

        // Add New Work KPI (From 2026)
        const newWorkStartDate = new Date('2026-01-01');
        const newWorkItems = allItems.filter(i => {
            const d = this.getSafeDate(i.received_date);
            return d && d >= newWorkStartDate;
        });
        const totalNewWork = newWorkItems.length;

        let completedWithin30 = 0;
        let completedWithin60 = 0;

        newWorkItems.forEach(i => {
            if (this.isCompleted(i)) {
                let startStr = i.received_date;
                const isSurvey = i.source === 'survey' || i.department === 'ฝ่ายรังวัด' || i.survey_type !== undefined || i.rv_12 !== undefined;
                if (isSurvey && i.received_date >= '2026-01-01' && i.survey_date && i.survey_date !== '0000-00-00') {
                    startStr = i.survey_date;
                }
                const start = this.getSafeDate(startStr);
                const end = this.getSafeDate(i.completion_date);
                if (!start || !end) return;

                const diffTime = Math.abs(end - start);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays <= 30) completedWithin30++;
                if (diffDays <= 60) completedWithin60++;
            }
        });

        const abm30Percent = totalNewWork > 0 ? (completedWithin30 / totalNewWork) * 100 : 0;
        const abm60Percent = totalNewWork > 0 ? (completedWithin60 / totalNewWork) * 100 : 0;

        return {
            total, pending, completed, over30, over60, type2, type3, type4, pendingByDept, pendingBreakdown,
            abm: {
                oldWork: { total: totalOldWork, pending: oldWorkPending, completed: oldWorkCompleted, percent: reductionPercent },
                newWork: { total: totalNewWork, within30: abm30Percent, within60: abm60Percent }
            }
        };
    },

    getSafeDate(dateString) {
        if (!dateString) return null;
        let date = new Date(dateString);
        if (isNaN(date.getTime())) return null;

        let year = date.getFullYear();
        if (year < 100) {
            year += 2000;
            date.setFullYear(year);
        }

        // Handle Buddhist Years (if year > 2200, assume it's BE and subtract 543)
        while (year > 2200) {
            year -= 543;
            date.setFullYear(year);
        }

        return date;
    },

    // --- Survey Department API ---
    // URL is now dynamic based on API_CONFIG
    get surveyApiUrl() {
        const baseUrl = window.API_CONFIG?.getBaseUrl() || 'api';
        return `${baseUrl}/survey${baseUrl.includes('localhost') ? '' : '.php'}`;
    },

    async getSurveyItems() {
        const now = Date.now();
        if (this._cache.surveyItems && (now - this._cache.surveyItemsTime < this._cache.ttl)) {
            return this._cache.surveyItems;
        }

        try {
            const response = await fetch(this.surveyApiUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();

            this._cache.surveyItems = data;
            this._cache.surveyItemsTime = now;
            return data;
        } catch (error) {
            console.error('Fetch survey error:', error);
            return [];
        }
    },

    async saveSurveyItem(item) {
        this.clearCache('survey');
        if (window.app?.currentUser) item.user_name = window.app.currentUser.name;
        try {
            const response = await fetch(this.surveyApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            return await response.json();
        } catch (error) {
            console.error('Save survey error:', error);
            alert('บันทึกข้อมูลไม่สำเร็จ');
        }
    },

    async updateSurveyItem(item) {
        this.clearCache('survey');
        if (window.app?.currentUser) item.user_name = window.app.currentUser.name;
        try {
            const response = await fetch(this.surveyApiUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Server responded with ' + response.status);
            }
            return await response.json();
        } catch (error) {
            console.error('Update survey error:', error);
            throw error;
        }
    },

    async deleteSurveyItem(id) {
        this.clearCache('survey');
        const userName = window.app?.currentUser?.name || 'System';
        try {
            await fetch(this.surveyApiUrl, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, user_name: userName })
            });
        } catch (error) {
            console.error('Delete survey error:', error);
        }
    },

    // --- Registration Department API ---
    // URL is now dynamic based on API_CONFIG
    get registrationApiUrl() {
        const baseUrl = window.API_CONFIG?.getBaseUrl() || 'api';
        return `${baseUrl}/registration${baseUrl.includes('localhost') ? '' : '.php'}`;
    },

    async getRegistrationItems() {
        const now = Date.now();
        if (this._cache.regItems && (now - this._cache.regItemsTime < this._cache.ttl)) {
            return this._cache.regItems;
        }

        try {
            const response = await fetch(this.registrationApiUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();

            this._cache.regItems = data;
            this._cache.regItemsTime = now;
            return data;
        } catch (error) {
            console.warn('Fetch registration error (using mock data):', error);
            // ... mock data logic ...
            return [
                { id: 1, seq_no: '1', received_date: '2023-02-02', subject: 'ใบแทน', related_person: 'นางสาววันทนา รักดี', summary: 'โฉนดที่ดินสูญหาย', status_cause: 'ส่งช่าง', responsible_person: 'นายจีระเดช ฤทธิรัตน์' },
                { id: 2, seq_no: '2', received_date: '2023-02-27', subject: 'ใบแทน', related_person: 'นางสมนึก ฉุนชื่นจิตร', summary: 'โฉนดที่ดินสูญหาย', status_cause: 'รอแจก', responsible_person: 'นายจีระเดช ฤทธิรัตน์' },
                { id: 3, seq_no: '3', received_date: '2023-05-01', subject: 'ใบแทน', related_person: 'นายเลิศศักดิ์ สุวรรณภาศรี', summary: 'โฉนดที่ดินสูญหาย', status_cause: 'รอแจก', responsible_person: 'นายจีระเดช ฤทธิรัตน์' },
                { id: 4, seq_no: '4', received_date: '2023-06-13', subject: 'ใบแทน', related_person: 'นางสาวปวริศา ศุภสิทธิ์', summary: 'โฉนดที่ดินสูญหาย', status_cause: 'แจ้งผู้ขอ', responsible_person: 'นายทรงพล แสงศร' },
                { id: 5, seq_no: '5', received_date: '2023-06-28', subject: 'ใบแทน', related_person: 'นางสาวอาษา ทองคำ', summary: 'โฉนดที่ดินสูญหาย', status_cause: 'รอแจก', responsible_person: 'นายจีระเดช ฤทธิรัตน์' },
                { id: 6, seq_no: '6', received_date: '2023-08-29', subject: 'ใบแทน', related_person: 'นางน้องหน่อย แจ้งประจักษ์', summary: 'โฉนดที่ดินสูญหาย', status_cause: 'รอแจก', responsible_person: 'นายจีระเดช ฤทธิรัตน์' },
                { id: 7, seq_no: '7', received_date: '2023-11-29', subject: 'ใบแทน', related_person: 'นายสุริยฉัตร ตราชู', summary: 'โฉนดที่ดินสูญหาย', status_cause: 'รอแจก', responsible_person: 'นางสาวนวพร นพรัตน์' },
                { id: 8, seq_no: '8', received_date: '2023-11-29', subject: 'ใบแทน', related_person: 'นายสุริยฉัตร ตราชู', summary: 'โฉนดที่ดินสูญหาย', status_cause: 'รอแจก', responsible_person: 'นางสาวนวพร นพรัตน์' },
                { id: 9, seq_no: '9', received_date: '2024-01-10', subject: 'ใบแทน', related_person: 'นางสาวสุดาทิพย์ มาประดิษฐ์', summary: 'โฉนดที่ดินสูญหาย', status_cause: 'รอแจก', responsible_person: 'นางบังอร ศรีลัง' },
                { id: 10, seq_no: '10', received_date: '2024-03-22', subject: 'ใบแทน', related_person: 'นายศิริ เพ็ชรมณี', summary: 'โฉนดที่ดินสูญหาย', status_cause: 'รอแจก', responsible_person: 'นายทรงพล แสงศร' }
            ];
        }
    },

    async saveRegistrationItem(item) {
        this.clearCache('registration');
        try {
            const response = await fetch(this.registrationApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            return await response.json();
        } catch (error) {
            console.error('Save registration error:', error);
            alert('บันทึกข้อมูลไม่สำเร็จ (Demo Mode)');
        }
    },

    async updateRegistrationItem(item) {
        this.clearCache('registration');
        if (window.app?.currentUser) item.user_name = window.app.currentUser.name;
        try {
            const response = await fetch(this.registrationApiUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Server responded with ' + response.status);
            }
            return await response.json();
        } catch (error) {
            console.error('Update registration error:', error);
            throw error;
        }
    },

    async deleteRegistrationItem(id) {
        this.clearCache('registration');
        try {
            await fetch(this.registrationApiUrl, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id })
            });
        } catch (error) {
            console.error('Delete registration error:', error);
        }
    },

    // --- Academic Department API ---
    // URL is now dynamic based on API_CONFIG
    get academicApiUrl() {
        const baseUrl = window.API_CONFIG?.getBaseUrl() || 'api';
        return `${baseUrl}/academic${baseUrl.includes('localhost') ? '' : '.php'}`;
    },

    async getAcademicItems() {
        const now = Date.now();
        if (this._cache.acadItems && (now - this._cache.acadItemsTime < this._cache.ttl)) {
            return this._cache.acadItems;
        }

        try {
            const response = await fetch(this.academicApiUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();

            this._cache.acadItems = data;
            this._cache.acadItemsTime = now;
            return data;
        } catch (error) {
            console.error('Fetch academic error:', error);
            return [];
        }
    },

    async saveAcademicItem(item) {
        this.clearCache('academic');
        try {
            const response = await fetch(this.academicApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            return await response.json();
        } catch (error) {
            console.error('Save academic error:', error);
            throw error;
        }
    },

    async updateAcademicItem(item) {
        this.clearCache('academic');
        if (window.app?.currentUser) item.user_name = window.app.currentUser.name;
        try {
            const response = await fetch(this.academicApiUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Server responded with ' + response.status);
            }
            return await response.json();
        } catch (error) {
            console.error('Update academic error:', error);
            throw error;
        }
    },

    async deleteAcademicItem(id) {
        this.clearCache('academic');
        try {
            await fetch(this.academicApiUrl, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id })
            });
        } catch (error) {
            console.error('Delete academic error:', error);
        }
    },

    // --- Admin Department API ---
    get adminApiUrl() {
        const baseUrl = window.API_CONFIG?.getBaseUrl() || 'api';
        return `${baseUrl}/admin${baseUrl.includes('localhost') ? '' : '.php'}`;
    },

    async getAdminItems() {
        const now = Date.now();
        if (this._cache.adminItems && (now - this._cache.adminItemsTime < this._cache.ttl)) {
            return this._cache.adminItems;
        }

        try {
            const response = await fetch(this.adminApiUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();

            this._cache.adminItems = data;
            this._cache.adminItemsTime = now;
            return data;
        } catch (error) {
            console.error('Fetch admin error:', error);
            return [];
        }
    },

    async saveAdminItem(item) {
        this.clearCache('admin');
        try {
            const response = await fetch(this.adminApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            return await response.json();
        } catch (error) {
            console.error('Save admin error:', error);
            throw error;
        }
    },

    async updateAdminItem(item) {
        this.clearCache('admin');
        if (window.app?.currentUser) item.user_name = window.app.currentUser.name;
        try {
            const response = await fetch(this.adminApiUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Server responded with ' + response.status);
            }
            return await response.json();
        } catch (error) {
            console.error('Update admin error:', error);
            throw error;
        }
    },

    async deleteAdminItem(id) {
        this.clearCache('admin');
        try {
            await fetch(this.adminApiUrl, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id })
            });
        } catch (error) {
            console.error('Delete admin error:', error);
        }
    },

    async getStatusHistory(params = {}) {
        try {
            const baseUrl = window.API_CONFIG?.getBaseUrl() || 'api';
            const query = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    query.append(key, value);
                }
            });

            const queryString = query.toString();
            const suffix = baseUrl.includes('localhost') ? '' : '.php';
            const response = await fetch(`${baseUrl}/status_history${suffix}${queryString ? `?${queryString}` : ''}`);
            if (!response.ok) throw new Error('Status history fetch failed');
            return await response.json();
        } catch (error) {
            console.error('Fetch status history error:', error);
            return [];
        }
    },

    clearCache(department = null) {
        // Always invalidate stats when any data changes
        this._cache.lastStats = null;
        this._cache.lastStatsTime = 0;
        this._cache.settings = null;
        this._cache.settingsTime = 0;

        if (!department) {
            // Clear all department caches
            this._cache.surveyItems = null;
            this._cache.surveyItemsTime = 0;
            this._cache.regItems = null;
            this._cache.regItemsTime = 0;
            this._cache.acadItems = null;
            this._cache.acadItemsTime = 0;
            this._cache.adminItems = null;
            this._cache.adminItemsTime = 0;
        } else if (department === 'survey') {
            this._cache.surveyItems = null;
            this._cache.surveyItemsTime = 0;
        } else if (department === 'registration') {
            this._cache.regItems = null;
            this._cache.regItemsTime = 0;
        } else if (department === 'academic') {
            this._cache.acadItems = null;
            this._cache.acadItemsTime = 0;
        } else if (department === 'admin') {
            this._cache.adminItems = null;
            this._cache.adminItemsTime = 0;
        }
    }
};

