<?php
/**
 * Import API - Handle Excel/CSV file uploads and import data
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

include_once 'db.php';

// Check if PhpSpreadsheet is available, otherwise use simple CSV parsing
$usePhpSpreadsheet = file_exists(__DIR__ . '/../vendor/autoload.php');
if ($usePhpSpreadsheet) {
    require __DIR__ . '/../vendor/autoload.php';
}

function parseCSV($filePath)
{
    $data = [];
    if (($handle = fopen($filePath, "r")) !== FALSE) {
        $headers = fgetcsv($handle, 1000, ",");
        // Clean BOM from first header if present
        if (!empty($headers[0])) {
            $headers[0] = preg_replace('/^\xEF\xBB\xBF/', '', $headers[0]);
        }
        while (($row = fgetcsv($handle, 1000, ",")) !== FALSE) {
            if (count($row) >= count($headers)) {
                $data[] = array_combine($headers, array_slice($row, 0, count($headers)));
            }
        }
        fclose($handle);
    }
    return $data;
}

function parseExcel($filePath)
{
    global $usePhpSpreadsheet;

    if (!$usePhpSpreadsheet) {
        // Fallback: Try to read as CSV if no PhpSpreadsheet
        return parseCSV($filePath);
    }

    $data = [];
    try {
        $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($filePath);
        $worksheet = $spreadsheet->getActiveSheet();
        $rows = $worksheet->toArray();

        if (count($rows) > 0) {
            $headers = array_shift($rows);
            foreach ($rows as $row) {
                if (!empty(array_filter($row))) {
                    $data[] = array_combine($headers, $row);
                }
            }
        }
    } catch (Exception $e) {
        throw new Exception("Cannot read Excel file: " . $e->getMessage());
    }

    return $data;
}

function calculateProgressType($receivedDate)
{
    if (empty($receivedDate))
        return 1;

    try {
        $received = new DateTime($receivedDate);
        $today = new DateTime();
        $diff = $today->diff($received)->days;

        // If older than 30 days, set as งานค้าง (type 4)
        return ($diff > 30) ? 4 : 1;
    } catch (Exception $e) {
        return 1;
    }
}

function normalizeDate($dateStr)
{
    if (empty($dateStr))
        return null;

    // Try various date formats
    $formats = ['Y-m-d', 'd/m/Y', 'm/d/Y', 'd-m-Y', 'Y/m/d'];
    foreach ($formats as $format) {
        $date = DateTime::createFromFormat($format, trim($dateStr));
        if ($date) {
            return $date->format('Y-m-d');
        }
    }

    // Try Excel serial date (if numeric)
    if (is_numeric($dateStr)) {
        $unix = ($dateStr - 25569) * 86400;
        if ($unix > 0) {
            return date('Y-m-d', $unix);
        }
    }

    return null;
}

function generateSeqNo($workType, $conn, $tableName)
{
    $seqColumns = [
        'survey' => 'received_seq',
        'registration' => 'seq_no',
        'academic' => 'seq_no',
        'admin' => 'seq_no'
    ];

    $prefixes = [
        'survey' => 'SRV',
        'registration' => 'REG',
        'academic' => 'ACD',
        'admin' => 'ADM'
    ];

    $seqCol = $seqColumns[$workType];
    $prefix = $prefixes[$workType];

    // Get current max ID from table to generate next sequence
    $stmt = $conn->query("SELECT COUNT(*) + 1 as next_num FROM $tableName");
    $nextNum = $stmt->fetchColumn();

    return $prefix . '-' . str_pad($nextNum, 4, '0', STR_PAD_LEFT);
}

// Main handler
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('Method not allowed');
    }

    $workType = $_POST['work_type'] ?? null;

    if (!$workType || !in_array($workType, ['survey', 'registration', 'academic', 'admin'])) {
        throw new Exception('Invalid work type');
    }

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        throw new Exception('No file uploaded or upload error');
    }

    $file = $_FILES['file'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

    if (!in_array($ext, ['csv', 'xlsx', 'xls'])) {
        throw new Exception('Invalid file type. Only CSV and Excel files are allowed.');
    }

    // Parse file
    $data = ($ext === 'csv') ? parseCSV($file['tmp_name']) : parseExcel($file['tmp_name']);

    if (empty($data)) {
        throw new Exception('No data found in file');
    }

    // Column mapping based on work type
    $columnMaps = [
        'survey' => [
            'วันที่รับ' => 'received_date',
            'วันรังวัด' => 'survey_date',
            'ประเภทรังวัด' => 'survey_type',
            'ผู้ขอ' => 'applicant',
            'สรุปเรื่อง' => 'summary',
            'สาเหตุค้าง' => 'status_cause',
            'คนคุมเรื่อง' => 'men',
            'เลข รว.12' => 'rv_12'
        ],
        'registration' => [
            'วันที่รับ' => 'received_date',
            'เรื่อง' => 'subject',
            'ผู้เกี่ยวข้อง' => 'related_person',
            'สรุปเรื่อง' => 'summary',
            'สาเหตุค้าง' => 'status_cause',
            'ผู้รับผิดชอบ' => 'responsible_person'
        ],
        'academic' => [
            'วันที่รับ' => 'received_date',
            'เรื่อง' => 'subject',
            'ผู้เกี่ยวข้อง' => 'related_person',
            'สรุปเรื่อง' => 'summary',
            'สาเหตุค้าง' => 'status_cause',
            'ผู้รับผิดชอบ' => 'responsible_person'
        ],
        'admin' => [
            'วันที่รับ' => 'received_date',
            'เรื่อง' => 'subject',
            'ผู้เกี่ยวข้อง' => 'related_person',
            'สรุปเรื่อง' => 'summary',
            'สาเหตุค้าง' => 'status_cause',
            'ผู้รับผิดชอบ' => 'responsible_person'
        ]
    ];

    $tableNames = [
        'survey' => 'survey_works',
        'registration' => 'registration_works',
        'academic' => 'academic_works',
        'admin' => 'administration_works'
    ];

    $columnMap = $columnMaps[$workType];
    $tableName = $tableNames[$workType];

    // Process and insert data
    $inserted = 0;
    $updated = 0;
    $skipped = 0;
    $errors = [];

    $conn->beginTransaction();

    $isCompletedFlag = isset($_POST['is_completed']) && $_POST['is_completed'] === '1';
    $isUpdateMode = isset($_POST['import_mode']) && $_POST['import_mode'] === 'update';

    foreach ($data as $idx => $row) {
        try {
            $mappedRow = [];
            foreach ($columnMap as $thaiCol => $dbCol) {
                $value = null;
                foreach ($row as $key => $val) {
                    if (trim($key) === $thaiCol) {
                        $value = trim($val);
                        break;
                    }
                }
                $mappedRow[$dbCol] = $value;
            }

            // Normalize date
            if (!empty($mappedRow['received_date'])) {
                $mappedRow['received_date'] = normalizeDate($mappedRow['received_date']);
            }
            if (!empty($mappedRow['survey_date'])) {
                $mappedRow['survey_date'] = normalizeDate($mappedRow['survey_date']);
            }

            // Skip invalid or empty rows
            // If date is empty or invalid (normalizeDate returns null), skip the row
            if (empty($mappedRow['received_date'])) {
                $skipped++;
                continue;
            }

            // --- UPDATE MODE LOGIC ---
            if ($isUpdateMode) {
                // Find existing record for matching
                // Criteria: Date + Type + Applicant
                $matchSql = "";
                $matchParams = [];

                if ($workType === 'survey') {
                    $matchSql = "SELECT id, status_cause FROM survey_works 
                                WHERE received_date = :received_date 
                                AND survey_type = :survey_type 
                                AND applicant = :applicant 
                                ORDER BY id DESC LIMIT 1";
                    $matchParams = [
                        ':received_date' => $mappedRow['received_date'],
                        ':survey_type' => $mappedRow['survey_type'],
                        ':applicant' => $mappedRow['applicant']
                    ];
                } else {
                    // registration or academic
                    $matchSql = "SELECT id, status_cause FROM $tableName 
                                WHERE received_date = :received_date 
                                AND subject = :subject 
                                AND related_person = :related_person 
                                ORDER BY id DESC LIMIT 1";
                    $matchParams = [
                        ':received_date' => $mappedRow['received_date'],
                        ':subject' => $mappedRow['subject'],
                        ':related_person' => $mappedRow['related_person']
                    ];
                }

                $matchStmt = $conn->prepare($matchSql);
                $matchStmt->execute($matchParams);
                $existing = $matchStmt->fetch(PDO::FETCH_ASSOC);

                if ($existing) {
                    $oldStatus = $existing['status_cause'] ?? '';
                    $newStatus = $mappedRow['status_cause'] ?? '';

                    // Only update if status is different
                    if ($oldStatus !== $newStatus && !empty($newStatus)) {
                        // Update status
                        $updateSql = "UPDATE $tableName SET status_cause = :new_status WHERE id = :id";
                        $updateStmt = $conn->prepare($updateSql);
                        $updateStmt->execute([
                            ':new_status' => $newStatus,
                            ':id' => $existing['id']
                        ]);

                        // Log history
                        $historySql = "INSERT INTO status_history (work_type, work_id, action_type, old_value, new_value, note, changed_by) 
                                      VALUES (?, ?, ?, ?, ?, ?, ?)";
                        $historyStmt = $conn->prepare($historySql);
                        $historyStmt->execute([
                            $workType,
                            $existing['id'],
                            'อัปเดตผ่านการนำเข้าไฟล์',
                            $oldStatus,
                            $newStatus,
                            'อัปเดตแบบกลุ่มจากไฟล์ Excel/CSV',
                            'ระบบกึ่งอัตโนมัติ'
                        ]);

                        $updated++;
                    } else {
                        $skipped++;
                    }
                    continue; // Skip to next row, don't insert
                } else {
                    // Not found in update mode -> Skip or Error? Let's skip and report in errors
                    throw new Exception('ไม่พบข้อมูลงานเดิมเพื่ออัปเดต (ตรวจสอบ วันที่/ประเภท/ผู้ขอ)');
                }
            }
            // --- END UPDATE MODE LOGIC ---

            // If it's a bulk completed import - use today as completion date (like "เสร็จสิ้นวันนี้" button)
            if ($isCompletedFlag) {
                $mappedRow['completion_date'] = date('Y-m-d'); // ใช้วันที่ปัจจุบัน
                // ใช้ประเภทงานที่ส่งมาจาก Modal (ปกติ/สุดขั้นตอน/ศาล)
                $mappedRow['progress_type'] = isset($_POST['progress_type']) ? (int) $_POST['progress_type'] : 1;
                if (empty($mappedRow['status_cause'])) {
                    $mappedRow['status_cause'] = 'เสร็จสิ้น';
                }
            } elseif (isset($_POST['progress_type'])) {
                // ถ้าส่ง progress_type มา (เช่น งานสุดขั้นตอน/งานศาล) ให้ใช้ค่านั้น
                $mappedRow['progress_type'] = (int) $_POST['progress_type'];
            } else {
                // Calculate progress_type based on age (for normal import)
                $mappedRow['progress_type'] = calculateProgressType($mappedRow['received_date']);
            }

            // Auto-generate sequence number
            $seqColumns = [
                'survey' => 'received_seq',
                'registration' => 'seq_no',
                'academic' => 'seq_no',
                'admin' => 'seq_no'
            ];
            $seqCol = $seqColumns[$workType];
            $mappedRow[$seqCol] = generateSeqNo($workType, $conn, $tableName);

            // Build insert query
            $columns = array_keys($mappedRow);
            $placeholders = array_map(fn($c) => ":$c", $columns);

            $sql = "INSERT INTO $tableName (" . implode(', ', $columns) . ") VALUES (" . implode(', ', $placeholders) . ")";
            $stmt = $conn->prepare($sql);

            foreach ($mappedRow as $col => $val) {
                $stmt->bindValue(":$col", $val);
            }

            $stmt->execute();
            $inserted++;

        } catch (Exception $e) {
            $errors[] = "Row " . ($idx + 2) . ": " . $e->getMessage();
        }
    }

    $conn->commit();
    @unlink(__DIR__ . '/cache/stats_cache.json');

    echo json_encode([
        'status' => 'success',
        'inserted' => $inserted,
        'updated' => $updated,
        'skipped' => $skipped,
        'total' => count($data),
        'errors' => $errors
    ]);

} catch (Exception $e) {
    if (isset($conn) && $conn->inTransaction()) {
        $conn->rollBack();
    }
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
?>