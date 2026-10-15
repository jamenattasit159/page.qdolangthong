<?php
/**
 * ฟังก์ชันตรวจสอบการล็อคข้อมูลรายงานประจำเดือน
 * เงื่อนไข: ทุกวันที่ 5 เวลา 01:00 น. เป็นต้นไป จะล็อคไม่ให้บันทึกงานของเดือนก่อนหน้า
 * @param string $completionDateStr วันที่เสร็จงานในรูปแบบ YYYY-MM-DD
 * @return bool true หากระบบถูกล็อค ห้ามบันทึกย้อนหลัง
 */
function isLockdownActive($completionDateStr, $department = null)
{
    if (empty($completionDateStr))
        return false;

    try {
        global $conn;

        $settingKey = 'lockdown_status';
        if (!empty($department)) {
            $settingKeyOverride = "lockdown_status_{$department}";
            $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = :key");
            $stmt->execute([':key' => $settingKeyOverride]);
            $overrideSetting = $stmt->fetchColumn();
            if ($overrideSetting !== false) {
                // Use override if exists
                $setting = $overrideSetting;
            } else {
                // Fallback
                $stmt = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'lockdown_status'");
                $setting = $stmt->fetchColumn();
            }
        } else {
            $stmt = $conn->query("SELECT setting_value FROM system_settings WHERE setting_key = 'lockdown_status'");
            $setting = $stmt->fetchColumn();
        }

        if ($setting === 'unlocked')
            return false; // ปลดล็อคตลอดเวลา
        if ($setting === 'locked') {
            // ล็อคตลอดเวลา (เช็คปี/เดือนด้วยเพื่อให้ล็อคเฉพาะงานย้อนหลัก)
            $now = new DateTime();
            $targetDate = new DateTime($completionDateStr);
            if ($targetDate->format('Y-m') < $now->format('Y-m'))
                return true;
            return false;
        }

        // 2. Default Logic (Auto: Locked after the 5th)
        $now = new DateTime();
        $currentDay = (int) $now->format('j');
        $currentHour = (int) $now->format('G');

        $isLockdownTime = $currentDay > 5 || ($currentDay == 5 && $currentHour >= 1);
        if (!$isLockdownTime)
            return false;

        $targetDate = new DateTime($completionDateStr);
        $currentMonth = (int) $now->format('n');
        $currentYear = (int) $now->format('Y');
        $targetMonth = (int) $targetDate->format('n');
        $targetYear = (int) $targetDate->format('Y');

        if ($targetYear < $currentYear)
            return true;
        if ($targetYear == $currentYear && $targetMonth < $currentMonth)
            return true;

        return false;
    } catch (Exception $e) {
        return false;
    }
}
?>