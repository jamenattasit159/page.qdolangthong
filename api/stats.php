<?php
/**
 * Stats API - Optimized with Caching
 * คำนวณยอดสรุปจากหลังบ้านเพื่อให้ Dashboard ทำงานได้รวดเร็ว
 * 
 * ⚡ Optimizations:
 * 1. File-based caching (ลด DB queries ซ้ำๆ)
 * 2. Single aggregated SQL query per table
 * 3. Prepared statements
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

include_once 'db.php';

// ⚡ Cache Configuration
$CACHE_ENABLED = true;
$CACHE_TTL = 300; // seconds (5 minutes - ลด DB queries ซ้ำๆ)
$CACHE_DIR = __DIR__ . '/cache';
$CACHE_FILE = $CACHE_DIR . '/stats_cache.json';

// Create cache directory if not exists
if ($CACHE_ENABLED && !is_dir($CACHE_DIR)) {
    @mkdir($CACHE_DIR, 0755, true);
}

// Check cache first
if (isset($_GET['refresh']) && ($_GET['refresh'] === 'true' || $_GET['refresh'] === '1')) {
    @unlink($CACHE_FILE);
}

if ($CACHE_ENABLED && file_exists($CACHE_FILE)) {
    $cacheAge = time() - filemtime($CACHE_FILE);
    if ($cacheAge < $CACHE_TTL) {
        // Return cached data
        echo file_get_contents($CACHE_FILE);
        exit();
    }
}

try {
    $department = $_GET['department'] ?? 'all';

    $tableMap = [
        'survey' => 'survey_works',
        'registration' => 'registration_works',
        'academic' => 'academic_works',
        'admin' => 'administration_works'
    ];

    $tables = ($department === 'all') ? array_values($tableMap) : [$tableMap[$department]];

    $stats = [
        'total' => 0,
        'pending' => 0,
        'completed' => 0,
        'over30' => 0,
        'over60' => 0,
        'type2' => 0,
        'type3' => 0,
        'type4' => 0,
        'pendingByDept' => [
            'ฝ่ายรังวัด' => 0,
            'ฝ่ายทะเบียน' => 0,
            'กลุ่มงานวิชาการ' => 0,
            'ฝ่ายอำนวยการ' => 0
        ],
        'pendingBreakdown' => [
            'ฝ่ายรังวัด' => ['type2' => 0, 'type3' => 0, 'type4' => 0, 'other' => 0],
            'ฝ่ายทะเบียน' => ['type2' => 0, 'type3' => 0, 'type4' => 0, 'other' => 0],
            'กลุ่มงานวิชาการ' => ['type2' => 0, 'type3' => 0, 'type4' => 0, 'other' => 0],
            'ฝ่ายอำนวยการ' => ['type2' => 0, 'type3' => 0, 'type4' => 0, 'other' => 0]
        ],
        'kpi' => [
            'oldWork' => ['total' => 0, 'pending' => 0, 'completed' => 0, 'percent' => 0],
            'newWork' => ['total' => 0, 'within30' => 0, 'within60' => 0]
        ]
    ];

    $deptLabelMap = [
        'survey_works' => 'ฝ่ายรังวัด',
        'registration_works' => 'ฝ่ายทะเบียน',
        'academic_works' => 'กลุ่มงานวิชาการ',
        'administration_works' => 'ฝ่ายอำนวยการ'
    ];

    $baselineDate = '2025-12-31';
    $newWorkStartDate = '2026-01-01';
    $now = date('Y-m-d');

    foreach ($tables as $table) {
        $label = $deptLabelMap[$table];

        $startDateExpr = ($table === 'survey_works')
            ? "(CASE WHEN received_date >= '2026-01-01' AND survey_date IS NOT NULL AND survey_date != '0000-00-00' THEN survey_date ELSE received_date END)"
            : "received_date";

        // 1. Basic counts
        $sql = "SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN (completion_date IS NULL OR completion_date = '0000-00-00') THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN (completion_date IS NOT NULL AND completion_date != '0000-00-00') THEN 1 ELSE 0 END) as completed,
                    
                    -- Over 30/60 days (Pending only)
                    SUM(CASE WHEN (completion_date IS NULL OR completion_date = '0000-00-00')
                             AND progress_type NOT IN (2, 3)
                             AND DATEDIFF(:now1, {$startDateExpr}) > 60 THEN 1 ELSE 0 END) as over60,
                    SUM(CASE WHEN (completion_date IS NULL OR completion_date = '0000-00-00')
                             AND progress_type NOT IN (2, 3)
                             AND DATEDIFF(:now2, {$startDateExpr}) > 30 
                             AND DATEDIFF(:now3, {$startDateExpr}) <= 60 THEN 1 ELSE 0 END) as over30,
                    
                    -- Pending Breakdown
                    SUM(CASE WHEN (completion_date IS NULL OR completion_date = '0000-00-00') AND progress_type = 2 THEN 1 ELSE 0 END) as type2,
                    SUM(CASE WHEN (completion_date IS NULL OR completion_date = '0000-00-00') AND progress_type = 3 THEN 1 ELSE 0 END) as type3,
                    SUM(CASE WHEN (completion_date IS NULL OR completion_date = '0000-00-00') AND progress_type = 4 THEN 1 ELSE 0 END) as type4,
                    SUM(CASE WHEN (completion_date IS NULL OR completion_date = '0000-00-00') AND progress_type NOT IN (2, 3, 4) THEN 1 ELSE 0 END) as other_pending,

                    -- KPI Old Work (<= 2025-12-31)
                    SUM(CASE WHEN received_date <= :baseline1 THEN 1 ELSE 0 END) as old_total,
                    SUM(CASE WHEN received_date <= :baseline2 AND (completion_date IS NULL OR completion_date = '0000-00-00') THEN 1 ELSE 0 END) as old_pending,
                    SUM(CASE WHEN received_date <= :baseline3 AND (completion_date IS NOT NULL AND completion_date != '0000-00-00') THEN 1 ELSE 0 END) as old_completed,

                    -- KPI New Work (>= 2026-01-01)
                    SUM(CASE WHEN received_date >= :newstart1 THEN 1 ELSE 0 END) as new_total,
                    SUM(CASE WHEN received_date >= :newstart2 AND (completion_date IS NOT NULL AND completion_date != '0000-00-00') AND DATEDIFF(completion_date, {$startDateExpr}) <= 30 THEN 1 ELSE 0 END) as new_within30,
                    SUM(CASE WHEN received_date >= :newstart3 AND (completion_date IS NOT NULL AND completion_date != '0000-00-00') AND DATEDIFF(completion_date, {$startDateExpr}) > 30 AND DATEDIFF(completion_date, {$startDateExpr}) <= 60 THEN 1 ELSE 0 END) as new_within60
                FROM $table";

        $stmt = $conn->prepare($sql);
        $stmt->execute([
            'now1' => $now,
            'now2' => $now,
            'now3' => $now,
            'baseline1' => $baselineDate,
            'baseline2' => $baselineDate,
            'baseline3' => $baselineDate,
            'newstart1' => $newWorkStartDate,
            'newstart2' => $newWorkStartDate,
            'newstart3' => $newWorkStartDate
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        $stats['total'] += (int) $row['total'];
        $stats['pending'] += (int) $row['pending'];
        $stats['completed'] += (int) $row['completed'];
        $stats['over30'] += (int) $row['over30'];
        $stats['over60'] += (int) $row['over60'];
        $stats['type2'] += (int) $row['type2'];
        $stats['type3'] += (int) $row['type3'];
        $stats['type4'] += (int) $row['type4'];

        $stats['pendingByDept'][$label] = (int) $row['pending'];
        $stats['pendingBreakdown'][$label]['type2'] = (int) $row['type2'];
        $stats['pendingBreakdown'][$label]['type3'] = (int) $row['type3'];
        $stats['pendingBreakdown'][$label]['type4'] = (int) $row['type4'];
        $stats['pendingBreakdown'][$label]['other'] = (int) $row['other_pending'];

        $stats['kpi']['oldWork']['total'] += (int) $row['old_total'];
        $stats['kpi']['oldWork']['pending'] += (int) $row['old_pending'];
        $stats['kpi']['oldWork']['completed'] += (int) $row['old_completed'];

        $stats['kpi']['newWork']['total'] += (int) $row['new_total'];
        // Note: These are raw counts, percentages will be calculated at the end
        $stats['kpi']['newWork']['_within30'] = ($stats['kpi']['newWork']['_within30'] ?? 0) + (int) $row['new_within30'];
        $stats['kpi']['newWork']['_within60'] = ($stats['kpi']['newWork']['_within60'] ?? 0) + (int) $row['new_within60'];
    }

    // Final calculations
    if ($stats['kpi']['oldWork']['total'] > 0) {
        $stats['kpi']['oldWork']['percent'] = ($stats['kpi']['oldWork']['completed'] / $stats['kpi']['oldWork']['total']) * 100;
    }

    if ($stats['kpi']['newWork']['total'] > 0) {
        $stats['kpi']['newWork']['within30'] = ($stats['kpi']['newWork']['_within30'] / $stats['kpi']['newWork']['total']) * 100;
        $stats['kpi']['newWork']['within60'] = ($stats['kpi']['newWork']['_within60'] / $stats['kpi']['newWork']['total']) * 100;
    }

    // Clean up temporary fields
    unset($stats['kpi']['newWork']['_within30']);
    unset($stats['kpi']['newWork']['_within60']);

    // Prepare JSON output
    $output = json_encode($stats);

    // ⚡ Save to cache for next request
    if ($CACHE_ENABLED && $department === 'all') {
        @file_put_contents($CACHE_FILE, $output);
    }

    echo $output;

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
