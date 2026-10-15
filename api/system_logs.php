<?php
header('Content-Type: application/json; charset=utf-8');
date_default_timezone_set('Asia/Bangkok');
include_once 'db.php';

try {
    $action = $_GET['action'] ?? 'get_logs';

    // -------------------------------------------------------------
    // ACTION: item_history (Full audit trail for a specific work item)
    // -------------------------------------------------------------
    if ($action === 'item_history') {
        $module = trim($_GET['module'] ?? '');
        $refId = trim($_GET['ref_id'] ?? '');

        if (!$module || !$refId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'module and ref_id are required']);
            exit;
        }

        // 1. Fetch work details
        $work = null;
        if ($module === 'survey') {
            $stmt = $conn->prepare("SELECT * FROM survey_works WHERE id = ?");
            $stmt->execute([$refId]);
            $work = $stmt->fetch(PDO::FETCH_ASSOC);
        } elseif ($module === 'registration') {
            $stmt = $conn->prepare("SELECT * FROM registration_works WHERE id = ?");
            $stmt->execute([$refId]);
            $work = $stmt->fetch(PDO::FETCH_ASSOC);
        } elseif ($module === 'academic') {
            $stmt = $conn->prepare("SELECT * FROM academic_works WHERE id = ?");
            $stmt->execute([$refId]);
            $work = $stmt->fetch(PDO::FETCH_ASSOC);
        } elseif ($module === 'admin') {
            $stmt = $conn->prepare("SELECT * FROM administration_works WHERE id = ?");
            $stmt->execute([$refId]);
            $work = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        // 2. Fetch status history
        $stmtStatus = $conn->prepare("SELECT * FROM status_history WHERE work_type = ? AND work_id = ? ORDER BY changed_at DESC");
        $stmtStatus->execute([$module, $refId]);
        $histories = $stmtStatus->fetchAll(PDO::FETCH_ASSOC);

        // 3. Fetch activity logs
        $stmtAct = $conn->prepare("SELECT * FROM activity_logs WHERE department = ? AND item_id = ? ORDER BY created_at DESC");
        $stmtAct->execute([$module, $refId]);
        $activities = $stmtAct->fetchAll(PDO::FETCH_ASSOC);

        // 4. Correlate and build timeline
        $usedActIds = [];
        $timeline = [];

        foreach ($histories as $h) {
            $hTime = strtotime($h['changed_at']);
            $matchedAct = null;
            foreach ($activities as $act) {
                if (!isset($usedActIds[$act['id']])) {
                    $actTime = strtotime($act['created_at']);
                    if (abs($hTime - $actTime) <= 5 && ($act['user_name'] === $h['changed_by'])) {
                        $matchedAct = $act;
                        $usedActIds[$act['id']] = true;
                        break;
                    }
                }
            }

            $timeline[] = [
                'id' => 'sh-' . $h['id'] . ($matchedAct ? '_al-' . $matchedAct['id'] : ''),
                'source' => $matchedAct ? 'unified' : 'status',
                'user' => $h['changed_by'] ?: ($matchedAct['user_name'] ?? 'ระบบ'),
                'action' => $h['action_type'] ?: 'อัปเดตสถานะ',
                'old_value' => $h['old_value'] ?? '-',
                'new_value' => $h['new_value'] ?? '-',
                'note' => $h['note'] ?? '',
                'activity_details' => $matchedAct['details'] ?? '',
                'timestamp' => $h['changed_at']
            ];
        }

        // Standalone activities
        foreach ($activities as $act) {
            if (!isset($usedActIds[$act['id']])) {
                $timeline[] = [
                    'id' => 'al-' . $act['id'],
                    'source' => 'activity',
                    'user' => $act['user_name'] ?: 'ระบบ',
                    'action' => $act['action'] ?: 'ACTION',
                    'old_value' => '-',
                    'new_value' => '-',
                    'note' => '',
                    'activity_details' => $act['details'] ?? '',
                    'timestamp' => $act['created_at']
                ];
            }
        }

        // Sort timeline descending by timestamp
        usort($timeline, function($a, $b) {
            return strtotime($b['timestamp']) - strtotime($a['timestamp']);
        });

        echo json_encode([
            'status' => 'success',
            'module' => $module,
            'ref_id' => $refId,
            'work' => $work,
            'timeline' => $timeline
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // -------------------------------------------------------------
    // ACTION: get_logs (Main dashboard data & audit list)
    // -------------------------------------------------------------
    $limit = isset($_GET['limit']) ? max(100, min(5000, (int)$_GET['limit'])) : 2500;
    $datePreset = $_GET['preset'] ?? 'all';
    $dateFrom = $_GET['date_from'] ?? null;
    $dateTo = $_GET['date_to'] ?? null;
    $filterModule = $_GET['module'] ?? 'all';
    $filterUser = $_GET['user'] ?? 'all';
    $filterAction = $_GET['action_type'] ?? 'all';
    $mode = $_GET['mode'] ?? 'unified'; // 'unified', 'status', 'activity', 'raw'

    // Calculate dates based on preset
    $today = date('Y-m-d');
    if ($datePreset === 'today') {
        $dateFrom = $today;
        $dateTo = $today;
    } elseif ($datePreset === 'yesterday') {
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $dateFrom = $yesterday;
        $dateTo = $yesterday;
    } elseif ($datePreset === '7days') {
        $dateFrom = date('Y-m-d', strtotime('-7 days'));
        $dateTo = $today;
    } elseif ($datePreset === '30days') {
        $dateFrom = date('Y-m-d', strtotime('-30 days'));
        $dateTo = $today;
    }

    // Base queries
    $actWhere = [];
    $actParams = [];
    $shWhere = [];
    $shParams = [];

    if ($dateFrom) {
        $actWhere[] = "DATE(created_at) >= ?";
        $actParams[] = $dateFrom;
        $shWhere[] = "DATE(changed_at) >= ?";
        $shParams[] = $dateFrom;
    }
    if ($dateTo) {
        $actWhere[] = "DATE(created_at) <= ?";
        $actParams[] = $dateTo;
        $shWhere[] = "DATE(changed_at) <= ?";
        $shParams[] = $dateTo;
    }
    if ($filterModule !== 'all' && $filterModule !== '') {
        $actWhere[] = "department = ?";
        $actParams[] = $filterModule;
        $shWhere[] = "work_type = ?";
        $shParams[] = $filterModule;
    }
    if ($filterUser !== 'all' && $filterUser !== '') {
        $actWhere[] = "user_name = ?";
        $actParams[] = $filterUser;
        $shWhere[] = "changed_by = ?";
        $shParams[] = $filterUser;
    }

    $actSql = "SELECT id, user_name as user, action, department as module, item_id as ref_id, details, created_at as log_date FROM activity_logs";
    if (!empty($actWhere)) {
        $actSql .= " WHERE " . implode(" AND ", $actWhere);
    }
    $actSql .= " ORDER BY created_at DESC LIMIT " . $limit;
    $stmt1 = $conn->prepare($actSql);
    $stmt1->execute($actParams);
    $activities = $stmt1->fetchAll(PDO::FETCH_ASSOC);

    $shSql = "SELECT id, changed_by as user, action_type as action, work_type as module, work_id as ref_id, old_value, new_value, note, changed_at as log_date FROM status_history";
    if (!empty($shWhere)) {
        $shSql .= " WHERE " . implode(" AND ", $shWhere);
    }
    $shSql .= " ORDER BY changed_at DESC LIMIT " . $limit;
    $stmt2 = $conn->prepare($shSql);
    $stmt2->execute($shParams);
    $histories = $stmt2->fetchAll(PDO::FETCH_ASSOC);

    // Correlate & Deduplicate
    $used_activity_ids = [];
    $activity_index = [];

    foreach ($activities as $act) {
        $time = strtotime($act['log_date']);
        $bucket = floor($time / 5);
        $key = ($act['module'] ?? '') . '_' . ($act['ref_id'] ?? '') . '_' . ($act['user'] ?? '') . '_' . $bucket;
        $activity_index[$key][] = $act;
    }

    $unified_logs = [];

    // Mode check
    if ($mode === 'status') {
        // Only status history
        foreach ($histories as $h) {
            $unified_logs[] = [
                'id' => 'sh-' . $h['id'],
                'source' => 'status',
                'source_label' => 'ประวัติสถานะ',
                'user' => $h['user'] ?: 'ระบบ',
                'action' => $h['action'] ?: 'อัปเดตสถานะ',
                'module' => $h['module'] ?: '-',
                'ref_id' => $h['ref_id'] ?: null,
                'old_value' => $h['old_value'] ?? '-',
                'new_value' => $h['new_value'] ?? '-',
                'note' => $h['note'] ?? '',
                'activity_details' => '',
                'details' => $h['note'] ?: ("สถานะ: " . ($h['old_value'] ?: '-') . " -> " . ($h['new_value'] ?: '-')),
                'log_date' => $h['log_date']
            ];
        }
    } elseif ($mode === 'activity') {
        // Only activity logs
        foreach ($activities as $act) {
            $unified_logs[] = [
                'id' => 'al-' . $act['id'],
                'source' => 'activity',
                'source_label' => 'กิจกรรมระบบ',
                'user' => $act['user'] ?: 'ระบบ',
                'action' => $act['action'] ?: 'ACTION',
                'module' => $act['module'] ?: '-',
                'ref_id' => $act['ref_id'] ?: null,
                'old_value' => '-',
                'new_value' => '-',
                'note' => '',
                'activity_details' => $act['details'] ?? '',
                'details' => $act['details'] ?? 'กิจกรรมของระบบ',
                'log_date' => $act['log_date']
            ];
        }
    } elseif ($mode === 'raw') {
        // Both tables without deduplication
        foreach ($histories as $h) {
            $unified_logs[] = [
                'id' => 'sh-' . $h['id'],
                'source' => 'status',
                'source_label' => 'ประวัติงาน (Status)',
                'user' => $h['user'] ?: 'ระบบ',
                'action' => $h['action'] ?: 'อัปเดตสถานะ',
                'module' => $h['module'] ?: '-',
                'ref_id' => $h['ref_id'] ?: null,
                'old_value' => $h['old_value'] ?? '-',
                'new_value' => $h['new_value'] ?? '-',
                'note' => $h['note'] ?? '',
                'activity_details' => '',
                'details' => $h['note'] ?: ("สถานะ: " . ($h['old_value'] ?: '-') . " -> " . ($h['new_value'] ?: '-')),
                'log_date' => $h['log_date']
            ];
        }
        foreach ($activities as $act) {
            $unified_logs[] = [
                'id' => 'al-' . $act['id'],
                'source' => 'activity',
                'source_label' => 'ระบบ (Activity)',
                'user' => $act['user'] ?: 'ระบบ',
                'action' => $act['action'] ?: 'ACTION',
                'module' => $act['module'] ?: '-',
                'ref_id' => $act['ref_id'] ?: null,
                'old_value' => '-',
                'new_value' => '-',
                'note' => '',
                'activity_details' => $act['details'] ?? '',
                'details' => $act['details'] ?? 'กิจกรรมของระบบ',
                'log_date' => $act['log_date']
            ];
        }
    } else {
        // 'unified' mode: Deduplicate matching events between status_history & activity_logs
        foreach ($histories as $h) {
            $time = strtotime($h['log_date']);
            $bucket = floor($time / 5);
            $matched_act = null;

            foreach ([$bucket, $bucket - 1, $bucket + 1] as $b) {
                $key = ($h['module'] ?? '') . '_' . ($h['ref_id'] ?? '') . '_' . ($h['user'] ?? '') . '_' . $b;
                if (isset($activity_index[$key])) {
                    foreach ($activity_index[$key] as $act) {
                        if (!isset($used_activity_ids[$act['id']])) {
                            $matched_act = $act;
                            $used_activity_ids[$act['id']] = true;
                            break 2;
                        }
                    }
                }
            }

            $entry = [
                'id' => 'sh-' . $h['id'] . ($matched_act ? '_al-' . $matched_act['id'] : ''),
                'source' => $matched_act ? 'unified' : 'status',
                'source_label' => $matched_act ? 'สมบูรณ์ (กิจกรรม+สถานะ)' : 'ประวัติสถานะ',
                'user' => $h['user'] ?: ($matched_act['user'] ?? 'ระบบ'),
                'action' => $h['action'] ?: ($matched_act['action'] ?? 'อัปเดต'),
                'module' => $h['module'] ?: ($matched_act['module'] ?? '-'),
                'ref_id' => $h['ref_id'] ?: ($matched_act['ref_id'] ?? null),
                'old_value' => $h['old_value'] ?? '-',
                'new_value' => $h['new_value'] ?? '-',
                'note' => $h['note'] ?? '',
                'activity_details' => $matched_act['details'] ?? '',
                'log_date' => $h['log_date']
            ];

            // Build rich combined details
            $details = '';
            if (!empty($h['note'])) {
                $details = $h['note'];
            } elseif (!empty($h['old_value']) || !empty($h['new_value'])) {
                $details = "สถานะ: " . ($h['old_value'] ?: '-') . " -> " . ($h['new_value'] ?: '-');
            }
            if (!empty($matched_act['details']) && $details !== $matched_act['details']) {
                $details .= (!empty($details) ? ' | ' : '') . $matched_act['details'];
            }
            $entry['details'] = $details ?: ($matched_act['details'] ?? 'ปรับปรุงข้อมูล');

            $unified_logs[] = $entry;
        }

        // Add remaining standalone activities (e.g. ADD, DELETE, PASSWORD_RESET)
        foreach ($activities as $act) {
            if (!isset($used_activity_ids[$act['id']])) {
                $unified_logs[] = [
                    'id' => 'al-' . $act['id'],
                    'source' => 'activity',
                    'source_label' => 'กิจกรรมระบบ',
                    'user' => $act['user'] ?: 'ระบบ',
                    'action' => $act['action'] ?: 'ACTION',
                    'module' => $act['module'] ?: '-',
                    'ref_id' => $act['ref_id'] ?: null,
                    'old_value' => '-',
                    'new_value' => '-',
                    'note' => '',
                    'activity_details' => $act['details'] ?? '',
                    'details' => $act['details'] ?? 'กิจกรรมของระบบ',
                    'log_date' => $act['log_date']
                ];
            }
        }
    }

    // Sort by log_date DESC
    usort($unified_logs, function($a, $b) {
        return strtotime($b['log_date']) - strtotime($a['log_date']);
    });

    // Batch work metadata lookup
    $ids_by_module = ['survey' => [], 'registration' => [], 'academic' => [], 'admin' => []];
    foreach ($unified_logs as $l) {
        if (!empty($l['ref_id']) && is_numeric($l['ref_id']) && isset($ids_by_module[$l['module']])) {
            $ids_by_module[$l['module']][$l['ref_id']] = true;
        }
    }

    $work_metadata = [];
    if (!empty($ids_by_module['survey'])) {
        $ids = array_keys($ids_by_module['survey']);
        $in = implode(',', array_map('intval', $ids));
        $q = $conn->query("SELECT id, received_seq, survey_type as subject, applicant, men as responsible_staff, rv_12, status_cause, completion_date FROM survey_works WHERE id IN ($in)");
        while ($row = $q->fetch(PDO::FETCH_ASSOC)) {
            $work_metadata['survey'][$row['id']] = $row;
        }
    }
    if (!empty($ids_by_module['registration'])) {
        $ids = array_keys($ids_by_module['registration']);
        $in = implode(',', array_map('intval', $ids));
        $q = $conn->query("SELECT id, seq_no as received_seq, subject, related_person as applicant, responsible_person as responsible_staff, status_cause, completion_date FROM registration_works WHERE id IN ($in)");
        while ($row = $q->fetch(PDO::FETCH_ASSOC)) {
            $work_metadata['registration'][$row['id']] = $row;
        }
    }
    if (!empty($ids_by_module['academic'])) {
        $ids = array_keys($ids_by_module['academic']);
        $in = implode(',', array_map('intval', $ids));
        $q = $conn->query("SELECT id, seq_no as received_seq, subject, related_person as applicant, responsible_person as responsible_staff, status_cause, completion_date FROM academic_works WHERE id IN ($in)");
        while ($row = $q->fetch(PDO::FETCH_ASSOC)) {
            $work_metadata['academic'][$row['id']] = $row;
        }
    }
    if (!empty($ids_by_module['admin'])) {
        $ids = array_keys($ids_by_module['admin']);
        $in = implode(',', array_map('intval', $ids));
        $q = $conn->query("SELECT id, seq_no as received_seq, subject, related_person as applicant, responsible_person as responsible_staff, status_cause, completion_date FROM administration_works WHERE id IN ($in)");
        while ($row = $q->fetch(PDO::FETCH_ASSOC)) {
            $work_metadata['admin'][$row['id']] = $row;
        }
    }

    // Attach work metadata and prepare statistics
    $allUsers = [];
    $allModules = ['survey' => 0, 'registration' => 0, 'academic' => 0, 'admin' => 0];
    $actionCounts = ['status' => 0, 'update' => 0, 'add' => 0, 'delete' => 0, 'other' => 0];
    $userActivityCounts = [];
    $uniqueWorks = [];
    $deleteCount = 0;

    $todayCount = 0;
    $todayUniqueWorks = [];
    $todayUsers = [];
    $todayDeletes = 0;
    $todayFeedGroups = [];

    foreach ($unified_logs as &$l) {
        $module = $l['module'];
        $refId = $l['ref_id'];
        $userName = $l['user'] ?: 'ระบบ';
        $logDate = $l['log_date'];
        $logDay = substr($logDate, 0, 10);

        // Attach work_meta
        if (!empty($refId) && isset($work_metadata[$module][$refId])) {
            $l['work_meta'] = $work_metadata[$module][$refId];
        } else {
            $l['work_meta'] = null;
        }

        // Action normalization
        $actUpper = strtoupper($l['action']);
        $actionCat = 'other';
        if (strpos($actUpper, 'DELETE') !== false || strpos($actUpper, 'ลบ') !== false) {
            $actionCat = 'delete';
            $deleteCount++;
            if ($logDay === $today) $todayDeletes++;
        } elseif (strpos($actUpper, 'ADD') !== false || strpos($actUpper, 'เพิ่ม') !== false) {
            $actionCat = 'add';
        } elseif (strpos($actUpper, 'STATUS') !== false || strpos($actUpper, 'สถานะ') !== false) {
            $actionCat = 'status';
        } elseif (strpos($actUpper, 'UPDATE') !== false || strpos($actUpper, 'อัปเดต') !== false || strpos($actUpper, 'แก้ไข') !== false) {
            $actionCat = 'update';
        }
        $l['action_category'] = $actionCat;

        // Statistics
        $allUsers[$userName] = true;
        if (isset($allModules[$module])) {
            $allModules[$module]++;
        }
        $actionCounts[$actionCat]++;
        $userActivityCounts[$userName] = ($userActivityCounts[$userName] ?? 0) + 1;

        if ($refId) {
            $uniqueWorks[$module . '_' . $refId] = true;
        }

        // Today Feed processing
        if ($logDay === $today) {
            $todayCount++;
            $todayUsers[$userName] = true;
            $workKey = $module . '_' . ($refId ?: ('act_' . $l['id']));
            $todayUniqueWorks[$workKey] = true;

            if (!isset($todayFeedGroups[$workKey])) {
                $todayFeedGroups[$workKey] = [
                    'work_key' => $workKey,
                    'module' => $module,
                    'ref_id' => $refId,
                    'work_meta' => $l['work_meta'],
                    'latest_date' => $logDate,
                    'latest_user' => $userName,
                    'edits_count' => 0,
                    'events' => []
                ];
            }
            $todayFeedGroups[$workKey]['edits_count']++;
            $todayFeedGroups[$workKey]['events'][] = [
                'id' => $l['id'],
                'time' => substr($logDate, 11, 8),
                'user' => $userName,
                'action' => $l['action'],
                'action_category' => $actionCat,
                'details' => $l['details'],
                'old_value' => $l['old_value'],
                'new_value' => $l['new_value']
            ];
        }
    }

    // Top active users
    arsort($userActivityCounts);
    $topUsers = [];
    foreach (array_slice($userActivityCounts, 0, 8, true) as $u => $cnt) {
        $topUsers[] = ['user' => $u, 'count' => $cnt];
    }

    // Summary payload
    $summary = [
        'total_logs' => count($unified_logs),
        'unique_works_count' => count($uniqueWorks),
        'active_users_count' => count($allUsers),
        'delete_count' => $deleteCount,
        'today' => [
            'date' => $today,
            'total_logs' => $todayCount,
            'unique_works_count' => count($todayUniqueWorks),
            'active_users_count' => count($todayUsers),
            'delete_count' => $todayDeletes
        ],
        'by_department' => $allModules,
        'by_action' => $actionCounts,
        'top_users' => $topUsers
    ];

    // Filter by action_type if passed
    if ($filterAction !== 'all' && $filterAction !== '') {
        $filterActUpper = strtoupper($filterAction);
        $unified_logs = array_values(array_filter($unified_logs, function($item) use ($filterActUpper) {
            return strtoupper($item['action_category']) === $filterActUpper || strtoupper($item['action']) === $filterActUpper;
        }));
    }

    // Support flat format for backwards compatibility
    if (isset($_GET['format']) && $_GET['format'] === 'flat') {
        echo json_encode($unified_logs, JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Standard Rich Response
    echo json_encode([
        'status' => 'success',
        'summary' => $summary,
        'today_feed' => array_values($todayFeedGroups),
        'logs' => $unified_logs,
        'users_list' => array_keys($allUsers),
        'departments_list' => ['survey', 'registration', 'academic', 'admin'],
        'db_today' => $today
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
?>
