<?php
/**
 * Same-Day Completion Logs API
 * จัดการ log การบันทึกงานเกิดเสร็จวันเดียว
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

include_once 'db.php';

try {
    $method = $_SERVER['REQUEST_METHOD'];

    /**
     * Update monthly KPI report for same-day completion entries.
     * We treat same-day completions as "completed within 30 days" for KPI purposes.
     *
     * @param PDO    $conn
     * @param string $yearMonth  Format: YYYY-MM
     * @param string $department survey|registration|academic
     * @param int    $delta      Positive to add, negative to subtract
     * @param string $createdBy
     */
    function updateMonthlyKPIForSameDay($conn, $yearMonth, $department, $delta, $createdBy = null)
    {
        if (!$yearMonth || !$department || $delta === 0) {
            return;
        }

        // Only allow known departments for KPI table
        if (!in_array($department, ['survey', 'registration', 'academic'], true)) {
            return;
        }

        // If adding, use upsert-add semantics (requires unique_month_dept)
        if ($delta > 0) {
            $sql = "INSERT INTO monthly_kpi_reports (years_month, department, new_work_completed, completed_within_30, created_by)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        new_work_completed = new_work_completed + VALUES(new_work_completed),
                        completed_within_30 = completed_within_30 + VALUES(completed_within_30),
                        updated_at = CURRENT_TIMESTAMP";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$yearMonth, $department, $delta, $delta, $createdBy]);
            return;
        }

        // If subtracting, clamp at zero to avoid negative totals
        $abs = abs((int) $delta);
        $sql = "UPDATE monthly_kpi_reports
                SET
                    new_work_completed = GREATEST(new_work_completed - ?, 0),
                    completed_within_30 = GREATEST(completed_within_30 - ?, 0),
                    updated_at = CURRENT_TIMESTAMP
                WHERE years_month = ? AND department = ?";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$abs, $abs, $yearMonth, $department]);
    }

    switch ($method) {
        case 'GET':
            // Get logs with optional filters
            $department = $_GET['department'] ?? null;
            $startDate = $_GET['start_date'] ?? null;
            $endDate = $_GET['end_date'] ?? null;
            $yearMonth = $_GET['year_month'] ?? null;

            $sql = "SELECT * FROM sameday_completion_logs WHERE 1=1";
            $params = [];

            if ($department && $department !== 'all') {
                $sql .= " AND department = ?";
                $params[] = $department;
            }

            if ($yearMonth) {
                // Filter by year-month (e.g., 2026-01)
                $sql .= " AND DATE_FORMAT(record_date, '%Y-%m') = ?";
                $params[] = $yearMonth;
            } else {
                if ($startDate) {
                    $sql .= " AND record_date >= ?";
                    $params[] = $startDate;
                }
                if ($endDate) {
                    $sql .= " AND record_date <= ?";
                    $params[] = $endDate;
                }
            }

            $sql .= " ORDER BY record_date DESC, created_at DESC";

            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Also get summary by department for the period
            $summarySQL = "SELECT 
                department,
                SUM(count) as total_count,
                COUNT(*) as record_count
                FROM sameday_completion_logs 
                WHERE 1=1";

            $summaryParams = [];
            if ($yearMonth) {
                $summarySQL .= " AND DATE_FORMAT(record_date, '%Y-%m') = ?";
                $summaryParams[] = $yearMonth;
            }

            $summarySQL .= " GROUP BY department";

            $stmt = $conn->prepare($summarySQL);
            $stmt->execute($summaryParams);
            $summary = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'status' => 'success',
                'logs' => $logs,
                'summary' => $summary
            ]);
            break;

        case 'POST':
            // Add new log entry
            $data = json_decode(file_get_contents('php://input'), true);

            $recordDate = $data['record_date'] ?? date('Y-m-d');
            $department = $data['department'] ?? null;
            $count = (int) ($data['count'] ?? 0);
            $notes = $data['notes'] ?? null;
            $createdBy = $data['created_by'] ?? 'ผู้ดูแลระบบ';

            if (!$department) {
                http_response_code(400);
                echo json_encode(['error' => 'department is required']);
                exit;
            }

            if ($count <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'count must be greater than 0']);
                exit;
            }

            $conn->beginTransaction();

            try {
                $sql = "INSERT INTO sameday_completion_logs (record_date, department, count, notes, created_by) 
                        VALUES (?, ?, ?, ?, ?)";
                $stmt = $conn->prepare($sql);
                $stmt->execute([$recordDate, $department, $count, $notes, $createdBy]);

                $newId = $conn->lastInsertId();

                // Also update monthly KPI reports (monthly_kpi_reports)
                $yearMonth = date('Y-m', strtotime($recordDate));
                updateMonthlyKPIForSameDay($conn, $yearMonth, $department, $count, $createdBy);

                $conn->commit();

                echo json_encode([
                    'status' => 'success',
                    'message' => 'บันทึกสำเร็จ',
                    'id' => $newId,
                    'kpi_updated' => true,
                    'data' => [
                        'id' => $newId,
                        'record_date' => $recordDate,
                        'department' => $department,
                        'count' => $count,
                        'notes' => $notes,
                        'created_by' => $createdBy
                    ]
                ]);
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }
            break;

        case 'PUT':
            // Update existing log entry
            $data = json_decode(file_get_contents('php://input'), true);

            $id = $data['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'id is required']);
                exit;
            }

            // Load existing entry for KPI adjustment
            $stmt = $conn->prepare("SELECT record_date, department, count FROM sameday_completion_logs WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$old) {
                http_response_code(404);
                echo json_encode(['error' => 'log not found']);
                exit;
            }

            $updateFields = [];
            $params = [];

            if (isset($data['record_date'])) {
                $updateFields[] = "record_date = ?";
                $params[] = $data['record_date'];
            }
            if (isset($data['department'])) {
                $updateFields[] = "department = ?";
                $params[] = $data['department'];
            }
            if (isset($data['count'])) {
                $updateFields[] = "count = ?";
                $params[] = (int) $data['count'];
            }
            if (isset($data['notes'])) {
                $updateFields[] = "notes = ?";
                $params[] = $data['notes'];
            }

            if (empty($updateFields)) {
                echo json_encode(['status' => 'success', 'message' => 'No fields to update']);
                exit;
            }

            $conn->beginTransaction();

            try {
                $params[] = $id;
                $sql = "UPDATE sameday_completion_logs SET " . implode(', ', $updateFields) . " WHERE id = ?";
                $stmt = $conn->prepare($sql);
                $stmt->execute($params);

                // KPI adjustment: subtract old, add new (based on updated values)
                $newRecordDate = $data['record_date'] ?? $old['record_date'];
                $newDepartment = $data['department'] ?? $old['department'];
                $newCount = isset($data['count']) ? (int) $data['count'] : (int) $old['count'];
                $newCreatedBy = $data['created_by'] ?? ($data['updated_by'] ?? ($data['changed_by'] ?? null));

                $oldYearMonth = date('Y-m', strtotime($old['record_date']));
                $newYearMonth = date('Y-m', strtotime($newRecordDate));

                // Subtract old
                updateMonthlyKPIForSameDay($conn, $oldYearMonth, $old['department'], -((int) $old['count']), $newCreatedBy);
                // Add new
                updateMonthlyKPIForSameDay($conn, $newYearMonth, $newDepartment, $newCount, $newCreatedBy);

                $conn->commit();

                echo json_encode([
                    'status' => 'success',
                    'message' => 'อัปเดตสำเร็จ',
                    'kpi_updated' => true
                ]);
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }
            break;

        case 'DELETE':
            // Delete log entry
            $data = json_decode(file_get_contents('php://input'), true);

            $id = $data['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'id is required']);
                exit;
            }

            // Load existing entry for KPI adjustment
            $stmt = $conn->prepare("SELECT record_date, department, count FROM sameday_completion_logs WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$old) {
                http_response_code(404);
                echo json_encode(['error' => 'log not found']);
                exit;
            }

            $conn->beginTransaction();

            try {
                $sql = "DELETE FROM sameday_completion_logs WHERE id = ?";
                $stmt = $conn->prepare($sql);
                $stmt->execute([$id]);

                // Subtract from KPI if log existed
                $oldYearMonth = date('Y-m', strtotime($old['record_date']));
                updateMonthlyKPIForSameDay($conn, $oldYearMonth, $old['department'], -((int) $old['count']), null);

                $conn->commit();

                echo json_encode([
                    'status' => 'success',
                    'message' => 'ลบสำเร็จ',
                    'kpi_updated' => true
                ]);
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
} catch (Exception $e) {
    if (isset($conn) && $conn->inTransaction()) {
        $conn->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>