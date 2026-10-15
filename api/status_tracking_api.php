<?php
/**
 * AABM Smart Track API
 * API ระบบติดตามสถานะงานคำขอ 3 ฝ่าย สำนักงานที่ดินจังหวัดอ่างทอง
 * มาตรฐานความปลอดภัยตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
 * นโยบาย: 
 * 1. ไม่แสดงเลขโฉนดที่ดิน / สารบัญโฉนด ในทุกช่องทางตามมาตรฐาน PDPA
 * 2. ค้นหาแบบตรงทั้งชื่อและนามสกุล (ป้องกันการเห็นข้อมูลคนละนามสกุล)
 * 3. ล็อกห้ามสมัครชื่อผู้ใช้ admin และระบบ
 * 4. แสดงชื่อจริงของผู้ใช้งานชัดเจน
 */

if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    ini_set('session.use_only_cookies', 1);
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        ini_set('session.cookie_secure', 1);
    }
    session_start();
}

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/db.php';
$pdo = $conn;

// ฟังก์ชันลบเลขโฉนดและเลขที่ดินออกจากชื่อเรื่องตามมาตรฐาน PDPA
function sanitizeSubjectPDPA($text) {
    if (empty($text)) return 'ไม่ระบุเรื่อง';
    $cleaned = preg_replace('/(โฉนดที่ดิน|โฉนดเลขที่|โฉนด|น\.ส\.\s*3\s*ก\.|น\.ส\.3ก|เลขที่ดิน|แปลงเลขที่|แปลงที่ดิน|เลขที่)\s*[:\s]*[0-9\/,\s\-]+/ui', '', $text);
    $cleaned = preg_replace('/\s{2,}/u', ' ', trim($cleaned));
    return $cleaned ?: $text;
}

// ฟังก์ชันแปลงสถานะทางราชการให้เป็นภาษาที่สุภาพ ไพเราะ และเข้าใจง่ายสำหรับประชาชน (ไม่แตะต้องข้อมูลในตาราง)
function beautifyStatusThai($raw) {
    if (empty($raw) || $raw === '-' || $raw === 'งานปกติ') {
        return 'อยู่ระหว่างเจ้าหน้าที่กำลังเร่งรัดดำเนินการตามขั้นตอน';
    }

    $s = trim($raw);

    // หากมีลูกศรเปลี่ยนผ่าน เช่น "ระหว่างประกาศ -> ส่งฝ่ายรังวัด"
    if (strpos($s, '->') !== false) {
        $parts = explode('->', $s);
        $toPart = trim(end($parts));
        return beautifyStatusThai($toPart);
    }

    // กฎการแปลงคำให้สุภาพ ไพเราะ สบายใจต่อประชาชน
    $rules = [
        // เสร็จสิ้น / รอแจก
        '/^(รอแจก.*|แจ้งผู้ขอรับโฉนด.*|พร้อมจ่ายโฉนด)$/u' => 'ดำเนินการเสร็จสิ้นเรียบร้อยแล้ว พร้อมให้ท่านติดต่อรับเอกสารสิทธิ์',
        '/^(เสร็จสิ้น|งานสุดขั้นตอน)$/u' => 'ดำเนินการแล้วเสร็จสมบูรณ์',
        
        // เสนอลงนาม / จัดพิมพ์
        '/^(เสนอลงนาม|รอลงนาม|ลงนาม)$/u' => 'อยู่ระหว่างเสนอเจ้าพนักงานที่ดินลงนามอนุมัติ',
        '/^(เบิกแบบพิมพ์|เขียนโฉนด|พิมพ์โฉนด)$/u' => 'อยู่ระหว่างจัดพิมพ์และจัดทำเอกสารสิทธิ์ฉบับสมบูรณ์',

        // ตรวจสอบ
        '/^(หัวหน้างานตรวจระเบียบ|ตรวจระเบียบ)$/u' => 'อยู่ระหว่างหัวหน้างานตรวจสอบความถูกต้องของระเบียบและเอกสาร',
        '/^(หัวหน้าฝ่ายตรวจรายงาน|ตรวจรายงาน)$/u' => 'อยู่ระหว่างหัวหน้าฝ่ายตรวจสอบและรับรองผลการรังวัด',
        '/^(รอตรวจ|อยู่ระหว่างตรวจสอบ)$/u' => 'อยู่ระหว่างเจ้าหน้าที่ตรวจสอบความถูกต้องของคำขอ',

        // การส่งต่อระหว่างฝ่าย
        '/^(ส่งฝ่ายรังวัด|ส่งกลับฝ่ายรังวัด)$/u' => 'ประสานส่งเรื่องต่อฝ่ายรังวัด เพื่อดำเนินการทางช่าง',
        '/^(ส่งฝ่ายทะเบียน|ส่งกลับฝ่ายทะเบียน)$/u' => 'ประสานส่งเรื่องต่อฝ่ายทะเบียน เพื่อดำเนินการทางสิทธิ์และนิติกรรม',
        '/^(ส่งกลุ่มงานวิชาการ|ส่งฝ่ายวิชาการ|ส่งวิชาการ)$/u' => 'ส่งเรื่องฝ่ายวิชาการ เพื่อตรวจพิจารณาข้อกฎหมายและระเบียบที่เกี่ยวข้อง',
        '/^(ส่งช่าง|มอบหมายช่าง)$/u' => 'มอบหมายช่างรังวัด เพื่อเตรียมการลงพื้นที่ปฏิบัติงาน',

        // ประกาศ
        '/^(ระหว่างประกาศ|ประกาศ|ประกาศเรียก|รอครบกำหนดประกาศ)$/u' => 'อยู่ระหว่างปิดประกาศตามระเบียบกำหนด (เพื่อคุ้มครองสิทธิของผู้มีส่วนได้เสีย)',

        // รอผล / นัดหมาย
        '/^(รอผลสอบถาม|รอตอบสอบถาม|รอผลสอบ)$/u' => 'อยู่ระหว่างรอผลการประสานงานตรวจสอบร่วมกับหน่วยงานที่เกี่ยวข้อง',
        '/^(นัดรังวัดใหม่)$/u' => 'อยู่ระหว่างนัดหมายกำหนดวันทำการรังวัดใหม่',
        '/^(นัดตรวจสอบทางสาธารณประโยชน์)$/u' => 'อยู่ระหว่างนัดตรวจสอบแนวเขตและพื้นที่สาธารณประโยชน์',

        // ติดต่อ / สอบสวนเพิ่มเติม
        '/^(.*ทับ.*เลขที่ดิน.*|.*สอบสวนเพิ่มเติม.*)$/u' => 'อยู่ระหว่างประสานผู้ยื่นคำขอเพื่อสอบสวนข้อเท็จจริงเพิ่มเติม',
        '/^(แจ้งเตือนครั้งที่.*|แจ้งผู้ขอ.*)$/u' => 'มีหนังสือประสานแจ้งข้อมูลและความคืบหน้าถึงผู้ยื่นคำขอ',
        '/^(งานศาล|.*ศาล.*)$/u' => 'อยู่ระหว่างดำเนินการตามกระบวนการทางกฎหมาย/ศาล',
        '/^(ยกเลิกเรื่อง|ผู้ขอยกเลิก)$/u' => 'ยุติการดำเนินการตามคำร้องของผู้ขอ/ระเบียบ',
        '/^(อยู่ระหว่างดำเนินการ|กำลังดำเนินการ|ระหว่างดำเนินการ)$/u' => 'อยู่ระหว่างเจ้าหน้าที่กำลังเร่งรัดดำเนินการตามลำดับขั้นตอน'
    ];

    foreach ($rules as $pattern => $replacement) {
        if (preg_match($pattern, $s)) {
            return $replacement;
        }
    }

    return 'อยู่ระหว่างดำเนินการ: ' . $s;
}

// ฟังก์ชันแปลงบันทึกประวัติให้สุภาพ ชัดเจน
function beautifyNoteThai($note) {
    if (empty($note)) return '';
    $n = trim($note);

    if (preg_match('/^สถานะ\s*:\s*(.*)/u', $n, $m)) {
        $inner = trim($m[1]);
        if (strpos($inner, '->') !== false) {
            $parts = explode('->', $inner);
            $from = beautifyStatusThai(trim($parts[0]));
            $to = beautifyStatusThai(trim($parts[1]));
            return "ปรับขั้นตอนการดำเนินงานจาก “{$from}” สู่ “{$to}”";
        }
        return "ขั้นตอนการดำเนินงาน: " . beautifyStatusThai($inner);
    }

    if (strpos($n, 'อัปเดตแบบกลุ่มจากไฟล์') !== false) {
        return 'บันทึกความคืบหน้าระบบงานประจำรอบสัปดาห์';
    }

    return $n;
}

$action = $_GET['action'] ?? ($_POST['action'] ?? '');

switch ($action) {
    case 'register':
        handleRegister($pdo);
        break;
    case 'login':
    case 'loginWithPassword':
        handleLogin($pdo);
        break;
    case 'getMyWorks':
        getMyWorks($pdo);
        break;
    case 'checkAuth':
        checkAuth($pdo);
        break;
    case 'deleteAccount':
        deleteAccount($pdo);
        break;
    case 'logout':
        logoutSession();
        break;
    case 'getHistory':
        getHistory($pdo);
        break;
    case 'getWorkTypes':
        getWorkTypes($pdo);
        break;
    case 'getVisitCount':
        getVisitCount($pdo);
        break;
    case 'incrementVisit':
        incrementVisit($pdo);
        break;
    default:
        if (!empty($action)) {
            echo json_encode(['success' => false, 'error' => 'Invalid action: ' . htmlspecialchars($action)]);
        }
}

/**
 * 1. ระบบสมัครสมาชิก (Register)
 */
function handleRegister($pdo) {
    $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $username        = trim($data['username'] ?? '');
    $password        = trim($data['password'] ?? '');
    $confirmPassword = trim($data['confirm_password'] ?? '');
    $fullName        = trim($data['full_name'] ?? '');
    $pdpaConsent     = !empty($data['pdpa_consent']);

    if (empty($username) || empty($password) || empty($fullName)) {
        echo json_encode(['success' => false, 'error' => 'กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง']);
        return;
    }

    // ล็อกห้ามใช้ username ว่า admin หรือชื่อสงวนของระบบ
    $reservedUsernames = [
        'admin', 'administrator', 'root', 'system', 'superadmin', 
        'staff', 'officer', 'moderator', 'backoffice', 'manager', 
        'supervisor', 'dol', 'aabm'
    ];
    if (in_array(strtolower($username), $reservedUsernames)) {
        echo json_encode(['success' => false, 'error' => 'ชื่อผู้ใช้ (Username) นี้สงวนไว้สำหรับเจ้าหน้าที่และระบบ กรุณาเลือกชื่อผู้ใช้อื่น']);
        return;
    }

    if (!$pdpaConsent) {
        echo json_encode(['success' => false, 'error' => 'กรุณาอ่านข้อกำหนดและนโยบาย PDPA ก่อน']);
        return;
    }

    if (!empty($confirmPassword) && $password !== $confirmPassword) {
        echo json_encode(['success' => false, 'error' => 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน']);
        return;
    }

    if (strlen($username) < 3) {
        echo json_encode(['success' => false, 'error' => 'ชื่อผู้ใช้ (Username) ต้องมีความยาวอย่างน้อย 3 ตัวอักษร']);
        return;
    }

    if (strlen($password) < 4) {
        echo json_encode(['success' => false, 'error' => 'รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร']);
        return;
    }

    $stmt = $pdo->prepare("SELECT id FROM citizen_users WHERE username = ? LIMIT 1");
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        echo json_encode(['success' => false, 'error' => 'ชื่อผู้ใช้นี้ (Username) มีผู้ใช้งานแล้ว กรุณาเลือกชื่อผู้ใช้อื่น']);
        return;
    }

    // ป้องกันการสวมรอยชื่อผู้อื่น (1 ชื่อ-นามสกุล = 1 บัญชี)
    $nameStmt = $pdo->prepare("SELECT id FROM citizen_users WHERE full_name = ? LIMIT 1");
    $nameStmt->execute([$fullName]);
    if ($nameStmt->fetch()) {
        echo json_encode(['success' => false, 'error' => 'ชื่อ-นามสกุลนี้ได้ทำการลงทะเบียนในระบบแล้ว หากเป็นบัญชีของท่านกรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน']);
        return;
    }

    $passHash = password_hash($password, PASSWORD_BCRYPT);
    $insStmt = $pdo->prepare("
        INSERT INTO citizen_users (username, full_name, password_hash, pdpa_consent, pdpa_consent_at, last_login) 
        VALUES (?, ?, ?, 1, NOW(), NOW())
    ");
    $insStmt->execute([$username, $fullName, $passHash]);
    $newId = $pdo->lastInsertId();

    if (session_status() === PHP_SESSION_NONE) @session_start();
    if (!headers_sent()) @session_regenerate_id(true);

    $_SESSION['citizen_logged_in'] = true;
    $_SESSION['citizen_user_id'] = $newId;
    $_SESSION['citizen_username'] = $username;
    $_SESSION['citizen_name'] = $fullName;

    echo json_encode([
        'success' => true,
        'message' => 'สมัครสมาชิกและเข้าสู่ระบบเรียบร้อยแล้ว',
        'username' => $username,
        'full_name' => $fullName
    ]);
}

/**
 * 2. เข้าสู่ระบบด้วย Username & Password (Login)
 */
function handleLogin($pdo) {
    $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $loginInput = trim($data['username'] ?? ($data['name'] ?? ''));
    $password   = trim($data['password'] ?? '');

    if (empty($loginInput) || empty($password)) {
        echo json_encode(['success' => false, 'error' => 'กรุณากรอกชื่อผู้ใช้ (Username) และรหัสผ่าน']);
        return;
    }

    $stmt = $pdo->prepare("SELECT * FROM citizen_users WHERE username = ? OR full_name = ? LIMIT 1");
    $stmt->execute([$loginInput, $loginInput]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        echo json_encode([
            'success' => false,
            'error' => 'ไม่พบชื่อผู้ใช้งานนี้ในระบบ กรุณาสมัครใช้งานก่อน'
        ]);
        return;
    }

    if (password_verify($password, $user['password_hash'])) {
        $upStmt = $pdo->prepare("UPDATE citizen_users SET failed_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = ?");
        $upStmt->execute([$user['id']]);

        if (session_status() === PHP_SESSION_NONE) @session_start();
        if (!headers_sent()) @session_regenerate_id(true);

        $_SESSION['citizen_logged_in'] = true;
        $_SESSION['citizen_user_id'] = $user['id'];
        $_SESSION['citizen_username'] = $user['username'];
        $_SESSION['citizen_name'] = $user['full_name'];

        echo json_encode([
            'success' => true,
            'message' => 'เข้าสู่ระบบสำเร็จ',
            'username' => $user['username'],
            'full_name' => $user['full_name']
        ]);
    } else {
        echo json_encode(['success' => false, 'error' => 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง']);
    }
}

/**
 * 3. สิทธิขอให้ลบบัญชีและข้อมูลส่วนบุคคลตาม PDPA (Right to Erasure)
 */
function deleteAccount($pdo) {
    if (empty($_SESSION['citizen_logged_in']) || empty($_SESSION['citizen_user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'กรุณาเข้าสู่ระบบก่อนขอลบบัญชี']);
        return;
    }

    $userId = (int) $_SESSION['citizen_user_id'];
    $stmt = $pdo->prepare("DELETE FROM citizen_users WHERE id = ?");
    $stmt->execute([$userId]);

    logoutSession();
}

/**
 * 4. ดึงข้อมูลคำขอ 3 ฝ่ายของบุคคลที่ล็อกอินอยู่
 * กฎ PDPA เข้มงวด: 
 * - ไม่เปิดเผยเลขโฉนดที่ดิน (ไม่ส่งค่า summary ที่เป็นเลขโฉนดออกไป)
 * - ลบเลขโฉนดที่ดินออกจากชื่อเรื่อง (subject)
 * - ต้องตรงทั้งชื่อและนามสกุล
 */
function getMyWorks($pdo) {
    if (empty($_SESSION['citizen_logged_in']) || empty($_SESSION['citizen_name'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'กรุณาเข้าสู่ระบบก่อน']);
        return;
    }

    $citizenName = $_SESSION['citizen_name'];
    $cleanName = preg_replace('/^(นาย|นางสาว|นาง|ว่าที่\s*ร\.ต\.|ด\.ช\.|ด\.ญ\.|น\.ส\.|ดร\.)\s*/u', '', trim($citizenName));
    $words = preg_split('/\s+/u', trim($cleanName), -1, PREG_SPLIT_NO_EMPTY);
    
    $results = [];

    if (!empty($words)) {
        $firstName = $words[0];
        $lastName = count($words) > 1 ? $words[count($words) - 1] : '';

        // ถ้ามีทั้งชื่อและนามสกุล ต้องตรงทั้งชื่อ AND นามสกุล เท่านั้น
        if (!empty($lastName)) {
            $surveyConds = ["applicant LIKE ?", "applicant LIKE ?"];
            $surveyParams = ['%' . $firstName . '%', '%' . $lastName . '%'];
            $regConds = ["related_person LIKE ?", "related_person LIKE ?"];
            $regParams = ['%' . $firstName . '%', '%' . $lastName . '%'];

            $sStmt = $pdo->prepare("
                SELECT id, 'survey' as work_type, received_seq as seq_no, received_date, survey_type as subject, applicant as related_person, status_cause, men as responsible_person, rv_12, survey_date, completion_date, progress_type, created_at, updated_at 
                FROM survey_works 
                WHERE " . implode(' AND ', $surveyConds) . " 
                ORDER BY received_date DESC
            ");
            $sStmt->execute($surveyParams);
            $sRes = $sStmt->fetchAll(PDO::FETCH_ASSOC);

            $rStmt = $pdo->prepare("
                SELECT id, 'registration' as work_type, seq_no, received_date, subject, related_person, status_cause, responsible_person, completion_date, progress_type, created_at, updated_at 
                FROM registration_works 
                WHERE " . implode(' AND ', $regConds) . " 
                ORDER BY received_date DESC
            ");
            $rStmt->execute($regParams);
            $rRes = $rStmt->fetchAll(PDO::FETCH_ASSOC);

            $aStmt = $pdo->prepare("
                SELECT id, 'academic' as work_type, seq_no, received_date, subject, related_person, status_cause, responsible_person, completion_date, progress_type, created_at, updated_at 
                FROM academic_works 
                WHERE " . implode(' AND ', $regConds) . " 
                ORDER BY received_date DESC
            ");
            $aStmt->execute($regParams);
            $aRes = $aStmt->fetchAll(PDO::FETCH_ASSOC);

            $results = array_merge($sRes, $rRes, $aRes);
        } else {
            // ค้นหาด้วยชื่อหลักเมื่อไม่มีนามสกุล
            $sStmt = $pdo->prepare("
                SELECT id, 'survey' as work_type, received_seq as seq_no, received_date, survey_type as subject, applicant as related_person, status_cause, men as responsible_person, rv_12, survey_date, completion_date, progress_type, created_at, updated_at 
                FROM survey_works 
                WHERE applicant LIKE ? 
                ORDER BY received_date DESC
            ");
            $sStmt->execute(['%' . $firstName . '%']);
            $sRes = $sStmt->fetchAll(PDO::FETCH_ASSOC);

            $rStmt = $pdo->prepare("
                SELECT id, 'registration' as work_type, seq_no, received_date, subject, related_person, status_cause, responsible_person, completion_date, progress_type, created_at, updated_at 
                FROM registration_works 
                WHERE related_person LIKE ? 
                ORDER BY received_date DESC
            ");
            $rStmt->execute(['%' . $firstName . '%']);
            $rRes = $rStmt->fetchAll(PDO::FETCH_ASSOC);

            $aStmt = $pdo->prepare("
                SELECT id, 'academic' as work_type, seq_no, received_date, subject, related_person, status_cause, responsible_person, completion_date, progress_type, created_at, updated_at 
                FROM academic_works 
                WHERE related_person LIKE ? 
                ORDER BY received_date DESC
            ");
            $aStmt->execute(['%' . $firstName . '%']);
            $aRes = $aStmt->fetchAll(PDO::FETCH_ASSOC);

            $results = array_merge($sRes, $rRes, $aRes);
        }
    }

    // ประมวลผลสถานะ และ ตัดเลขโฉนดที่ดินออกตาม PDPA
    foreach ($results as &$work) {
        // ทำความสะอาด subject เพื่อไม่ให้มีเลขโฉนดปรากฏ
        $work['subject'] = sanitizeSubjectPDPA($work['subject'] ?? '');

        // ตัด summary เพื่อไม่เปิดเผยเลขโฉนด
        unset($work['summary']);

        $stmt = $pdo->prepare("
            SELECT COUNT(*) as update_count, MAX(changed_at) as last_update
            FROM status_history 
            WHERE work_type = ? AND work_id = ?
        ");
        $stmt->execute([$work['work_type'], $work['id']]);
        $historyInfo = $stmt->fetch(PDO::FETCH_ASSOC);
        $work['update_count'] = (int) ($historyInfo['update_count'] ?? 0);
        $work['last_update'] = $historyInfo['last_update'] ?? null;

        $stmt = $pdo->prepare("
            SELECT action_type, old_value, new_value, note, changed_by, changed_at
            FROM status_history 
            WHERE work_type = ? AND work_id = ?
            ORDER BY changed_at DESC
            LIMIT 1
        ");
        $stmt->execute([$work['work_type'], $work['id']]);
        $latestHistory = $stmt->fetch(PDO::FETCH_ASSOC);

        $rawStatus = 'กำลังดำเนินการ';
        if ($latestHistory) {
            if (!empty($latestHistory['new_value'])) {
                $rawStatus = $latestHistory['new_value'];
            } elseif (!empty($latestHistory['note'])) {
                $rawStatus = $latestHistory['note'];
            } else {
                $rawStatus = !empty($work['status_cause']) && $work['status_cause'] !== '-' ? $work['status_cause'] : 'กำลังดำเนินการ';
            }
            $work['latest_status_date'] = $latestHistory['changed_at'];
        } else {
            $rawStatus = !empty($work['status_cause']) && $work['status_cause'] !== '-' ? $work['status_cause'] : 'กำลังดำเนินการ';
            $work['latest_status_date'] = $work['updated_at'] ?? $work['received_date'];
        }

        $work['latest_status'] = beautifyStatusThai($rawStatus);

        $isFinished = !empty($work['completion_date']);
        $work['is_completed'] = $isFinished;
        $work['status_badge_label'] = $isFinished ? 'ดำเนินการเสร็จสิ้น' : 'อยู่ระหว่างดำเนินการ';
    }

    $hasRecords = count($results) > 0;

    echo json_encode([
        'success' => true,
        'has_records' => $hasRecords,
        'registered_name' => $citizenName,
        'full_name' => $citizenName,
        'count' => count($results),
        'data' => $results,
        'empty_message' => $hasRecords ? null : 'ยังไม่มีการเข้ามาใช้บริการ',
        'update_note' => 'สำนักงานที่ดินจังหวัดอ่างทอง อัพเดทข้อมูลทุกวันจันทร์'
    ]);
}

/**
 * 5. ตรวจสอบสถานะการ Login
 */
function checkAuth($pdo) {
    if (!empty($_SESSION['citizen_logged_in']) && !empty($_SESSION['citizen_name'])) {
        echo json_encode([
            'authenticated' => true,
            'username' => $_SESSION['citizen_username'] ?? '',
            'full_name' => $_SESSION['citizen_name']
        ]);
    } else {
        echo json_encode(['authenticated' => false]);
    }
}

/**
 * 6. ออกจากระบบ (Logout)
 */
function logoutSession() {
    $_SESSION = [];
    if (ini_get("session.use_cookies") && !headers_sent()) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        @session_destroy();
    }
    echo json_encode(['success' => true, 'message' => 'ออกจากระบบเรียบร้อยแล้ว']);
}

/**
 * 7. ดึงประวัติการอัปเดตสถานะคำขอ (ตัดเลขโฉนดออก)
 */
function getHistory($pdo) {
    if (empty($_SESSION['citizen_logged_in'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'กรุณาเข้าสู่ระบบก่อน']);
        return;
    }

    $workType = $_GET['workType'] ?? '';
    $workId = (int) ($_GET['workId'] ?? 0);

    if (!$workType || !$workId) {
        echo json_encode(['success' => false, 'error' => 'Missing parameters']);
        return;
    }

    $tableName = $workType === 'survey' ? 'survey_works' :
        ($workType === 'registration' ? 'registration_works' : 'academic_works');

    if (!in_array($tableName, ['survey_works', 'registration_works', 'academic_works'])) {
        echo json_encode(['success' => false, 'error' => 'Invalid work type']);
        return;
    }

    $stmt = $pdo->prepare("SELECT * FROM `$tableName` WHERE id = ?");
    $stmt->execute([$workId]);
    $work = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($work) {
        // ตัดเลขโฉนดออกจาก subject
        if (isset($work['subject'])) $work['subject'] = sanitizeSubjectPDPA($work['subject']);
        if (isset($work['survey_type'])) $work['survey_type'] = sanitizeSubjectPDPA($work['survey_type']);
        unset($work['summary']);
    }

    $stmt = $pdo->prepare("
        SELECT 
            id,
            action_type,
            old_value,
            new_value,
            note,
            changed_by,
            changed_at
        FROM status_history
        WHERE work_type = ? AND work_id = ?
        ORDER BY changed_at ASC
    ");
    $stmt->execute([$workType, $workId]);
    $history = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($history as &$h) {
        $h['beautified_status'] = beautifyStatusThai($h['new_value'] ?? '');
        $h['beautified_note'] = beautifyNoteThai($h['note'] ?? '');
    }

    echo json_encode([
        'success' => true,
        'work' => $work,
        'received_date' => $work['received_date'] ?? null,
        'completion_date' => $work['completion_date'] ?? null,
        'data' => $history
    ]);
}

/**
 * ดึงประเภทงานทั้งหมด
 */
function getWorkTypes($pdo) {
    $stmt = $pdo->query("SELECT DISTINCT survey_type FROM survey_works WHERE survey_type IS NOT NULL AND survey_type != '' ORDER BY survey_type ASC");
    $surveyTypes = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $stmt = $pdo->query("SELECT DISTINCT subject FROM registration_works WHERE subject IS NOT NULL AND subject != '' ORDER BY subject ASC LIMIT 30");
    $regSubjects = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $stmt = $pdo->query("SELECT DISTINCT subject FROM academic_works WHERE subject IS NOT NULL AND subject != '' ORDER BY subject ASC LIMIT 30");
    $acadSubjects = $stmt->fetchAll(PDO::FETCH_COLUMN);

    echo json_encode([
        'success' => true,
        'data' => [
            'survey' => $surveyTypes,
            'registration' => $regSubjects,
            'academic' => $acadSubjects
        ]
    ]);
}

/**
 * ดึงจำนวนผู้เข้าใช้งาน
 */
function getVisitCount($pdo) {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS visit_counter_monthly (
            id INT AUTO_INCREMENT PRIMARY KEY,
            `year_month` VARCHAR(7) NOT NULL UNIQUE,
            `count` INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    ");

    $stmt = $pdo->query("SELECT COALESCE(SUM(`count`), 0) as total FROM visit_counter_monthly");
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    $totalCount = (int) ($result['total'] ?? 0);

    try {
        $baseStmt = $pdo->query("SELECT COALESCE(SUM(`count`), 0) as base_total FROM visit_counter");
        $baseRes = $baseStmt->fetch(PDO::FETCH_ASSOC);
        $totalCount += (int) ($baseRes['base_total'] ?? 0);
    } catch (Exception $e) {
        if ($totalCount === 0) $totalCount = 800;
    }

    $stmt = $pdo->query("
        SELECT `year_month`, `count` 
        FROM visit_counter_monthly 
        ORDER BY `year_month` DESC 
        LIMIT 12
    ");
    $monthlyData = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'count' => $totalCount,
        'monthly' => $monthlyData
    ]);
}

/**
 * บันทึกจำนวนผู้เข้าใช้งาน
 */
function incrementVisit($pdo) {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS visit_counter_monthly (
            id INT AUTO_INCREMENT PRIMARY KEY,
            `year_month` VARCHAR(7) NOT NULL UNIQUE,
            `count` INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    ");

    $yearMonth = date('Y-m');

    $stmt = $pdo->prepare("
        INSERT INTO visit_counter_monthly (`year_month`, `count`) 
        VALUES (?, 1) 
        ON DUPLICATE KEY UPDATE `count` = `count` + 1
    ");
    $stmt->execute([$yearMonth]);

    try {
        $pdo->exec("UPDATE visit_counter SET `count` = `count` + 1 WHERE id = 1");
    } catch (Exception $e) {
        // ignore
    }

    $stmt = $pdo->query("SELECT COALESCE(SUM(`count`), 0) as total FROM visit_counter_monthly");
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    $totalCount = (int) ($result['total'] ?? 0);

    try {
        $baseStmt = $pdo->query("SELECT COALESCE(SUM(`count`), 0) as base_total FROM visit_counter");
        $baseRes = $baseStmt->fetch(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        $totalCount += 800;
    }

    echo json_encode([
        'success' => true,
        'count' => $totalCount
    ]);
}
