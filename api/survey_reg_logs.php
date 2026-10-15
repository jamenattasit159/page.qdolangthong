<?php
/**
 * Survey Registration Logs API
 * จัดการ log การบันทึกจำนวนการรับงานจากฝ่ายทะเบียน (เฉพาะฝ่ายรังวัด)
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
     * Update monthly KPI report for Survey department's received work from Registration.
     *
     * @param PDO    $conn
     * @param string $yearMonth  Format: YYYY-MM
     * @param int    $delta      Positive to add, negative to subtract
     * @param string $createdBy
     */
    function updateMonthlyKPIForSurveyReg($conn, $yearMonth, $delta, $createdBy = null)
    {
        if (!$yearMonth || $delta === 0) {
            return;
        }

        // If adding, use upsert-add semantics (requires unique_month_dept)
        if ($delta > 0) {
            $sql = "INSERT INTO monthly_kpi_reports (years_month, department, survey_received_from_reg, created_by)
                    VALUES (?, 'survey', ?, ?)
                    ON DUPLICATE KEY UPDATE
                        survey_received_from_reg = survey_received_from_reg + VALUES(survey_received_from_reg),
                        updated_at = CURRENT_TIMESTAMP";
            $stmt = $conn->prepare($sql);
            $stmt->execute([$yearMonth, $delta, $createdBy]);
            return;
        }

        // If subtracting, clamp at zero to avoid negative totals
        $abs = abs((int) $delta);
        $sql = "UPDATE monthly_kpi_reports
                SET
                    survey_received_from_reg = GREATEST(survey_received_from_reg - ?, 0),
                    updated_at = CURRENT_TIMESTAMP
                WHERE years_month = ? AND department = 'survey'";
        $stmt = $conn->prepare($sql);
        $stmt->execute([$abs, $yearMonth]);
    }

    switch ($method) {
        case 'GET':
            // Get logs
            $yearMonth = $_GET['year_month'] ?? null;

            $sql = "SELECT * FROM survey_registration_logs WHERE 1=1";
            $params = [];

            if ($yearMonth) {
                $sql .= " AND DATE_FORMAT(record_date, '%Y-%m') = ?";
                $params[] = $yearMonth;
            }

            $sql .= " ORDER BY record_date DESC, created_at DESC";

            $stmt = $conn->prepare($sql);
            $stmt->execute($params);
            $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Summary
            $summarySQL = "SELECT 
                SUM(count) as total_count,
                COUNT(*) as record_count
                FROM survey_registration_logs 
                WHERE 1=1";

            $summaryParams = [];
            if ($yearMonth) {
                $summarySQL .= " AND DATE_FORMAT(record_date, '%Y-%m') = ?";
                $summaryParams[] = $yearMonth;
            }

            $stmt = $conn->prepare($summarySQL);
            $stmt->execute($summaryParams);
            $summary = $stmt->fetch(PDO::FETCH_ASSOC);

            echo json_encode([
                'status' => 'success',
                'logs' => $logs,
                'summary' => $summary
            ]);
            break;

        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true);

            $recordDate = $data['record_date'] ?? date('Y-m-d');
            $count = (int) ($data['count'] ?? 0);
            $notes = $data['notes'] ?? null;
            $createdBy = $data['created_by'] ?? 'ผู้ดูแลระบบ';

            if ($count <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'count must be greater than 0']);
                exit;
            }

            $conn->beginTransaction();

            try {
                $sql = "INSERT INTO survey_registration_logs (record_date, count, notes, created_by) 
                        VALUES (?, ?, ?, ?)";
                $stmt = $conn->prepare($sql);
                $stmt->execute([$recordDate, $count, $notes, $createdBy]);

                $newId = $conn->lastInsertId();

                // Update KPI
                $yearMonth = date('Y-m', strtotime($recordDate));
                updateMonthlyKPIForSurveyReg($conn, $yearMonth, $count, $createdBy);

                $conn->commit();

                echo json_encode([
                    'status' => 'success',
                    'message' => 'บันทึกสำเร็จ',
                    'id' => $newId,
                    'data' => [
                        'id' => $newId,
                        'record_date' => $recordDate,
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
            $data = json_decode(file_get_contents('php://input'), true);

            $id = $data['id'] ?? null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'id is required']);
                exit;
            }

            $stmt = $conn->prepare("SELECT record_date, count FROM survey_registration_logs WHERE id = ?");
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
                $sql = "UPDATE survey_registration_logs SET " . implode(', ', $updateFields) . " WHERE id = ?";
                $stmt = $conn->prepare($sql);
                $stmt->execute($params);

                // KPI adjustment
                $newRecordDate = $data['record_date'] ?? $old['record_date'];
                $newCount = isset($data['count']) ? (int) $data['count'] : (int) $old['count'];
                $newCreatedBy = $data['created_by'] ?? null;

                $oldYearMonth = date('Y-m', strtotime($old['record_date']));
                $newYearMonth = date('Y-m', strtotime($newRecordDate));

                // Subtract old
                updateMonthlyKPIForSurveyReg($conn, $oldYearMonth, -(int) $old['count'], $newCreatedBy);
                // Add new
                updateMonthlyKPIForSurveyReg($conn, $newYearMonth, $newCount, $newCreatedBy);

                $conn->commit();

                echo json_encode(['status' => 'success', 'message' => 'อัปเดตสำเร็จ']);
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }
            break;

        case 'DELETE':
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? null;

            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'id is required']);
                exit;
            }

            $stmt = $conn->prepare("SELECT record_date, count FROM survey_registration_logs WHERE id = ?");
            $stmt->execute([$id]);
            $old = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$old) {
                http_response_code(404);
                echo json_encode(['error' => 'log not found']);
                exit;
            }

            $conn->beginTransaction();

            try {
                $sql = "DELETE FROM survey_registration_logs WHERE id = ?";
                $stmt = $conn->prepare($sql);
                $stmt->execute([$id]);

                // Subtract from KPI
                $oldYearMonth = date('Y-m', strtotime($old['record_date']));
                updateMonthlyKPIForSurveyReg($conn, $oldYearMonth, -(int) $old['count'], null);

                $conn->commit();

                echo json_encode(['status' => 'success', 'message' => 'ลบสำเร็จ']);
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
