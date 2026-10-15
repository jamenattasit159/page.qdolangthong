window.app = {
    currentUser: null,
    idleTimer: null,
    timeoutSettings: 40 * 60 * 1000, // 40 minutes
    sessionMaxAge: 4 * 60 * 60 * 1000, // 24 hours - session จะหมดอายุหลังจาก 24 ชั่วโมง

    // State for List View
    currentDepFilter: 'all',
    currentSort: 'desc',
    currentPage: 1,
    itemsPerPage: 20,
    searchTerm: '',
    currentStatusFilter: 'all',

    // Status View State (pending/completed)
    surveyStatusView: 'pending',
    registrationStatusView: 'pending',
    academicStatusView: 'pending',
    adminStatusView: 'pending',

    // Progress Type Filter State (all, 1, 2, 3)
    surveyProgressFilter: 'all',
    registrationProgressFilter: 'all',
    academicProgressFilter: 'all',
    adminProgressFilter: 'all',
    dashboardMetricItems: [],
    dashboardMetricTitle: '',

    // State for the read-only, cross-department work search
    allWorkSearchItems: [],
    allWorkSearchTerm: '',
    allWorkSearchDepartment: 'all',
    allWorkSearchStatus: 'all',
    allWorkSearchTimer: null,

    // Month Filter State (all, 1-12)
    surveyMonthFilter: 'all',
    registrationMonthFilter: 'all',
    academicMonthFilter: 'all',
    adminMonthFilter: 'all',

    init() {
        console.log('App initialized v2.0');
        this.checkSession();
        this.updateDate();
        if (this.currentUser) {
            this.startIdleMonitor();
            // Load system settings (Lockdown, etc.)
            DataManager.getSystemSettings();
        }

        // Initialize AOS
        if (typeof AOS !== 'undefined') {
            AOS.init({
                duration: 800,
                once: true,
                offset: 50
            });
        }
    },

    checkSession() {
        // If URL has ?role=citizen, clean it and show staff login by default
        if (window.location.search.includes('role=citizen')) {
            try {
                window.history.replaceState({}, '', 'index.html');
            } catch (e) {}
            this.clearSession();
            this.showLogin();
            this.switchLoginRole('staff');
            return;
        }

        // Session check with expiration (localStorage)
        const user = localStorage.getItem('dol_user');
        const sessionTimestamp = localStorage.getItem('dol_session_timestamp');

        if (user && sessionTimestamp) {
            const loginTime = parseInt(sessionTimestamp, 10);
            const now = Date.now();
            const sessionAge = now - loginTime;

            // Check if session has expired
            if (sessionAge > this.sessionMaxAge) {
                this.clearSession();
                this.showLogin();
                return;
            }

            try {
                this.currentUser = JSON.parse(user);
            } catch (e) {
                this.clearSession();
                this.showLogin();
                return;
            }

            // If citizen session, verify backend session is active before redirecting to avoid infinite loop
            if (this.currentUser && this.currentUser.role === 'citizen') {
                fetch('api/status_tracking_api.php?action=checkAuth')
                    .then(r => r.json())
                    .then(res => {
                        if (res && (res.authenticated || res.logged_in)) {
                            window.location.href = 'tracking/';
                        } else {
                            this.clearSession();
                            this.showLogin();
                            this.switchLoginRole('staff');
                        }
                    })
                    .catch(() => {
                        this.clearSession();
                        this.showLogin();
                        this.switchLoginRole('staff');
                    });
                return;
            }

            this.showMainApp();
        } else {
            this.clearSession();
            this.showLogin();
        }
    },

    clearSession() {
        this.currentUser = null;
        localStorage.removeItem('dol_user');
        localStorage.removeItem('dol_session_timestamp');
        clearTimeout(this.idleTimer);
    },

    showLogin() {
        const overlay = document.getElementById('login-overlay');
        if (overlay) {
            overlay.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
        }
        document.getElementById('main-message-box')?.classList.add('hidden');
        document.getElementById('main-sidebar')?.classList.add('hidden');
        document.getElementById('main-content')?.classList.add('hidden');
        // Default to Staff Login
        this.switchLoginRole('staff');
    },

    showMainApp() {
        if (this.currentUser?.role === 'citizen') {
            window.location.href = 'tracking/';
            return;
        }

        document.getElementById('login-overlay').classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            document.getElementById('login-overlay').classList.add('hidden');
            document.getElementById('login-overlay').classList.remove('opacity-0', 'pointer-events-none');
        }, 500);

        const sidebar = document.getElementById('main-sidebar');
        const mainContent = document.getElementById('main-content');

        // Ensure main content is visible
        mainContent.classList.remove('hidden');

        // Hide or adjust menu items based on role
        this.updateMenuVisibility();

        const userDept = this.currentUser?.department || 'all';

        // Check if URL has parameters to open a specific work detail
        const urlParams = new URLSearchParams(window.location.search);
        const openDept = urlParams.get('open_dept') || urlParams.get('dept');
        const openId = urlParams.get('open_id') || urlParams.get('id');

        if (openDept && openId) {
            this.navigate(openDept + '_list');
            setTimeout(async () => {
                try {
                    if (openDept === 'survey') await this.viewSurveyDetail(openId);
                    else if (openDept === 'registration') await this.viewRegistrationDetail(openId);
                    else if (openDept === 'academic') await this.viewAcademicDetail(openId);
                    else if (openDept === 'admin') await this.viewAdminDetail(openId);
                } catch (e) {
                    console.error('Error opening work detail from URL:', e);
                }
                try {
                    window.history.replaceState({}, '', window.location.pathname);
                } catch (e) {}
            }, 500);
        } else {
            if (userDept === 'all') {
                this.navigate('dashboard');
            } else {
                this.navigate(userDept + '_list');
            }
        }

        this.updateUserInfo();
    },

    updateMenuVisibility() {
        const userDept = this.currentUser?.department || 'all';
        const userRole = this.currentUser?.role || 'staff';
        const isAdmin = userRole === 'superadmin' || userRole === 'admin';

        // Define which elements to hide for each department
        const menuMappings = {
            'survey': [
                'nav-registration_list', 'nav-academic_list', 'nav-admin_list',
                'nav-registration_dashboard', 'nav-academic_dashboard', 'nav-admin_dashboard',
                'nav-add-registration', 'nav-add-academic', 'nav-add-admin',
                'nav-import-registration', 'nav-import-academic', 'nav-import-admin',
                'nav-sameday-registration', 'nav-sameday-academic', 'nav-sameday-admin',
                'nav-import-completed-registration', 'nav-import-completed-academic', 'nav-import-completed-admin',
                'nav-completed-registration', 'nav-completed-academic', 'nav-completed-admin'
            ],
            'registration': [
                'nav-survey_list', 'nav-academic_list', 'nav-admin_list',
                'nav-survey_dashboard', 'nav-academic_dashboard', 'nav-admin_dashboard',
                'nav-add-survey', 'nav-add-academic', 'nav-add-admin',
                'nav-import-survey', 'nav-import-academic', 'nav-import-admin',
                'nav-sameday-survey', 'nav-sameday-academic', 'nav-sameday-admin',
                'nav-import-completed-survey', 'nav-import-completed-academic', 'nav-import-completed-admin',
                'nav-completed-survey', 'nav-completed-academic', 'nav-completed-admin'
            ],
            'academic': [
                'nav-survey_list', 'nav-registration_list', 'nav-admin_list',
                'nav-survey_dashboard', 'nav-registration_dashboard', 'nav-admin_dashboard',
                'nav-add-survey', 'nav-add-registration', 'nav-add-admin',
                'nav-import-survey', 'nav-import-registration', 'nav-import-admin',
                'nav-sameday-survey', 'nav-sameday-registration', 'nav-sameday-admin',
                'nav-import-completed-survey', 'nav-import-completed-registration', 'nav-import-completed-admin',
                'nav-completed-survey', 'nav-completed-registration', 'nav-completed-admin'
            ],
            'admin': [
                'nav-survey_list', 'nav-registration_list', 'nav-academic_list',
                'nav-survey_dashboard', 'nav-registration_dashboard', 'nav-academic_dashboard',
                'nav-add-survey', 'nav-add-registration', 'nav-add-academic',
                'nav-import-survey', 'nav-import-registration', 'nav-import-academic',
                'nav-sameday-survey', 'nav-sameday-registration', 'nav-sameday-academic',
                'nav-import-completed-survey', 'nav-import-completed-registration', 'nav-import-completed-academic',
                'nav-completed-survey', 'nav-completed-registration', 'nav-completed-academic'
            ]
        };

        // Show all menus first (reset)
        document.querySelectorAll('.nav-item, .nav-import-btn, .mobile-nav-item').forEach(el => {
            el.classList.remove('hidden');
        });

        // If department-specific user, hide other department menus
        if (userDept !== 'all' && menuMappings[userDept]) {
            menuMappings[userDept].forEach(menuId => {
                const el = document.getElementById(menuId);
                if (el) el.classList.add('hidden');
            });
        }

        // Admin-only menu items
        ['nav-all-admin', 'nav-admin-backlog-summary'].forEach(menuId => {
            const el = document.getElementById(menuId);
            if (!el) return;

            if (isAdmin) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
    },

    showAdminMenuPopup() {
        Swal.fire({
            title: 'การจัดการระบบ (Admin)',
            html: `
                <div class="space-y-4 mt-6">
                    <a href="admin_settings.html" class="block w-full p-4 border border-emerald-100 rounded-2xl hover:bg-emerald-50 hover:border-emerald-200 transition-all text-left flex items-center group bg-white shadow-sm hover:shadow-md">
                        <div class="w-12 h-12 bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 border border-emerald-100/50">
                            <i class="fas fa-shield-alt text-xl"></i>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 text-sm md:text-base">ตั้งค่าระดับสูง (Admin Settings)</h3>
                            <p class="text-xs text-slate-500 font-medium mt-1">จัดการระบบ Lockdown, สิทธิ์หมวดหมู่งาน และประกาศ</p>
                        </div>
                    </a>

                    <a href="system_logs.html" class="block w-full p-4 border border-violet-100 rounded-2xl hover:bg-violet-50 hover:border-violet-200 transition-all text-left flex items-center group bg-white shadow-sm hover:shadow-md">
                        <div class="w-12 h-12 bg-gradient-to-br from-violet-100 to-violet-50 text-violet-600 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 border border-violet-100/50">
                            <i class="fas fa-history text-xl"></i>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 text-sm md:text-base">ตรวจสอบประวัติ (Activity Logs)</h3>
                            <p class="text-xs text-slate-500 font-medium mt-1">ดูประวัติการใช้งานและกิจกรรมในระบบ</p>
                        </div>
                    </a>

                    <a href="admin_backlog_summary.html" class="block w-full p-4 border border-indigo-100 rounded-2xl hover:bg-indigo-50 hover:border-indigo-200 transition-all text-left flex items-center group bg-white shadow-sm hover:shadow-md">
                        <div class="w-12 h-12 bg-gradient-to-br from-indigo-100 to-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 border border-indigo-100/50">
                            <i class="fas fa-chart-line text-xl"></i>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-800 text-sm md:text-base">งานค้างผู้ตรวจ (Admin Backlog Summary)</h3>
                            <p class="text-xs text-slate-500 font-medium mt-1">สรุปรายงานงานค้างประจำเดือนและรายปี</p>
                        </div>
                    </a>
                </div>
            `,
            showConfirmButton: false,
            showCloseButton: true,
            focusCancel: false,
            customClass: {
                popup: 'rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-white/50 bg-slate-50/95 backdrop-blur-2xl p-6 !w-full !max-w-md',
                title: 'text-2xl font-extrabold text-slate-800 tracking-tight pt-2',
                closeButton: 'text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all rounded-full h-8 w-8 mt-4 mr-4 focus:outline-none focus:ring-0',
                htmlContainer: '!m-0 p-2'
            }
        });
    },

    updateUserInfo() {
        const infoEl = document.getElementById('user-info');
        if (infoEl && this.currentUser) {
            if (this.currentUser.role === 'citizen') {
                infoEl.innerHTML = `
                    <div class="flex items-center justify-center mb-1">
                        <span class="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                            <i class="fas fa-user-check"></i>
                        </span>
                    </div>
                    <p class="text-sm font-bold text-white truncate px-2" title="${this.currentUser.name}">${this.currentUser.name}</p>
                    <p class="text-[11px] text-emerald-100 mt-0.5"><i class="fas fa-shield-halved text-emerald-300 mr-1"></i>ประชาชน (PDPA)</p>
                `;
            } else {
                infoEl.innerHTML = `
                    <p class="text-sm font-bold text-white">${this.currentUser.name}</p>
                    <p class="text-xs text-emerald-100 opacity-80">${this.currentUser.role === 'superadmin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่'}</p>
                `;
            }
        }
    },

    // Staff Login with Database Verification
    async login() {
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const alertEl = document.getElementById('staff-login-alert');
        const submitBtn = document.getElementById('btn-staff-login');

        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        if (alertEl) alertEl.classList.add('hidden');

        if (!username || !password) {
            if (alertEl) {
                alertEl.textContent = 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน';
                alertEl.classList.remove('hidden');
            }
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> กำลังเข้าสู่ระบบ...';
        }

        try {
            const res = await fetch('api/auth.php?action=login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (res.ok && data.status === 'success' && data.user) {
                if (usernameInput) usernameInput.value = '';
                if (passwordInput) passwordInput.value = '';

                this.setSession(data.user);
            } else {
                const msg = data.message || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง';
                if (alertEl) {
                    alertEl.textContent = msg;
                    alertEl.classList.remove('hidden');
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'เข้าสู่ระบบไม่สำเร็จ',
                        text: msg,
                        confirmButtonColor: '#10B981'
                    });
                }
            }
        } catch (err) {
            console.error('Login error:', err);
            const errMsg = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
            if (alertEl) {
                alertEl.textContent = errMsg;
                alertEl.classList.remove('hidden');
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'เชื่อมต่อล้มเหลว',
                    text: errMsg,
                    confirmButtonColor: '#10B981'
                });
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `
                    <span class="relative z-10 flex items-center gap-2">
                        <span>เข้าสู่ระบบเจ้าหน้าที่</span>
                        <i class="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                    </span>
                `;
            }
        }
    },

    // Switch Role between Staff and Citizen
    switchLoginRole(role) {
        const staffSection = document.getElementById('staff-auth-section');
        const citizenSection = document.getElementById('citizen-auth-section');
        const tabStaff = document.getElementById('tab-role-staff');
        const tabCitizen = document.getElementById('tab-role-citizen');

        if (role === 'citizen') {
            staffSection?.classList.add('hidden');
            citizenSection?.classList.remove('hidden');

            tabCitizen?.classList.add('bg-white', 'text-sky-700', 'shadow-sm', 'font-bold');
            tabCitizen?.classList.remove('text-slate-600');

            tabStaff?.classList.remove('bg-white', 'text-emerald-800', 'shadow-sm', 'font-bold');
            tabStaff?.classList.add('text-slate-600');
        } else {
            citizenSection?.classList.add('hidden');
            staffSection?.classList.remove('hidden');

            tabStaff?.classList.add('bg-white', 'text-emerald-800', 'shadow-sm', 'font-bold');
            tabStaff?.classList.remove('text-slate-600');

            tabCitizen?.classList.remove('bg-white', 'text-sky-700', 'shadow-sm', 'font-bold');
            tabCitizen?.classList.add('text-slate-600');
        }
    },

    // Switch Citizen tabs: Login vs Register
    switchCitizenAuthTab(mode) {
        const formLogin = document.getElementById('form-citizen-login');
        const formReg = document.getElementById('form-citizen-register');
        const tabLogin = document.getElementById('tab-citizen-login');
        const tabReg = document.getElementById('tab-citizen-register');

        if (mode === 'register') {
            formLogin?.classList.add('hidden');
            formReg?.classList.remove('hidden');

            tabReg?.classList.add('bg-white', 'text-sky-700', 'shadow-xs', 'font-bold');
            tabReg?.classList.remove('text-slate-600');

            tabLogin?.classList.remove('bg-white', 'text-emerald-700', 'shadow-xs', 'font-bold');
            tabLogin?.classList.add('text-slate-600');
        } else {
            formReg?.classList.add('hidden');
            formLogin?.classList.remove('hidden');

            tabLogin?.classList.add('bg-white', 'text-emerald-700', 'shadow-xs', 'font-bold');
            tabLogin?.classList.remove('text-slate-600');

            tabReg?.classList.remove('bg-white', 'text-sky-700', 'shadow-xs', 'font-bold');
            tabReg?.classList.add('text-slate-600');
        }
    },

    togglePasswordVisibility(inputId, btn) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const icon = btn.querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            if (icon) {
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            }
        } else {
            input.type = 'password';
            if (icon) {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }
    },

    // Citizen Login
    async citizenLogin() {
        const usernameInput = document.getElementById('citizen-login-username');
        const passwordInput = document.getElementById('citizen-login-password');
        const alertBox = document.getElementById('citizen-login-alert');
        const btn = document.getElementById('btn-citizen-login');

        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        if (alertBox) alertBox.classList.add('hidden');

        if (!username || !password) {
            if (alertBox) {
                alertBox.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
                alertBox.classList.remove('hidden');
            }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> กำลังเข้าสู่ระบบ...';
        }

        try {
            const res = await fetch('api/status_tracking_api.php?action=login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await res.json();

            if (result.success) {
                const citizenUser = {
                    username: result.username,
                    name: result.full_name,
                    role: 'citizen',
                    department: 'citizen'
                };
                this.currentUser = citizenUser;
                localStorage.setItem('dol_user', JSON.stringify(citizenUser));
                localStorage.setItem('dol_session_timestamp', Date.now().toString());

                if (usernameInput) usernameInput.value = '';
                if (passwordInput) passwordInput.value = '';

                // Redirect to /tracking/ workflow
                window.location.href = 'tracking/';
            } else {
                if (alertBox) {
                    alertBox.textContent = result.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
                    alertBox.classList.remove('hidden');
                }
            }
        } catch (err) {
            console.error('Citizen login error:', err);
            if (alertBox) {
                alertBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
                alertBox.classList.remove('hidden');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-right-to-bracket mr-1"></i> เข้าสู่ระบบติดตามคำขอ';
            }
        }
    },

    // Citizen Register
    async citizenRegister() {
        const usernameInput = document.getElementById('citizen-reg-username');
        const fullnameInput = document.getElementById('citizen-reg-fullname');
        const passInput = document.getElementById('citizen-reg-password');
        const confirmPassInput = document.getElementById('citizen-reg-confirm-password');
        const pdpaCheckbox = document.getElementById('citizen-reg-pdpa');
        const alertBox = document.getElementById('citizen-reg-alert');
        const btn = document.getElementById('btn-citizen-reg');

        const username = usernameInput ? usernameInput.value.trim() : '';
        const full_name = fullnameInput ? fullnameInput.value.trim() : '';
        const password = passInput ? passInput.value : '';
        const confirm_password = confirmPassInput ? confirmPassInput.value : '';
        const pdpa_consent = pdpaCheckbox ? pdpaCheckbox.checked : false;

        if (alertBox) alertBox.classList.add('hidden');

        if (!username || !full_name || !password) {
            if (alertBox) {
                alertBox.textContent = 'กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง';
                alertBox.classList.remove('hidden');
            }
            return;
        }

        if (!pdpa_consent) {
            if (alertBox) {
                alertBox.textContent = 'กรุณาอ่านข้อกำหนดและนโยบาย PDPA ก่อน';
                alertBox.classList.remove('hidden');
            }
            return;
        }

        if (password !== confirm_password) {
            if (alertBox) {
                alertBox.textContent = 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน';
                alertBox.classList.remove('hidden');
            }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> กำลังสร้างบัญชีผู้ใช้งาน...';
        }

        try {
            const res = await fetch('api/status_tracking_api.php?action=register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, full_name, password, confirm_password, pdpa_consent })
            });
            const result = await res.json();

            if (result.success) {
                const citizenUser = {
                    username: result.username,
                    name: result.full_name,
                    role: 'citizen',
                    department: 'citizen'
                };
                this.currentUser = citizenUser;
                localStorage.setItem('dol_user', JSON.stringify(citizenUser));
                localStorage.setItem('dol_session_timestamp', Date.now().toString());

                if (usernameInput) usernameInput.value = '';
                if (fullnameInput) fullnameInput.value = '';
                if (passInput) passInput.value = '';
                if (confirmPassInput) confirmPassInput.value = '';

                // Redirect to /tracking/ workflow
                window.location.href = 'tracking/';
            } else {
                if (alertBox) {
                    alertBox.textContent = result.error || 'เกิดข้อผิดพลาดในการลงทะเบียน';
                    alertBox.classList.remove('hidden');
                }
            }
        } catch (err) {
            console.error('Citizen register error:', err);
            if (alertBox) {
                alertBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
                alertBox.classList.remove('hidden');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-user-check mr-1"></i> สมัครสมาชิกและเข้าใช้งาน';
            }
        }
    },

    openPdpaModal() {
        const modal = document.getElementById('pdpa-modal');
        if (modal) modal.classList.remove('hidden');
    },

    closePdpaModal() {
        const modal = document.getElementById('pdpa-modal');
        if (modal) modal.classList.add('hidden');
    },

    setSession(user) {
        this.currentUser = user;
        localStorage.setItem('dol_user', JSON.stringify(user));
        localStorage.setItem('dol_session_timestamp', Date.now().toString());

        try {
            window.dispatchEvent(new CustomEvent('dol_login_success', { detail: user }));
        } catch (e) {}

        Swal.fire({
            icon: 'success',
            title: `ยินดีต้อนรับ, ${user.name}`,
            text: 'เข้าสู่ระบบสำเร็จ',
            timer: 1000,
            showConfirmButton: false
        }).then(() => {
            // Check if 3 days have passed since last cache prompt
            const lastPrompt = localStorage.getItem('dol_last_cache_prompt');
            const now = Date.now();
            const threeDays = 3 * 24 * 60 * 60 * 1000;

            if (!lastPrompt || (now - parseInt(lastPrompt)) > threeDays) {
                // Add prompt for clearing cache as requested by user
                Swal.fire({
                    title: 'ล้างแคชข้อมูล?',
                    text: 'คุณต้องการล้างแคชเพื่อดึงข้อมูลใหม่ล่าสุดจากเซิร์ฟเวอร์หรือไม่? (จะแสดงเมนูนี้ทุกๆ 3 วัน) หรือกด Ctrl+F5 เพื่อล้างแคช',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#10B981',
                    cancelButtonColor: '#6B7280',
                    confirmButtonText: 'ใช่, ล้างแคช',
                    cancelButtonText: 'ไม่ต้อง'
                }).then((result) => {
                    localStorage.setItem('dol_last_cache_prompt', now.toString());
                    if (result.isConfirmed) {
                        DataManager.clearCache();
                        Swal.fire({
                            title: 'ล้างแคชสำเร็จ',
                            icon: 'success',
                            timer: 1000,
                            showConfirmButton: false
                        }).then(() => {
                            this.showMainApp();
                            this.startIdleMonitor();
                        });
                    } else {
                        this.showMainApp();
                        this.startIdleMonitor();
                    }
                });
            } else {
                this.showMainApp();
                this.startIdleMonitor();
            }
        });
    },

    startIdleMonitor() {
        // Throttled reset to avoid excessive calls on mousemove/scroll
        this._throttledIdleReset = this._throttleIdleReset.bind(this);
        const resetBound = this._throttledIdleReset;

        window.onmousemove = resetBound;
        window.onmousedown = resetBound;
        window.ontouchstart = resetBound;
        window.onclick = resetBound;
        window.onkeypress = resetBound;
        window.addEventListener('scroll', resetBound, { passive: true, capture: true });

        this.resetIdleTimer(); // Start the timer
    },

    _lastIdleResetTime: 0,
    _throttleIdleReset() {
        const now = Date.now();
        // Throttle: only reset every 10 seconds to reduce overhead
        if (now - this._lastIdleResetTime < 10000) return;
        this._lastIdleResetTime = now;
        this.resetIdleTimer();
    },

    resetIdleTimer() {
        clearTimeout(this.idleTimer);
        // Only set timer if user is logged in
        if (this.currentUser) {
            this.idleTimer = setTimeout(this.handleSessionTimeout.bind(this), this.timeoutSettings);
        }
    },

    handleSessionTimeout() {
        // Clear session immediately
        this.clearSession();

        Swal.fire({
            title: 'หมดเวลาการใช้งาน',
            text: 'คุณไม่ได้ทำรายการเป็นเวลานาน ระบบจะทำการออกจากระบบอัตโนมัติ',
            icon: 'warning',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#10B981',
            allowOutsideClick: false,
            allowEscapeKey: false
        }).then((result) => {
            // Force reload regardless of how dialog was closed
            window.location.href = window.location.href;
        });
    },

    async logout() {
        const result = await Swal.fire({
            title: 'ออกจากระบบ?',
            text: "คุณต้องการออกจากระบบใช่หรือไม่",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#10B981',
            cancelButtonColor: '#d33',
            confirmButtonText: 'ใช่, ออกจากระบบ',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                if (this.currentUser?.role === 'citizen') {
                    await fetch('api/status_tracking_api.php?action=logout');
                } else {
                    await fetch('api/auth.php?action=logout');
                }
            } catch (e) {}

            this.clearSession();
            window.location.href = 'index.html';
        }
    },

    updateDate() {
        const el = document.getElementById('current-date');
        if (el) {
            const now = new Date();
            el.innerText = now.toLocaleDateString('th-TH', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    },

    // ... existing code ...
    // State for Survey View
    currentSurveyFilter: 'all',
    currentSurveySort: 'desc',
    surveySearchTerm: '',
    surveySearchTimeout: null,
    currentSurveyPage: 1,
    surveyItemsPerPage: 20,

    // State for Registration View
    currentRegistrationPage: 1,
    registrationItemsPerPage: 20,
    registrationSearchTerm: '',
    registrationSearchTimeout: null,
    currentRegistrationSort: 'desc',
    currentRegistrationFilter: 'all',

    // State for Academic View
    currentAcademicPage: 1,
    academicItemsPerPage: 20,
    academicSearchTerm: '',
    academicSearchTimeout: null,
    currentAcademicSort: 'desc',

    // State for Admin View
    currentAdminPage: 1,
    adminItemsPerPage: 20,
    adminSearchTerm: '',
    adminSearchTimeout: null,
    currentAdminSort: 'desc',
    currentAdminSubject: 'all',

    // ... (navigate function remains mostly same, just ensure state reset)

    async sortRegistrationList(order) {
        this.currentRegistrationSort = order;
        this.currentRegistrationPage = 1;
        this.refreshRegistrationList();
    },

    async filterRegistrationList(type) {
        this.currentRegistrationFilter = type;
        this.currentRegistrationPage = 1;
        this.refreshRegistrationList();
    },


    async navigate(page) {
        const content = document.getElementById('app-content');
        const title = document.getElementById('page-title');
        const userDept = this.currentUser?.department || 'all';
        const isStaff = this.currentUser?.role === 'staff';

        // Role check for citizen
        if (this.currentUser?.role === 'citizen') {
            window.location.href = 'tracking/';
            return;
        }

        // Permission check for staff users
        if (isStaff && userDept !== 'all') {
            // Staff can only access their department's page, dashboard, and reports
            const allowedPages = {
                'survey': ['dashboard', 'all_work_search', 'survey_list', 'survey_dashboard', 'survey_form', 'report', 'old_backlog'],
                'registration': ['dashboard', 'all_work_search', 'registration_list', 'registration_dashboard', 'registration_form', 'report', 'old_backlog'],
                'academic': ['dashboard', 'all_work_search', 'academic_list', 'academic_dashboard', 'academic_form', 'report', 'old_backlog'],
                'admin': ['dashboard', 'all_work_search', 'admin_list', 'admin_dashboard', 'admin_form', 'report', 'old_backlog']
            };

            if (!allowedPages[userDept]?.includes(page)) {
                Swal.fire({
                    icon: 'warning',
                    title: 'ไม่มีสิทธิ์เข้าถึง',
                    text: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้',
                    confirmButtonColor: '#F97316'
                });

                // Redirect to their department page
                const deptPage = userDept + '_list';
                this.navigate(deptPage);
                return;
            }
        }

        // Reset only the previously active nav (O(1) instead of O(n))
        const _resetNav = (el) => {
            if (!el) return;
            el.classList.remove('bg-emerald-50', 'text-emerald-700', 'font-bold', 'shadow-sm', 'border-l-4', 'border-emerald-500',
                'bg-indigo-50', 'text-indigo-700', 'border-indigo-500',
                'bg-blue-50', 'text-blue-700', 'border-blue-500',
                'bg-orange-50', 'text-orange-700', 'border-orange-500',
                'bg-violet-50', 'text-violet-700', 'border-violet-500', 'hover:bg-violet-50', 'hover:text-violet-700',
                'bg-purple-50', 'text-purple-700', 'border-purple-500');
            el.classList.add('hover:bg-emerald-50', 'hover:text-emerald-600', 'text-gray-600');
            const iconDiv = el.querySelector('div');
            if (iconDiv) {
                iconDiv.className = 'p-2 bg-gray-100 rounded-lg group-hover:bg-emerald-100 mr-3 transition-colors text-gray-400 group-hover:text-emerald-600';
            }
        };

        if (this._activeNavEl) {
            _resetNav(this._activeNavEl);
        } else {
            // First load: reset all nav items once
            document.querySelectorAll('.nav-item').forEach(_resetNav);
        }

        const activeNav = document.getElementById(`nav-${page}`);
        if (activeNav) {
            activeNav.classList.remove('text-gray-600');
            activeNav.classList.add('font-bold', 'shadow-sm', 'transition-all', 'duration-300', 'text-left', 'group', 'border-l-4');

            const iconDiv = activeNav.querySelector('div');

            if (page === 'survey_list') {
                activeNav.classList.add('bg-indigo-50', 'text-indigo-700', 'border-indigo-500');
                if (iconDiv) iconDiv.className = 'p-2 bg-indigo-100 rounded-lg mr-3 transition-colors text-indigo-600';
            } else if (page === 'registration_list') {
                activeNav.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-500');
                if (iconDiv) iconDiv.className = 'p-2 bg-blue-100 rounded-lg mr-3 transition-colors text-blue-600';
            } else if (page === 'academic_list') {
                activeNav.classList.add('bg-orange-50', 'text-orange-700', 'border-orange-500');
                if (iconDiv) iconDiv.className = 'p-2 bg-orange-100 rounded-lg mr-3 transition-colors text-orange-600';
            } else if (page === 'admin_list') {
                activeNav.classList.add('bg-teal-50', 'text-teal-700', 'border-teal-500');
                if (iconDiv) iconDiv.className = 'p-2 bg-teal-100 rounded-lg mr-3 transition-colors text-teal-600';
            } else if (page === 'all_work_search') {
                activeNav.classList.add('bg-violet-50', 'text-violet-700', 'border-violet-500');
                if (iconDiv) iconDiv.className = 'p-2 bg-violet-100 rounded-lg mr-3 transition-colors text-violet-700';
            } else if (page === 'sync_page') {
                activeNav.classList.add('bg-purple-50', 'text-purple-700', 'border-purple-500');
                if (iconDiv) iconDiv.className = 'p-2 bg-purple-100 rounded-lg mr-3 transition-colors text-purple-600';
            } else {
                activeNav.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-500');
                if (iconDiv) iconDiv.className = 'p-2 bg-emerald-100 rounded-lg mr-3 transition-colors text-emerald-600';
            }
            this._activeNavEl = activeNav;
        }

        // Reset active nav state (Mobile)
        document.querySelectorAll('.mobile-nav-item').forEach(el => {
            if (el.classList.contains('w-16')) return; // Skip floating button
            el.classList.remove('text-emerald-600', 'font-bold');
            el.classList.add('text-gray-400');
            const iconWrap = el.querySelector('div');
            if (iconWrap) iconWrap.classList.remove('bg-emerald-50');
        });

        const activeMobile = document.querySelector(`.mobile-nav-item[data-page="${page}"]`);
        if (activeMobile && !activeMobile.classList.contains('w-16')) {
            activeMobile.classList.remove('text-gray-400');
            activeMobile.classList.add('text-emerald-600', 'font-bold');
            const iconWrap = activeMobile.querySelector('div');
            if (iconWrap) iconWrap.classList.add('bg-emerald-50');
        }

        if (page === 'all_work_search') {
            title.innerText = 'ค้นหาสถานะงานทุกฝ่าย';
            content.innerHTML = this.renderAllWorkSearchPage();
            await this.loadAllWorkSearchData();
        } else if (page === 'dashboard') {
            title.innerText = 'ภาพรวมการดำเนินงาน';
            content.innerHTML = await UI.renderDashboard(userDept);
            this.initPerformanceChart();
        } else if (page === 'logs') {
            title.innerText = 'ตรวจสอบประวัติ (Activity Logs)';
            content.innerHTML = await UI.renderLogs();
            UI.initDataTable('logs-datatable', { order: [[4, 'desc']] });
        } else if (page === 'report') {
            window.location.href = 'report.html';
            return;
        } else if (page === 'old_backlog') {
            window.location.href = 'old_backlog_report.html';
            return;
        } else if (page === 'survey_list') {
            title.innerText = 'งานฝ่ายรังวัด';
            this.currentSurveyPage = 1; // Reset to first page
            await this.refreshSurveyList();
        } else if (page === 'survey_dashboard') {
            title.innerText = 'ภาพรวมฝ่ายรังวัด';
            content.innerHTML = await UI.renderDashboard('survey');
            this.initPerformanceChart('survey');
        } else if (page === 'registration_list') {
            title.innerText = 'งานฝ่ายทะเบียน';
            this.currentRegistrationPage = 1;
            await this.refreshRegistrationList();
        } else if (page === 'registration_dashboard') {
            title.innerText = 'ภาพรวมฝ่ายทะเบียน';
            content.innerHTML = await UI.renderDashboard('registration');
            this.initPerformanceChart('registration');
        } else if (page === 'academic_list') {
            title.innerText = 'งานกลุ่มงานวิชาการ';
            this.currentAcademicPage = 1;
            await this.refreshAcademicList();
        } else if (page === 'academic_dashboard') {
            title.innerText = 'ภาพรวมฝ่ายวิชาการ';
            content.innerHTML = await UI.renderDashboard('academic');
            this.initPerformanceChart('academic');
        } else if (page === 'academic_form') {
            title.innerText = 'บันทึกงานวิชาการ';
            content.innerHTML = UI.renderAcademicForm();
        } else if (page === 'admin_list') {
            title.innerText = 'งานฝ่ายอำนวยการ';
            this.currentAdminPage = 1;
            await this.refreshAdminList();
        } else if (page === 'admin_dashboard') {
            title.innerText = 'ภาพรวมฝ่ายอำนวยการ';
            content.innerHTML = await UI.renderDashboard('admin');
            this.initPerformanceChart('admin');
        } else if (page === 'admin_form') {
            title.innerText = 'บันทึกงานอำนวยการ';
            content.innerHTML = UI.renderAdminForm();
        }

        // Refresh AOS/Animations
        UI.refreshAOS();
    },

    // --- Survey Logic ---
    async handleSurveySubmit(e) {
        e.preventDefault();
        const form = e.target;
        const data = new FormData(form);

        // Map FormData to Object
        const item = {};
        data.forEach((value, key) => item[key] = value);

        try {
            await DataManager.saveSurveyItem(item);
            Swal.fire({
                title: 'บันทึกสำร็จ!',
                text: 'บันทึกข้อมูลงานรังวัดเรียบร้อยแล้ว',
                icon: 'success',
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#10B981'
            }).then(() => {
                this.navigate('survey_list');
            });
        } catch (error) {
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    },

    // --- Registration Logic ---
    async handleRegistrationSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const data = new FormData(form);
        const item = {};
        data.forEach((value, key) => item[key] = value);

        try {
            await DataManager.saveRegistrationItem(item);
            Swal.fire({
                title: 'บันทึกสำเร็จ!',
                text: 'บันทึกข้อมูลงานทะเบียนเรียบร้อยแล้ว',
                icon: 'success',
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#10B981'
            }).then(() => {
                this.navigate('registration_list');
            });
        } catch (error) {
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    },

    // --- Academic Logic ---
    async handleAcademicSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const data = new FormData(form);
        const item = {};
        data.forEach((value, key) => item[key] = value);

        try {
            await DataManager.saveAcademicItem(item);
            Swal.fire({
                title: 'บันทึกสำเร็จ!',
                text: 'บันทึกข้อมูลวิชาการเรียบร้อยแล้ว',
                icon: 'success',
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#F97316'
            }).then(() => {
                this.navigate('academic_list');
            });
        } catch (error) {
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    },

    async searchAcademicList(term) {
        this.academicSearchTerm = term;
        this.currentAcademicPage = 1;

        if (this.academicSearchTimeout) {
            clearTimeout(this.academicSearchTimeout);
        }

        this.academicSearchTimeout = setTimeout(() => {
            this.refreshAcademicList();
        }, 300);
    },

    async sortAcademicList(order) {
        this.currentAcademicSort = order;
        this.currentAcademicPage = 1;
        this.refreshAcademicList();
    },

    async goToAcademicPage(page) {
        this.currentAcademicPage = page;
        this.refreshAcademicList();
    },

    async refreshAcademicList() {
        const content = document.getElementById('app-content');
        const listContainer = document.getElementById('academic-list-container');

        // Destroy existing DataTable before re-render
        UI.destroyDataTable('academic-datatable');

        let items = await DataManager.getAcademicItems();

        // 0. Filter by Status View (Pending/Completed) - Use DataManager helper functions for consistent logic
        if (this.academicStatusView === 'pending') {
            items = items.filter(item => DataManager.isPending(item));
        } else {
            items = items.filter(item => DataManager.isCompleted(item));

            // Apply Month Filter if completed
            if (this.academicMonthFilter && this.academicMonthFilter !== 'all') {
                items = items.filter(i => {
                    const d = DataManager.getSafeDate(i.completion_date);
                    return d && (d.getMonth() + 1) === parseInt(this.academicMonthFilter, 10);
                });
            }
        }

        // 0.5. Filter by Progress Type (1=ปกติ, 2=สุดขั้นตอน, 3=งานศาล)
        if (this.academicProgressFilter && this.academicProgressFilter !== 'all') {
            const pType = parseInt(this.academicProgressFilter, 10);
            items = items.filter(item => parseInt(item.progress_type, 10) === pType);
        }

        if (this.academicSearchTerm) {
            const lowerTerm = this.academicSearchTerm.toLowerCase();
            items = items.filter(item =>
                (item.subject && item.subject.toLowerCase().includes(lowerTerm)) ||
                (item.related_person && item.related_person.toLowerCase().includes(lowerTerm)) ||
                (item.seq_no && item.seq_no.toLowerCase().includes(lowerTerm))
            );
        }

        // Auto-reset page if current page becomes empty after refresh
        const maxPage = Math.ceil(items.length / this.academicItemsPerPage) || 1;
        if (this.currentAcademicPage > maxPage) {
            this.currentAcademicPage = maxPage;
        }

        // Sorting
        if (!this.currentAcademicSort) this.currentAcademicSort = 'desc';

        items.sort((a, b) => {
            const idA = parseInt(a.id, 10) || 0;
            const idB = parseInt(b.id, 10) || 0;

            return this.currentAcademicSort === 'asc' ? (idA - idB) : (idB - idA);
        });

        content.innerHTML = await UI.renderAcademicList(
            items,
            this.academicSearchTerm,
            this.currentAcademicSort || 'desc',
            this.currentAcademicSubject || 'all',
            this.currentAcademicPage,
            this.academicItemsPerPage,
            this.academicStatusView
        );

        // Restore input focus
        const searchInput = document.getElementById('academic-search-input');
        if (searchInput && this.academicSearchTerm) {
            searchInput.focus();
            const val = searchInput.value;
            searchInput.value = '';
            searchInput.value = val;
        }

        UI.refreshAOS();

        // Initialize DataTables after DOM is fully rendered - Remove delay to fix UI glitch
        requestAnimationFrame(() => {
            const tableEl = document.getElementById('academic-datatable');
            if (typeof $ !== 'undefined' && $.fn.DataTable && tableEl) {
                UI.initDataTable('academic-datatable', {
                    order: [],
                    columnDefs: [
                        { orderable: false, targets: [5] }
                    ]
                });
            }
        });
    },

    async filterAcademicSubject(subject) {
        this.currentAcademicSubject = subject;
        this.currentAcademicPage = 1;
        this.refreshAcademicList();
    },

    // --- Admin Logic ---
    async handleAdminSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const data = new FormData(form);
        const item = {};
        data.forEach((value, key) => item[key] = value);

        try {
            await DataManager.saveAdminItem(item);
            Swal.fire({
                title: 'บันทึกสำเร็จ!',
                text: 'บันทึกข้อมูลอำนวยการเรียบร้อยแล้ว',
                icon: 'success',
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#0D9488'
            }).then(() => {
                this.navigate('admin_list');
            });
        } catch (error) {
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    },

    async searchAdminList(term) {
        this.adminSearchTerm = term;
        this.currentAdminPage = 1;

        if (this.adminSearchTimeout) {
            clearTimeout(this.adminSearchTimeout);
        }

        this.adminSearchTimeout = setTimeout(() => {
            this.refreshAdminList();
        }, 300);
    },

    async sortAdminList(order) {
        this.currentAdminSort = order;
        this.currentAdminPage = 1;
        this.refreshAdminList();
    },

    async goToAdminPage(page) {
        this.currentAdminPage = page;
        this.refreshAdminList();
    },

    async refreshAdminList() {
        const content = document.getElementById('app-content');
        const listContainer = document.getElementById('admin-list-container');

        // Destroy existing DataTable before re-render
        UI.destroyDataTable('admin-datatable');

        let items = await DataManager.getAdminItems();

        if (this.adminStatusView === 'pending') {
            items = items.filter(item => DataManager.isPending(item));
        } else {
            items = items.filter(item => DataManager.isCompleted(item));

            if (this.adminMonthFilter && this.adminMonthFilter !== 'all') {
                items = items.filter(i => {
                    const d = DataManager.getSafeDate(i.completion_date);
                    return d && (d.getMonth() + 1) === parseInt(this.adminMonthFilter, 10);
                });
            }
        }

        if (this.adminProgressFilter && this.adminProgressFilter !== 'all') {
            const pType = parseInt(this.adminProgressFilter, 10);
            items = items.filter(item => parseInt(item.progress_type, 10) === pType);
        }

        if (this.adminSearchTerm) {
            const lowerTerm = this.adminSearchTerm.toLowerCase();
            items = items.filter(item =>
                (item.subject && item.subject.toLowerCase().includes(lowerTerm)) ||
                (item.related_person && item.related_person.toLowerCase().includes(lowerTerm)) ||
                (item.seq_no && item.seq_no.toLowerCase().includes(lowerTerm))
            );
        }

        const maxPage = Math.ceil(items.length / this.adminItemsPerPage) || 1;
        if (this.currentAdminPage > maxPage) {
            this.currentAdminPage = maxPage;
        }

        if (!this.currentAdminSort) this.currentAdminSort = 'desc';

        items.sort((a, b) => {
            const idA = parseInt(a.id, 10) || 0;
            const idB = parseInt(b.id, 10) || 0;

            return this.currentAdminSort === 'asc' ? (idA - idB) : (idB - idA);
        });

        content.innerHTML = await UI.renderAdminList(
            items,
            this.adminSearchTerm,
            this.currentAdminSort || 'desc',
            this.currentAdminSubject || 'all',
            this.currentAdminPage,
            this.adminItemsPerPage,
            this.adminStatusView
        );

        const searchInput = document.getElementById('admin-search-input');
        if (searchInput && this.adminSearchTerm) {
            searchInput.focus();
            const val = searchInput.value;
            searchInput.value = '';
            searchInput.value = val;
        }

        UI.refreshAOS();

        requestAnimationFrame(() => {
            const tableEl = document.getElementById('admin-datatable');
            if (typeof $ !== 'undefined' && $.fn.DataTable && tableEl) {
                UI.initDataTable('admin-datatable', {
                    order: [],
                    columnDefs: [
                        { orderable: false, targets: [5] }
                    ]
                });
            }
        });
    },

    async filterAdminSubject(subject) {
        this.currentAdminSubject = subject;
        this.currentAdminPage = 1;
        this.refreshAdminList();
    },

    async setAdminStatusView(view) {
        this.adminStatusView = view;
        this.adminMonthFilter = 'all';
        this.currentAdminPage = 1;
        this.refreshAdminList();
    },

    async filterAdminProgress(progressType) {
        this.adminProgressFilter = progressType;
        this.currentAdminPage = 1;
        this.refreshAdminList();
    },

    async filterAdminMonth(month) {
        this.adminMonthFilter = month;
        this.currentAdminPage = 1;
        this.refreshAdminList();
    },

    async setAcademicStatusView(view) {
        this.academicStatusView = view;
        this.academicMonthFilter = 'all';
        this.currentAcademicPage = 1;
        this.refreshAcademicList();
    },

    async filterAcademicProgress(progressType) {
        this.academicProgressFilter = progressType;
        this.currentAcademicPage = 1;
        this.refreshAcademicList();
    },

    async filterAcademicMonth(month) {
        this.academicMonthFilter = month;
        this.currentAcademicPage = 1;
        this.refreshAcademicList();
    },

    async searchRegistrationList(term) {
        this.registrationSearchTerm = term;
        this.currentRegistrationPage = 1;

        if (this.registrationSearchTimeout) {
            clearTimeout(this.registrationSearchTimeout);
        }

        this.registrationSearchTimeout = setTimeout(() => {
            this.refreshRegistrationList();
        }, 300);
    },

    async goToRegistrationPage(page) {
        this.currentRegistrationPage = page;
        this.refreshRegistrationList();
    },

    async setRegistrationStatusView(view) {
        this.registrationStatusView = view;
        this.registrationMonthFilter = 'all';
        this.currentRegistrationPage = 1;
        this.refreshRegistrationList();
    },

    async filterRegistrationSubject(subject) {
        this.currentRegistrationSubject = subject;
        this.currentRegistrationPage = 1;
        this.refreshRegistrationList();
    },

    async filterRegistrationProgress(progressType) {
        this.registrationProgressFilter = progressType;
        this.currentRegistrationPage = 1;
        this.refreshRegistrationList();
    },

    async filterRegistrationMonth(month) {
        this.registrationMonthFilter = month;
        this.currentRegistrationPage = 1;
        this.refreshRegistrationList();
    },

    async refreshRegistrationList() {
        const content = document.getElementById('app-content');
        const listContainer = document.getElementById('registration-list-container');

        // Destroy existing DataTable before re-render
        UI.destroyDataTable('registration-datatable');

        // Data Fetching
        let items = await DataManager.getRegistrationItems();

        // Filter by Status View - Use DataManager helper functions for consistent logic
        if (this.registrationStatusView === 'pending') {
            items = items.filter(item => DataManager.isPending(item));
        } else {
            items = items.filter(item => DataManager.isCompleted(item));

            // Apply Month Filter if completed
            if (this.registrationMonthFilter && this.registrationMonthFilter !== 'all') {
                items = items.filter(i => {
                    const d = DataManager.getSafeDate(i.completion_date);
                    return d && (d.getMonth() + 1) === parseInt(this.registrationMonthFilter, 10);
                });
            }
        }

        // Filter by Progress Type (1=ปกติ, 2=สุดขั้นตอน, 3=งานศาล)
        if (this.registrationProgressFilter && this.registrationProgressFilter !== 'all') {
            const pType = parseInt(this.registrationProgressFilter, 10);
            items = items.filter(item => parseInt(item.progress_type, 10) === pType);
        }

        // Auto-reset page if current page becomes empty after refresh
        const maxPage = Math.ceil(items.length / this.registrationItemsPerPage) || 1;
        if (this.currentRegistrationPage > maxPage) {
            this.currentRegistrationPage = maxPage;
        }
        // Sort by ID
        if (!this.currentRegistrationSort) this.currentRegistrationSort = 'desc';
        items.sort((a, b) => {
            const idA = parseInt(a.id, 10) || 0;
            const idB = parseInt(b.id, 10) || 0;
            return this.currentRegistrationSort === 'asc' ? (idA - idB) : (idB - idA);
        });

        // Always use renderRegistrationList to ensure sort buttons highlight correctly
        content.innerHTML = await UI.renderRegistrationList(
            items,
            this.registrationSearchTerm,
            this.currentRegistrationSort,
            this.currentRegistrationFilter,
            this.currentRegistrationSubject || 'all',
            this.currentRegistrationPage,
            this.registrationItemsPerPage,
            this.registrationStatusView
        );

        // Restore input focus only if needed (safety check for full render)
        const searchInput = document.getElementById('registration-search-input');
        if (searchInput && this.registrationSearchTerm) {
            searchInput.focus();
            const val = searchInput.value;
            searchInput.value = '';
            searchInput.value = val;
        }

        UI.refreshAOS();

        // Initialize DataTables after DOM is fully rendered - Remove delay to fix UI glitch
        requestAnimationFrame(() => {
            const tableEl = document.getElementById('registration-datatable');
            if (typeof $ !== 'undefined' && $.fn.DataTable && tableEl) {
                UI.initDataTable('registration-datatable', {
                    order: [],
                    columnDefs: [
                        { orderable: false, targets: [7] }
                    ]
                });
            }
        });
    },

    async filterSurveyList(type) {
        this.currentSurveyFilter = type;
        this.currentSurveyPage = 1;
        this.refreshSurveyList();
    },

    async sortSurveyList(order) {
        this.currentSurveySort = order;
        this.currentSurveyPage = 1;
        this.refreshSurveyList();
    },

    async searchSurveyList(term) {
        this.surveySearchTerm = term;
        this.currentSurveyPage = 1;

        if (this.surveySearchTimeout) {
            clearTimeout(this.surveySearchTimeout);
        }

        this.surveySearchTimeout = setTimeout(() => {
            this.refreshSurveyList();
        }, 300);
    },

    async filterSurveyType(type) {
        this.currentSurveyFilter = type;
        this.currentSurveyPage = 1;
        this.refreshSurveyList();
    },

    async setSurveyStatusView(view) {
        this.surveyStatusView = view;
        this.surveyMonthFilter = 'all';
        this.currentSurveyPage = 1;
        this.refreshSurveyList();
    },

    async filterSurveyProgress(progressType) {
        this.surveyProgressFilter = progressType;
        this.currentSurveyPage = 1;
        this.refreshSurveyList();
    },

    async filterSurveyMonth(month) {
        this.surveyMonthFilter = month;
        this.currentSurveyPage = 1;
        this.refreshSurveyList();
    },

    async goToSurveyPage(page) {
        this.currentSurveyPage = page;
        this.refreshSurveyList();
    },

    async refreshSurveyList() {
        const content = document.getElementById('app-content');
        const listContainer = document.getElementById('survey-list-container');

        // Destroy existing DataTable before re-render
        UI.destroyDataTable('survey-datatable');

        // Get all items
        let items = await DataManager.getSurveyItems();

        // 0. Filter by Status View - Use DataManager helper functions for consistent logic
        if (this.surveyStatusView === 'pending') {
            items = items.filter(item => DataManager.isPending(item));
        } else {
            items = items.filter(item => DataManager.isCompleted(item));

            // Apply Month Filter if completed
            if (this.surveyMonthFilter && this.surveyMonthFilter !== 'all') {
                items = items.filter(i => {
                    const d = DataManager.getSafeDate(i.completion_date);
                    return d && (d.getMonth() + 1) === parseInt(this.surveyMonthFilter, 10);
                });
            }
        }

        // 0.5. Filter by Progress Type (1=ปกติ, 2=สุดขั้นตอน, 3=งานศาล)
        if (this.surveyProgressFilter && this.surveyProgressFilter !== 'all') {
            const pType = parseInt(this.surveyProgressFilter, 10);
            items = items.filter(item => parseInt(item.progress_type, 10) === pType);
        }

        // 1. Filter by Type
        if (this.currentSurveyFilter && this.currentSurveyFilter !== 'all') {
            items = items.filter(item => item.survey_type === this.currentSurveyFilter);
        }

        // 2. Search
        if (this.surveySearchTerm) {
            const lowerTerm = this.surveySearchTerm.toLowerCase();
            items = items.filter(item =>
                (item.applicant && item.applicant.toLowerCase().includes(lowerTerm)) ||
                (item.plot_no && item.plot_no.toLowerCase().includes(lowerTerm)) ||
                (item.received_seq && item.received_seq.toLowerCase().includes(lowerTerm))
            );
        }

        // Auto-reset page if current page becomes empty after refresh
        const maxPage = Math.ceil(items.length / this.surveyItemsPerPage) || 1;
        if (this.currentSurveyPage > maxPage) {
            this.currentSurveyPage = maxPage;
        }

        // 3. Sort by created_at
        if (!this.currentSurveySort) this.currentSurveySort = 'desc'; // Default newest first

        items.sort((a, b) => {
            const idA = parseInt(a.id, 10) || 0;
            const idB = parseInt(b.id, 10) || 0;

            return this.currentSurveySort === 'asc' ? (idA - idB) : (idB - idA);
        });

        // Always use renderSurveyList to ensure sort buttons highlight correctly
        content.innerHTML = await UI.renderSurveyList(
            items,
            this.surveySearchTerm,
            this.currentSurveySort,
            this.currentSurveyFilter,
            this.currentSurveyPage,
            this.surveyItemsPerPage,
            this.surveyStatusView
        );

        // Restore input focus
        const searchInput = document.getElementById('survey-search-input');
        if (searchInput && this.surveySearchTerm) {
            searchInput.focus();
            const val = searchInput.value;
            searchInput.value = '';
            searchInput.value = val;
        }

        UI.refreshAOS();

        // Initialize DataTables after DOM is fully rendered - Remove delay to fix UI glitch
        requestAnimationFrame(() => {
            const tableEl = document.getElementById('survey-datatable');
            if (typeof $ !== 'undefined' && $.fn.DataTable && tableEl) {
                UI.initDataTable('survey-datatable', {
                    order: [],
                    columnDefs: [
                        { orderable: false, targets: [0, 9] }
                    ]
                });
            }
        });
    },



    async viewSurveyDetail(id) {
        const [items] = await Promise.all([DataManager.getSurveyItems(), DataManager.getSystemSettings(true)]);
        let item = items.find(i => String(i.id) === String(id));
        if (!item) {
            item = items.find(i => i.received_seq && String(i.received_seq).trim() === String(id).trim());
        }
        if (item) {
            UI.showSurveyDetail(item);
        }
    },

    async viewRegistrationDetail(id) {
        const [items] = await Promise.all([DataManager.getRegistrationItems(), DataManager.getSystemSettings(true)]);
        let item = items.find(i => String(i.id) === String(id));
        if (!item) {
            item = items.find(i => i.seq_no && String(i.seq_no).trim() === String(id).trim());
        }
        if (item && UI.showRegistrationDetail) {
            UI.showRegistrationDetail(item);
        }
    },

    async viewAcademicDetail(id) {
        const [items] = await Promise.all([DataManager.getAcademicItems(), DataManager.getSystemSettings(true)]);
        let item = items.find(i => String(i.id) === String(id));
        if (!item) {
            item = items.find(i => i.seq_no && String(i.seq_no).trim() === String(id).trim());
        }
        if (item && UI.showAcademicDetail) {
            UI.showAcademicDetail(item);
        }
    },

    async viewAdminDetail(id) {
        const [items] = await Promise.all([DataManager.getAdminItems(), DataManager.getSystemSettings(true)]);
        let item = items.find(i => String(i.id) === String(id));
        if (!item) {
            item = items.find(i => i.seq_no && String(i.seq_no).trim() === String(id).trim());
        }
        if (item && UI.showAdminDetail) {
            UI.showAdminDetail(item);
        }
    },

    closeDetailModal() {
        const modal = document.getElementById('detail-modal');
        if (modal) {
            // Animation for closing
            modal.querySelector('div[class*="scale-100"]').classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.querySelector('div[class*="scale-100"]').classList.remove('scale-95', 'opacity-0');
                const title = document.getElementById('detail-modal-title');
                const subtitle = document.getElementById('detail-modal-subtitle');
                if (title) title.textContent = 'รายละเอียดงาน';
                if (subtitle) subtitle.textContent = 'ข้อมูลครบถ้วนของรายการที่เลือก';
            }, 200);
        }
    },

    openAddModal(type) {
        this.currentAddType = type;
        const fieldsContainer = document.getElementById('add-work-fields') || document.getElementById('add-work-form');
        const modalTitle = document.getElementById('modal-title');
        const form = document.getElementById('add-work-form');

        if (form) {
            form.reset();
            form.querySelectorAll('.border-red-500').forEach(el => el.classList.remove('border-red-500'));
        }

        const titles = {
            'survey': 'เพิ่มงานฝ่ายรังวัด',
            'registration': 'เพิ่มงานฝ่ายทะเบียน',
            'academic': 'เพิ่มงานกลุ่มงานวิชาการ',
            'admin': 'เพิ่มงานฝ่ายอำนวยการ'
        };
        if (modalTitle) modalTitle.innerHTML = `<i class="fas fa-plus-circle mr-3"></i> ${titles[type] || 'เพิ่มงานใหม่'}`;

        if (fieldsContainer && UI.renderAddForm) {
            fieldsContainer.innerHTML = UI.renderAddForm(type);
            document.getElementById('add-work-modal').classList.remove('hidden');
        }
    },

    async openSurveyRegModal() {
        const now = new Date();
        const yearMonth = now.toISOString().slice(0, 7);

        try {
            const response = await fetch(`api/survey_reg_logs.php?year_month=${yearMonth}`);
            const data = await response.json();
            const logs = data.logs || [];
            const summary = data.summary || { total_count: 0 };

            let logsHtml = logs.map(log => `
                <div class="flex justify-between items-center p-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 rounded-lg transition-colors">
                    <div class="text-left">
                        <p class="font-bold text-gray-700">${new Date(log.record_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        <p class="text-xs text-gray-400">${log.notes || '-'}</p>
                    </div>
                    <div class="flex items-center gap-4">
                        <span class="text-lg font-black text-blue-600">${log.count}</span>
                        <button onclick="app.deleteSurveyRegLog(${log.id})" class="text-red-400 hover:text-red-600 transition-colors p-2">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `).join('');

            if (logs.length === 0) {
                logsHtml = '<div class="text-center py-8 text-gray-400">ยังไม่มีการบันทึกข้อมูลในเดือนนี้</div>';
            }

            Swal.fire({
                title: 'ยอดรับงานจากฝ่ายทะเบียน',
                html: `
                    <div class="mb-6 p-4 bg-blue-50 rounded-2xl flex justify-between items-center border border-blue-100 shadow-inner">
                        <span class="text-blue-700 font-bold">รวมยอดทั้งหมดเดือนนี้</span>
                        <span class="text-2xl font-black text-blue-700">${(summary.total_count || 0).toLocaleString()}</span>
                    </div>
                    
                    <div class="space-y-4 mb-6">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="text-left">
                                <label class="block text-xs font-bold text-gray-500 mb-1 ml-1">วันที่รับงาน</label>
                                <input type="date" id="swal-reg-date" value="${now.toISOString().split('T')[0]}" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm">
                            </div>
                            <div class="text-left">
                                <label class="block text-xs font-bold text-gray-500 mb-1 ml-1">จำนวนงาน (เรื่อง)</label>
                                <input type="number" id="swal-reg-count" placeholder="0" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-bold">
                            </div>
                        </div>
                        <div class="text-left">
                            <label class="block text-xs font-bold text-gray-500 mb-1 ml-1">หมายเหตุ</label>
                            <input type="text" id="swal-reg-notes" placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)" class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm">
                        </div>
                        <button onclick="app.saveSurveyRegLog()" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-600/20 transform hover:-translate-y-0.5 transition-all">
                            <i class="fas fa-save mr-2"></i> บันทึกข้อมูล
                        </button>
                    </div>

                    <div class="text-left">
                        <h4 class="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 px-1">ประวัติการบันทึกเดือนนี้</h4>
                        <div class="max-h-60 overflow-y-auto px-1">
                            ${logsHtml}
                        </div>
                    </div>
                `,
                showConfirmButton: false,
                showCloseButton: true,
                width: '500px',
                padding: '2rem',
                customClass: {
                    container: 'kpi-modal-container',
                    popup: 'rounded-3xl shadow-2xl border-0'
                }
            });

        } catch (error) {
            console.error(error);
            Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
        }
    },

    async saveSurveyRegLog() {
        const record_date = document.getElementById('swal-reg-date').value;
        const countInput = document.getElementById('swal-reg-count');
        const count = parseInt(countInput.value);
        const notes = document.getElementById('swal-reg-notes').value;

        if (!count || count <= 0) {
            Swal.fire('กรุณาตรวจสอบข้อมูล', 'ระบุจำนวนงานที่ถูกต้อง', 'warning');
            return;
        }

        try {
            const response = await fetch('api/survey_reg_logs.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    record_date,
                    count,
                    notes,
                    created_by: this.currentUser?.name || 'ฝ่ายรังวัด'
                })
            });

            if (response.ok) {
                // Refresh modal with current list
                this.openSurveyRegModal();

                // Show small success toast instead of whole Swal
                const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000,
                    timerProgressBar: true
                });
                Toast.fire({
                    icon: 'success',
                    title: 'บันทึกสำเร็จ'
                });
            } else {
                Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
            }
        } catch (error) {
            Swal.fire('ผิดพลาด', error.message, 'error');
        }
    },

    async deleteSurveyRegLog(id) {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: "ข้อมูลนี้จะถูกลบออกจากรายงาน KPI ด้วย",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#EF4444',
            confirmButtonText: 'ลบข้อมูล',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const response = await fetch('api/survey_reg_logs.php', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });

                if (response.ok) {
                    this.openSurveyRegModal(); // Refresh modal
                }
            } catch (error) {
                Swal.fire('ผิดพลาด', error.message, 'error');
            }
        }
    },


    async handleSaveWork() {
        if (this._isSavingWork) return;
        if (!this.currentAddType) return;

        const form = document.getElementById('add-work-form');
        const formData = new FormData(form);
        formData.append('type', this.currentAddType);
        if (this.currentUser?.name) {
            formData.append('user_name', this.currentUser.name);
        }

        // Basic validation
        let isValid = true;
        form.querySelectorAll('[required]').forEach(input => {
            if (!input.value || !input.value.trim()) {
                isValid = false;
                input.classList.add('border-red-500');
            } else {
                input.classList.remove('border-red-500');
            }
        });

        if (!isValid) {
            Swal.fire('กรุณากรอกข้อมูล', 'โปรดระบุข้อมูลในช่องที่จำเป็น (*)', 'warning');
            return;
        }

        // Lockdown Check (async - fetch fresh settings from server)
        const completionDate = formData.get('received_date');
        const addType = this.currentAddType || '';
        const deptForLockdown = addType === 'survey' ? 'survey' : addType === 'registration' ? 'registration' : addType === 'academic' ? 'academic' : addType === 'admin' ? 'admin' : null;
        if (await DataManager.isLockdownActive(completionDate, deptForLockdown)) {
            Swal.fire({
                icon: 'error',
                title: 'ไม่สามารถบันทึกข้อมูลได้',
                text: 'เนื่องจากเลยกำหนดการรายงานประจำเดือน (วันที่ 5 เวลา 01:00 น.) จึงไม่สามารถบันทึกงานย้อนหลังของเดือนที่ผ่านมาได้',
                confirmButtonColor: '#EF4444'
            });
            return;
        }

        const submitBtn = document.getElementById('btn-save-work');
        try {
            this._isSavingWork = true;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> กำลังบันทึก...';
            }

            const response = await fetch('api/save_work.php', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.status === 'success') {
                if (typeof DataManager !== 'undefined' && DataManager.clearCache) {
                    DataManager.clearCache(this.currentAddType);
                }
                document.getElementById('add-work-modal').classList.add('hidden');
                Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');

                if (this.currentAddType === 'survey') this.refreshSurveyList();
                else if (this.currentAddType === 'registration') this.refreshRegistrationList();
                else if (this.currentAddType === 'academic') this.refreshAcademicList();
                else if (this.currentAddType === 'admin') this.refreshAdminList();

            } else {
                Swal.fire('Error', result.message || 'เกิดข้อผิดพลาด', 'error');
            }
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์', 'error');
        } finally {
            this._isSavingWork = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i> บันทึกข้อมูล';
            }
        }
    },

    // === Completed Work Modal Functions ===
    currentCompletedType: null,

    showCompletedWorkModal(type = null) {
        const modalTitle = document.getElementById('completed-modal-title');
        const fieldsContainer = document.getElementById('completed-work-fields') || document.getElementById('completed-work-form');
        const form = document.getElementById('completed-work-form');

        if (form) {
            form.reset();
            form.querySelectorAll('.border-red-500').forEach(el => el.classList.remove('border-red-500'));
        }

        // ถ้ามี type ที่ระบุมา (จาก department-specific button)
        this.currentCompletedType = type;

        const titles = {
            'survey': 'บันทึกงานเสร็จ - ฝ่ายรังวัด',
            'registration': 'บันทึกงานเสร็จ - ฝ่ายทะเบียน',
            'academic': 'บันทึกงานเสร็จ - กลุ่มงานวิชาการ',
            'admin': 'บันทึกงานเสร็จ - ฝ่ายอำนวยการ'
        };

        // ถ้าไม่ได้ระบุ type แต่ user เป็น staff ของแผนกเฉพาะ ให้ตั้งเป็นแผนกนั้น
        const userDept = this.currentUser?.department;
        if (!type && userDept && userDept !== 'all') {
            type = userDept;
            this.currentCompletedType = type;
        }

        if (modalTitle) {
            modalTitle.innerHTML = `<i class="fas fa-check-circle mr-3"></i> ${titles[type] || 'บันทึกงานเสร็จ'}`;
        }

        if (fieldsContainer && UI.renderCompletedAddForm) {
            fieldsContainer.innerHTML = UI.renderCompletedAddForm(type);
            document.getElementById('completed-work-modal').classList.remove('hidden');
        }
    },

    updateCompletedFormFields(type) {
        this.currentCompletedType = type;
        const fieldsContainer = document.getElementById('completed-work-fields') || document.getElementById('completed-work-form');
        const modalTitle = document.getElementById('completed-modal-title');

        const titles = {
            'survey': 'บันทึกงานเสร็จ - ฝ่ายรังวัด',
            'registration': 'บันทึกงานเสร็จ - ฝ่ายทะเบียน',
            'academic': 'บันทึกงานเสร็จ - กลุ่มงานวิชาการ',
            'admin': 'บันทึกงานเสร็จ - ฝ่ายอำนวยการ'
        };

        if (modalTitle) {
            modalTitle.innerHTML = `<i class="fas fa-check-circle mr-3"></i> ${titles[type] || 'บันทึกงานเสร็จ'}`;
        }

        if (fieldsContainer && UI.renderCompletedAddForm) {
            fieldsContainer.innerHTML = UI.renderCompletedAddForm(type);
        }
    },

    async handleSaveCompletedWork() {
        if (this._isSavingCompletedWork) return;

        const deptSelect = document.getElementById('completed-dept-select');
        const type = deptSelect?.value || this.currentCompletedType;

        if (!type) {
            Swal.fire('กรุณาเลือกฝ่าย', 'โปรดเลือกฝ่าย/กลุ่มงานก่อนบันทึก', 'warning');
            return;
        }

        const form = document.getElementById('completed-work-form');
        const formData = new FormData(form);
        formData.append('type', type);
        formData.append('is_completed', '1'); // Flag ให้ backend รู้ว่าเป็นงานเสร็จ
        if (this.currentUser?.name) {
            formData.append('user_name', this.currentUser.name);
        }

        // Basic validation
        let isValid = true;
        form.querySelectorAll('[required]').forEach(input => {
            if (!input.value || !input.value.trim()) {
                isValid = false;
                input.classList.add('border-red-500');
            } else {
                input.classList.remove('border-red-500');
            }
        });

        if (!isValid) {
            Swal.fire('กรุณากรอกข้อมูล', 'โปรดระบุข้อมูลในช่องที่จำเป็น (*)', 'warning');
            return;
        }

        const submitBtn = document.getElementById('btn-save-completed-work');
        try {
            this._isSavingCompletedWork = true;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> กำลังบันทึก...';
            }

            const response = await fetch('api/save_work.php', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.status === 'success') {
                if (typeof DataManager !== 'undefined' && DataManager.clearCache) {
                    DataManager.clearCache(type);
                }
                document.getElementById('completed-work-modal').classList.add('hidden');
                Swal.fire({
                    icon: 'success',
                    title: 'บันทึกงานเสร็จสำเร็จ!',
                    text: 'งานถูกบันทึกและนับว่าเสร็จสิ้นแล้ว',
                    confirmButtonColor: '#10B981'
                });

                // Refresh list ตามแผนก
                if (type === 'survey') this.refreshSurveyList();
                else if (type === 'registration') this.refreshRegistrationList();
                else if (type === 'academic') this.refreshAcademicList();
                else if (type === 'admin') this.refreshAdminList();

            } else {
                Swal.fire('Error', result.message || 'เกิดข้อผิดพลาด', 'error');
            }
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์', 'error');
        } finally {
            this._isSavingCompletedWork = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-check-circle mr-2"></i> บันทึกงานเสร็จ';
            }
        }
    },

    async quickUpdateStatus(id, type, status) {
        const today = new Date().toISOString().split('T')[0];
        try {
            // Get old data for history before updating
            let items = [];
            if (type === 'survey') items = await DataManager.getSurveyItems();
            else if (type === 'registration') items = await DataManager.getRegistrationItems();
            else if (type === 'academic') items = await DataManager.getAcademicItems();

            const oldItem = items.find(i => i.id == id);
            const oldStatus = oldItem ? (oldItem.status_cause || oldItem.status || '-') : '-';

            if (type === 'survey') {
                await DataManager.updateSurveyItem({ id, status_cause: status, completion_date: today });
            } else if (type === 'registration') {
                await DataManager.updateRegistrationItem({ id, status_cause: status, completion_date: today });
            } else if (type === 'academic') {
                await DataManager.updateAcademicItem({ id, status_cause: status, completion_date: today });
            }

            // Log to status history
            await this.addStatusHistory(id, type, 'ทำเครื่องหมายเสร็จ', oldStatus, 'เสร็จสิ้น');

            Swal.fire('สำเร็จ', 'อัปเดตสถานะเป็น "เสร็จสิ้น" เรียบร้อยแล้ว', 'success');
            document.getElementById('detail-modal').classList.add('hidden');
            this.refreshLists(type);
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'ไม่สามารถอัปเดตข้อมูลได้', 'error');
        }
    },

    async sendToRegistration(id, type) {
        let status = document.getElementById('update-status-input').value;
        const rv_12 = document.getElementById('update-rv12-input')?.value;
        const survey_date = document.getElementById('update-survey-date')?.value;
        let completion_date = document.getElementById('update-completion-date').value;

        // Use today's date if not specified
        if (!completion_date) {
            const today = new Date();
            completion_date = today.toISOString().split('T')[0];
        }

        // Default status if empty
        if (!status) {
            status = 'ส่งฝ่ายทะเบียน';
        }

        try {
            // Get old data for history
            let items = [];
            if (type === 'survey') items = await DataManager.getSurveyItems();
            else if (type === 'registration') items = await DataManager.getRegistrationItems();
            else if (type === 'academic') items = await DataManager.getAcademicItems();

            const oldItem = items.find(i => i.id == id);
            const oldStatus = oldItem ? (oldItem.status_cause || oldItem.status || '-') : '-';

            if (type === 'survey') {
                await DataManager.updateSurveyItem({
                    id,
                    status_cause: status,
                    rv_12,
                    survey_date,
                    completion_date
                });
            } else if (type === 'registration') {
                await DataManager.updateRegistrationItem({ id, status_cause: status, completion_date });
            } else if (type === 'academic') {
                await DataManager.updateAcademicItem({ id, status_cause: status, completion_date });
            }

            // Log history
            await this.addStatusHistory(id, type, 'ส่งฝ่ายทะเบียน', oldStatus, status);

            Swal.fire({
                icon: 'success',
                title: 'สำเร็จ',
                text: 'บันทึกและส่งฝ่ายทะเบียนเรียบร้อยแล้ว',
                timer: 1500,
                showConfirmButton: false
            });

            document.getElementById('detail-modal').classList.add('hidden');
            this.refreshLists(type);

        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'ไม่สามารถดำเนินการได้', 'error');
        }
    },

    async saveStatusUpdate(id, type) {
        const status = document.getElementById('update-status-input')?.value || '';
        const completion_date = document.getElementById('update-completion-date')?.value || '';

        // ดักกรณีฝ่ายรังวัด: สถานะเป็น "ถอนจ่าย" แต่มีการเลือกวันที่ทำรายการเสร็จ
        if (type === 'survey' && status.trim().includes('ถอนจ่าย') && completion_date.trim() !== '') {
            const alertMsg = 'งานนี้ สถานนะเสร็จแล้วหรือยัง จากการติ้กวันเข้ามา เพราะสถานะเป็น ถอนจ่าย สงสัยโทรหาเจมส์ได้เลย';
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'warning',
                    title: 'ตรวจสอบสถานะงาน',
                    text: alertMsg,
                    confirmButtonColor: '#F59E0B',
                    confirmButtonText: 'ตกลง'
                });
            } else {
                alert(alertMsg);
            }
            return;
        }

        // Lockdown Check (async - fetch fresh settings from server, per-dept)
        const deptKey = type === 'survey' ? 'survey' : type === 'registration' ? 'registration' : type === 'academic' ? 'academic' : null;
        if (completion_date && await DataManager.isLockdownActive(completion_date, deptKey)) {
            Swal.fire({
                icon: 'error',
                title: 'ไม่สามารถแก้ไขข้อมูลได้',
                text: 'สถานะ "เสร็จสิ้น" ของเดือนที่ผ่านมาถูกล็อคแล้ว (เลยกำหนดแจ้งงานประจำเดือนทุกวันที่ 5)',
                confirmButtonColor: '#EF4444'
            });
            return;
        }

        try {
            // Get old data for history before updating
            let items = [];
            if (type === 'survey') items = await DataManager.getSurveyItems();
            else if (type === 'registration') items = await DataManager.getRegistrationItems();
            else if (type === 'academic') items = await DataManager.getAcademicItems();

            const oldItem = items.find(i => i.id == id);
            const oldStatus = oldItem ? (oldItem.status_cause || oldItem.status || '-') : '-';

            let notes = [];
            if (status !== oldStatus) notes.push(`สถานะ: ${oldStatus} -> ${status}`);

            // Check completion date change
            const oldCompletion = oldItem ? (oldItem.completion_date || '') : '';
            if (completion_date != oldCompletion) {
                notes.push(`วันที่แล้วเสร็จ: ${oldCompletion || '-'} -> ${completion_date || '-'}`);
            }

            if (type === 'survey') {
                const rv_12 = document.getElementById('update-rv12-input')?.value;
                const survey_date = document.getElementById('update-survey-date')?.value;
                const oldRv12 = oldItem ? (oldItem.rv_12 || '') : '';
                const oldSurveyDate = oldItem ? (oldItem.survey_date || '') : '';

                // ตรวจ lockdown สำหรับวันนัดรังวัดด้วย เพื่อป้องกันการบันทึกวันรังวัดย้อนหลัง
                if (survey_date && survey_date !== oldSurveyDate && await DataManager.isLockdownActive(survey_date, 'survey')) {
                    Swal.fire({
                        icon: 'error',
                        title: 'ไม่สามารถแก้ไขข้อมูลได้',
                        text: 'วันนัดรังวัดของเดือนที่ผ่านมาถูกล็อคแล้ว (เลยกำหนดการรายงานประจำเดือนทุกวันที่ 5)',
                        confirmButtonColor: '#EF4444'
                    });
                    return;
                }

                if (rv_12 != oldRv12) notes.push(`รว.12: ${oldRv12 || '-'} -> ${rv_12 || '-'}`);
                if (survey_date != oldSurveyDate) notes.push(`วันรังวัด: ${oldSurveyDate || '-'} -> ${survey_date || '-'}`);

                await DataManager.updateSurveyItem({ id, status_cause: status, completion_date, rv_12, survey_date });
            } else if (type === 'registration') {
                await DataManager.updateRegistrationItem({ id, status_cause: status, completion_date });
            } else if (type === 'academic') {
                await DataManager.updateAcademicItem({ id, status_cause: status, completion_date });
            }

            // Add to status history if anything was changed
            if (notes.length > 0) {
                const actionName = (status !== oldStatus) ? 'อัปเดตสถานะ' : 'อัปเดตข้อมูลทั่วไป';
                await this.addStatusHistory(id, type, actionName, oldStatus, status, notes.join(', '));
            }

            Swal.fire('สำเร็จ', 'บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว', 'success');
            document.getElementById('detail-modal').classList.add('hidden');
            this.refreshLists(type);
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    },

    async deleteWork(id, type) {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: 'ข้อมูลงานจะถูกลบถาวรและไม่สามารถกู้คืนได้',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#6b7280',
            confirmButtonText: '<i class="fas fa-trash-alt mr-2"></i> ลบงาน',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const apiEndpoint = `api/${type}.php`;
                const response = await fetch(apiEndpoint, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ id: id })
                });

                const data = await response.json();
                if (response.ok && data.status === 'success') {
                    if (typeof DataManager !== 'undefined' && DataManager.clearCache) {
                        DataManager.clearCache(type);
                    }
                    Swal.fire({
                        icon: 'success',
                        title: 'ลบสำเร็จ!',
                        text: 'ข้อมูลงานถูกลบเรียบร้อยแล้ว',
                        timer: 1500,
                        showConfirmButton: false
                    });
                    document.getElementById('detail-modal').classList.add('hidden');
                    this.refreshLists(type);
                } else {
                    throw new Error(data.message || 'Delete failed');
                }
            } catch (error) {
                console.error(error);
                Swal.fire('Error', 'ไม่สามารถลบข้อมูลได้: ' + error.message, 'error');
            }
        }
    },

    refreshLists(type) {
        if (typeof DataManager !== 'undefined' && DataManager.clearCache) {
            DataManager.clearCache(type || null);
        }
        // Only refresh the specific department that changed
        if (type === 'survey') this.refreshSurveyList();
        else if (type === 'registration') this.refreshRegistrationList();
        else if (type === 'academic') this.refreshAcademicList();
        else if (type === 'admin') this.refreshAdminList();
        else {
            // No type specified — refresh all
            this.refreshSurveyList();
            this.refreshRegistrationList();
            this.refreshAcademicList();
            this.refreshAdminList();
        }
    },

    showToast(title, icon = 'success', timer = 1500, text = null) {
        if (typeof Swal === 'undefined') return;
        const config = {
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: timer,
            timerProgressBar: true,
            icon: icon,
            title: title
        };
        if (text) config.text = text;
        return Swal.fire(config);
    },

    async refreshCurrentPage() {
        const refreshBtn = document.getElementById('btn-refresh-page');
        const refreshIcons = document.querySelectorAll('.refresh-spin-icon, #refresh-icon');
        refreshIcons.forEach(icon => icon.classList.add('fa-spin'));
        if (refreshBtn) refreshBtn.disabled = true;

        try {
            // Invalidate all caches
            if (typeof DataManager !== 'undefined' && DataManager.clearCache) {
                DataManager.clearCache();
            }

            const page = this.currentPage || 'dashboard';

            if (page === 'survey_list') {
                await this.refreshSurveyList();
            } else if (page === 'registration_list') {
                await this.refreshRegistrationList();
            } else if (page === 'academic_list') {
                await this.refreshAcademicList();
            } else if (page === 'admin_list') {
                await this.refreshAdminList();
            } else if (page === 'dashboard') {
                await this.renderDashboard();
            } else if (page === 'survey_dashboard') {
                await this.renderSurveyDashboard();
            } else if (page === 'registration_dashboard') {
                await this.renderRegistrationDashboard();
            } else if (page === 'academic_dashboard') {
                await this.renderAcademicDashboard();
            } else if (page === 'admin_dashboard') {
                await this.renderAdminDashboard();
            } else if (page === 'all_work_search') {
                await this.renderAllWorkSearch();
            } else {
                await this.navigate(page);
            }

            this.showToast('รีเฟรชข้อมูลล่าสุดแล้ว', 'success', 1500);

        } catch (error) {
            console.error('Refresh page error:', error);
            Swal.fire('Error', 'ไม่สามารถรีเฟรชข้อมูลได้: ' + (error.message || error), 'error');
        } finally {
            setTimeout(() => {
                refreshIcons.forEach(icon => icon.classList.remove('fa-spin'));
                if (refreshBtn) refreshBtn.disabled = false;
            }, 500);
        }
    },

    // ABM Report Date Handler
    async updateABMReport(dateValue) {
        const content = document.getElementById('app-content');
        if (content) {
            content.innerHTML = await UI.renderReport(dateValue);

            // Refresh AOS animations
            UI.refreshAOS();
        }
    },

    // Show monthly items modal
    async showMonthlyItems(year, month) {
        const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
            'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        const monthName = thaiMonths[month - 1];
        const yearBE = year + 543;

        // Get KPI data with the current report date
        const abmReportDate = document.getElementById('abm-report-month')?.value || null;
        const abmData = await DataManager.getABMReport(abmReportDate);
        if (!abmData || !abmData.oldWork) return;

        // Find the month data
        const monthData = abmData.oldWork.monthlyProgress.find(m => m.yearAD === year && m.monthNum === month);

        if (!monthData || !monthData.items || monthData.items.length === 0) {
            Swal.fire('ไม่มีข้อมูล', `ไม่พบงานที่เสร็จในเดือน ${monthName} ${yearBE}`, 'info');
            return;
        }

        // Build table rows
        const tableRows = monthData.items.map((item, idx) => `
            <tr class="hover:bg-gray-50 border-b border-gray-100">
                <td class="px-3 py-2 text-center text-sm text-gray-500">${idx + 1}</td>
                <td class="px-3 py-2 text-sm text-gray-600">${item.department || '-'}</td>
                <td class="px-3 py-2 text-sm text-gray-800 font-medium">${item.subject || item.applicant || '-'}</td>
                <td class="px-3 py-2 text-sm text-gray-600">${UI.formatThaiDate(item.received_date)}</td>
                <td class="px-3 py-2 text-sm text-emerald-600 font-medium">${UI.formatThaiDate(item.completion_date)}</td>
            </tr>
        `).join('');

        // Show modal with SweetAlert2
        Swal.fire({
            title: `<i class="fas fa-list-check text-orange-500 mr-2"></i>งานที่เสร็จ ${monthName} ${yearBE}`,
            html: `
                <div class="text-left">
                    <div class="mb-4 p-3 bg-orange-50 rounded-lg border border-orange-100">
                        <div class="flex justify-between items-center">
                            <span class="text-orange-700 font-bold">จำนวนทั้งหมด:</span>
                            <span class="text-2xl font-black text-orange-600">${monthData.items.length} งาน</span>
                        </div>
                    </div>
                    <div class="overflow-x-auto max-h-96">
                        <table class="w-full text-left border-collapse">
                            <thead class="bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-3 py-2 text-xs font-bold text-gray-600 uppercase">ที่</th>
                                    <th class="px-3 py-2 text-xs font-bold text-gray-600 uppercase">ฝ่าย</th>
                                    <th class="px-3 py-2 text-xs font-bold text-gray-600 uppercase">เรื่อง/ราย</th>
                                    <th class="px-3 py-2 text-xs font-bold text-gray-600 uppercase">วันที่รับ</th>
                                    <th class="px-3 py-2 text-xs font-bold text-emerald-600 uppercase">วันที่เสร็จ</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            `,
            width: 800,
            confirmButtonText: 'ปิด',
            confirmButtonColor: '#F97316',
            customClass: {
                popup: 'rounded-2xl',
                title: 'text-lg font-bold text-gray-800'
            }
        });
    },

    // Export to PDF using Official Template and Browser Print (Professional/Official version)
    async exportToPDF() {
        Swal.fire({
            title: 'กำลังเตรียมเอกสารราชการ...',
            html: 'กรุณารอสักครู่ ระบบกำลังจัดรูปแบบรายงานแบบเป็นทางการ',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const reportDate = document.getElementById('abm-report-date')?.value || null;
            const abmData = await DataManager.getABMReport(reportDate);

            // Generate the professional HTML template
            const reportHtml = UI.renderOfficialPrintTemplate(abmData);

            // Create a temporary iframe or open a new window for printing
            const printWindow = window.open('', '_blank', 'width=1000,height=800');

            if (!printWindow) {
                throw new Error('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณายอมรับ Pop-up ในเบราว์เซอร์ของคุณ');
            }

            printWindow.document.write(reportHtml);
            printWindow.document.close();

            // Wait for images and fonts to load before printing
            printWindow.onload = function () {
                setTimeout(() => {
                    printWindow.print();
                    // printWindow.close(); // optional: close after print
                }, 500);
            };

            Swal.fire({
                icon: 'success',
                title: 'เตรียมเอกสารสำเร็จ!',
                text: 'กรุณาเลือก "Save as PDF" ในหน้าต่างที่เปิดขึ้นมา เพื่อดาวน์โหลดไฟล์รายงานแบบเป็นทางการ',
                confirmButtonColor: '#10B981'
            });
        } catch (error) {
            console.error('Official PDF Export Error:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถสร้างรายงานได้: ' + error.message,
                confirmButtonColor: '#EF4444'
            });
        }
    },

    // Export to Excel
    async exportToExcel() {
        Swal.fire({
            title: 'กำลังสร้าง Excel...',
            html: 'กรุณารอสักครู่',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const reportDate = document.getElementById('abm-report-month')?.value || null;
            const abmReport = await DataManager.getABMReport(reportDate);

            // Create workbook
            const wb = XLSX.utils.book_new();

            // Sheet 1: Summary
            const summaryData = [
                ['รายงาน ABM งานค้าง - Ang Thong AABM'],
                ['วันที่รายงาน: ' + (abmReport.reportDate || new Date().toLocaleDateString('th-TH'))],
                [''],
                ['=== โซน 1: งานเก่า (ก่อน ม.ค. 2569) ==='],
                ['งานเก่าทั้งหมด (Baseline)', abmReport.oldWork.baseline.total],
                ['ดำเนินการเสร็จแล้ว', abmReport.oldWork.summary.totalCompleted],
                ['คงเหลือ', abmReport.oldWork.summary.remaining],
                ['% ลดลง', abmReport.oldWork.summary.currentPercent.toFixed(1) + '%'],
                [''],
                ['=== โซน 2: งานใหม่ (ตั้งแต่ ม.ค. 2569) ==='],
                ['งานใหม่ทั้งหมด', abmReport.newWork.total],
                ['เสร็จแล้ว', abmReport.newWork.completed],
                ['รอดำเนินการ', abmReport.newWork.pending],
                ['เสร็จใน 30 วัน', abmReport.newWork.breakdown.within30Days + ' (' + abmReport.newWork.percentages.within30.toFixed(1) + '%)'],
                ['เสร็จใน 60 วัน', abmReport.newWork.breakdown.within60Days + ' (' + abmReport.newWork.percentages.within60.toFixed(1) + '%)']
            ];
            const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

            // Sheet 2: Old Work Monthly
            if (abmReport.oldWork.monthlyProgress && abmReport.oldWork.monthlyProgress.length > 0) {
                const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
                const monthlyHeaders = ['เดือน', 'งานค้างต้นเดือน', 'เสร็จในเดือน', 'งานค้างสิ้นเดือน', '% ลดลง', 'ผลการประเมิน'];
                const monthlyRows = abmReport.oldWork.monthlyProgress.map(m => [
                    thaiMonths[m.monthNum - 1] + ' ' + m.year,
                    m.backlogStart,
                    m.completedThisMonth,
                    m.backlogEnd,
                    m.percentThisMonth.toFixed(1) + '%',
                    m.achieved ? 'บรรลุเป้าหมาย' : 'ไม่บรรลุเป้าหมาย'
                ]);
                const wsMonthly = XLSX.utils.aoa_to_sheet([monthlyHeaders, ...monthlyRows]);
                XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Progress');
            }

            // Sheet 3: Old Work Details (รายละเอียดงานเก่าที่เสร็จแล้ว - เหมือน PDF ภาคผนวก)
            if (abmReport.oldWork.monthlyProgress && abmReport.oldWork.monthlyProgress.length > 0) {
                const oldWorkDetailsHeaders = ['เดือน/ปี', 'ลำดับ', 'ฝ่าย', 'เรื่อง/ผู้ขอ', 'วันที่รับ', 'วันที่เสร็จ'];
                const oldWorkDetailsRows = [];

                abmReport.oldWork.monthlyProgress.forEach(m => {
                    if (m.items && m.items.length > 0) {
                        m.items.forEach((item, idx) => {
                            oldWorkDetailsRows.push([
                                m.month + ' ' + m.year,
                                idx + 1,
                                item.department || '-',
                                item.subject || item.applicant || '-',
                                item.received_date || '-',
                                item.completion_date || '-'
                            ]);
                        });
                    }
                });

                if (oldWorkDetailsRows.length > 0) {
                    const wsOldDetails = XLSX.utils.aoa_to_sheet([oldWorkDetailsHeaders, ...oldWorkDetailsRows]);
                    XLSX.utils.book_append_sheet(wb, wsOldDetails, 'Old Work Details');
                }
            }

            // Sheet 4: New Work Details (รายละเอียดงานใหม่ที่เสร็จแล้ว)
            if (abmReport.newWork.completedItems && abmReport.newWork.completedItems.length > 0) {
                const newWorkDetailsHeaders = ['ลำดับ', 'ฝ่าย', 'เรื่อง/ผู้ขอ', 'วันที่รับ', 'วันที่เสร็จ', 'จำนวนวัน', 'สถานะ'];
                const newWorkDetailsRows = abmReport.newWork.completedItems.map((item, idx) => {
                    const days = item.daysToComplete || '-';
                    let status = 'เสร็จสิ้น';

                    if (typeof days === 'number') {
                        if (days <= 30) {
                            status = 'เสร็จใน 30 วัน ✓';
                        } else if (days <= 60) {
                            status = 'เสร็จใน 60 วัน';
                        } else {
                            status = 'เสร็จเกิน 60 วัน';
                        }
                    }

                    return [
                        idx + 1,
                        item.department || '-',
                        item.subject || item.applicant || '-',
                        item.received_date || '-',
                        item.completion_date || '-',
                        days,
                        status
                    ];
                });

                const wsNewDetails = XLSX.utils.aoa_to_sheet([newWorkDetailsHeaders, ...newWorkDetailsRows]);
                XLSX.utils.book_append_sheet(wb, wsNewDetails, 'New Work Details');
            }

            // Save
            XLSX.writeFile(wb, 'ABM_Report_' + new Date().toISOString().split('T')[0] + '.xlsx');

            Swal.fire({
                icon: 'success',
                title: 'Export Excel สำเร็จ!',
                text: 'ไฟล์ Excel ถูกดาวน์โหลดแล้ว',
                confirmButtonColor: '#10B981'
            });
        } catch (error) {
            console.error('Excel Export Error:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: error.message || 'ไม่สามารถสร้าง Excel ได้',
                confirmButtonColor: '#EF4444'
            });
        }
    },

    // ==================== PROGRESS TYPE & HISTORY MANAGEMENT ====================

    getProgressTypeAssignMode(workType, settings = DataManager.systemSettings) {
        const deptAssignKey = workType ? `progress_type_assign_${workType}` : null;
        return (deptAssignKey && settings?.[deptAssignKey])
            || settings?.progress_type_assign
            || 'restricted';
    },

    async refreshProgressTypeDetail(itemId, workType) {
        if (workType === 'survey') {
            await this.viewSurveyDetail(itemId);
        } else if (workType === 'registration') {
            await this.viewRegistrationDetail(itemId);
        } else if (workType === 'academic') {
            await this.viewAcademicDetail(itemId);
        } else if (workType === 'admin') {
            await this.viewAdminDetail(itemId);
        }
    },

    // Update progress type
    async updateProgressType(itemId, workType, newType, isChecked) {
        try {
            // If unchecking, set to type 1 (normal)
            const progressType = isChecked ? newType : 1;

            // Get old progress type and item info
            let items;
            if (workType === 'survey') {
                items = await DataManager.getSurveyItems();
            } else if (workType === 'registration') {
                items = await DataManager.getRegistrationItems();
            } else if (workType === 'academic') {
                items = await DataManager.getAcademicItems();
            } else if (workType === 'admin') {
                items = await DataManager.getAdminItems();
            } else {
                items = [];
            }

            const item = items.find(i => i.id == itemId);

            if (isChecked && [2, 3].includes(parseInt(newType, 10))) {
                if (item && UI.isNewWork2026 && !UI.isNewWork2026(item.received_date)) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'ไม่อนุญาตให้ปรับหมวด',
                        text: 'งานเก่าที่รับเรื่องก่อนวันที่ 1 มกราคม 2569 ไม่สามารถปรับเป็นงานสุดขั้นตอนหรืองานศาลได้',
                        confirmButtonColor: '#EF4444'
                    });
                    const checkbox = document.getElementById(`progress-type-${newType}`);
                    if (checkbox) checkbox.checked = false;
                    await this.refreshProgressTypeDetail(itemId, workType);
                    return;
                }

                const settings = await DataManager.getSystemSettings(true);
                if (this.getProgressTypeAssignMode(workType, settings) !== 'allowed') {
                    const checkbox = document.getElementById(`progress-type-${newType}`);
                    if (checkbox) checkbox.checked = false;
                    await this.refreshProgressTypeDetail(itemId, workType);
                    return;
                }
            }
            const oldType = item?.progress_type || 4;

            // Determine table name and API endpoint
            const tableMap = {
                'survey': 'survey_works',
                'registration': 'registration_works',
                'academic': 'academic_works'
            };

            // Call API to update
            const response = await fetch(`api/${workType}.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: itemId,
                    progress_type: progressType
                })
            });

            // Read body first so we can extract the real error message from PHP
            const resData = await response.json().catch(() => ({}));
            if (!response.ok) {
                const apiError = new Error(resData.message || 'Unable to update progress type');
                apiError.status = response.status;
                throw apiError;
            }

            // Log to history
            const typeLabels = {
                1: 'งานปกติ',
                2: 'งานสุดขั้นตอน',
                3: 'งานศาล',
                4: 'งานค้าง'
            };

            await this.addStatusHistory(itemId, workType, 'เปลี่ยนหมวดหมู่', typeLabels[oldType], typeLabels[progressType]);

            // ── Clear item cache so the refreshed view uses fresh data ──
            DataManager.clearItemCache(workType);

            // Refresh the detail view
            await this.refreshProgressTypeDetail(itemId, workType);

            // Refresh the main list in background (Real-time update)
            this.refreshLists(workType);

            Swal.fire({
                icon: 'success',
                title: 'อัปเดตหมวดหมู่แล้ว!',
                text: `เปลี่ยนเป็น "${typeLabels[progressType]}"`,
                timer: 1500,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });

        } catch (error) {
            if (error.status === 403 && [2, 3].includes(parseInt(newType, 10))) {
                const checkbox = document.getElementById(`progress-type-${newType}`);
                if (checkbox) checkbox.checked = false;
                await this.refreshProgressTypeDetail(itemId, workType);
                return;
            }
            console.error('Update progress type error:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: error.message || 'ไม่สามารถอัปเดตหมวดหมู่ได้'
            });
        }
    },

    // Load status history for a work item
    async loadStatusHistory(workId, workType) {
        try {
            const response = await fetch(`api/status_history.php?work_type=${workType}&work_id=${workId}`);
            const history = await response.json();

            const historyList = document.getElementById('history-list');
            if (!historyList) return;

            if (history.length === 0) {
                historyList.innerHTML = UI.renderEmptyHistory();
            } else {
                historyList.innerHTML = history.map(h => UI.formatHistoryItem(h)).join('');
            }
        } catch (error) {
            console.error('Load history error:', error);
            const historyList = document.getElementById('history-list');
            if (historyList) {
                historyList.innerHTML = `
                    <div class="text-center py-4 text-red-500">
                        <i class="fas fa-exclamation-circle mr-2"></i>ไม่สามารถโหลดประวัติได้
                    </div>
                `;
            }
        }
    },

    // Add status history entry
    async addStatusHistory(workId, workType, actionType, oldValue = null, newValue = null, note = null) {
        try {
            const response = await fetch('api/status_history.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    work_type: workType,
                    work_id: workId,
                    action_type: actionType,
                    old_value: oldValue,
                    new_value: newValue,
                    note: note,
                    changed_by: this.currentUser?.name || this.currentUser?.username || 'ผู้ใช้งาน'
                })
            });

            if (!response.ok) throw new Error('Failed to add history');
            return await response.json();
        } catch (error) {
            console.error('Add history error:', error);
            throw error;
        }
    },

    // Show modal to add history note
    showAddHistoryModal(workId, workType) {
        Swal.fire({
            title: '<i class="fas fa-plus-circle text-amber-500 mr-2"></i> เพิ่มบันทึกประวัติ',
            html: `
                <div class="text-left space-y-4">
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">ประเภทการดำเนินการ</label>
                        <select id="history-action-type" class="w-full border rounded-lg p-2 text-sm">
                            <option value="อัปเดตสถานะ">อัปเดตสถานะ</option>
                            <option value="ติดต่อคู่กรณี">ติดต่อคู่กรณี</option>
                            <option value="ส่งหนังสือ">ส่งหนังสือ</option>
                            <option value="รอเอกสาร">รอเอกสาร</option>
                            <option value="ประชุม/หารือ">ประชุม/หารือ</option>
                            <option value="รอดำเนินการศาล">รอดำเนินการศาล</option>
                            <option value="หมายเหตุอื่นๆ">หมายเหตุอื่นๆ</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">รายละเอียด/หมายเหตุ</label>
                        <textarea id="history-note" rows="3" class="w-full border rounded-lg p-2 text-sm" placeholder="ระบุรายละเอียดการดำเนินการ..."></textarea>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-save mr-1"></i> บันทึก',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#F59E0B',
            focusConfirm: false,
            preConfirm: () => {
                const actionType = document.getElementById('history-action-type').value;
                const note = document.getElementById('history-note').value;

                if (!note.trim()) {
                    Swal.showValidationMessage('กรุณาระบุรายละเอียด');
                    return false;
                }

                return { actionType, note };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await this.addStatusHistory(workId, workType, result.value.actionType, null, null, result.value.note);

                    // Reload history
                    await this.loadStatusHistory(workId, workType);

                    Swal.fire({
                        icon: 'success',
                        title: 'บันทึกประวัติแล้ว!',
                        timer: 1500,
                        showConfirmButton: false,
                        toast: true,
                        position: 'top-end'
                    });
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'เกิดข้อผิดพลาด',
                        text: error.message || 'ไม่สามารถบันทึกประวัติได้'
                    });
                }
            }
        });
    },

    // Edit a history entry
    async editHistory(historyId, currentActionType, currentNote, workType, workId) {
        const { value: formValues } = await Swal.fire({
            title: '<i class="fas fa-edit text-blue-500 mr-2"></i> แก้ไขประวัติ',
            html: `
                <div class="text-left space-y-4">
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">ประเภทการดำเนินการ</label>
                        <select id="edit-action-type" class="w-full border rounded-lg p-2 text-sm">
                            <option value="อัปเดตสถานะ" ${currentActionType === 'อัปเดตสถานะ' ? 'selected' : ''}>อัปเดตสถานะ</option>
                            <option value="ติดต่อคู่กรณี" ${currentActionType === 'ติดต่อคู่กรณี' ? 'selected' : ''}>ติดต่อคู่กรณี</option>
                            <option value="ส่งหนังสือ" ${currentActionType === 'ส่งหนังสือ' ? 'selected' : ''}>ส่งหนังสือ</option>
                            <option value="รอเอกสาร" ${currentActionType === 'รอเอกสาร' ? 'selected' : ''}>รอเอกสาร</option>
                            <option value="ประชุม/หารือ" ${currentActionType === 'ประชุม/หารือ' ? 'selected' : ''}>ประชุม/หารือ</option>
                            <option value="รอดำเนินการศาล" ${currentActionType === 'รอดำเนินการศาล' ? 'selected' : ''}>รอดำเนินการศาล</option>
                            <option value="เพิ่มหมายเหตุ" ${currentActionType === 'เพิ่มหมายเหตุ' ? 'selected' : ''}>เพิ่มหมายเหตุ</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">หมายเหตุ / รายละเอียด</label>
                        <textarea id="edit-note" rows="3" class="w-full border rounded-lg p-2 text-sm" 
                            placeholder="รายละเอียดเพิ่มเติม...">${currentNote}</textarea>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-save mr-2"></i> บันทึก',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#3B82F6',
            preConfirm: () => {
                return {
                    actionType: document.getElementById('edit-action-type').value,
                    note: document.getElementById('edit-note').value
                };
            }
        });

        if (formValues) {
            try {
                const response = await fetch('api/status_history.php', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: historyId,
                        action_type: formValues.actionType,
                        note: formValues.note
                    })
                });

                if (!response.ok) throw new Error('Failed to update history');

                // Reload history
                await this.loadStatusHistory(workId, workType);

                Swal.fire({
                    icon: 'success',
                    title: 'แก้ไขประวัติแล้ว!',
                    timer: 1500,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top-end'
                });
            } catch (error) {
                console.error('Edit history error:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'เกิดข้อผิดพลาด',
                    text: error.message || 'ไม่สามารถแก้ไขประวัติได้'
                });
            }
        }
    },

    // Delete a history entry
    async deleteHistory(historyId, workType, workId) {
        const result = await Swal.fire({
            title: '<i class="fas fa-trash text-red-500 mr-2"></i> ลบประวัติ?',
            text: 'คุณต้องการลบรายการประวัตินี้หรือไม่?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-trash mr-2"></i> ลบ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#EF4444'
        });

        if (result.isConfirmed) {
            try {
                const response = await fetch('api/status_history.php', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: historyId })
                });

                if (!response.ok) throw new Error('Failed to delete history');

                // Reload history
                await this.loadStatusHistory(workId, workType);

                Swal.fire({
                    icon: 'success',
                    title: 'ลบประวัติแล้ว!',
                    timer: 1500,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top-end'
                });
            } catch (error) {
                console.error('Delete history error:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'เกิดข้อผิดพลาด',
                    text: error.message || 'ไม่สามารถลบประวัติได้'
                });
            }
        }
    },

    // ==================== EXCEL/CSV IMPORT ====================

    // Show import modal
    showImportModal(workType, isCompleted = false) {
        if (!workType || workType === 'undefined' || workType === 'null') {
            if (this.currentPage?.includes('academic')) workType = 'academic';
            else if (this.currentPage?.includes('registration')) workType = 'registration';
            else if (this.currentPage?.includes('admin')) workType = 'admin';
            else workType = 'survey';
        }

        const typeLabels = {
            'survey': 'งานฝ่ายรังวัด',
            'registration': 'งานฝ่ายทะเบียน',
            'academic': 'งานกลุ่มงานวิชาการ',
            'admin': 'งานฝ่ายอำนวยการ'
        };

        const typeColors = {
            'survey': 'indigo',
            'registration': 'blue',
            'academic': 'orange',
            'admin': 'teal'
        };

        const color = isCompleted ? 'green' : (typeColors[workType] || 'emerald');
        const title = isCompleted ? `นำเข้างานที่เสร็จแล้ว (${typeLabels[workType] || 'ไม่ระบุ'})` : `นำเข้าข้อมูล${typeLabels[workType] || ''}`;
        const icon = isCompleted ? 'fa-check-double' : 'fa-file-upload';

        Swal.fire({
            title: `<h3 class="text-xl font-bold flex items-center justify-center"><i class="fas ${icon} text-${color}-600 mr-2"></i> ${title}</h3>`,
            html: `
                <div class="text-left space-y-4">
                    <!-- Download Template Section -->
                    <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <h4 class="font-bold text-gray-700 mb-2 text-sm"><i class="fas fa-download mr-2 text-${color}-500"></i>1. ดาวน์โหลดไฟล์ต้นแบบ</h4>
                        <p class="text-xs text-gray-500 mb-3">ดาวน์โหลดไฟล์ต้นแบบแล้วกรอกข้อมูลตามรูปแบบที่กำหนด</p>
                        <div class="flex gap-2">
                            <button onclick="app.downloadTemplate('${workType}', 'csv')" 
                                class="px-3 py-2 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600 transition flex items-center">
                                <i class="fas fa-file-csv mr-2"></i> CSV
                            </button>
                            <button onclick="app.downloadTemplate('${workType}', 'xlsx')" 
                                class="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition flex items-center">
                                <i class="fas fa-file-excel mr-2"></i> Excel
                            </button>
                        </div>
                    </div>

                    <!-- Upload Section -->
                    <div class="bg-${color}-50 p-4 rounded-xl border border-${color}-200">
                        <h4 class="font-bold text-gray-700 mb-2 text-sm"><i class="fas fa-upload mr-2 text-${color}-500"></i>2. อัปโหลดไฟล์ข้อมูล</h4>
                        <p class="text-xs text-gray-500 mb-3">เลือกไฟล์ Excel (.xlsx) หรือ CSV (.csv) ที่กรอกข้อมูลแล้ว</p>
                        <input type="file" id="import-file" 
                            accept=".csv,.xlsx,.xls"
                            class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-${color}-500 file:text-white hover:file:bg-${color}-600 cursor-pointer"
                        >
                    </div>

                    ${isCompleted ? `
                    <div class="bg-blue-50 p-4 rounded-xl border border-blue-200">
                        <h4 class="font-bold text-gray-700 mb-2 text-sm"><i class="fas fa-tasks mr-2 text-blue-500"></i>3. ระบุประเภทงาน</h4>
                        <select id="import-progress-type" class="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm border p-2">
                            <option value="1">งานปกติ / เสร็จสิ้น</option>
                            <option value="2">งานสุดขั้นตอน</option>
                            <option value="3">งานศาล</option>
                        </select>
                    </div>
                    ` : ''}

                    <!-- Mode Selection -->
                    <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <label class="flex items-center cursor-pointer group">
                            <div class="relative">
                                <input type="checkbox" id="import-mode-update" class="sr-only peer">
                                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-${color}-600"></div>
                            </div>
                            <span class="ml-3 text-sm font-bold text-gray-700 group-hover:text-${color}-600 transition-colors">โหมดอัปเดตสาเหตุค้าง (Update Mode)</span>
                        </label>
                        <p class="text-[10px] text-gray-400 mt-2 ml-14"><i class="fas fa-info-circle mr-1"></i> ใช้เพื่ออัปเดตงานที่มีอยู่แล้วในระบบ โดยเช็คจาก วันที่รับ, ประเภทงาน และชื่อผู้ขอ</p>
                    </div>

                    <!-- Info -->
                    <div class="text-xs text-gray-400">
                        ${isCompleted ? `
                            <p class="text-green-600 font-bold"><i class="fas fa-check-circle mr-1"></i> รายการทั้งหมดจะถูกตั้งสถานะเป็น "เสร็จสิ้น" ทันที</p>
                            <p class="text-green-600 font-bold"><i class="fas fa-calendar-alt mr-1"></i> วันที่เสร็จจะเท่ากับวันที่รับเรื่องในไฟล์</p>
                        ` : `
                            <p><i class="fas fa-info-circle mr-1"></i> งานที่รับเรื่องเกิน 30 วัน จะถูกตั้งค่าเป็น "งานค้าง" อัตโนมัติ</p>
                        `}
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-upload mr-2"></i> นำเข้าข้อมูล',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: isCompleted ? '#10B981' : (color === 'indigo' ? '#6366F1' : color === 'blue' ? '#3B82F6' : color === 'teal' ? '#0D9488' : '#F97316'),
            showLoaderOnConfirm: true,
            preConfirm: async () => {
                const fileInput = document.getElementById('import-file');
                if (!fileInput.files.length) {
                    Swal.showValidationMessage('กรุณาเลือกไฟล์');
                    return false;
                }
                const progressType = document.getElementById('import-progress-type')?.value || '1';
                const isUpdateMode = document.getElementById('import-mode-update')?.checked || false;
                return this.processImport(workType, fileInput.files[0], isCompleted, progressType, isUpdateMode);
            },
            allowOutsideClick: () => !Swal.isLoading()
        });
    },

    // Process import file
    async processImport(workType, file, isCompleted = false, progressType = '1', isUpdateMode = false) {
        if (!workType || workType === 'undefined' || workType === 'null') {
            if (this.currentPage?.includes('academic')) workType = 'academic';
            else if (this.currentPage?.includes('registration')) workType = 'registration';
            else if (this.currentPage?.includes('admin')) workType = 'admin';
            else workType = 'survey';
        }

        const formData = new FormData();
        formData.append('work_type', workType);
        formData.append('file', file);

        if (isUpdateMode) {
            formData.append('import_mode', 'update');
        }

        // สำหรับการนำเข้างานที่เสร็จแล้ว
        if (isCompleted) {
            const pType = parseInt(progressType, 10);
            if (pType === 1) {
                // งานปกติ/เสร็จสิ้น = งานเสร็จจริงๆ → ใส่ completion_date
                formData.append('is_completed', '1');
                formData.append('progress_type', '1');
            } else if (pType === 2 || pType === 3) {
                // งานสุดขั้นตอน/งานศาล = ยังไม่เสร็จ แค่แยกหมวดหมู่
                // ไม่ใส่ completion_date, แค่ตั้ง progress_type
                formData.append('progress_type', progressType);
            }
        }

        try {
            const response = await fetch('api/import.php', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.status === 'success') {
                if (typeof DataManager !== 'undefined' && DataManager.clearCache) {
                    DataManager.clearCache(workType);
                }

                Swal.fire({
                    icon: 'success',
                    title: 'นำเข้าข้อมูลสำเร็จ!',
                    html: `
                        <div class="text-center">
                            <p class="text-2xl font-bold text-emerald-600">${result.inserted || 0} รายการ</p>
                            <p class="text-sm text-gray-500 mb-2">จากทั้งหมด ${result.total} รายการ</p>
                            
                            ${result.updated ? `<p class="text-xs font-bold text-blue-600"><i class="fas fa-edit mr-1"></i> อัปเดต: ${result.updated} รายการ</p>` : ''}
                            ${result.skipped ? `<p class="text-xs font-bold text-amber-500"><i class="fas fa-forward mr-1"></i> ข้าม: ${result.skipped} รายการ</p>` : ''}
                            
                            ${result.errors.length > 0 ? `
                                <div class="mt-3 text-left bg-red-50 p-3 rounded-lg max-h-32 overflow-y-auto">
                                    <p class="text-xs text-red-600 font-bold mb-1">รายการที่มีปัญหา:</p>
                                    ${result.errors.slice(0, 5).map(e => `<p class="text-xs text-red-500">${e}</p>`).join('')}
                                    ${result.errors.length > 5 ? `<p class="text-xs text-red-400">...และอีก ${result.errors.length - 5} รายการ</p>` : ''}
                                </div>
                            ` : ''}
                        </div>
                    `,
                    confirmButtonColor: '#10B981'
                });

                // Refresh the list
                if (workType === 'survey') this.refreshSurveyList();
                else if (workType === 'registration') this.refreshRegistrationList();
                else if (workType === 'academic') this.refreshAcademicList();
                else if (workType === 'admin') this.refreshAdminList();

                return true;
            } else {
                throw new Error(result.message || 'นำเข้าข้อมูลไม่สำเร็จ');
            }
        } catch (error) {
            console.error('Import error:', error);
            Swal.showValidationMessage(`เกิดข้อผิดพลาด: ${error.message}`);
            return false;
        }
    },

    // Download template file
    downloadTemplate(workType, format) {
        window.location.href = `api/template.php?type=${workType}&format=${format}`;
    },

    // ==================== ABM ACTION PLAN ====================

    // Load ABM data from API
    async loadABMData(date = null) {
        try {
            const today = new Date();
            // Use provided date or current month
            const yearMonth = date
                ? date.slice(0, 7) // YYYY-MM if full date provided
                : today.toISOString().slice(0, 7);

            console.log('Loading KPI Data for:', yearMonth); // Debug

            const response = await fetch(`api/abm_report.php?years_month=${yearMonth}&department=all`);
            if (!response.ok) throw new Error('Failed to load ABM data');

            return await response.json();
        } catch (error) {
            console.error('Error loading KPI data:', error);
            return {
                autoData: {
                    oldWork: { baseline: 0, completed: 0, pending: 0, monthlyCompleted: [] },
                    newWork: { total: 0, completed: 0, pending: 0 }
                },
                savedData: {},
                breakdown: {}
            };
        }
    },

    // Save ABM Note
    async saveABMNote(yearMonth, dept, note) {
        try {
            const response = await fetch('api/kpi_report.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    years_month: yearMonth,
                    department: dept,
                    notes: note,
                    created_by: 'ผู้ดูแลระบบ'
                })
            });

            if (!response.ok) throw new Error('Failed to save note');

            // Visual feedback
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true
            });

            Toast.fire({
                icon: 'success',
                title: 'บันทึกหมายเหตุเรียบร้อยแล้ว'
            });
        } catch (error) {
            console.error('Error saving KPI note:', error);
            Swal.fire('Error', 'ไม่สามารถบันทึกหมายเหตุได้', 'error');
        }
    },

    // Show modal to save manually completed work today
    async showABMSaveCompletionModal(defaultDept = 'survey') {
        Swal.fire({
            title: 'บันทึกงานเสร็จวันนี้',
            html: `
                <div class="space-y-4 py-4">
                    <div class="flex flex-col gap-1 text-left">
                        <label class="text-sm font-bold text-gray-700">เลือกฝ่าย</label>
                        <select id="swal-dept" class="w-full p-2 border rounded-lg">
                            <option value="survey" ${defaultDept === 'survey' ? 'selected' : ''}>รังวัด</option>
                            <option value="registration" ${defaultDept === 'registration' ? 'selected' : ''}>ทะเบียน</option>
                            <option value="academic" ${defaultDept === 'academic' ? 'selected' : ''}>วิชาการ</option>
                        </select>
                    </div>
                    <div class="flex flex-col gap-1 text-left">
                        <label class="text-sm font-bold text-gray-700">จำนวนงานที่เสร็จ (เรื่อง)</label>
                        <input type="number" id="swal-count" class="w-full p-2 border rounded-lg" value="1" min="1">
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'บันทึก',
            cancelButtonText: 'ยกเลิก',
            preConfirm: () => {
                return {
                    dept: document.getElementById('swal-dept').value,
                    count: document.getElementById('swal-count').value
                };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const monthInput = document.getElementById('abm-report-month');
                const yearMonth = monthInput ? monthInput.value : new Date().toISOString().slice(0, 7);

                try {
                    const response = await fetch('api/abm_report.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            years_month: yearMonth,
                            department: result.value.dept,
                            completed_within_30: parseInt(result.value.count, 10),
                            created_by: this.currentUser?.name || 'ผู้ดูแลระบบ'
                        })
                    });

                    if (!response.ok) throw new Error('Failed to save completion data');

                    Swal.fire({
                        title: 'บันทึกสำเร็จ!',
                        text: 'บันทึกข้อมูลงานเสร็จเรียบร้อยแล้ว',
                        icon: 'success',
                        timer: 1500,
                        showConfirmButton: false
                    }).then(() => {
                        this.updateABMReport(yearMonth + '-01');
                    });
                } catch (error) {
                    console.error('Error saving KPI completion:', error);
                    Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
                }
            }
        });
    },

    // Update KPI Report View based on date selection
    async updateKPIReport(date) {
        try {
            // Show loading state
            const contentDiv = document.getElementById('content-area') || document.getElementById('main-content'); // Adjust selector as needed
            if (contentDiv) {
                // If we are just updating the content inside the report container, we might specifically target that if possible
                // But generally we re-render the whole report view
                // Actually, renderReport in UI returns the HTML string.
                // We need to fetch data first, then call UI.renderKPIActionPlan?
                // Wait, UI.renderReport does the fetching AND returning HTML? No, renderReport calls DataManager (now app.loadABMData).

                // Let's rely on UI.renderReport to fetch data if we pass the date?
                // In UI.js: renderReport(reportDate) calls fetch.

                // So here we should just re-render the page content
                const html = await UI.renderReport(date);
                contentDiv.innerHTML = html;

                // Re-initialize AOS or other plugins if needed
                UI.refreshAOS();
            }
        } catch (error) {
            console.error('Error updating KPI report:', error);
            Swal.fire('Error', 'ไม่สามารถโหลดรายงานได้', 'error');
        }
    },

    // Save KPI Action Plan data
    async saveKPIActionPlan() {
        try {
            const today = new Date();
            const yearMonth = today.toISOString().slice(0, 7); // YYYY-MM

            const data = {
                years_month: yearMonth,
                department: 'all',
                new_work_received: 0, // Calculated automatically in backend or UI, not saved directly from here usually unless we want to override
                new_work_completed: parseInt(document.getElementById('kpi-new-completed')?.value || 0),
                completed_within_30: parseInt(document.getElementById('kpi-within-30')?.value || 0),
                completed_within_60: parseInt(document.getElementById('kpi-within-60')?.value || 0),
                completed_over_60: parseInt(document.getElementById('kpi-over-60')?.value || 0),
                notes: document.getElementById('kpi-notes')?.value || '',
                created_by: this.currentUser?.name || 'ผู้ดูแลระบบ'
            };

            const response = await fetch('api/kpi_report.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.status === 'success') {
                Swal.fire({
                    icon: 'success',
                    title: 'บันทึกสำเร็จ!',
                    text: 'บันทึกข้อมูล KPI เรียบร้อยแล้ว',
                    timer: 2000,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top-end'
                });
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error saving KPI data:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: error.message || 'ไม่สามารถบันทึกข้อมูลได้'
            });
        }
    },

    // ==================== SAME-DAY COMPLETION ====================

    // Show modal for recording same-day completions (งานเกิดเสร็จวันเดียว)
    async showSameDayCompletionModal(workType) {
        const deptNames = {
            survey: 'ฝ่ายรังวัด',
            registration: 'ฝ่ายทะเบียน',
            academic: 'กลุ่มงานวิชาการ'
        };
        const deptName = deptNames[workType] || workType;

        const today = new Date();
        const yearMonth = today.toISOString().slice(0, 7);
        const monthName = today.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

        const canManage = this.canManageSameDayLogs(workType);

        const result = await Swal.fire({
            title: `<i class="fas fa-check-double text-emerald-500 mr-2"></i>งานเกิดเสร็จวันเดียว`,
            html: `
                <div class="text-left">
                    <p class="text-sm text-gray-600 mb-4">
                        บันทึกจำนวนงานที่เกิดและเสร็จในวันเดียว (ไม่นับเป็นงานค้าง)<br>
                        <strong>${deptName}</strong>
                    </p>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">จำนวนงาน (เรื่อง)</label>
                        <input type="number" id="sameday-count" min="0" value="0"
                            class="w-full px-4 py-3 text-xl text-center font-bold border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            <i class="fas fa-calendar-alt mr-1 text-gray-400"></i>วันที่บันทึก 
                            <span class="text-xs text-gray-400">(ไม่บังคับ - ถ้าย้อนหลัง)</span>
                        </label>
                        <input type="date" id="sameday-date" value="${today.toISOString().split('T')[0]}"
                            class="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
                    </div>
                    <div class="bg-emerald-50 p-3 rounded-lg text-sm text-emerald-700">
                        <i class="fas fa-info-circle mr-1"></i>
                        งานเหล่านี้จะนับเป็น "งานเสร็จ" ในรายงาน KPI แต่ไม่สร้างรายการใหม่ในฐานข้อมูล
                    </div>
                    ${canManage ? `
                    <div class="mt-4">
                        <button type="button" onclick="app.openSameDayLogsManager('${workType}')"
                            class="w-full px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 font-bold hover:bg-gray-50 transition flex items-center justify-center">
                            <i class="fas fa-pen-to-square mr-2 text-gray-500"></i> แก้ไข/ลบรายการของฝ่าย
                        </button>
                        <p class="text-xs text-gray-400 mt-2 text-center">
                            แก้ไขได้เฉพาะรายการของฝ่ายตนเอง
                        </p>
                    </div>
                    ` : ``}
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-save mr-2"></i>บันทึก',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#10B981',
            focusConfirm: false,
            preConfirm: () => {
                const count = parseInt(document.getElementById('sameday-count').value || 0);
                const dateInput = document.getElementById('sameday-date').value;
                const recordDate = dateInput || today.toISOString().split('T')[0];

                if (count <= 0) {
                    Swal.showValidationMessage('จำนวนต้องมากกว่า 0');
                    return false;
                }
                return { count, workType, recordDate };
            }
        });

        if (result.isConfirmed) {
            await this.saveSameDayCompletion(result.value);
        }
    },

    canManageSameDayLogs(workType) {
        const dept = this.currentUser?.department || null;
        const role = this.currentUser?.role || null;
        if (!dept) return false;
        if (role === 'superadmin' || dept === 'all') return true;
        return dept === workType;
    },

    async openSameDayLogsManager(workType, forcedYearMonth = null) {
        try {
            // Resolve department: staff can only manage their own dept
            const userDept = this.currentUser?.department || null;
            const dept = (userDept && userDept !== 'all') ? userDept : workType;

            if (!this.canManageSameDayLogs(dept)) {
                Swal.fire({
                    icon: 'warning',
                    title: 'ไม่มีสิทธิ์เข้าถึง',
                    text: 'คุณสามารถจัดการได้เฉพาะรายการของฝ่ายตนเอง',
                    confirmButtonColor: '#F97316'
                });
                return;
            }

            const dateEl = document.getElementById('sameday-date');
            const dateVal = dateEl?.value || new Date().toISOString().slice(0, 10);
            const yearMonth = forcedYearMonth || dateVal.slice(0, 7);

            Swal.fire({
                title: '<i class="fas fa-list-check text-emerald-600 mr-2"></i>จัดการรายการงานเกิดเสร็จวันเดียว',
                html: `<div class="text-sm text-gray-500">กำลังโหลดข้อมูล...</div>`,
                width: 820,
                showConfirmButton: false,
                showCancelButton: true,
                cancelButtonText: 'ปิด'
            });

            const data = await this.fetchSameDayLogs(dept, yearMonth);
            const logs = data?.logs || [];
            this._sameDayLogsCache = (this._sameDayLogsCache || {});
            logs.forEach(l => { this._sameDayLogsCache[l.id] = l; });

            const deptNames = {
                survey: 'ฝ่ายรังวัด',
                registration: 'ฝ่ายทะเบียน',
                academic: 'กลุ่มงานวิชาการ'
            };

            const rows = logs.length > 0
                ? logs.map((l, idx) => `
                    <tr class="border-b border-gray-100 hover:bg-gray-50">
                        <td class="px-3 py-2 text-sm text-gray-500 text-center">${idx + 1}</td>
                        <td class="px-3 py-2 text-sm text-gray-700">${l.record_date || '-'}</td>
                        <td class="px-3 py-2 text-sm text-gray-900 font-bold text-center">${l.count || 0}</td>
                        <td class="px-3 py-2 text-sm text-gray-600">${l.notes ? String(l.notes).replace(/</g, '&lt;') : '-'}</td>
                        <td class="px-3 py-2 text-sm text-right whitespace-nowrap">
                            <button class="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition"
                                onclick="app.openEditSameDayLog(${l.id}, '${dept}', '${yearMonth}')">
                                <i class="fas fa-pen mr-1"></i>แก้ไข
                            </button>
                            <button class="ml-2 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 font-bold hover:bg-red-100 transition"
                                onclick="app.confirmDeleteSameDayLog(${l.id}, '${dept}', '${yearMonth}')">
                                <i class="fas fa-trash mr-1"></i>ลบ
                            </button>
                        </td>
                    </tr>
                `).join('')
                : `
                    <tr>
                        <td colspan="5" class="px-3 py-10 text-center text-gray-500">
                            ไม่พบรายการในเดือนนี้
                        </td>
                    </tr>
                `;

            Swal.fire({
                title: '<i class="fas fa-list-check text-emerald-600 mr-2"></i>จัดการรายการงานเกิดเสร็จวันเดียว',
                width: 820,
                showConfirmButton: false,
                showCancelButton: true,
                cancelButtonText: 'ปิด',
                html: `
                    <div class="text-left">
                        <div class="mb-3 flex items-center justify-between gap-3">
                            <div class="text-sm text-gray-600">
                                <span class="font-bold">${deptNames[dept] || dept}</span>
                                <span class="text-gray-400">•</span>
                                <span class="font-medium">${yearMonth}</span>
                            </div>
                            <button class="px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-bold hover:bg-gray-50 transition"
                                onclick="app.openSameDayLogsManager('${dept}', '${yearMonth}')">
                                <i class="fas fa-rotate-right mr-2 text-gray-400"></i>รีเฟรช
                            </button>
                        </div>
                        <div class="overflow-x-auto border border-gray-200 rounded-xl">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-3 py-2 text-xs font-bold text-gray-600 uppercase w-12 text-center">#</th>
                                        <th class="px-3 py-2 text-xs font-bold text-gray-600 uppercase w-36">วันที่</th>
                                        <th class="px-3 py-2 text-xs font-bold text-gray-600 uppercase w-24 text-center">จำนวน</th>
                                        <th class="px-3 py-2 text-xs font-bold text-gray-600 uppercase">หมายเหตุ</th>
                                        <th class="px-3 py-2 text-xs font-bold text-gray-600 uppercase w-56 text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows}
                                </tbody>
                            </table>
                        </div>
                        <div class="mt-3 text-xs text-gray-400">
                            หมายเหตุ: การแก้ไข/ลบ จะปรับยอดในรายงาน KPI ของเดือนนั้นอัตโนมัติ
                        </div>
                    </div>
                `
            });
        } catch (error) {
            console.error('openSameDayLogsManager error:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: error.message || 'ไม่สามารถโหลดรายการได้'
            });
        }
    },

    async fetchSameDayLogs(department, yearMonth) {
        const params = new URLSearchParams();
        if (department) params.set('department', department);
        if (yearMonth) params.set('year_month', yearMonth);

        const res = await fetch(`api/sameday_logs.php?${params.toString()}`);
        const data = await res.json();
        if (!res.ok || data.status !== 'success') {
            throw new Error(data.error || 'Failed to load logs');
        }
        return data;
    },

    async openEditSameDayLog(id, dept, yearMonth) {
        const log = this._sameDayLogsCache?.[id];
        if (!log) {
            Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูล', text: 'ไม่พบรายการที่ต้องการแก้ไข' });
            return;
        }

        const result = await Swal.fire({
            title: '<i class="fas fa-pen text-blue-600 mr-2"></i>แก้ไขรายการ',
            html: `
                <div class="text-left space-y-4">
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">วันที่บันทึก</label>
                        <input type="date" id="edit-sd-date" class="w-full px-3 py-2 border rounded-xl"
                            value="${log.record_date || ''}">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">จำนวนงาน (เรื่อง)</label>
                        <input type="number" id="edit-sd-count" min="1" class="w-full px-3 py-2 border rounded-xl text-center font-bold"
                            value="${log.count || 1}">
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">หมายเหตุ (ถ้ามี)</label>
                        <textarea id="edit-sd-notes" rows="2" class="w-full px-3 py-2 border rounded-xl"
                            placeholder="ระบุหมายเหตุ...">${log.notes || ''}</textarea>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'บันทึก',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#2563EB',
            preConfirm: () => {
                const record_date = document.getElementById('edit-sd-date').value;
                const count = parseInt(document.getElementById('edit-sd-count').value || 0, 10);
                const notes = document.getElementById('edit-sd-notes').value || null;
                if (!record_date) {
                    Swal.showValidationMessage('กรุณาระบุวันที่');
                    return false;
                }
                if (!count || count <= 0) {
                    Swal.showValidationMessage('จำนวนต้องมากกว่า 0');
                    return false;
                }
                return { record_date, count, notes };
            }
        });

        if (!result.isConfirmed) return;

        try {
            const res = await fetch('api/sameday_logs.php', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    record_date: result.value.record_date,
                    department: dept,
                    count: result.value.count,
                    notes: result.value.notes,
                    created_by: this.currentUser?.name || 'ผู้ใช้งาน'
                })
            });

            const data = await res.json();
            if (!res.ok || data.status !== 'success') {
                throw new Error(data.error || 'Update failed');
            }

            Swal.fire({
                icon: 'success',
                title: 'บันทึกการแก้ไขแล้ว',
                timer: 1200,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });

            // Refresh manager view
            this.openSameDayLogsManager(dept, yearMonth);
        } catch (e) {
            console.error('openEditSameDayLog error:', e);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message || 'ไม่สามารถแก้ไขได้' });
        }
    },

    async confirmDeleteSameDayLog(id, dept, yearMonth) {
        const log = this._sameDayLogsCache?.[id];
        const dateText = log?.record_date || '-';
        const countText = log?.count || 0;

        const result = await Swal.fire({
            icon: 'warning',
            title: 'ยืนยันการลบ?',
            html: `<div class="text-sm text-gray-600">ต้องการลบรายการวันที่ <b>${dateText}</b> จำนวน <b>${countText}</b> เรื่อง ใช่หรือไม่</div>`,
            showCancelButton: true,
            confirmButtonText: 'ลบ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#EF4444'
        });

        if (!result.isConfirmed) return;

        try {
            const res = await fetch('api/sameday_logs.php', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (!res.ok || data.status !== 'success') {
                throw new Error(data.error || 'Delete failed');
            }

            Swal.fire({
                icon: 'success',
                title: 'ลบรายการแล้ว',
                timer: 1200,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });

            // Refresh manager view
            this.openSameDayLogsManager(dept, yearMonth);
        } catch (e) {
            console.error('confirmDeleteSameDayLog error:', e);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message || 'ไม่สามารถลบได้' });
        }
    },

    // Save same-day completion count - บันทึกเป็นแต่ละรายการ
    async saveSameDayCompletion(data) {
        try {
            // บันทึกเป็น log แยกแต่ละรายการ (ไม่ใช่อัปเดตรวม)
            const response = await fetch('api/sameday_logs.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    record_date: data.recordDate, // วันที่บันทึกจริง
                    department: data.workType,
                    count: data.count,
                    notes: data.notes || null,
                    created_by: this.currentUser?.name || 'ผู้ดูแลระบบ'
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                Swal.fire({
                    icon: 'success',
                    title: 'บันทึกสำเร็จ!',
                    text: `บันทึกงานเกิดเสร็จวันเดียว ${data.count} เรื่อง`,
                    timer: 2000,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top-end'
                });
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error saving same-day completion:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: error.message || 'ไม่สามารถบันทึกข้อมูลได้'
            });
        }
    },

    /**
     * Dashboard metric drill-down.
     */
    handleDashboardMetricKey(event, metric, dept = 'all') {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.showDashboardMetricDetails(metric, dept);
        }
    },

    getDashboardMetricConfig(metric) {
        const configs = {
            total: { title: 'งานรับเข้าทั้งหมด', icon: 'fa-layer-group', color: '#4f46e5' },
            completed: { title: 'ดำเนินการเสร็จสิ้น', icon: 'fa-check-double', color: '#10b981' },
            over30: { title: 'ค้าง 31-60 วัน', icon: 'fa-hourglass-start', color: '#f59e0b' },
            over60: { title: 'ค้างเกิน 60 วัน', icon: 'fa-fire-flame-curved', color: '#e11d48' },
            type2: { title: 'งานสุดขั้นตอน', icon: 'fa-flag-checkered', color: '#8b5cf6' },
            type3: { title: 'งานศาล', icon: 'fa-gavel', color: '#ef4444' }
        };
        return configs[metric] || configs.total;
    },

    getDashboardDeptConfig(dept) {
        const configs = {
            survey: { title: 'ฝ่ายรังวัด', getter: () => DataManager.getSurveyItems() },
            registration: { title: 'ฝ่ายทะเบียน', getter: () => DataManager.getRegistrationItems() },
            academic: { title: 'ฝ่ายวิชาการ', getter: () => DataManager.getAcademicItems() },
            admin: { title: 'ฝ่ายอำนวยการ', getter: () => DataManager.getAdminItems() }
        };
        return configs[dept] || null;
    },

    async getDashboardItemsForDept(dept = 'all') {
        const deptConfigs = {
            survey: this.getDashboardDeptConfig('survey'),
            registration: this.getDashboardDeptConfig('registration'),
            academic: this.getDashboardDeptConfig('academic'),
            admin: this.getDashboardDeptConfig('admin')
        };

        const normalize = (items, source, label) => (items || []).map(item => ({
            ...item,
            source,
            departmentLabel: label
        }));

        if (dept !== 'all') {
            const config = deptConfigs[dept];
            if (!config) return [];
            const items = await config.getter();
            return normalize(items, dept, config.title);
        }

        const [surveyItems, registrationItems, academicItems, adminItems] = await Promise.all([
            deptConfigs.survey.getter(),
            deptConfigs.registration.getter(),
            deptConfigs.academic.getter(),
            deptConfigs.admin.getter()
        ]);

        return [
            ...normalize(surveyItems, 'survey', deptConfigs.survey.title),
            ...normalize(registrationItems, 'registration', deptConfigs.registration.title),
            ...normalize(academicItems, 'academic', deptConfigs.academic.title),
            ...normalize(adminItems, 'admin', deptConfigs.admin.title)
        ];
    },

    filterDashboardMetricItems(items, metric) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return items.filter(item => {
            const isCompleted = DataManager.isCompleted(item);
            const progressType = parseInt(item.progress_type, 10);
            let startDateStr = item.received_date;
            const isSurvey = item.source === 'survey' || item.department === 'ฝ่ายรังวัด' || item.survey_type !== undefined || item.rv_12 !== undefined;
            if (isSurvey && item.received_date >= '2026-01-01' && item.survey_date && item.survey_date !== '0000-00-00') {
                startDateStr = item.survey_date;
            }
            const startDate = DataManager.getSafeDate(startDateStr);
            let days = null;

            if (!startDate) return false;

            startDate.setHours(0, 0, 0, 0);
            days = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));

            if (metric === 'total') return true;
            if (metric === 'completed') return isCompleted;
            if (metric === 'over30') return !isCompleted && progressType !== 2 && progressType !== 3 && days !== null && days > 30 && days <= 60;
            if (metric === 'over60') return !isCompleted && progressType !== 2 && progressType !== 3 && days !== null && days > 60;
            if (metric === 'type2') return !isCompleted && progressType === 2;
            if (metric === 'type3') return !isCompleted && progressType === 3;
            return false;
        });
    },

    escapeDashboardText(value) {
        return String(value ?? '-')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    getDashboardItemTitle(item) {
        return item.applicant || item.related_person || item.applicant_name || item.sender_name || item.subject || '-';
    },

    getDashboardItemSubject(item) {
        return item.survey_type || item.subject || '-';
    },

    getDashboardItemRelatedPerson(item) {
        return item.related_person || item.applicant || item.applicant_name || item.sender_name || '-';
    },

    getDashboardItemUpdatedAt(item) {
        return item.updated_at || item.update_at || item.completion_date || '-';
    },

    getDashboardItemNote(item) {
        return item.note || item.notes || item.remark || item.remarks || '-';
    },

    getDashboardProgressLabel(progressType) {
        const labels = {
            2: 'สุดขั้นตอน',
            3: 'งานศาล',
            4: 'งานค้าง'
        };
        return labels[parseInt(progressType, 10)] || 'ปกติ';
    },

    getDashboardItemDays(item) {
        if (DataManager.isCompleted(item)) return '-';
        let startDateStr = item.received_date;
        const isSurvey = item.source === 'survey' || item.department === 'ฝ่ายรังวัด' || item.survey_type !== undefined || item.rv_12 !== undefined;
        if (isSurvey && item.received_date >= '2026-01-01' && item.survey_date && item.survey_date !== '0000-00-00') {
            startDateStr = item.survey_date;
        }
        const startDate = DataManager.getSafeDate(startDateStr);
        if (!startDate) return '-';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
        if (days < 0 && isSurvey && item.received_date >= '2026-01-01' && item.survey_date && item.survey_date !== '0000-00-00') {
            return 'รอวันรังวัด';
        }
        return days >= 0 ? days : '-';
    },

    buildDashboardMetricRows(items) {
        return items.map((item, index) => {
            const safe = value => this.escapeDashboardText(value);

            return `
                <tr class="border-b border-slate-100 hover:bg-slate-50">
                    <td class="px-3 py-2 text-xs font-semibold text-slate-700">${safe(item.departmentLabel || '')}</td>
                    <td class="px-3 py-2 text-center text-xs text-slate-500">${index + 1}</td>
                    <td class="px-3 py-2 text-xs text-slate-700">${safe(UI.formatThaiDate(item.received_date))}</td>
                    <td class="px-3 py-2 text-xs font-bold text-slate-800">${safe(item.subject || this.getDashboardItemSubject(item))}</td>
                    <td class="px-3 py-2 text-xs text-slate-600">${safe(this.getDashboardProgressLabel(item.progress_type))}</td>
                    <td class="px-3 py-2 text-xs text-slate-600">${safe(this.getDashboardItemRelatedPerson(item))}</td>
                    <td class="px-3 py-2 text-xs text-slate-600">${safe(item.status_cause || item.status || '-')}</td>
                    <td class="px-3 py-2 text-xs text-slate-600">${safe(this.getDashboardItemUpdatedAt(item))}</td>
                    <td class="px-3 py-2 text-xs text-slate-600">${safe(this.getDashboardItemNote(item))}</td>
                </tr>
            `;
        }).join('');
    },

    buildDashboardMetricCards(items) {
        if (!items.length) {
            return '<div class="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-400">ไม่พบข้อมูลในหมวดนี้</div>';
        }

        return items.map((item, index) => {
            const safe = value => this.escapeDashboardText(value);
            return `
                <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <div class="text-[11px] font-bold text-slate-400">#${index + 1} - ${safe(item.departmentLabel || '')}</div>
                            <h4 class="mt-1 text-sm font-black text-slate-800 leading-snug">${safe(item.subject || this.getDashboardItemSubject(item))}</h4>
                        </div>
                        <span class="shrink-0 rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-700">${safe(this.getDashboardProgressLabel(item.progress_type))}</span>
                    </div>
                    <dl class="mt-3 grid grid-cols-1 gap-2 text-xs">
                        <div class="flex justify-between gap-3">
                            <dt class="text-slate-400">วันที่รับเรื่อง</dt>
                            <dd class="font-semibold text-slate-700 text-right">${safe(UI.formatThaiDate(item.received_date))}</dd>
                        </div>
                        <div class="flex justify-between gap-3">
                            <dt class="text-slate-400">ผู้เกี่ยวข้อง</dt>
                            <dd class="font-semibold text-slate-700 text-right">${safe(this.getDashboardItemRelatedPerson(item))}</dd>
                        </div>
                        <div>
                            <dt class="text-slate-400">ความสำคัญของเรื่อง</dt>
                            <dd class="mt-1 font-semibold text-slate-700">${safe(item.status_cause || item.status || '-')}</dd>
                        </div>
                        <div class="flex justify-between gap-3">
                            <dt class="text-slate-400">การดำเนินการ</dt>
                            <dd class="font-semibold text-slate-700 text-right">${safe(this.getDashboardItemUpdatedAt(item))}</dd>
                        </div>
                        <div>
                            <dt class="text-slate-400">หมายเหตุ</dt>
                            <dd class="mt-1 font-semibold text-slate-700">${safe(this.getDashboardItemNote(item))}</dd>
                        </div>
                    </dl>
                </article>
            `;
        }).join('');
    },

    async showDashboardMetricDetails(metric, dept = 'all') {
        const metricConfig = this.getDashboardMetricConfig(metric);
        const deptConfig = this.getDashboardDeptConfig(dept);

        Swal.fire({
            title: 'กำลังโหลดข้อมูล...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const allItems = await this.getDashboardItemsForDept(dept);
            const items = this.filterDashboardMetricItems(allItems, metric)
                .sort((a, b) => new Date(b.received_date || 0) - new Date(a.received_date || 0));

            this.dashboardMetricItems = items;
            this.dashboardMetricTitle = metricConfig.title;

            const deptTitle = deptConfig ? deptConfig.title : 'ทุกฝ่าย';
            const tableRows = items.length > 0
                ? this.buildDashboardMetricRows(items)
                : '<tr><td colspan="9" class="px-4 py-10 text-center text-slate-400">ไม่พบข้อมูลในหมวดนี้</td></tr>';
            const mobileCards = this.buildDashboardMetricCards(items);

            await Swal.fire({
                width: window.innerWidth < 768 ? 'calc(100vw - 16px)' : 'min(1320px, calc(100vw - 72px))',
                showConfirmButton: false,
                showCloseButton: true,
                customClass: {
                    popup: 'rounded-[28px] dashboard-metric-popup',
                    title: 'px-5 md:px-0',
                    htmlContainer: '!mx-0 !px-4 md:!px-6'
                },
                didOpen: (popup) => {
                    popup.style.maxWidth = window.innerWidth < 768 ? 'calc(100vw - 16px)' : 'calc(100vw - 72px)';
                    popup.style.width = window.innerWidth < 768 ? 'calc(100vw - 16px)' : 'min(1320px, calc(100vw - 72px))';
                },
                title: `
                    <div class="flex items-center justify-center gap-3 text-base md:text-xl">
                        <span class="w-11 h-11 rounded-2xl text-white flex items-center justify-center" style="background:${metricConfig.color}">
                            <i class="fas ${metricConfig.icon}"></i>
                        </span>
                        <span>${metricConfig.title}</span>
                    </div>
                `,
                html: `
                    <style>
                        .dashboard-metric-popup .swal2-html-container {
                            overflow: visible !important;
                        }
                        .dashboard-metric-popup {
                            width: min(1320px, calc(100vw - 72px)) !important;
                            max-width: calc(100vw - 72px) !important;
                            padding: 1.25rem !important;
                        }
                        .dashboard-metric-popup .swal2-title {
                            padding-top: 0.5rem !important;
                        }
                        .dashboard-metric-popup .swal2-html-container {
                            margin: 1rem 0 0 !important;
                            padding: 0 !important;
                        }
                        @media (max-width: 767px) {
                            .dashboard-metric-popup {
                                width: calc(100vw - 16px) !important;
                                max-width: calc(100vw - 16px) !important;
                                padding: 0.75rem !important;
                            }
                        }
                        .ap-metric-cards {
                            display: grid;
                            gap: 12px;
                            max-height: min(66vh, 620px);
                            overflow-y: auto;
                            padding-right: 4px;
                        }
                        .ap-metric-table {
                            display: none;
                        }
                        @media (min-width: 760px) {
                            .ap-metric-cards {
                                display: none;
                            }
                            .ap-metric-table {
                                display: block;
                            }
                        }
                    </style>
                    <div class="text-left">
                        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                            <div>
                                <div class="text-sm font-bold text-slate-700">${deptTitle}</div>
                                <div class="text-xs text-slate-400">${items.length.toLocaleString('th-TH')} records - dashboard total</div>
                            </div>
                            <button type="button" onclick="app.exportDepartmentToExcel('')" class="inline-flex w-full md:w-auto items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition shadow-sm">
                                <i class="fas fa-file-excel"></i>
                                Export Excel
                            </button>
                        </div>
                        <div class="ap-metric-cards">
                            ${mobileCards}
                        </div>
                        <div class="ap-metric-table max-h-[65vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
                            <table class="w-full min-w-[1200px] text-left border-collapse">
                                <thead class="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
                                    <tr>
                                        <th class="px-3 py-3 text-[11px] font-black text-slate-500">ภารกิจ*</th>
                                        <th class="px-3 py-3 text-center text-[11px] font-black text-slate-500">ที่</th>
                                        <th class="px-3 py-3 text-[11px] font-black text-slate-500">วันที่รับเรื่อง</th>
                                        <th class="px-3 py-3 text-[11px] font-black text-slate-500">เรื่อง</th>
                                        <th class="px-3 py-3 text-[11px] font-black text-slate-500">ประเภทงาน</th>
                                        <th class="px-3 py-3 text-[11px] font-black text-slate-500">ผู้ที่เกี่ยวข้อง (คู่กรณี)</th>
                                        <th class="px-3 py-3 text-[11px] font-black text-slate-500">ความสำคัญของเรื่อง</th>
                                        <th class="px-3 py-3 text-[11px] font-black text-slate-500">การดำเนินการ</th>
                                        <th class="px-3 py-3 text-[11px] font-black text-slate-500">หมายเหตุ</th>
                                    </tr>
                                </thead>
                                <tbody>${tableRows}</tbody>
                            </table>
                        </div>
                    </div>
                `
            });
        } catch (error) {
            console.error('Dashboard metric details error:', error);
            Swal.fire('เกิดข้อผิดพลาด', error.message || 'ไม่สามารถโหลดข้อมูลได้', 'error');
        }
    },

    async openDashboardMetricItem(source, id) {
        const loaders = {
            survey: () => DataManager.getSurveyItems(),
            registration: () => DataManager.getRegistrationItems(),
            academic: () => DataManager.getAcademicItems(),
            admin: () => DataManager.getAdminItems()
        };

        try {
            const loader = loaders[source];
            if (!loader) return;
            const [items] = await Promise.all([loader(), DataManager.getSystemSettings()]);
            const item = items.find(i => String(i.id) === String(id));
            if (!item) return;

            Swal.close();
            setTimeout(() => {
                if (source === 'survey') UI.showSurveyDetail(item);
                else if (source === 'registration') UI.showRegistrationDetail(item);
                else if (source === 'academic') UI.showAcademicDetail(item);
                else if (source === 'admin' && UI.showAdminDetail) UI.showAdminDetail(item);
            }, 120);
        } catch (error) {
            console.error('Open metric item error:', error);
        }
    },

    exportDashboardMetricToExcel() {
        if (typeof XLSX === 'undefined') {
            Swal.fire('ไม่พบไลบรารี Excel', 'กรุณารอให้หน้าโหลดเสร็จแล้วลองอีกครั้ง', 'warning');
            return;
        }

        const items = this.dashboardMetricItems || [];
        const title = 'บัญชีรายละเอียดงานสุดขั้นตอน/งานศาล ตามแผนปฏิบัติการ (Action Plan) มาตรฐานกลาง เพื่อการบริหารจัดการงานค้างและงานเกิดใหม่ พ.ศ. 2569 (ข้อมูลตั้งแต่วันที่ 1 ม.ค. 2569) (งานเกิดใหม่)';
        const subTitle = '(ชื่อสำนัก/กอง/สำนักงาน)';
        const headers = [
            'ภารกิจ*',
            'ที่',
            'วันที่รับเรื่อง',
            'เรื่อง',
            'ประเภทงาน (งานศาล/งานสุดขั้นตอน)',
            'ผู้ที่เกี่ยวข้อง (คู่กรณี)',
            'ความสำคัญของเรื่อง\n(โดยสรุป)',
            'การดำเนินการ\n(วันที่ดำเนินการ)',
            'หมายเหตุ'
        ];
        const rows = items.map((item, index) => [
            item.departmentLabel || '',
            index + 1,
            item.received_date || '-',
            item.subject || this.getDashboardItemSubject(item),
            this.getDashboardProgressLabel(item.progress_type),
            this.getDashboardItemRelatedPerson(item),
            item.status_cause || item.status || '-',
            this.getDashboardItemUpdatedAt(item),
            this.getDashboardItemNote(item)
        ]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([[title], [subTitle], headers, ...rows]);
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }
        ];
        ws['!cols'] = [
            { wch: 22 }, { wch: 6 }, { wch: 16 }, { wch: 32 }, { wch: 30 },
            { wch: 30 }, { wch: 38 }, { wch: 28 }, { wch: 28 }
        ];
        ws['!rows'] = [{ hpt: 30 }, { hpt: 22 }, { hpt: 34 }];

        XLSX.utils.book_append_sheet(wb, ws, 'Action Plan Details');
        const safeTitle = (this.dashboardMetricTitle || 'Action_Plan')
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\s+/g, '_');
        const fileName = safeTitle + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
        XLSX.writeFile(wb, fileName);
    },

    /**
     * Export Department Data to Excel
     * @param {string} type 'survey', 'registration', 'academic'
     */
    async exportDepartmentToExcel(type) {
        if (!type) {
            this.exportDashboardMetricToExcel();
            return;
        }

        const typeLabels = {
            'survey': 'งานฝ่ายรังวัด',
            'registration': 'งานฝ่ายทะเบียน',
            'academic': 'งานกลุ่มงานวิชาการ'
        };

        Swal.fire({
            title: 'กำลังสร้างไฟล์ Excel...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            let items = [];
            let headers = [];
            let fileName = `Export_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`;

            if (type === 'survey') {
                items = await DataManager.getSurveyItems();
                // Apply status filter (pending/completed)
                if (this.surveyStatusView === 'pending') items = items.filter(i => DataManager.isPending(i));
                else if (this.surveyStatusView === 'completed') {
                    items = items.filter(i => DataManager.isCompleted(i));
                    // Apply month filter (based on completion_date)
                    if (this.surveyMonthFilter && this.surveyMonthFilter !== 'all') {
                        items = items.filter(i => {
                            const d = DataManager.getSafeDate(i.completion_date);
                            return d && (d.getMonth() + 1) === parseInt(this.surveyMonthFilter, 10);
                        });
                    }
                }

                // Apply type filter (subject)
                if (this.currentSurveyFilter && this.currentSurveyFilter !== 'all') {
                    items = items.filter(i => i.survey_type === this.currentSurveyFilter);
                }
                // Apply progress type filter (Final Step, etc.)
                if (this.surveyProgressFilter && this.surveyProgressFilter !== 'all') {
                    const pType = parseInt(this.surveyProgressFilter, 10);
                    items = items.filter(item => parseInt(item.progress_type, 10) === pType);
                }
                // Apply search term
                if (this.surveySearchTerm) {
                    const lowerTerm = this.surveySearchTerm.toLowerCase();
                    items = items.filter(i =>
                        (i.applicant && i.applicant.toLowerCase().includes(lowerTerm)) ||
                        (i.plot_no && i.plot_no.toLowerCase().includes(lowerTerm)) ||
                        (i.received_seq && i.received_seq.toLowerCase().includes(lowerTerm)) ||
                        (i.rv_12 && i.rv_12.toLowerCase().includes(lowerTerm))
                    );
                }

                headers = ['วันที่รับ', 'เลข รว.12', 'ประเภท', 'ผู้ขอ', 'สรุป', 'คนคุม', 'สถานะ/สาเหตุ'];
                items = items.map(i => [
                    i.received_date,
                    i.rv_12 || '-',
                    i.survey_type || '-',
                    i.applicant || '-',
                    i.summary || '-',
                    i.men || '-',
                    i.status_cause || (DataManager.isCompleted(i) ? 'เสร็จสิ้น' : 'คงค้าง')
                ]);
            } else if (type === 'registration') {
                items = await DataManager.getRegistrationItems();
                // Apply status filter (pending/completed)
                if (this.registrationStatusView === 'pending') items = items.filter(i => DataManager.isPending(i));
                else if (this.registrationStatusView === 'completed') {
                    items = items.filter(i => DataManager.isCompleted(i));
                    // Apply month filter
                    if (this.registrationMonthFilter && this.registrationMonthFilter !== 'all') {
                        items = items.filter(i => {
                            const d = DataManager.getSafeDate(i.completion_date);
                            return d && (d.getMonth() + 1) === parseInt(this.registrationMonthFilter, 10);
                        });
                    }
                }

                // Apply subject filter
                if (this.currentRegistrationSubject && this.currentRegistrationSubject !== 'all') {
                    items = items.filter(i => i.subject === this.currentRegistrationSubject);
                }

                // Apply progress type filter
                if (this.registrationProgressFilter && this.registrationProgressFilter !== 'all') {
                    const pType = parseInt(this.registrationProgressFilter, 10);
                    items = items.filter(item => parseInt(item.progress_type, 10) === pType);
                }

                // Apply search term
                if (this.registrationSearchTerm) {
                    const lowerTerm = this.registrationSearchTerm.toLowerCase();
                    items = items.filter(i =>
                        (i.subject && i.subject.toLowerCase().includes(lowerTerm)) ||
                        (i.related_person && i.related_person.toLowerCase().includes(lowerTerm)) ||
                        (i.responsible_person && i.responsible_person.toLowerCase().includes(lowerTerm)) ||
                        (i.seq_no && String(i.seq_no).toLowerCase().includes(lowerTerm))
                    );
                }

                headers = ['วันที่รับ', 'เลขลำดับ', 'เรื่อง', 'ผู้เกี่ยวข้อง', 'สรุป', 'สถานะ/สาเหตุ', 'ผู้รับผิดชอบ'];
                items = items.map(i => [
                    i.received_date,
                    i.seq_no || '-',
                    i.subject || '-',
                    i.related_person || '-',
                    i.summary || '-',
                    i.status_cause || (DataManager.isCompleted(i) ? 'เสร็จสิ้น' : 'คงค้าง'),
                    i.responsible_person || '-'
                ]);
            } else if (type === 'academic') {
                items = await DataManager.getAcademicItems();
                // Apply status filter (pending/completed)
                if (this.academicStatusView === 'pending') items = items.filter(i => DataManager.isPending(i));
                else if (this.academicStatusView === 'completed') {
                    items = items.filter(i => DataManager.isCompleted(i));
                    // Apply month filter
                    if (this.academicMonthFilter && this.academicMonthFilter !== 'all') {
                        items = items.filter(i => {
                            const d = DataManager.getSafeDate(i.completion_date);
                            return d && (d.getMonth() + 1) === parseInt(this.academicMonthFilter, 10);
                        });
                    }
                }

                // Apply subject filter
                if (this.currentAcademicSubject && this.currentAcademicSubject !== 'all') {
                    items = items.filter(i => i.subject === this.currentAcademicSubject);
                }

                // Apply progress type filter
                if (this.academicProgressFilter && this.academicProgressFilter !== 'all') {
                    const pType = parseInt(this.academicProgressFilter, 10);
                    items = items.filter(item => parseInt(item.progress_type, 10) === pType);
                }

                // Apply search term
                if (this.academicSearchTerm) {
                    const lowerTerm = this.academicSearchTerm.toLowerCase();
                    items = items.filter(i =>
                        (i.subject && i.subject.toLowerCase().includes(lowerTerm)) ||
                        (i.related_person && i.related_person.toLowerCase().includes(lowerTerm)) ||
                        (i.applicant_name && i.applicant_name.toLowerCase().includes(lowerTerm)) ||
                        (i.seq_no && String(i.seq_no).toLowerCase().includes(lowerTerm))
                    );
                }

                headers = ['วันที่รับ', 'เลขลำดับ', 'เรื่อง', 'เลขบ้าน/ที่ดิน', 'สถานะ/สาเหตุ', 'ผู้รับผิดชอบ'];
                items = items.map(i => [
                    i.received_date,
                    i.seq_no || '-',
                    i.subject || '-',
                    i.house_land_no || '-',
                    i.status_cause || (DataManager.isCompleted(i) ? 'เสร็จสิ้น' : 'คงค้าง'),
                    i.responsible_person || '-'
                ]);
            }

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet([headers, ...items]);
            XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
            XLSX.writeFile(wb, fileName);

            Swal.fire({
                icon: 'success',
                title: 'ส่งออกสำเร็จ',
                text: `บันทึกไฟล์ ${fileName} เรียบร้อยแล้ว (${items.length} รายการ)`,
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error) {
            console.error('Export error:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถส่งออกข้อมูลได้', 'error');
        }
    },

    renderAllWorkSearchPage() {
        return `
            <section class="space-y-5" aria-labelledby="all-work-search-heading">
                <div class="rounded-2xl bg-white p-5 md:p-7 shadow-sm border border-slate-200">
                    <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div class="max-w-2xl">
                            <div class="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">
                                <i class="fas fa-database"></i>
                                ฐานข้อมูลกลาง 4 ฝ่าย
                            </div>
                            <h3 id="all-work-search-heading" class="text-2xl font-black tracking-tight text-slate-800">ค้นหาสถานะงาน</h3>
                            <p class="mt-2 text-sm leading-6 text-slate-600">ใช้ระหว่างรับสายเพื่อค้นหาจากชื่อผู้ขอ ชื่อเรื่อง หรือเลขรับเรื่อง แล้วเปิดดูขั้นตอนล่าสุดได้ทันที</p>
                        </div>
                        <button type="button" onclick="app.navigate('dashboard')"
                            class="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-100">
                            <i class="fas fa-arrow-left"></i>
                            กลับหน้าภาพรวม
                        </button>
                    </div>

                    <form class="mt-6" onsubmit="event.preventDefault(); app.renderAllWorkSearchResults();">
                        <label for="all-work-search-input" class="mb-2 block text-sm font-bold text-slate-700">ชื่อผู้ขอ, ชื่อเรื่อง หรือเลขรับเรื่อง</label>
                        <div class="flex flex-col gap-3 sm:flex-row">
                            <div class="relative flex-1">
                                <i class="fas fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-violet-600"></i>
                                <input id="all-work-search-input" type="search" autocomplete="off"
                                    value="${this.escapeAllWorkSearchText(this.allWorkSearchTerm)}"
                                    oninput="app.handleAllWorkSearchInput(this.value)"
                                    class="w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-base text-slate-800 placeholder:text-slate-500 focus:border-violet-600 focus:outline-none focus:ring-4 focus:ring-violet-100"
                                    placeholder="เช่น สมชาย ใจดี, รังวัด หรือ 125/2569">
                            </div>
                            <button type="submit" class="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-violet-700 focus:outline-none focus:ring-4 focus:ring-violet-100">
                                <i class="fas fa-search"></i>
                                ค้นหา
                            </button>
                        </div>
                    </form>

                    <div class="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 md:flex-row md:items-end">
                        <label class="block text-sm font-semibold text-slate-700 md:w-56">
                            <span class="mb-1.5 block">ฝ่ายงาน</span>
                            <select id="all-work-department-filter" onchange="app.setAllWorkSearchDepartment(this.value)"
                                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-violet-600 focus:outline-none focus:ring-4 focus:ring-violet-100">
                                <option value="all" ${this.allWorkSearchDepartment === 'all' ? 'selected' : ''}>ทุกฝ่าย</option>
                                <option value="survey" ${this.allWorkSearchDepartment === 'survey' ? 'selected' : ''}>ฝ่ายรังวัด</option>
                                <option value="registration" ${this.allWorkSearchDepartment === 'registration' ? 'selected' : ''}>ฝ่ายทะเบียน</option>
                                <option value="academic" ${this.allWorkSearchDepartment === 'academic' ? 'selected' : ''}>กลุ่มงานวิชาการ</option>
                                <option value="admin" ${this.allWorkSearchDepartment === 'admin' ? 'selected' : ''}>ฝ่ายอำนวยการ</option>
                            </select>
                        </label>
                        <label class="block text-sm font-semibold text-slate-700 md:w-56">
                            <span class="mb-1.5 block">สถานะงาน</span>
                            <select id="all-work-status-filter" onchange="app.setAllWorkSearchStatus(this.value)"
                                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-violet-600 focus:outline-none focus:ring-4 focus:ring-violet-100">
                                <option value="all" ${this.allWorkSearchStatus === 'all' ? 'selected' : ''}>ทั้งหมด</option>
                                <option value="pending" ${this.allWorkSearchStatus === 'pending' ? 'selected' : ''}>กำลังดำเนินการ</option>
                                <option value="completed" ${this.allWorkSearchStatus === 'completed' ? 'selected' : ''}>เสร็จสิ้นแล้ว</option>
                            </select>
                        </label>
                        <button type="button" onclick="app.clearAllWorkSearch()" class="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-100">
                            <i class="fas fa-rotate-left"></i>
                            ล้างเงื่อนไข
                        </button>
                    </div>
                </div>

                <div class="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
                    <div class="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h4 class="font-bold text-slate-800">ผลการค้นหา</h4>
                            <p id="all-work-search-summary" class="mt-0.5 text-sm text-slate-600" role="status" aria-live="polite">กำลังเตรียมฐานข้อมูล...</p>
                        </div>
                        <span class="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                            <i class="fas fa-lock"></i>
                            ดูข้อมูลอย่างเดียว
                        </span>
                    </div>
                    <div id="all-work-search-results" class="min-h-56"></div>
                </div>
            </section>
        `;
    },

    async loadAllWorkSearchData() {
        const summary = document.getElementById('all-work-search-summary');
        const results = document.getElementById('all-work-search-results');
        if (summary) summary.textContent = 'กำลังโหลดข้อมูลจากทุกฝ่าย...';
        if (results) {
            results.innerHTML = `
                <div class="flex min-h-56 flex-col items-center justify-center gap-3 px-5 text-center text-slate-500">
                    <i class="fas fa-circle-notch fa-spin text-2xl text-violet-600"></i>
                    <p class="text-sm font-medium">กำลังเตรียมข้อมูลสำหรับค้นหา</p>
                </div>`;
        }

        try {
            this.allWorkSearchItems = await this.getDashboardItemsForDept('all');
            this.renderAllWorkSearchResults();

            const searchInput = document.getElementById('all-work-search-input');
            if (searchInput && !this.allWorkSearchTerm) searchInput.focus();
        } catch (error) {
            console.error('All work search load error:', error);
            if (summary) summary.textContent = 'ไม่สามารถโหลดข้อมูลสำหรับค้นหาได้';
            if (results) {
                results.innerHTML = `
                    <div class="flex min-h-56 flex-col items-center justify-center gap-3 px-5 text-center">
                        <i class="fas fa-triangle-exclamation text-2xl text-rose-500"></i>
                        <p class="text-sm font-bold text-slate-700">ไม่สามารถโหลดฐานข้อมูลได้</p>
                        <button type="button" onclick="app.loadAllWorkSearchData()" class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">ลองอีกครั้ง</button>
                    </div>`;
            }
        }
    },

    handleAllWorkSearchInput(value) {
        this.allWorkSearchTerm = value;
        clearTimeout(this.allWorkSearchTimer);
        this.allWorkSearchTimer = setTimeout(() => this.renderAllWorkSearchResults(), 120);
    },

    setAllWorkSearchDepartment(value) {
        this.allWorkSearchDepartment = value;
        this.renderAllWorkSearchResults();
    },

    setAllWorkSearchStatus(value) {
        this.allWorkSearchStatus = value;
        this.renderAllWorkSearchResults();
    },

    clearAllWorkSearch() {
        this.allWorkSearchTerm = '';
        this.allWorkSearchDepartment = 'all';
        this.allWorkSearchStatus = 'all';

        const input = document.getElementById('all-work-search-input');
        const department = document.getElementById('all-work-department-filter');
        const status = document.getElementById('all-work-status-filter');
        if (input) input.value = '';
        if (department) department.value = 'all';
        if (status) status.value = 'all';

        this.renderAllWorkSearchResults();
        input?.focus();
    },

    getAllWorkSearchMatches() {
        const term = this.allWorkSearchTerm.trim().toLocaleLowerCase('th-TH');
        if (!term) return [];

        const keywords = term.split(/\s+/).filter(Boolean);
        return this.allWorkSearchItems
            .filter(item => {
                if (this.allWorkSearchDepartment !== 'all' && item.source !== this.allWorkSearchDepartment) return false;
                if (this.allWorkSearchStatus === 'completed' && !DataManager.isCompleted(item)) return false;
                if (this.allWorkSearchStatus === 'pending' && DataManager.isCompleted(item)) return false;

                const searchable = [
                    this.getDashboardItemRelatedPerson(item),
                    this.getDashboardItemSubject(item),
                    item.summary,
                    item.status_cause,
                    item.status,
                    item.received_seq,
                    item.seq_no,
                    item.departmentLabel,
                    item.men,
                    item.responsible_person,
                    item.officer_name,
                    item.staff_name,
                    item.technician_name
                ].filter(Boolean).join(' ').toLocaleLowerCase('th-TH');

                return keywords.every(keyword => searchable.includes(keyword));
            })
            .sort((a, b) => {
                const dateA = UI.getSafeDate(a.received_date)?.getTime() || 0;
                const dateB = UI.getSafeDate(b.received_date)?.getTime() || 0;
                return dateB - dateA;
            });
    },

    renderAllWorkSearchResults() {
        const summary = document.getElementById('all-work-search-summary');
        const container = document.getElementById('all-work-search-results');
        if (!summary || !container) return;

        const total = this.allWorkSearchItems.length;
        const term = this.allWorkSearchTerm.trim();
        if (!total) {
            summary.textContent = 'ยังไม่มีข้อมูลที่พร้อมค้นหา';
            return;
        }

        if (!term) {
            summary.textContent = `พร้อมค้นหา ${total.toLocaleString('th-TH')} รายการจากทุกฝ่าย`;
            container.innerHTML = `
                <div class="flex min-h-56 flex-col items-center justify-center px-5 text-center">
                    <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-600"><i class="fas fa-magnifying-glass text-lg"></i></div>
                    <p class="font-bold text-slate-800">เริ่มต้นด้วยชื่อผู้ขอ ชื่อเจ้าหน้าที่ หรือช่าง</p>
                    <p class="mt-1 max-w-md text-sm leading-6 text-slate-600">ผลลัพธ์จะแสดงฝ่ายงาน วันที่รับเรื่อง และขั้นตอนล่าสุด พร้อมปุ่มเปิดรายละเอียด</p>
                </div>`;
            return;
        }

        const matches = this.getAllWorkSearchMatches();
        const resultLimit = 100;
        const visibleMatches = matches.slice(0, resultLimit);
        summary.textContent = matches.length
            ? `พบ ${matches.length.toLocaleString('th-TH')} รายการสำหรับ “${term}”`
            : `ไม่พบรายการสำหรับ “${term}”`;

        if (!matches.length) {
            container.innerHTML = `
                <div class="flex min-h-56 flex-col items-center justify-center px-5 text-center">
                    <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><i class="fas fa-folder-open"></i></div>
                    <p class="font-bold text-slate-800">ไม่พบงานที่ตรงกับคำค้นหา</p>
                    <p class="mt-1 text-sm text-slate-600">ลองตรวจการสะกด หรือค้นหาด้วยบางส่วนของชื่อและชื่อเรื่อง</p>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="divide-y divide-slate-100">
                ${visibleMatches.map(item => this.renderAllWorkSearchResultItem(item)).join('')}
            </div>
            ${matches.length > resultLimit ? `<p class="border-t border-slate-100 px-5 py-3 text-center text-sm text-slate-600">แสดง ${resultLimit.toLocaleString('th-TH')} รายการแรก กรุณาเพิ่มคำค้นหาเพื่อจำกัดผลลัพธ์</p>` : ''}
        `;
    },

    renderAllWorkSearchResultItem(item) {
        const meta = this.getAllWorkSearchDepartmentMeta(item.source);
        const status = this.getAllWorkSearchStatusMeta(item);
        const safe = value => this.escapeAllWorkSearchText(value);
        const subject = this.getDashboardItemSubject(item);
        const person = this.getDashboardItemRelatedPerson(item);
        const seqNo = item.received_seq || item.seq_no || '-';

        return `
            <article class="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0 flex-1">
                    <div class="mb-2 flex flex-wrap items-center gap-2">
                        <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${meta.badgeClass}"><i class="fas ${meta.icon}"></i>${meta.label}</span>
                        <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${status.badgeClass}"><i class="fas ${status.icon}"></i>${safe(status.label)}</span>
                        <span class="text-xs font-medium text-slate-500">เลขรับ ${safe(seqNo)}</span>
                    </div>
                    <h5 class="text-base font-bold leading-6 text-slate-800">${safe(subject)}</h5>
                    <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                        <span><i class="fas fa-user mr-1.5 text-slate-400"></i>${safe(person)}</span>
                        <span><i class="far fa-calendar-alt mr-1.5 text-slate-400"></i>รับเรื่อง ${safe(UI.formatThaiDate(item.received_date))}</span>
                    </div>
                    <p class="mt-2 text-sm text-slate-600"><span class="font-bold text-slate-700">ขั้นตอนล่าสุด:</span> ${safe(this.getAllWorkSearchStage(item))}</p>
                </div>
                <button type="button" onclick="app.openAllWorkSearchDetail('${item.source}', ${Number(item.id)})"
                    class="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-white px-4 py-2.5 text-sm font-bold text-violet-700 transition-colors hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100">
                    ดูรายละเอียด
                    <i class="fas fa-arrow-right text-xs"></i>
                </button>
            </article>`;
    },

    getAllWorkSearchDepartmentMeta(source) {
        const departments = {
            survey: { label: 'ฝ่ายรังวัด', icon: 'fa-ruler-combined', badgeClass: 'bg-indigo-50 text-indigo-700' },
            registration: { label: 'ฝ่ายทะเบียน', icon: 'fa-folder-open', badgeClass: 'bg-blue-50 text-blue-700' },
            academic: { label: 'กลุ่มงานวิชาการ', icon: 'fa-book-reader', badgeClass: 'bg-orange-50 text-orange-700' },
            admin: { label: 'ฝ่ายอำนวยการ', icon: 'fa-building', badgeClass: 'bg-teal-50 text-teal-700' }
        };
        return departments[source] || { label: 'ไม่ระบุฝ่าย', icon: 'fa-folder', badgeClass: 'bg-slate-100 text-slate-700' };
    },

    getAllWorkSearchStatusMeta(item) {
        if (DataManager.isCompleted(item)) {
            return { label: 'เสร็จสิ้นแล้ว', icon: 'fa-check-circle', badgeClass: 'bg-emerald-50 text-emerald-700' };
        }

        const progress = parseInt(item.progress_type, 10);
        if (progress === 2) return { label: 'งานสุดขั้นตอน', icon: 'fa-flag-checkered', badgeClass: 'bg-violet-50 text-violet-700' };
        if (progress === 3) return { label: 'งานศาล', icon: 'fa-gavel', badgeClass: 'bg-rose-50 text-rose-700' };
        if (progress === 4) return { label: 'งานค้าง', icon: 'fa-clock', badgeClass: 'bg-amber-50 text-amber-700' };
        return { label: 'กำลังดำเนินการ', icon: 'fa-spinner', badgeClass: 'bg-sky-50 text-sky-700' };
    },

    getAllWorkSearchStage(item, history = []) {
        if (DataManager.isCompleted(item)) return 'ดำเนินการเสร็จสิ้นแล้ว';
        const latestStep = history.find(entry => entry.note || entry.new_value);
        return latestStep?.note || latestStep?.new_value || item.status_cause || item.status || 'รอดำเนินการ';
    },

    escapeAllWorkSearchText(value) {
        return String(value ?? '-')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    formatAllWorkSearchDateTime(value) {
        const date = UI.getSafeDate(value);
        if (!date) return '-';
        return date.toLocaleString('th-TH', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    },

    async openAllWorkSearchDetail(source, id) {
        let item = this.allWorkSearchItems.find(work => work.source === source && Number(work.id) === Number(id));
        if (!item) {
            const items = await this.getDashboardItemsForDept('all');
            item = items.find(work => work.source === source && Number(work.id) === Number(id));
        }
        if (!item) return;

        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('detail-modal-content');
        const title = document.getElementById('detail-modal-title');
        const subtitle = document.getElementById('detail-modal-subtitle');
        if (!modal || !content) return;

        const department = this.getAllWorkSearchDepartmentMeta(source);
        if (title) title.textContent = 'รายละเอียดสถานะงาน';
        if (subtitle) subtitle.textContent = `${department.label} · เปิดดูข้อมูลแบบอ่านอย่างเดียว`;
        content.innerHTML = `
            <div class="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-slate-500">
                <i class="fas fa-circle-notch fa-spin text-2xl text-violet-600"></i>
                <p class="text-sm font-medium">กำลังโหลดประวัติการดำเนินงาน</p>
            </div>`;

        modal.classList.remove('hidden');
        setTimeout(() => modal.querySelector('div[class*="scale-100"]')?.classList.remove('scale-95', 'opacity-0'), 10);

        const history = await DataManager.getStatusHistory({ work_type: source, work_id: id });
        const safe = value => this.escapeAllWorkSearchText(value);
        const status = this.getAllWorkSearchStatusMeta(item);
        const subject = this.getDashboardItemSubject(item);
        const person = this.getDashboardItemRelatedPerson(item);
        const seqNo = item.received_seq || item.seq_no || '-';
        const stage = this.getAllWorkSearchStage(item, history);

        // คำนวณจำนวนวันค้าง
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let pendingDays = null;
        let pendingDaysText = '';

        if (!DataManager.isCompleted(item)) {
            let startDateStr = item.received_date;
            const isSurvey = source === 'survey' || item.department === 'ฝ่ายรังวัด' || item.survey_type !== undefined || item.rv_12 !== undefined;
            if (isSurvey && item.received_date >= '2026-01-01' && item.survey_date && item.survey_date !== '0000-00-00') {
                startDateStr = item.survey_date;
            }
            const startDate = DataManager.getSafeDate(startDateStr);
            if (startDate) {
                startDate.setHours(0, 0, 0, 0);
                pendingDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
                if (pendingDays >= 0) {
                    pendingDaysText = `<div class="mt-2"><span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${pendingDays > 60 ? 'bg-rose-50 text-rose-700' : pendingDays > 30 ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}"><i class="fas fa-hourglass-half"></i>ค้างมา ${pendingDays} วัน</span></div>`;
                }
            }
        }
        const historyMarkup = history.length
            ? history.map(entry => `
                <li class="grid grid-cols-[2rem_1fr] gap-3 py-3">
                    <div class="flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-violet-700"><i class="fas fa-check text-xs"></i></div>
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <strong class="text-sm text-slate-800">${safe(entry.action_type || 'อัปเดตสถานะ')}</strong>
                            <span class="text-xs text-slate-500">${safe(this.formatAllWorkSearchDateTime(entry.changed_at))}</span>
                        </div>
                        ${entry.note || entry.new_value ? `<p class="mt-1 text-sm leading-6 text-slate-700">${safe(entry.note || entry.new_value)}</p>` : ''}
                        ${entry.old_value && entry.new_value ? `<p class="mt-1 text-xs text-slate-500">${safe(entry.old_value)} <i class="fas fa-arrow-right mx-1 text-slate-400"></i> ${safe(entry.new_value)}</p>` : ''}
                        ${entry.changed_by ? `<p class="mt-1 text-xs text-slate-500"><i class="fas fa-user mr-1"></i>${safe(entry.changed_by)}</p>` : ''}
                    </div>
                </li>`).join('')
            : `<li class="rounded-lg bg-slate-50 px-4 py-5 text-center text-sm text-slate-600">ยังไม่มีบันทึกประวัติการดำเนินงาน</li>`;

        content.innerHTML = `
            <div class="space-y-5">
                <section class="rounded-xl bg-slate-50 p-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div class="min-w-0">
                            <div class="mb-2 flex flex-wrap items-center gap-2">
                                <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${department.badgeClass}"><i class="fas ${department.icon}"></i>${department.label}</span>
                                <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${status.badgeClass}"><i class="fas ${status.icon}"></i>${status.label}</span>
                            </div>
                            <h4 class="text-lg font-black leading-7 text-slate-800">${safe(subject)}</h4>
                            <p class="mt-1 text-sm text-slate-600"><i class="fas fa-user mr-1.5 text-slate-400"></i>${safe(person)}</p>
                        </div>
                        <dl class="shrink-0 text-sm sm:text-right">
                            <div><dt class="inline text-slate-500">เลขรับ: </dt><dd class="inline font-bold text-slate-800">${safe(seqNo)}</dd></div>
                            <div class="mt-1"><dt class="inline text-slate-500">รับเรื่อง: </dt><dd class="inline font-bold text-slate-800">${safe(UI.formatThaiDate(item.received_date))}</dd></div>
                        </dl>
                    </div>
                </section>

                <section class="rounded-xl border border-violet-100 bg-violet-50 p-4">
                    <p class="text-xs font-bold text-violet-700">ขั้นตอนปัจจุบัน</p>
                    <p class="mt-1 text-base font-bold leading-7 text-slate-800">${safe(stage)}</p>
                    ${DataManager.isCompleted(item) ? `<p class="mt-1 text-sm text-emerald-700"><i class="fas fa-check-circle mr-1"></i>เสร็จสิ้นเมื่อ ${safe(UI.formatThaiDate(item.completion_date))}</p>` : pendingDaysText}
                </section>

                <section>
                    <h4 class="mb-3 text-sm font-black text-slate-800">ข้อมูลรายการ</h4>
                    <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                        <div><dt class="text-slate-500">ผู้ขอ / ผู้เกี่ยวข้อง</dt><dd class="mt-0.5 font-semibold text-slate-800">${safe(person)}</dd></div>
                        <div><dt class="text-slate-500">ผู้รับผิดชอบ</dt><dd class="mt-0.5 font-semibold text-slate-800">${safe(item.men || item.responsible_person || '-')}</dd></div>
                        ${item.survey_date ? `<div><dt class="text-slate-500">วันนัดรังวัด</dt><dd class="mt-0.5 font-semibold text-slate-800">${safe(UI.formatThaiDate(item.survey_date))}</dd></div>` : ''}
                        ${item.rv_12 ? `<div><dt class="text-slate-500">เลข รว.12</dt><dd class="mt-0.5 font-semibold text-slate-800">${safe(item.rv_12)}</dd></div>` : ''}
                    </dl>
                    ${item.summary ? `<div class="mt-4 rounded-lg bg-slate-50 p-3"><p class="text-xs font-bold text-slate-500">สรุปเรื่อง</p><p class="mt-1 text-sm leading-6 text-slate-700">${safe(item.summary)}</p></div>` : ''}
                </section>

                <section class="border-t border-slate-200 pt-5">
                    <div class="mb-2 flex items-center gap-2"><i class="fas fa-clock-rotate-left text-violet-600"></i><h4 class="text-sm font-black text-slate-800">ประวัติการดำเนินงาน</h4></div>
                    <ol class="divide-y divide-slate-100">${historyMarkup}</ol>
                </section>
            </div>`;
    },

    /**
     * Initialize Performance Graph on Dashboard
     */
    async initPerformanceChart(dept = 'all') {
        const canvas = document.getElementById('performanceChart');
        if (!canvas || typeof Chart === 'undefined') return;

        try {
            const response = await fetch(`api/trend_stats.php?dept=${dept}`);
            const trendData = await response.json();

            const labels = trendData.map(d => d.month);
            const pendingData = trendData.map(d => d.pending);
            const completedData = trendData.map(d => d.completed);

            new Chart(canvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'งานที่เสร็จในเดือนนั้น',
                            data: completedData,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            fill: true,
                            tension: 0.4,
                            borderWidth: 3,
                            pointBackgroundColor: '#10b981',
                            pointRadius: 4
                        },
                        {
                            label: 'งานคงค้างสะสม',
                            data: pendingData,
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.05)',
                            fill: true,
                            tension: 0.4,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            pointBackgroundColor: '#f59e0b',
                            pointRadius: 3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                usePointStyle: true,
                                font: { family: 'Prompt', weight: 'bold' }
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true },
                        x: { grid: { display: false } }
                    }
                }
            });
        } catch (error) {
            console.error('Chart init error:', error);
        }
    }
};

// Attach to window
window.app = app;

// Start app
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

