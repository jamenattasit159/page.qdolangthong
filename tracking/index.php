<?php
/**
 * AABM Smart Track | ศูนย์ติดตามสถานะงานที่ดินอัจฉริยะ
 * สำนักงานที่ดินจังหวัดอ่างทอง
 * มาตรฐานความปลอดภัยตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
 * นโยบายความปลอดภัย: 
 * 1. ไม่แสดงเลขโฉนดที่ดิน (Protect Title Deed Numbers) ในทุกจุด
 * 2. ค้นหาตามชื่อและนามสกุลจริง ป้องกันการแสดงข้อมูลคนละนามสกุล
 * 3. ล็อกห้ามใช้ชื่อแอดมิน (admin)
 */

if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    ini_set('session.use_only_cookies', 1);
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        ini_set('session.cookie_secure', 1);
    }
    session_start();
}

$baseDir = dirname(__DIR__);
if (file_exists($baseDir . '/api/db.php')) {
    require_once $baseDir . '/api/db.php';
}

// บังคับ Header ให้เป็น text/html ป้องกัน Hostinger db.php ส่ง application/json
if (!headers_sent()) {
    header('Content-Type: text/html; charset=UTF-8');
}

// Visitor Counter
$totalVisits = 1800;
try {
    if (isset($conn)) {
        $yearMonth = date('Y-m');
        $conn->exec("
            CREATE TABLE IF NOT EXISTS visit_counter_monthly (
                id INT AUTO_INCREMENT PRIMARY KEY,
                `year_month` VARCHAR(7) NOT NULL UNIQUE,
                `count` INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        ");
        
        $stmt = $conn->prepare("
            INSERT INTO visit_counter_monthly (`year_month`, `count`) 
            VALUES (?, 1) 
            ON DUPLICATE KEY UPDATE `count` = `count` + 1
        ");
        $stmt->execute([$yearMonth]);
        
        $vStmt = $conn->query("SELECT COALESCE(SUM(`count`), 0) as total FROM visit_counter_monthly");
        $vRes = $vStmt->fetch(PDO::FETCH_ASSOC);
        $totalVisits = (int) ($vRes['total'] ?? 0);
        
        try {
            $baseStmt = $conn->query("SELECT COALESCE(SUM(`count`), 0) as base_total FROM visit_counter");
            $baseRes = $baseStmt->fetch(PDO::FETCH_ASSOC);
            $totalVisits += (int) ($baseRes['base_total'] ?? 0);
        } catch (Exception $ex) {
            $totalVisits += 800;
        }
    }
} catch (Exception $e) {
    $totalVisits = 1850;
}

$isLoggedIn = !empty($_SESSION['citizen_logged_in']) && !empty($_SESSION['citizen_name']);
if (!$isLoggedIn) {
    header('Location: ../index.html');
    exit;
}
$citizenFullName = $_SESSION['citizen_name'];
$citizenUsername = $_SESSION['citizen_username'] ?? '';
?>
<!DOCTYPE html>
<html lang="th" class="scroll-smooth">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover">
    <title>AABM Smart Track | ศูนย์ติดตามสถานะงานที่ดินอัจฉริยะ สำนักงานที่ดินจังหวัดอ่างทอง</title>
    <meta name="description" content="AABM Smart Track ระบบติดตามความคืบหน้างานที่ดิน 3 ฝ่าย สำนักงานที่ดินจังหวัดอ่างทอง รวดเร็ว ทันสมัย ปลอดภัยตามมาตรฐาน PDPA ไม่เปิดเผยเลขโฉนด">
    <link rel="icon" type="image/png" href="../favicon.png">

    <!-- Google Fonts: Plus Jakarta Sans + Kanit + Sarabun -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">

    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    screens: {
                        'xs': '420px'
                    },
                    fontFamily: {
                        kanit: ['Kanit', 'sans-serif'],
                        sarabun: ['Sarabun', 'sans-serif'],
                        jakarta: ['Plus Jakarta Sans', 'sans-serif']
                    },
                    colors: {
                        brand: {
                            50: '#f0f7ff',
                            100: '#e0effe',
                            200: '#bae0fd',
                            300: '#7dd0fc',
                            400: '#38bdf8',
                            500: '#0ea5e9',
                            600: '#0284c7',
                            700: '#0369a1',
                            800: '#075985',
                            900: '#0c4a6e',
                            950: '#082f49'
                        }
                    },
                    boxShadow: {
                        'soft': '0 10px 30px -10px rgba(0, 0, 0, 0.05)',
                        'soft-lg': '0 20px 40px -15px rgba(15, 23, 42, 0.07)',
                        'glow-brand': '0 0 25px -5px rgba(14, 165, 233, 0.3)',
                        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.3)'
                    }
                }
            }
        }
    </script>

    <!-- FontAwesome 6 -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

    <style>
        html, body {
            overflow-x: hidden;
            max-width: 100vw;
        }

        body {
            font-family: 'Sarabun', sans-serif;
            background-color: #f8fafc;
            background-image: 
                radial-gradient(at 0% 0%, rgba(224, 242, 254, 0.7) 0px, transparent 50%),
                radial-gradient(at 100% 0%, rgba(238, 242, 255, 0.8) 0px, transparent 50%),
                radial-gradient(at 50% 50%, rgba(240, 253, 250, 0.5) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(241, 245, 249, 0.8) 0px, transparent 50%);
            background-attachment: fixed;
            min-height: 100vh;
            -webkit-tap-highlight-color: transparent;
        }

        .font-kanit { font-family: 'Kanit', sans-serif; }
        .font-jakarta { font-family: 'Plus Jakarta Sans', sans-serif; }

        .glass-card {
            background: rgba(255, 255, 255, 0.92);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.95);
            box-shadow: 0 10px 35px -10px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(226, 232, 240, 0.6);
        }

        .glass-card-hover {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @media (hover: hover) and (pointer: fine) {
            .glass-card-hover:hover {
                transform: translateY(-2px);
                box-shadow: 0 20px 45px -12px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(14, 165, 233, 0.3);
            }
        }

        .glass-nav {
            background: rgba(255, 255, 255, 0.88);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-bottom: 1px solid rgba(226, 232, 240, 0.7);
        }

        /* Prevent auto-zoom on iOS inputs */
        @media screen and (max-width: 767px) {
            input, select, textarea {
                font-size: 16px !important;
            }
        }

        /* Hide scrollbar for Chrome, Safari and Opera */
        .no-scrollbar::-webkit-scrollbar {
            display: none;
        }
        /* Hide scrollbar for IE, Edge and Firefox */
        .no-scrollbar {
            -ms-overflow-style: none;  /* IE and Edge */
            scrollbar-width: none;  /* Firefox */
        }

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    </style>
</head>

<body class="text-slate-800 antialiased flex flex-col min-h-screen selection:bg-brand-500 selection:text-white">

    <!-- Top Navigation Bar -->
    <header class="glass-nav sticky top-0 z-30 transition-all duration-300">
        <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2">
            
            <!-- Left Branding: AABM Smart Track -->
            <div class="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
                <a href="./" class="flex items-center gap-2 sm:gap-3.5 group min-w-0">
                    <div class="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white shadow-soft p-1 sm:p-1.5 border border-slate-100 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 flex-shrink-0">
                        <img src="https://upload.wikimedia.org/wikipedia/th/f/f4/%E0%B8%95%E0%B8%A3%E0%B8%B2%E0%B8%81%E0%B8%A3%E0%B8%A1%E0%B8%97%E0%B8%B5%E0%B9%88%E0%B8%94%E0%B8%B4%E0%B8%99.png" 
                             alt="ตรากรมที่ดิน" class="w-full h-full object-contain">
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5 sm:gap-2">
                            <span class="font-jakarta font-extrabold text-sm sm:text-lg tracking-tight text-slate-900 truncate">
                                AABM <span class="text-brand-600 font-black">Smart Track</span>
                            </span>
                        </div>
                        <p class="text-[10px] sm:text-xs text-slate-500 font-medium truncate">สำนักงานที่ดินจังหวัดอ่างทอง</p>
                    </div>
                </a>
            </div>

            <!-- Right Controls -->
            <div class="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                <div id="header-user-section" class="<?= $isLoggedIn ? 'flex' : 'hidden' ?> items-center gap-1.5 sm:gap-2.5">
                    <!-- Real Full Name Display -->
                    <div class="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-emerald-50/90 border border-emerald-200/80 text-[11px] sm:text-xs font-kanit text-emerald-800 font-semibold shadow-xs max-w-[105px] xs:max-w-[150px] sm:max-w-none">
                        <i class="fas fa-user-check text-emerald-600 flex-shrink-0"></i>
                        <span id="header-citizen-name" class="truncate"><?= htmlspecialchars($citizenFullName ?: 'ผู้ยื่นคำขอ') ?></span>
                    </div>

                    <!-- PDPA Right to Erasure (Delete Account) -->
                    <button type="button" onclick="confirmDeleteAccount()" 
                            class="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-rose-50/80 hover:bg-rose-100 text-rose-700 border border-rose-200/70 text-xs font-kanit font-semibold transition-all shadow-xs flex items-center gap-1 min-h-[36px] min-w-[36px] justify-center" title="ลบบัญชีผู้ใช้ตามสิทธิ PDPA (Right to Erasure)">
                        <i class="fas fa-user-xmark"></i> <span class="hidden md:inline">ลบบัญชี</span>
                    </button>

                    <button type="button" onclick="handleLogout()" 
                            class="p-2 sm:px-3.5 sm:py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-kanit font-bold transition-all shadow-xs flex items-center gap-1.5 min-h-[36px] min-w-[36px] justify-center" title="ออกจากระบบ">
                        <i class="fas fa-arrow-right-from-bracket text-rose-600"></i> <span class="hidden md:inline">ออกจากระบบ</span>
                    </button>
                </div>

                <div id="header-visitor-section" class="<?= !$isLoggedIn ? 'flex' : 'hidden' ?> items-center gap-2 sm:gap-3">
                    <div class="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-white/80 border border-slate-200 text-[11px] sm:text-xs font-kanit font-medium text-slate-600 shadow-xs">
                        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                        <span class="hidden xs:inline">ผู้เข้าชม:</span>
                        <strong class="text-brand-600 font-bold font-jakarta"><?= number_format($totalVisits) ?></strong>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content Container -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-10 space-y-6 sm:space-y-8">

        <!-- Hero Section -->
        <section class="text-center space-y-2.5 sm:space-y-3 relative">
            <div class="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-brand-50/90 border border-brand-200/80 text-brand-700 text-[11px] sm:text-xs font-kanit font-semibold shadow-xs max-w-full">
                <i class="fas fa-calendar-check text-brand-500 flex-shrink-0"></i>
                <span class="truncate">สำนักงานที่ดินจังหวัดอ่างทอง • อัปเดตข้อมูลทุกวันจันทร์</span>
            </div>

            <div class="space-y-1 sm:space-y-1.5">
                <h2 class="font-kanit text-xl xs:text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
                    ศูนย์ติดตามสถานะงานที่ดินอัจฉริยะ <span class="hidden sm:inline">(AABM Smart Track)</span>
                </h2>
                <p class="font-kanit text-xs xs:text-sm sm:text-base md:text-lg text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed">
                    เช็กความคืบหน้าคำขอของท่านได้สะดวกรวดเร็ว • <span class="text-brand-600 font-semibold">ฝ่ายรังวัด</span> • <span class="text-blue-600 font-semibold">ฝ่ายทะเบียน</span> • <span class="text-emerald-600 font-semibold">ฝ่ายวิชาการ</span>
                </p>
                <div class="pt-0.5 sm:pt-1 flex items-center justify-center gap-2 text-[11px] sm:text-xs font-kanit text-slate-500">
                    <span class="inline-flex items-center gap-1"><i class="fas fa-shield-halved text-emerald-600"></i> คุ้มครองข้อมูลตามมาตรฐาน PDPA</span>
                </div>
            </div>
        </section>

        <!-- ============================================================== -->
        <!-- SCREEN 1: AUTHENTICATION (PURE USERNAME + PASSWORD)            -->
        <!-- ============================================================== -->
        <section id="screen-auth" class="<?= !$isLoggedIn ? 'block' : 'hidden' ?> max-w-md mx-auto">
            <div class="glass-card rounded-2xl sm:rounded-3xl p-5 sm:p-8 relative overflow-hidden shadow-soft-lg">
                
                <!-- Tab Switcher -->
                <div class="flex items-center p-1 sm:p-1.5 bg-slate-100/90 rounded-xl sm:rounded-2xl mb-5 sm:mb-6 border border-slate-200/70">
                    <button type="button" onclick="switchAuthTab('login')" id="tab-btn-login"
                            class="flex-1 py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg sm:rounded-xl font-kanit font-bold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 bg-white text-emerald-700 shadow-xs min-h-[40px]">
                        <i class="fas fa-right-to-bracket text-emerald-600"></i>
                        <span>เข้าสู่ระบบ</span>
                    </button>
                    <button type="button" onclick="switchAuthTab('register')" id="tab-btn-register"
                            class="flex-1 py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg sm:rounded-xl font-kanit font-medium text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900 min-h-[40px]">
                        <i class="fas fa-user-plus text-brand-600"></i>
                        <span>สมัครใช้งาน</span>
                    </button>
                </div>

                <!-- 1. LOGIN FORM -->
                <form id="form-login" onsubmit="handleLoginSubmit(event)" class="space-y-3.5 sm:space-y-4">
                    <div class="space-y-1.5 text-left">
                        <label class="block text-xs font-bold font-kanit text-slate-700">ชื่อผู้ใช้ (Username)</label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center pointer-events-none text-slate-400">
                                <i class="fas fa-user text-sm"></i>
                            </div>
                            <input type="text" id="login-username" required
                                   class="w-full pl-10 sm:pl-11 pr-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-300 bg-white/90 text-slate-800 placeholder-slate-400 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all shadow-xs"
                                   placeholder="กรอกชื่อผู้ใช้งาน">
                        </div>
                    </div>

                    <div class="space-y-1.5 text-left">
                        <label class="block text-xs font-bold font-kanit text-slate-700">รหัสผ่าน (Password)</label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center pointer-events-none text-slate-400">
                                <i class="fas fa-lock text-sm"></i>
                            </div>
                            <input type="password" id="login-password" required
                                   class="w-full pl-10 sm:pl-11 pr-11 sm:pr-12 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-300 bg-white/90 text-slate-800 placeholder-slate-400 text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all shadow-xs"
                                   placeholder="กรอกรหัสผ่าน">
                            <button type="button" onclick="togglePasswordVisibility('login-password', this)" class="absolute inset-y-0 right-0 pr-3.5 sm:pr-4 flex items-center text-slate-400 hover:text-slate-600">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>

                    <div id="login-alert" class="hidden p-3 rounded-xl sm:rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-left"></div>

                    <button type="submit" id="btn-submit-login"
                            class="w-full font-kanit py-3 sm:py-3.5 px-6 rounded-xl sm:rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-sm sm:text-base shadow-soft hover:shadow-glow-emerald active:scale-[0.98] transition-all flex items-center justify-center gap-2 min-h-[44px]">
                        <i class="fas fa-right-to-bracket"></i>
                        <span>เข้าสู่ระบบ</span>
                    </button>
                </form>

                <!-- 2. REGISTER FORM -->
                <form id="form-register" onsubmit="handleRegisterSubmit(event)" class="hidden space-y-3.5 sm:space-y-4">
                    <div class="space-y-1.5 text-left">
                        <label class="block text-xs font-bold font-kanit text-slate-700">
                            ชื่อผู้ใช้งาน (Username) <span class="text-rose-500">*</span>
                        </label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center pointer-events-none text-slate-400">
                                <i class="fas fa-at text-sm"></i>
                            </div>
                            <input type="text" id="reg-username" required
                                   class="w-full pl-10 sm:pl-11 pr-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-300 bg-white/90 text-slate-800 placeholder-slate-400 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-xs"
                                   placeholder="เช่น somchai99 หรือ เบอร์โทรศัพท์">
                        </div>
                    </div>

                    <div class="space-y-1.5 text-left">
                        <label class="block text-xs font-bold font-kanit text-slate-700">
                            ชื่อ - นามสกุลจริง ผู้ยื่นคำขอ <span class="text-rose-500">*</span>
                        </label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center pointer-events-none text-slate-400">
                                <i class="fas fa-user-tag text-sm"></i>
                            </div>
                            <input type="text" id="reg-fullname" required
                                   class="w-full pl-10 sm:pl-11 pr-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-300 bg-white/90 text-slate-800 placeholder-slate-400 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-xs"
                                   placeholder="ระบุชื่อและนามสกุลจริง เช่น สมชาย ใจดี">
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="space-y-1.5 text-left">
                            <label class="block text-xs font-bold font-kanit text-slate-700">รหัสผ่าน <span class="text-rose-500">*</span></label>
                            <input type="password" id="reg-password" required
                                   class="w-full px-3.5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-300 bg-white/90 text-slate-800 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-xs"
                                   placeholder="ตั้งรหัสผ่าน">
                        </div>
                        <div class="space-y-1.5 text-left">
                            <label class="block text-xs font-bold font-kanit text-slate-700">ยืนยันรหัสผ่าน <span class="text-rose-500">*</span></label>
                            <input type="password" id="reg-confirm-password" required
                                   class="w-full px-3.5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-300 bg-white/90 text-slate-800 text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-xs"
                                   placeholder="ยืนยันอีกครั้ง">
                        </div>
                    </div>

                    <!-- PDPA Consent Box (Unchecked by default - Explicit Opt-in required) -->
                    <div class="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-brand-50/80 border border-brand-200/80 text-left space-y-2">
                        <label class="flex items-start gap-2.5 cursor-pointer select-none">
                            <input type="checkbox" id="reg-pdpa-consent" required
                                   oninvalid="this.setCustomValidity('กรุณาอ่านข้อกำหนดและนโยบาย PDPA ก่อน')"
                                   oninput="this.setCustomValidity('')"
                                   onchange="this.setCustomValidity('')"
                                   class="w-4 h-4 mt-0.5 text-brand-600 rounded border-slate-300 focus:ring-brand-500">
                            <span class="text-xs text-slate-700 leading-snug">
                                ข้าพเจ้ายินยอมให้ประมวลผลข้อมูลและยอมรับ 
                                <button type="button" onclick="openPdpaModal()" class="text-brand-600 font-bold hover:underline">
                                    นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
                                </button>
                                ของสำนักงานที่ดินจังหวัดอ่างทอง
                            </span>
                        </label>
                    </div>

                    <div id="reg-alert" class="hidden p-3 rounded-xl sm:rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-left"></div>

                    <button type="submit" id="btn-submit-reg"
                            class="w-full font-kanit py-3 sm:py-3.5 px-6 rounded-xl sm:rounded-2xl bg-gradient-to-r from-brand-600 via-indigo-600 to-brand-700 hover:from-brand-700 hover:to-indigo-800 text-white font-bold text-sm sm:text-base shadow-soft hover:shadow-glow-brand active:scale-[0.98] transition-all flex items-center justify-center gap-2 min-h-[44px]">
                        <i class="fas fa-user-check"></i>
                        <span>สมัครสมาชิกและเข้าใช้งาน</span>
                    </button>
                </form>

                <div class="mt-5 sm:mt-6 pt-3.5 sm:pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                    <span class="flex items-center gap-1"><i class="fas fa-shield-halved text-emerald-600"></i> คุ้มครอง PDPA</span>
                    <button type="button" onclick="openPdpaModal()" class="text-brand-600 hover:underline">นโยบายความเป็นส่วนตัว</button>
                </div>
            </div>
        </section>

        <!-- ============================================================== -->
        <!-- SCREEN 2: PERSONAL DASHBOARD (ผลการค้นหาคำขอ & ไปป์ไลน์ 3 ฝ่าย) -->
        <!-- ============================================================== -->
        <section id="screen-dashboard" class="<?= $isLoggedIn ? 'block' : 'hidden' ?> space-y-5 sm:space-y-6">

            <!-- Citizen Welcome Card -->
            <div class="glass-card p-4 sm:p-7 rounded-2xl sm:rounded-3xl shadow-soft flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div class="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div class="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-700 text-white flex items-center justify-center text-lg sm:text-2xl shadow-soft flex-shrink-0">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <h3 class="font-kanit text-base sm:text-xl md:text-2xl font-bold text-slate-900 truncate">
                                ยินดีต้อนรับ, <span id="dash-real-name" class="text-brand-700"><?= htmlspecialchars($citizenFullName ?: 'ผู้ยื่นคำขอ') ?></span>
                            </h3>
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-kanit font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 flex-shrink-0">
                                <i class="fas fa-shield-halved text-[9px] sm:text-[10px]"></i> คุ้มครอง PDPA
                            </span>
                        </div>
                        <p class="text-[11px] sm:text-sm text-slate-500 mt-0.5 sm:mt-1 flex items-center gap-1.5 flex-wrap">
                            <span>รายการคำขอของ: <strong id="dash-search-name" class="text-slate-800 font-semibold"><?= htmlspecialchars($citizenFullName) ?></strong></span>
                        </p>
                    </div>
                </div>

                <!-- Action Utilities (Responsive 2-Col Grid on Mobile, Inline Flex on Desktop) -->
                <div class="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full md:w-auto text-xs font-kanit">
                    <button type="button" onclick="toggleViewMode()" id="btn-toggle-view"
                            class="col-span-2 sm:col-span-1 px-3 sm:px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs min-h-[40px]">
                        <i class="fas fa-stream text-brand-500"></i>
                        <span id="view-mode-label">มุมมองไปป์ไลน์ 3 ฝ่าย</span>
                    </button>
                    <button type="button" onclick="fetchMyWorks()"
                            class="px-3 sm:px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition-colors flex items-center justify-center gap-1.5 shadow-xs min-h-[40px]" title="รีเฟรชข้อมูล">
                        <i class="fas fa-sync-alt text-slate-500"></i>
                        <span>รีเฟรช</span>
                    </button>
                    <button type="button" onclick="window.print()"
                            class="hidden sm:flex px-3 sm:px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition-colors items-center justify-center gap-1.5 shadow-xs min-h-[40px]" title="พิมพ์รายงาน">
                        <i class="fas fa-print text-slate-500"></i>
                        <span>พิมพ์</span>
                    </button>
                    <button type="button" onclick="handleLogout()"
                            class="px-3 sm:px-3.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs min-h-[40px]" title="ออกจากระบบ">
                        <i class="fas fa-arrow-right-from-bracket text-rose-600"></i>
                        <span>ออกจากระบบ</span>
                    </button>
                </div>
            </div>

            <!-- Department Filter Bar (Responsive Horizontal Scrollable Pills) -->
            <div id="dept-filter-bar" class="flex items-center gap-2 overflow-x-auto pb-2 scroll-smooth no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
                <button type="button" onclick="filterDepartment('all')" id="tab-all"
                        class="tab-dept active flex-shrink-0 whitespace-nowrap px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-kanit font-semibold transition-all flex items-center gap-2 bg-brand-600 text-white shadow-xs">
                    <i class="fas fa-layer-group text-xs"></i>
                    <span>ทั้งหมด</span>
                    <span id="badge-count-all" class="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-white/20 text-white">0</span>
                </button>
                <button type="button" onclick="filterDepartment('survey')" id="tab-survey"
                        class="tab-dept flex-shrink-0 whitespace-nowrap px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-kanit font-medium text-slate-600 bg-white border border-slate-200/80 hover:bg-slate-50 transition-all flex items-center gap-2">
                    <i class="fas fa-location-dot text-amber-500 text-xs"></i>
                    <span>ฝ่ายรังวัด</span>
                    <span id="badge-count-survey" class="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700">0</span>
                </button>
                <button type="button" onclick="filterDepartment('registration')" id="tab-registration"
                        class="tab-dept flex-shrink-0 whitespace-nowrap px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-kanit font-medium text-slate-600 bg-white border border-slate-200/80 hover:bg-slate-50 transition-all flex items-center gap-2">
                    <i class="fas fa-file-contract text-blue-500 text-xs"></i>
                    <span>ฝ่ายทะเบียน</span>
                    <span id="badge-count-registration" class="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700">0</span>
                </button>
                <button type="button" onclick="filterDepartment('academic')" id="tab-academic"
                        class="tab-dept flex-shrink-0 whitespace-nowrap px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-kanit font-medium text-slate-600 bg-white border border-slate-200/80 hover:bg-slate-50 transition-all flex items-center gap-2">
                    <i class="fas fa-book-bookmark text-emerald-500 text-xs"></i>
                    <span>ฝ่ายวิชาการ</span>
                    <span id="badge-count-academic" class="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700">0</span>
                </button>
            </div>

            <!-- Loading State -->
            <div id="dashboard-loading" class="hidden py-16 text-center">
                <div class="inline-flex flex-col items-center justify-center p-8 rounded-3xl glass-card max-w-sm mx-auto">
                    <div class="w-12 h-12 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-4"></div>
                    <h3 class="font-kanit font-bold text-slate-800 text-base">กำลังโหลดข้อมูลคำขอ...</h3>
                    <p class="text-xs text-slate-500 mt-1 font-medium">ระบบกำลังดึงประวัติงานคำขอของท่าน</p>
                </div>
            </div>

            <!-- EMPTY STATE BANNER: "ยังไม่มีการเข้ามาใช้บริการ" -->
            <div id="empty-cases-banner" class="hidden py-6 sm:py-8">
                <div class="max-w-lg mx-auto p-5 sm:p-10 rounded-2xl sm:rounded-3xl glass-card border border-rose-100 shadow-soft-lg text-center space-y-4">
                    <div class="w-16 h-16 sm:w-20 sm:h-20 bg-rose-50 text-rose-500 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto text-2xl sm:text-3xl shadow-inner">
                        <i class="fas fa-circle-exclamation"></i>
                    </div>
                    
                    <div class="space-y-1">
                        <h4 class="font-kanit font-extrabold text-slate-900 text-xl sm:text-2xl">ยังไม่มีการเข้ามาใช้บริการ</h4>
                        <p class="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                            ขณะนี้ไม่พบรายการคำขอคงค้างในฐานข้อมูลของสำนักงานที่ดิน
                        </p>
                    </div>

                    <div class="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs font-kanit font-medium text-left space-y-1">
                        <div class="flex items-center gap-2 font-bold">
                            <i class="fas fa-circle-info text-amber-600 flex-shrink-0"></i>
                            <span>สำนักงานที่ดินจังหวัดอ่างทอง อัพเดทข้อมูลทุกวันจันทร์</span>
                        </div>
                        <p class="text-[11px] text-amber-800 pl-5">
                            หากท่านเพิ่งเข้ามาติดต่อหรือยื่นคำขอ ข้อมูลจะถูกประมวลผลและอัปเดตเข้าระบบในการสรุปยอดรอบวันจันทร์ถัดไป
                        </p>
                    </div>

                    <div class="pt-1 sm:pt-2 flex items-center justify-center gap-3">
                        <button type="button" onclick="fetchMyWorks()"
                                class="w-full sm:w-auto px-5 py-3 rounded-xl sm:rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-kanit font-bold text-xs shadow-soft transition-all flex items-center justify-center gap-2 min-h-[42px]">
                            <i class="fas fa-sync-alt"></i>
                            <span>รีเฟรชตรวจสอบอีกครั้ง</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Dynamic Results Container -->
            <div id="results-container" class="space-y-5 sm:space-y-6"></div>

        </section>

    </main>

    <!-- PDPA Policy Modal -->
    <div id="pdpa-modal" class="fixed inset-0 z-50 hidden overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 transition-opacity duration-300">
        <div class="relative w-full max-w-2xl max-h-[92dvh] sm:max-h-[85vh] bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-auto">
            <div class="px-4 sm:px-6 py-4 sm:py-5 bg-gradient-to-r from-brand-700 via-indigo-800 to-slate-900 text-white flex items-center justify-between flex-shrink-0">
                <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <i class="fas fa-shield-halved text-emerald-400 text-lg sm:text-xl flex-shrink-0"></i>
                    <div class="min-w-0">
                        <h3 class="font-kanit text-sm sm:text-lg font-bold truncate">นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA Policy)</h3>
                        <p class="text-[10px] sm:text-xs text-slate-300 truncate">AABM Smart Track • สำนักงานที่ดินจังหวัดอ่างทอง</p>
                    </div>
                </div>
                <button type="button" onclick="closePdpaModal()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center flex-shrink-0 ml-2">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>

            <div class="p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1 space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed font-sarabun">
                <div class="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-brand-50 border border-brand-100 text-brand-900">
                    <strong class="font-kanit block text-sm mb-1">การคุ้มครองความเป็นส่วนตัวและทรัพย์สินตามมาตรฐาน PDPA</strong>
                    สำนักงานที่ดินจังหวัดอ่างทอง ปฏิบัติตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. ๒๕๖๒ (PDPA) อย่างเคร่งครัด เพื่อความปลอดภัยของข้อมูลทรัพย์สินของประชาชน
                </div>
                
                <div class="space-y-1.5">
                    <h4 class="font-kanit font-bold text-slate-900 text-xs sm:text-sm">1. มาตรการไม่เปิดเผยเลขโฉนดที่ดิน (No Deed Number Disclosure)</h4>
                    <p class="text-slate-600">
                        เพื่อป้องกันการนำข้อมูลเลขโฉนดที่ดินหรือสารบัญที่ดินไปใช้ในทางมิชอบ ระบบ AABM Smart Track <strong>จะไม่แสดงเลขโฉนดที่ดินหรือเลขแปลงที่ดินใดๆ บนหน้าจอแสดงผลทั้งสิ้น</strong> ประชาชนสามารถตรวจสอบขั้นตอนสถานะความคืบหน้าของคำขอได้ด้วยความมั่นใจและปลอดภัยสูงสุด
                    </p>
                </div>

                <div class="space-y-1.5">
                    <h4 class="font-kanit font-bold text-slate-900 text-xs sm:text-sm">2. การตรวจสอบตัวตนตามชื่อ-นามสกุลเฉพาะบุคคล</h4>
                    <p class="text-slate-600">
                        ระบบจะแสดงเฉพาะรายการคำขอที่ชื่อและนามสกุลตรงกับผู้ยื่นคำขอที่ได้ลงทะเบียนไว้เท่านั้น (คนละนามสกุลจะไม่สามารถเข้าถึงข้อมูลของกันและกันได้เด็ดขาด)
                    </p>
                </div>

                <div class="space-y-1.5">
                    <h4 class="font-kanit font-bold text-slate-900 text-xs sm:text-sm">3. สิทธิของเจ้าของข้อมูลส่วนบุคคล (มาตรา ๓๐ ถึง ๓๖) รวมถึงสิทธิขอให้ลบบัญชี (มาตรา ๓๓)</h4>
                    <p class="text-slate-600">
                        ท่านในฐานะเจ้าของข้อมูลส่วนบุคคล มีสิทธิขอให้ลบบัญชีผู้ใช้และข้อมูลส่วนบุคคลออกจากระบบ (Right to Erasure) ได้ตลอดเวลาผ่านปุ่ม "ลบบัญชี"
                    </p>
                </div>
            </div>

            <div class="px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
                <span class="text-[11px] sm:text-xs text-slate-400 font-medium truncate max-w-[160px] sm:max-w-none">สำนักงานที่ดินจังหวัดอ่างทอง</span>
                <button type="button" onclick="closePdpaModal()" class="font-kanit px-5 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs shadow-md transition-colors min-h-[38px]">
                    รับทราบและเข้าใจ
                </button>
            </div>
        </div>
    </div>

    <!-- History Timeline Modal -->
    <div id="history-modal" class="fixed inset-0 z-50 hidden overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 transition-opacity duration-300">
        <div class="relative w-full max-w-2xl max-h-[92dvh] sm:max-h-[88vh] bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-auto transform transition-all duration-300 scale-95 opacity-0" id="history-modal-card">
            <div class="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-brand-900 text-white flex items-center justify-between flex-shrink-0">
                <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/10 flex items-center justify-center text-brand-300 text-sm sm:text-lg flex-shrink-0">
                        <i class="fas fa-clock-rotate-left"></i>
                    </div>
                    <div class="min-w-0">
                        <h3 id="modal-title" class="font-kanit text-sm sm:text-lg font-bold truncate">ประวัติการดำเนินงาน</h3>
                        <p id="modal-subtitle" class="text-[10px] sm:text-xs text-slate-300 truncate">รายละเอียดบันทึกความคืบหน้า</p>
                    </div>
                </div>
                <button type="button" onclick="closeHistoryModal()" class="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors flex-shrink-0 ml-2">
                    <i class="fas fa-times text-xs sm:text-sm"></i>
                </button>
            </div>

            <!-- Compact 3-Column Info Header on all screens -->
            <div class="p-2.5 sm:p-4 border-b border-slate-100 bg-slate-50/80 grid grid-cols-3 gap-1.5 sm:gap-3 text-xs flex-shrink-0">
                <div class="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 text-center sm:text-left min-w-0">
                    <span class="text-slate-400 block font-medium text-[10px] sm:text-xs mb-0.5 truncate">ประเภทงาน</span>
                    <strong id="modal-info-type" class="text-slate-800 font-bold text-xs sm:text-sm truncate block">-</strong>
                </div>
                <div class="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 text-center sm:text-left min-w-0">
                    <span class="text-slate-400 block font-medium text-[10px] sm:text-xs mb-0.5 truncate">ผู้ขอ</span>
                    <strong id="modal-info-person" class="text-slate-800 font-bold text-xs sm:text-sm truncate block">-</strong>
                </div>
                <div class="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 text-center sm:text-left min-w-0">
                    <span class="text-slate-400 block font-medium text-[10px] sm:text-xs mb-0.5 truncate">เลขที่คำขอ</span>
                    <strong id="modal-info-seq" class="text-brand-600 font-bold text-xs sm:text-sm truncate block">-</strong>
                </div>
            </div>

            <div class="p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1" id="modal-timeline-body"></div>

            <div class="px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
                <span class="text-[10px] sm:text-xs text-slate-400 font-medium truncate max-w-[160px] sm:max-w-none">อัปเดตข้อมูลทุกวันจันทร์</span>
                <button type="button" onclick="closeHistoryModal()" class="font-kanit px-4 sm:px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-colors min-h-[36px]">
                    ปิดหน้าต่าง
                </button>
            </div>
        </div>
    </div>

    <!-- Footer -->
    <footer class="mt-auto glass-nav border-t border-slate-200/80 py-5 sm:py-6 pb-8 sm:pb-6 text-center text-xs text-slate-500 font-medium">
        <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3">
            <div class="flex items-center gap-2">
                <img src="https://upload.wikimedia.org/wikipedia/th/f/f4/%E0%B8%95%E0%B8%A3%E0%B8%B2%E0%B8%81%E0%B8%A3%E0%B8%A1%E0%B8%97%E0%B8%B5%E0%B9%88%E0%B8%94%E0%B8%B4%E0%B8%99.png" 
                     alt="ตรากรมที่ดิน" class="w-5 h-5 object-contain flex-shrink-0">
                <span class="truncate">&copy; <?= date('Y') ?> <strong>AABM Smart Track</strong> • สำนักงานที่ดินจังหวัดอ่างทอง</span>
            </div>
            <div class="flex items-center gap-3 sm:gap-4 text-xs">
                <span class="hidden xs:inline text-slate-400">อัปเดตข้อมูลทุกวันจันทร์</span>
                <button type="button" onclick="openPdpaModal()" class="text-slate-600 hover:text-brand-600 underline">นโยบาย PDPA</button>
            </div>
        </div>
    </footer>

    <!-- Floating Scroll to Top Button (Mobile Friendly) -->
    <button type="button" id="btn-scroll-top" onclick="window.scrollTo({top: 0, behavior: 'smooth'})"
            class="fixed bottom-5 right-5 z-40 w-11 h-11 rounded-full bg-brand-600 text-white shadow-lg flex items-center justify-center transition-all duration-300 opacity-0 pointer-events-none hover:bg-brand-700 active:scale-95"
            title="เลื่อนขึ้นบนสุด">
        <i class="fas fa-chevron-up text-sm"></i>
    <!-- Client-Side JavaScript Logic -->
    <script>
        const API_URL = '../api/status_tracking_api.php';
        let rawSearchResults = [];
        let currentFilter = 'all';
        let currentViewMode = 'pipeline';
        let currentAuthCitizen = <?= json_encode($citizenFullName) ?>;
        let currentCitizenUsername = <?= json_encode($citizenUsername) ?>;

        document.addEventListener('DOMContentLoaded', () => {
            if (currentAuthCitizen) {
                showScreen('dashboard');
                fetchMyWorks();
            }
        });

        function showScreen(screen) {
            document.getElementById('screen-auth').classList.add('hidden');
            document.getElementById('screen-dashboard').classList.add('hidden');

            if (screen === 'auth') {
                document.getElementById('screen-auth').classList.remove('hidden');
            } else if (screen === 'dashboard') {
                document.getElementById('screen-dashboard').classList.remove('hidden');
            }
        }

        function switchAuthTab(tab) {
            const btnLogin = document.getElementById('tab-btn-login');
            const btnReg = document.getElementById('tab-btn-register');
            const formLogin = document.getElementById('form-login');
            const formReg = document.getElementById('form-register');

            if (tab === 'login') {
                btnLogin.className = "flex-1 py-3 px-4 rounded-xl font-kanit font-bold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 bg-white text-emerald-700 shadow-xs";
                btnReg.className = "flex-1 py-3 px-4 rounded-xl font-kanit font-medium text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900";
                formLogin.classList.remove('hidden');
                formReg.classList.add('hidden');
                document.getElementById('login-username').focus();
            } else {
                btnReg.className = "flex-1 py-3 px-4 rounded-xl font-kanit font-bold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 bg-white text-brand-700 shadow-xs";
                btnLogin.className = "flex-1 py-3 px-4 rounded-xl font-kanit font-medium text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900";
                formReg.classList.remove('hidden');
                formLogin.classList.add('hidden');
                document.getElementById('reg-username').focus();
            }
        }

        function togglePasswordVisibility(inputId, btn) {
            const input = document.getElementById(inputId);
            const icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        }

        // 1. REGISTER
        async function handleRegisterSubmit(e) {
            e.preventDefault();
            const alertBox = document.getElementById('reg-alert');
            const btn = document.getElementById('btn-submit-reg');
            const username = document.getElementById('reg-username').value.trim();
            const full_name = document.getElementById('reg-fullname').value.trim();
            const password = document.getElementById('reg-password').value.trim();
            const confirm_password = document.getElementById('reg-confirm-password').value.trim();
            const pdpa_consent = document.getElementById('reg-pdpa-consent').checked;

            // ตรวจสอบชื่อสงวน admin
            const reserved = ['admin', 'administrator', 'root', 'system', 'superadmin', 'staff', 'officer', 'moderator', 'manager', 'supervisor', 'dol', 'aabm'];
            if (reserved.includes(username.toLowerCase())) {
                alertBox.textContent = 'ชื่อผู้ใช้ (Username) นี้สงวนไว้สำหรับเจ้าหน้าที่และระบบ กรุณาเลือกชื่อผู้ใช้อื่น';
                alertBox.classList.remove('hidden');
                return;
            }

            if (!pdpa_consent) {
                alertBox.textContent = 'กรุณากดทำเครื่องหมายยินยอมรับนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA) ก่อนสมัครใช้งาน';
                alertBox.classList.remove('hidden');
                return;
            }

            if (password !== confirm_password) {
                alertBox.textContent = 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน';
                alertBox.classList.remove('hidden');
                return;
            }

            alertBox.classList.add('hidden');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังสร้างบัญชีผู้ใช้งาน...';

            try {
                const response = await fetch(`${API_URL}?action=register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, full_name, password, confirm_password, pdpa_consent })
                });
                const result = await response.json();

                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-user-check"></i> <span>สมัครสมาชิกและเข้าใช้งาน</span>';

                if (result.success) {
                    currentAuthCitizen = result.full_name;
                    currentCitizenUsername = result.username;
                    onLoginSuccess(result.full_name);
                } else {
                    alertBox.textContent = result.error || 'เกิดข้อผิดพลาดในการสมัครสมาชิก';
                    alertBox.classList.remove('hidden');
                }
            } catch (err) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-user-check"></i> <span>สมัครสมาชิกและเข้าใช้งาน</span>';
                alertBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
                alertBox.classList.remove('hidden');
            }
        }

        // 2. LOGIN (USERNAME + PASSWORD)
        async function handleLoginSubmit(e) {
            e.preventDefault();
            const alertBox = document.getElementById('login-alert');
            const btn = document.getElementById('btn-submit-login');
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value.trim();

            alertBox.classList.add('hidden');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...';

            try {
                const response = await fetch(`${API_URL}?action=login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const result = await response.json();

                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> <span>เข้าสู่ระบบ</span>';

                if (result.success) {
                    currentAuthCitizen = result.full_name;
                    currentCitizenUsername = result.username;
                    onLoginSuccess(result.full_name);
                } else {
                    alertBox.textContent = result.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
                    alertBox.classList.remove('hidden');
                }
            } catch (err) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> <span>เข้าสู่ระบบ</span>';
                alertBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
                alertBox.classList.remove('hidden');
            }
        }

        // 3. ON LOGIN SUCCESS (SHOWS REAL FULL NAME)
        function onLoginSuccess(fullName) {
            document.getElementById('header-citizen-name').textContent = fullName || 'ผู้ยื่นคำขอ';
            document.getElementById('dash-real-name').textContent = fullName || 'ผู้ยื่นคำขอ';
            document.getElementById('dash-search-name').textContent = fullName || currentAuthCitizen;
            document.getElementById('header-user-section').classList.remove('hidden');
            document.getElementById('header-user-section').classList.add('flex');
            document.getElementById('header-visitor-section').classList.add('hidden');

            showScreen('dashboard');
            fetchMyWorks();
        }

        // 4. FETCH MY WORKS
        async function fetchMyWorks() {
            const loading = document.getElementById('dashboard-loading');
            const emptyBanner = document.getElementById('empty-cases-banner');
            const container = document.getElementById('results-container');
            const filterBar = document.getElementById('dept-filter-bar');

            loading.classList.remove('hidden');
            emptyBanner.classList.add('hidden');
            container.innerHTML = '';

            try {
                const response = await fetch(`${API_URL}?action=getMyWorks`);
                const result = await response.json();

                loading.classList.add('hidden');

                if (result.success && result.has_records && result.data && result.data.length > 0) {
                    rawSearchResults = result.data;
                    filterBar.classList.remove('hidden');
                    updateCounts(rawSearchResults);
                    renderResults();
                } else if (result.success) {
                    rawSearchResults = [];
                    filterBar.classList.add('hidden');
                    updateCounts([]);
                    emptyBanner.classList.remove('hidden');
                } else {
                    handleLogout();
                }
            } catch (err) {
                loading.classList.add('hidden');
                console.error('Error loading my works:', err);
            }
        }

        function updateCounts(data) {
            const surveyCount = data.filter(item => item.work_type === 'survey').length;
            const regCount = data.filter(item => item.work_type === 'registration').length;
            const acadCount = data.filter(item => item.work_type === 'academic').length;

            document.getElementById('badge-count-all').textContent = data.length;
            document.getElementById('badge-count-survey').textContent = surveyCount;
            document.getElementById('badge-count-registration').textContent = regCount;
            document.getElementById('badge-count-academic').textContent = acadCount;
        }

        function filterDepartment(dept) {
            currentFilter = dept;
            document.querySelectorAll('.tab-dept').forEach(tab => {
                tab.classList.remove('active', 'bg-brand-600', 'text-white', 'shadow-xs');
                tab.classList.add('text-slate-600', 'bg-white', 'border', 'border-slate-200/80', 'hover:bg-slate-50');
            });

            const activeTab = document.getElementById(`tab-${dept}`);
            if (activeTab) {
                activeTab.classList.add('active', 'bg-brand-600', 'text-white', 'shadow-xs');
                activeTab.classList.remove('text-slate-600', 'bg-white', 'border', 'border-slate-200/80', 'hover:bg-slate-50');
            }

            renderResults();
        }

        function toggleViewMode() {
            currentViewMode = currentViewMode === 'pipeline' ? 'cards' : 'pipeline';
            document.getElementById('view-mode-label').textContent = currentViewMode === 'pipeline' ? 'มุมมองไปป์ไลน์ 3 ฝ่าย' : 'มุมมองการ์ดแยกรายการ';
            renderResults();
        }

        function formatThaiDate(dateStr) {
            if (!dateStr) return '-';
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
        }

        // ลบเลขโฉนดที่ดินออกจากชื่อเรื่องตามมาตรฐาน PDPA
        function sanitizeSubjectPDPA(subj) {
            if (!subj) return 'ไม่ระบุเรื่อง';
            let s = subj.trim();
            // ตัดเลขโฉนด, เล่มที่, แปลงที่ดิน, เลขที่ดิน ออกทั้งหมด
            s = s.replace(/(โฉนดที่ดิน|โฉนดเลขที่|โฉนด|น\.ส\.\s*3\s*ก\.|น\.ส\.3ก|เลขที่ดิน|แปลงเลขที่|แปลงที่ดิน|เลขที่)\s*[:\s]*[0-9\/,\s\-]+/gi, '').trim();
            return s.replace(/\s{2,}/g, ' ') || subj;
        }

        // Smart Subject Normalizer
        function normalizeSubject(subj) {
            if (!subj) return 'คำขอทั่วไป';
            let s = sanitizeSubjectPDPA(subj);
            
            if (s.includes('สอบเขต')) return 'สอบเขตที่ดิน';
            if (s.includes('แบ่งกรรมสิทธิ์รวม')) return 'แบ่งกรรมสิทธิ์รวม';
            if (s.includes('แบ่งแยก')) return 'แบ่งแยกที่ดิน';
            if (s.includes('รวมโฉนด') || s.includes('รวมแปลง')) return 'รวมโฉนดที่ดิน';
            if (s.includes('ออกโฉนด') || s.includes('ออกใบไต่สวน')) return 'ออกโฉนดที่ดิน';
            if (s.includes('มรดก')) return 'โอนมรดก';
            if (s.includes('ขายฝาก')) return 'ขายฝาก';
            if (s.includes('จำนอง')) return 'จำนอง';
            if (s.includes('ขาย')) return 'ซื้อขายที่ดิน';
            if (s.includes('ให้')) return 'ให้ที่ดิน';
            if (s.includes('ใบแทน')) return 'ออกใบแทน';
            return s || 'คำขอทั่วไป';
        }

        // แปลงสถานะทางราชการให้เป็นภาษาที่สุภาพ ไพเราะ และเข้าใจง่ายสำหรับประชาชน (ไม่แตะต้องข้อมูลในตาราง)
        function beautifyStatusThai(raw) {
            if (!raw || raw === '-' || raw === 'งานปกติ') {
                return 'อยู่ระหว่างเจ้าหน้าที่กำลังเร่งรัดดำเนินการตามขั้นตอน';
            }

            const s = raw.trim();

            if (s.includes('->')) {
                const parts = s.split('->');
                const toPart = parts[parts.length - 1].trim();
                return beautifyStatusThai(toPart);
            }

            if (/^(รอแจก|แจ้งผู้ขอรับโฉนด|พร้อมจ่ายโฉนด)/.test(s)) {
                return 'ดำเนินการเสร็จสิ้นเรียบร้อยแล้ว พร้อมให้ท่านติดต่อรับเอกสารสิทธิ์';
            }
            if (/^(เสร็จสิ้น|งานสุดขั้นตอน)/.test(s)) {
                return 'ดำเนินการแล้วเสร็จสมบูรณ์';
            }
            if (/^(เสนอลงนาม|รอลงนาม|ลงนาม)/.test(s)) {
                return 'อยู่ระหว่างเสนอเจ้าพนักงานที่ดินลงนามอนุมัติ';
            }
            if (/^(เบิกแบบพิมพ์|เขียนโฉนด|พิมพ์โฉนด)/.test(s)) {
                return 'อยู่ระหว่างจัดพิมพ์และจัดทำเอกสารสิทธิ์ฉบับสมบูรณ์';
            }
            if (/^(หัวหน้างานตรวจระเบียบ|ตรวจระเบียบ)/.test(s)) {
                return 'อยู่ระหว่างหัวหน้างานตรวจสอบความถูกต้องของระเบียบและเอกสาร';
            }
            if (/^(หัวหน้าฝ่ายตรวจรายงาน|ตรวจรายงาน)/.test(s)) {
                return 'อยู่ระหว่างหัวหน้าฝ่ายตรวจสอบและรับรองผลการรังวัด';
            }
            if (/^(รอตรวจ|อยู่ระหว่างตรวจสอบ)/.test(s)) {
                return 'อยู่ระหว่างเจ้าหน้าที่ตรวจสอบความถูกต้องของคำขอ';
            }
            if (/^(ส่งฝ่ายรังวัด|ส่งกลับฝ่ายรังวัด)/.test(s)) {
                return 'ประสานส่งเรื่องต่อฝ่ายรังวัด เพื่อดำเนินการทางช่าง';
            }
            if (/^(ส่งฝ่ายทะเบียน|ส่งกลับฝ่ายทะเบียน)/.test(s)) {
                return 'ประสานส่งเรื่องต่อฝ่ายทะเบียน เพื่อดำเนินการทางสิทธิ์และนิติกรรม';
            }
            if (/^(ส่งกลุ่มงานวิชาการ|ส่งฝ่ายวิชาการ|ส่งวิชาการ)/.test(s)) {
                return 'ส่งเรื่องฝ่ายวิชาการ เพื่อตรวจพิจารณาข้อกฎหมายและระเบียบที่เกี่ยวข้อง';
            }
            if (/^(ส่งช่าง|มอบหมายช่าง)/.test(s)) {
                return 'มอบหมายช่างรังวัด เพื่อเตรียมการลงพื้นที่ปฏิบัติงาน';
            }
            if (/^(ระหว่างประกาศ|ประกาศ|ประกาศเรียก|รอครบกำหนดประกาศ)/.test(s)) {
                return 'อยู่ระหว่างปิดประกาศตามระเบียบกำหนด (เพื่อคุ้มครองสิทธิของผู้มีส่วนได้เสีย)';
            }
            if (/^(รอผลสอบถาม|รอตอบสอบถาม|รอผลสอบ)/.test(s)) {
                return 'อยู่ระหว่างรอผลการประสานงานตรวจสอบร่วมกับหน่วยงานที่เกี่ยวข้อง';
            }
            if (/^(นัดรังวัดใหม่)/.test(s)) {
                return 'อยู่ระหว่างนัดหมายกำหนดวันทำการรังวัดใหม่';
            }
            if (/^(นัดตรวจสอบทางสาธารณประโยชน์)/.test(s)) {
                return 'อยู่ระหว่างนัดตรวจสอบแนวเขตและพื้นที่สาธารณประโยชน์';
            }
            if (/(ทับ.*เลขที่ดิน|สอบสวนเพิ่มเติม)/.test(s)) {
                return 'อยู่ระหว่างประสานผู้ยื่นคำขอเพื่อสอบสวนข้อเท็จจริงเพิ่มเติม';
            }
            if (/^(แจ้งเตือนครั้งที่|แจ้งผู้ขอ)/.test(s)) {
                return 'มีหนังสือประสานแจ้งข้อมูลและความคืบหน้าถึงผู้ยื่นคำขอ';
            }
            if (/(งานศาล|ศาล)/.test(s)) {
                return 'อยู่ระหว่างดำเนินการตามกระบวนการทางกฎหมาย/ศาล';
            }
            if (/^(ยกเลิกเรื่อง|ผู้ขอยกเลิก)/.test(s)) {
                return 'ยุติการดำเนินการตามคำร้องของผู้ขอ/ระเบียบ';
            }
            if (/^(อยู่ระหว่างดำเนินการ|กำลังดำเนินการ|ระหว่างดำเนินการ)/.test(s)) {
                return 'อยู่ระหว่างเจ้าหน้าที่กำลังเร่งรัดดำเนินการตามลำดับขั้นตอน';
            }

            return 'อยู่ระหว่างดำเนินการ: ' + s;
        }

        function beautifyNoteThai(rawNote) {
            if (!rawNote) return '';
            let n = rawNote.trim();

            const m = n.match(/^สถานะ\s*:\s*(.*)/);
            if (m) {
                const inner = m[1].trim();
                if (inner.includes('->')) {
                    const parts = inner.split('->');
                    const fromText = beautifyStatusThai(parts[0].trim());
                    const toText = beautifyStatusThai(parts[1].trim());
                    return `ปรับขั้นตอนการดำเนินงานจาก “${fromText}” สู่ “${toText}”`;
                }
                return `ขั้นตอนการดำเนินงาน: ${beautifyStatusThai(inner)}`;
            }

            if (n.includes('อัปเดตแบบกลุ่มจากไฟล์')) {
                return 'บันทึกความคืบหน้าระบบงานประจำรอบสัปดาห์';
            }

            return n;
        }

        function renderResults() {
            const container = document.getElementById('results-container');
            container.innerHTML = '';

            let filtered = rawSearchResults;
            if (currentFilter !== 'all') {
                filtered = rawSearchResults.filter(item => item.work_type === currentFilter);
            }

            if (filtered.length === 0) {
                container.innerHTML = `<div class="text-center py-12 glass-card rounded-3xl p-6 text-slate-500 font-kanit">ไม่มีรายการในหมวดหมู่นี้</div>`;
                return;
            }

            if (currentViewMode === 'pipeline') {
                renderPipelineView(filtered, container);
            } else {
                renderCardListView(filtered, container);
            }
        }

        // Render 3-Department Interactive Pipeline View (ไม่แสดงเลขโฉนดใดๆ ทั้งสิ้น)
        function renderPipelineView(items, container) {
            const groups = {};
            items.forEach(item => {
                const normKey = normalizeSubject(item.subject || item.survey_type);
                if (!groups[normKey]) {
                    groups[normKey] = {
                        subject: normKey,
                        rawSubject: sanitizeSubjectPDPA(item.subject || item.survey_type || normKey),
                        person: item.related_person || item.applicant || currentAuthCitizen,
                        survey: null,
                        registration: null,
                        academic: null,
                        items: []
                    };
                }
                groups[normKey].items.push(item);

                if (item.work_type === 'survey') groups[normKey].survey = item;
                if (item.work_type === 'registration') groups[normKey].registration = item;
                if (item.work_type === 'academic') groups[normKey].academic = item;
            });

            Object.values(groups).forEach(group => {
                const card = document.createElement('div');
                card.className = 'glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-7 space-y-4 sm:space-y-6 glass-card-hover';

                const isSurveyDone = group.survey && group.survey.completion_date;
                const isSurveyActive = !!group.survey && !isSurveyDone;

                const isRegDone = group.registration && group.registration.completion_date;
                const isRegActive = !!group.registration && !isRegDone;

                const isAcadDone = group.academic && group.academic.completion_date;
                const isAcadActive = !!group.academic && !isAcadDone;

                const hasAnyWork = group.survey || group.registration || group.academic;
                const allFinished = hasAnyWork && (!group.survey || isSurveyDone) && (!group.registration || isRegDone) && (!group.academic || isAcadDone);

                card.innerHTML = `
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-5 border-b border-slate-100">
                        <div class="flex items-start gap-3 sm:gap-3.5 min-w-0">
                            <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white flex items-center justify-center text-lg sm:text-xl shadow-soft flex-shrink-0">
                                <i class="fas fa-folder-tree"></i>
                            </div>
                            <div class="min-w-0">
                                <h3 class="font-kanit text-base sm:text-xl font-bold text-slate-900 leading-snug break-words">${group.subject}</h3>
                                <p class="text-xs sm:text-sm text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <i class="fas fa-user-check text-emerald-500 flex-shrink-0"></i>
                                    <span>ผู้ยื่นคำขอ: <strong class="text-slate-800 font-semibold">${group.person}</strong></span>
                                </p>
                            </div>
                        </div>

                        <div class="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
                            <span class="px-3 sm:px-3.5 py-1 rounded-full text-[11px] sm:text-xs font-kanit font-semibold ${
                                allFinished
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-brand-50 text-brand-700 border border-brand-200'
                            }">
                                <i class="fas ${allFinished ? 'fa-check-circle text-emerald-500' : 'fa-spinner fa-spin text-brand-500'} mr-1"></i>
                                ${allFinished ? 'งานเสร็จสิ้นครบถ้วน' : 'อยู่ระหว่างดำเนินการ'}
                            </span>
                        </div>
                    </div>

                    <!-- 3-Department Connected Stepper (ไม่แสดงเลขโฉนด) -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 relative">

                        <!-- 1. ฝ่ายรังวัด (Survey) -->
                        <div class="p-4 sm:p-5 rounded-2xl border transition-all ${
                            isSurveyDone ? 'bg-emerald-50/70 border-emerald-200 shadow-soft' : 
                            isSurveyActive ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-200/50 shadow-soft' : 
                            'bg-slate-50/60 border-slate-200/70 opacity-70'
                        }">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs font-bold flex items-center justify-center ${
                                        isSurveyDone ? 'bg-emerald-600 text-white' : 
                                        isSurveyActive ? 'bg-amber-500 text-white animate-pulse' : 
                                        'bg-slate-200 text-slate-500'
                                    }">
                                        ${isSurveyDone ? '<i class="fas fa-check text-[10px]"></i>' : '1'}
                                    </span>
                                    <h4 class="font-kanit font-bold text-sm text-slate-800">ฝ่ายรังวัด</h4>
                                </div>
                                <span class="text-[10px] sm:text-[11px] font-kanit font-semibold px-2 py-0.5 rounded-md ${
                                    isSurveyDone ? 'bg-emerald-100 text-emerald-800' : 
                                    isSurveyActive ? 'bg-amber-100 text-amber-800' : 
                                    'bg-slate-100 text-slate-500'
                                }">
                                    ${isSurveyDone ? 'เสร็จสิ้น' : (isSurveyActive ? 'กำลังดำเนินการ' : 'ไม่มีคำขอ')}
                                </span>
                            </div>

                            ${group.survey ? `
                                <div class="space-y-1.5 text-xs text-slate-600">
                                    <div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">เลขคำขอ:</span> <strong class="truncate text-right">${group.survey.seq_no || '-'}</strong></div>
                                    <div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">วันที่รับเรื่อง:</span> <span class="truncate text-right">${formatThaiDate(group.survey.received_date)}</span></div>
                                    ${group.survey.rv_12 ? `<div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">ร.ว.๑๒:</span> <strong class="text-brand-600 truncate text-right">${group.survey.rv_12}</strong></div>` : ''}
                                    ${group.survey.survey_date ? `<div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">วันนัดรังวัด:</span> <span class="text-amber-700 font-semibold truncate text-right">${formatThaiDate(group.survey.survey_date)}</span></div>` : ''}
                                    ${group.survey.responsible_person ? `<div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">ช่างรังวัด:</span> <span class="truncate text-right">${group.survey.responsible_person}</span></div>` : ''}
                                    <div class="pt-2 border-t border-slate-200/60 mt-2">
                                        <span class="text-slate-400 block text-[11px]">สถานะล่าสุด:</span>
                                        <p class="font-semibold text-slate-800 mt-0.5 text-xs leading-relaxed">${group.survey.latest_status || 'กำลังดำเนินการ'}</p>
                                    </div>
                                    <div class="pt-2">
                                        <button type="button" onclick="showHistory('survey', ${group.survey.id})" class="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-kanit font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs min-h-[42px]">
                                            <i class="fas fa-list-check text-brand-500"></i> ดูประวัติ (${group.survey.update_count || 0})
                                        </button>
                                    </div>
                                </div>
                            ` : `
                                <p class="text-xs text-slate-400 py-6 text-center italic">ไม่มีข้อมูลคำขอในฝ่ายนี้</p>
                            `}
                        </div>

                        <!-- Mobile Flow Connector (1 -> 2) -->
                        <div class="md:hidden flex items-center justify-center py-0.5 text-slate-300">
                            <div class="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] shadow-xs border border-slate-200/80">
                                <i class="fas fa-chevron-down"></i>
                            </div>
                        </div>

                        <!-- 2. ฝ่ายทะเบียน (Registration) (ไม่มีแถวเลขโฉนด) -->
                        <div class="p-4 sm:p-5 rounded-2xl border transition-all ${
                            isRegDone ? 'bg-emerald-50/70 border-emerald-200 shadow-soft' : 
                            isRegActive ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-200/50 shadow-soft' : 
                            'bg-slate-50/60 border-slate-200/70 opacity-70'
                        }">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs font-bold flex items-center justify-center ${
                                        isRegDone ? 'bg-emerald-600 text-white' : 
                                        isRegActive ? 'bg-blue-600 text-white animate-pulse' : 
                                        'bg-slate-200 text-slate-500'
                                    }">
                                        ${isRegDone ? '<i class="fas fa-check text-[10px]"></i>' : '2'}
                                    </span>
                                    <h4 class="font-kanit font-bold text-sm text-slate-800">ฝ่ายทะเบียน</h4>
                                </div>
                                <span class="text-[10px] sm:text-[11px] font-kanit font-semibold px-2 py-0.5 rounded-md ${
                                    isRegDone ? 'bg-emerald-100 text-emerald-800' : 
                                    isRegActive ? 'bg-blue-100 text-blue-800' : 
                                    'bg-slate-100 text-slate-500'
                                }">
                                    ${isRegDone ? 'เสร็จสิ้น' : (isRegActive ? 'กำลังดำเนินการ' : 'ไม่มีคำขอ')}
                                </span>
                            </div>

                            ${group.registration ? `
                                <div class="space-y-1.5 text-xs text-slate-600">
                                    <div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">เลขคำขอ:</span> <strong class="truncate text-right">${group.registration.seq_no || '-'}</strong></div>
                                    <div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">วันที่รับเรื่อง:</span> <span class="truncate text-right">${formatThaiDate(group.registration.received_date)}</span></div>
                                    ${group.registration.responsible_person ? `<div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">ผู้รับผิดชอบ:</span> <span class="truncate text-right">${group.registration.responsible_person}</span></div>` : ''}
                                    <div class="pt-2 border-t border-slate-200/60 mt-2">
                                        <span class="text-slate-400 block text-[11px]">สถานะล่าสุด:</span>
                                        <p class="font-semibold text-slate-800 mt-0.5 text-xs leading-relaxed">${group.registration.latest_status || 'กำลังดำเนินการ'}</p>
                                    </div>
                                    <div class="pt-2">
                                        <button type="button" onclick="showHistory('registration', ${group.registration.id})" class="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-kanit font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs min-h-[42px]">
                                            <i class="fas fa-list-check text-brand-500"></i> ดูประวัติ (${group.registration.update_count || 0})
                                        </button>
                                    </div>
                                </div>
                            ` : `
                                <p class="text-xs text-slate-400 py-6 text-center italic">ไม่มีข้อมูลคำขอในฝ่ายนี้</p>
                            `}
                        </div>

                        <!-- Mobile Flow Connector (2 -> 3) -->
                        <div class="md:hidden flex items-center justify-center py-0.5 text-slate-300">
                            <div class="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] shadow-xs border border-slate-200/80">
                                <i class="fas fa-chevron-down"></i>
                            </div>
                        </div>

                        <!-- 3. ฝ่ายวิชาการ (Academic) -->
                        <div class="p-4 sm:p-5 rounded-2xl border transition-all ${
                            isAcadDone ? 'bg-emerald-50/70 border-emerald-200 shadow-soft' : 
                            isAcadActive ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-200/50 shadow-soft' : 
                            'bg-slate-50/60 border-slate-200/70 opacity-70'
                        }">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs font-bold flex items-center justify-center ${
                                        isAcadDone ? 'bg-emerald-600 text-white' : 
                                        isAcadActive ? 'bg-indigo-600 text-white animate-pulse' : 
                                        'bg-slate-200 text-slate-500'
                                    }">
                                        ${isAcadDone ? '<i class="fas fa-check text-[10px]"></i>' : '3'}
                                    </span>
                                    <h4 class="font-kanit font-bold text-sm text-slate-800">ฝ่ายวิชาการ</h4>
                                </div>
                                <span class="text-[10px] sm:text-[11px] font-kanit font-semibold px-2 py-0.5 rounded-md ${
                                    isAcadDone ? 'bg-emerald-100 text-emerald-800' : 
                                    isAcadActive ? 'bg-indigo-100 text-indigo-800' : 
                                    'bg-slate-100 text-slate-500'
                                }">
                                    ${isAcadDone ? 'เสร็จสิ้น' : (isAcadActive ? 'กำลังดำเนินการ' : 'ไม่มีคำขอ')}
                                </span>
                            </div>

                            ${group.academic ? `
                                <div class="space-y-1.5 text-xs text-slate-600">
                                    <div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">เลขคำขอ:</span> <strong class="truncate text-right">${group.academic.seq_no || '-'}</strong></div>
                                    <div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">วันที่รับเรื่อง:</span> <span class="truncate text-right">${formatThaiDate(group.academic.received_date)}</span></div>
                                    ${group.academic.responsible_person ? `<div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">ผู้รับผิดชอบ:</span> <span class="truncate text-right">${group.academic.responsible_person}</span></div>` : ''}
                                    <div class="pt-2 border-t border-slate-200/60 mt-2">
                                        <span class="text-slate-400 block text-[11px]">สถานะล่าสุด:</span>
                                        <p class="font-semibold text-slate-800 mt-0.5 text-xs leading-relaxed">${group.academic.latest_status || 'กำลังดำเนินการ'}</p>
                                    </div>
                                    <div class="pt-2">
                                        <button type="button" onclick="showHistory('academic', ${group.academic.id})" class="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-kanit font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs min-h-[42px]">
                                            <i class="fas fa-list-check text-brand-500"></i> ดูประวัติ (${group.academic.update_count || 0})
                                        </button>
                                    </div>
                                </div>
                            ` : `
                                <p class="text-xs text-slate-400 py-6 text-center italic">ไม่มีข้อมูลคำขอในฝ่ายนี้</p>
                            `}
                        </div>

                    </div>
                `;

                container.appendChild(card);
            });
        }

        // Render Individual Cards View (ไม่แสดงเลขโฉนด)
        function renderCardListView(items, container) {
            const grid = document.createElement('div');
            grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5';

            items.forEach(item => {
                const deptLabel = item.work_type === 'survey' ? 'ฝ่ายรังวัด' : (item.work_type === 'registration' ? 'ฝ่ายทะเบียน' : 'ฝ่ายวิชาการ');
                const deptColor = item.work_type === 'survey' ? 'amber' : (item.work_type === 'registration' ? 'blue' : 'emerald');
                const isDone = !!item.completion_date;

                const card = document.createElement('div');
                card.className = 'glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-soft glass-card-hover flex flex-col justify-between';

                card.innerHTML = `
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="px-2.5 py-1 rounded-xl text-xs font-kanit font-semibold bg-${deptColor}-50 text-${deptColor}-700 border border-${deptColor}-200">
                                ${deptLabel}
                            </span>
                            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-kanit font-medium ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-brand-100 text-brand-800'}">
                                ${isDone ? 'เสร็จสิ้น' : 'กำลังดำเนินการ'}
                            </span>
                        </div>

                        <div>
                            <h4 class="font-kanit font-bold text-sm sm:text-base text-slate-900 leading-snug break-words">${sanitizeSubjectPDPA(item.subject || item.survey_type || 'ไม่ระบุเรื่อง')}</h4>
                            <p class="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                                <i class="fas fa-user text-brand-500 flex-shrink-0"></i>
                                <span>ผู้ยื่นคำขอ: <strong class="text-slate-800">${item.related_person || item.applicant || currentAuthCitizen}</strong></span>
                            </p>
                        </div>

                        <div class="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-slate-50/80 border border-slate-100 text-xs space-y-1">
                            <div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">เลขคำขอ:</span> <strong class="truncate text-right">${item.seq_no || '-'}</strong></div>
                            <div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">วันที่รับคำขอ:</span> <span class="truncate text-right">${formatThaiDate(item.received_date)}</span></div>
                            ${item.rv_12 ? `<div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">ร.ว.๑๒:</span> <strong class="text-brand-600 truncate text-right">${item.rv_12}</strong></div>` : ''}
                            ${item.responsible_person ? `<div class="flex justify-between items-center gap-2"><span class="text-slate-400 flex-shrink-0">ผู้รับผิดชอบ:</span> <span class="truncate text-right">${item.responsible_person}</span></div>` : ''}
                            <div class="pt-1.5 border-t border-slate-200/50 mt-1">
                                <span class="text-slate-400 text-[11px]">สถานะปัจจุบัน:</span>
                                <p class="font-semibold text-slate-800 text-xs mt-0.5 leading-relaxed">${item.latest_status || 'กำลังดำเนินการ'}</p>
                            </div>
                        </div>
                    </div>

                    <div class="pt-3 sm:pt-4 mt-2">
                        <button type="button" onclick="showHistory('${item.work_type}', ${item.id})" class="w-full py-2.5 px-3 rounded-xl sm:rounded-2xl bg-slate-100 hover:bg-brand-50 hover:text-brand-600 text-slate-700 font-kanit font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs min-h-[42px]">
                            <i class="fas fa-clock-rotate-left text-xs"></i> ดูประวัติไทม์ไลน์ (${item.update_count || 0})
                        </button>
                    </div>
                `;

                grid.appendChild(card);
            });

            container.appendChild(grid);
        }

        // 5. SHOW HISTORY MODAL
        async function showHistory(workType, workId) {
            const modal = document.getElementById('history-modal');
            const modalCard = document.getElementById('history-modal-card');
            const timelineBody = document.getElementById('modal-timeline-body');

            const deptName = workType === 'survey' ? 'ฝ่ายรังวัด' : (workType === 'registration' ? 'ฝ่ายทะเบียน' : 'ฝ่ายวิชาการ');
            document.getElementById('modal-title').textContent = `ประวัติการดำเนินงาน (${deptName})`;

            timelineBody.innerHTML = `
                <div class="py-12 text-center">
                    <div class="w-10 h-10 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-3"></div>
                    <p class="text-xs text-slate-500 font-kanit">กำลังโหลดบันทึกประวัติ...</p>
                </div>
            `;

            modal.classList.remove('hidden');
            setTimeout(() => {
                modalCard.classList.remove('scale-95', 'opacity-0');
                modalCard.classList.add('scale-100', 'opacity-100');
            }, 20);

            try {
                const response = await fetch(`${API_URL}?action=getHistory&workType=${workType}&workId=${workId}`);
                const res = await response.json();

                if (res.success) {
                    const work = res.work || {};
                    document.getElementById('modal-info-type').textContent = sanitizeSubjectPDPA(work.subject || work.survey_type || '-');
                    document.getElementById('modal-info-person').textContent = work.related_person || work.applicant || currentAuthCitizen;
                    document.getElementById('modal-info-seq').textContent = work.seq_no || work.received_seq || '-';

                    renderTimelineItems(res.data || [], res.received_date, res.completion_date);
                } else {
                    timelineBody.innerHTML = `<div class="p-6 text-center text-rose-500 text-xs font-kanit">ไม่สามารถโหลดข้อมูลประวัติได้</div>`;
                }
            } catch (err) {
                console.error('History fetch error:', err);
                timelineBody.innerHTML = `<div class="p-6 text-center text-rose-500 text-xs font-kanit">เกิดข้อผิดพลาดในการดึงข้อมูล</div>`;
            }
        }

        function renderTimelineItems(logs, receivedDate, completionDate) {
            const container = document.getElementById('modal-timeline-body');
            container.innerHTML = '';

            let html = `<div class="relative pl-7 sm:pl-9 space-y-4 sm:space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">`;

            if (receivedDate) {
                html += `
                    <div class="relative flex items-start gap-3 sm:gap-4 group">
                        <div class="absolute -left-7 sm:-left-9 w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px] shadow-md ring-2 sm:ring-4 ring-white">
                            <i class="fas fa-inbox"></i>
                        </div>
                        <div class="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-brand-50/70 border border-brand-100 w-full">
                            <div class="flex items-center justify-between text-xs text-slate-500 mb-1 gap-2">
                                <span class="font-kanit font-semibold text-brand-700 truncate">รับเรื่องเข้าสู่ระบบ</span>
                                <span class="text-slate-400 text-[11px] flex-shrink-0">${formatThaiDate(receivedDate)}</span>
                            </div>
                            <p class="text-xs font-semibold text-slate-800">ยื่นคำขอและบันทึกข้อมูลเข้าระบบ</p>
                        </div>
                    </div>
                `;
            }

            if (logs && logs.length > 0) {
                logs.forEach((log, index) => {
                    const changedDate = new Date(log.changed_at);
                    const formattedDate = !isNaN(changedDate.getTime()) 
                        ? changedDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' น.'
                        : log.changed_at;

                    const cleanStatus = log.beautified_status || beautifyStatusThai(log.new_value || '');
                    const cleanNote = log.beautified_note || beautifyNoteThai(log.note || '');

                    html += `
                        <div class="relative flex items-start gap-3 sm:gap-4 group">
                            <div class="absolute -left-7 sm:-left-9 w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center text-[10px] shadow-sm ring-2 sm:ring-4 ring-white">
                                ${index + 1}
                            </div>
                            <div class="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-slate-200/80 shadow-xs w-full space-y-1.5">
                                <div class="flex flex-wrap items-center justify-between text-xs gap-1.5">
                                    <span class="font-kanit font-bold text-slate-800 px-2 sm:px-2.5 py-0.5 rounded-lg bg-slate-100 text-[11px] sm:text-xs">${log.action_type || 'บันทึกความคืบหน้า'}</span>
                                    <span class="text-slate-400 text-[10px] sm:text-[11px]">${formattedDate}</span>
                                </div>
                                ${cleanStatus ? `<p class="text-xs font-medium text-slate-700">ขั้นตอน: <strong class="text-brand-600 font-semibold">${cleanStatus}</strong></p>` : ''}
                                ${cleanNote && cleanNote !== cleanStatus ? `<p class="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-1 leading-relaxed"><i class="fas fa-circle-info text-brand-500 mr-1"></i> ${cleanNote}</p>` : ''}
                                ${log.changed_by ? `<div class="text-[10px] sm:text-[11px] text-slate-400 pt-1 flex items-center gap-1"><i class="fas fa-user-pen text-slate-300"></i> เจ้าหน้าที่: ${log.changed_by}</div>` : ''}
                            </div>
                        </div>
                    `;
                });
            } else if (!receivedDate) {
                html += `
                    <div class="py-8 text-center text-slate-400 font-kanit text-xs">
                        <i class="fas fa-info-circle text-lg mb-1 block"></i>
                        ยังไม่มีประวัติการอัปเดตเพิ่มเติม
                    </div>
                `;
            }

            if (completionDate) {
                html += `
                    <div class="relative flex items-start gap-3 sm:gap-4 group">
                        <div class="absolute -left-7 sm:-left-9 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shadow-md ring-2 sm:ring-4 ring-white">
                            <i class="fas fa-check text-[10px]"></i>
                        </div>
                        <div class="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-emerald-50 border border-emerald-200 w-full">
                            <div class="flex items-center justify-between text-xs text-emerald-800 mb-1 gap-2">
                                <span class="font-kanit font-bold truncate">ดำเนินการแล้วเสร็จ</span>
                                <span class="text-[11px] flex-shrink-0">${formatThaiDate(completionDate)}</span>
                            </div>
                            <p class="text-xs text-emerald-700">ภารกิจในฝ่ายนี้เสร็จสิ้นสมบูรณ์</p>
                        </div>
                    </div>
                `;
            }

            html += `</div>`;
            container.innerHTML = html;
        }

        function closeHistoryModal() {
            const modal = document.getElementById('history-modal');
            const modalCard = document.getElementById('history-modal-card');
            modalCard.classList.remove('scale-100', 'opacity-100');
            modalCard.classList.add('scale-95', 'opacity-0');
            setTimeout(() => { modal.classList.add('hidden'); }, 200);
        }

        // PDPA Modal
        function openPdpaModal() {
            document.getElementById('pdpa-modal').classList.remove('hidden');
        }

        function closePdpaModal() {
            document.getElementById('pdpa-modal').classList.add('hidden');
        }

        // PDPA Delete Account (Right to Erasure)
        async function confirmDeleteAccount() {
            if (!confirm('ยืนยันการลบบัญชีผู้ใช้ของท่านตามสิทธิ PDPA (Right to Erasure)?\n\nระบบจะลบ Username, Password และเซสชันทั้งหมดของท่านออกจากระบบทันที')) {
                return;
            }

            try {
                const response = await fetch(`${API_URL}?action=deleteAccount`);
                const res = await response.json();
                alert('ลบบัญชีผู้ใช้ของท่านตามสิทธิ PDPA เรียบร้อยแล้ว');
                localStorage.removeItem('dol_user');
                localStorage.removeItem('dol_session_timestamp');
                window.location.href = '../index.html';
            } catch (err) {
                localStorage.removeItem('dol_user');
                localStorage.removeItem('dol_session_timestamp');
                window.location.href = '../index.html';
            }
        }

        // Logout
        async function handleLogout() {
            try {
                await fetch(`${API_URL}?action=logout`);
            } catch (e) {}
            localStorage.removeItem('dol_user');
            localStorage.removeItem('dol_session_timestamp');
            window.location.href = '../index.html';
        }

        // Scroll to Top FAB Visibility
        window.addEventListener('scroll', () => {
            const btn = document.getElementById('btn-scroll-top');
            if (btn) {
                if (window.scrollY > 300) {
                    btn.classList.remove('opacity-0', 'pointer-events-none');
                    btn.classList.add('opacity-100');
                } else {
                    btn.classList.remove('opacity-100');
                    btn.classList.add('opacity-0', 'pointer-events-none');
                }
            }
        });
    </script>
</body>
</html>
