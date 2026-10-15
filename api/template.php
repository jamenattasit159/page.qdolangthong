<?php
/**
 * Template Download API - Generate and download Excel/CSV templates
 */

$workType = $_GET['type'] ?? 'registration';
$format = $_GET['format'] ?? 'csv';

$templates = [
    'survey' => [
        'filename' => 'template_survey',
        'columns' => ['วันที่รับ', 'วันรังวัด', 'ประเภทรังวัด', 'ผู้ขอ', 'สรุปเรื่อง', 'สาเหตุค้าง', 'คนคุมเรื่อง', 'เลข รว.12'],
        'sample' => ['2026-01-16', '2026-01-20', 'แบ่งแยก', 'นางสาวทดสอบ', 'รอตรวจสอบ', 'รอคู่กรณี', 'นายทดสอบ', '123/2569']
    ],
    'registration' => [
        'filename' => 'template_registration',
        'columns' => ['วันที่รับ', 'เรื่อง', 'ผู้เกี่ยวข้อง', 'สรุปเรื่อง', 'สาเหตุค้าง', 'ผู้รับผิดชอบ'],
        'sample' => ['2026-01-16', 'ขอจดทะเบียน', 'นางสาวทดสอบ', 'รอเอกสาร', 'รอหลักฐาน', 'นายทดสอบ']
    ],
    'academic' => [
        'filename' => 'template_academic',
        'columns' => ['วันที่รับ', 'เรื่อง', 'ผู้เกี่ยวข้อง', 'สรุปเรื่อง', 'สาเหตุค้าง', 'ผู้รับผิดชอบ'],
        'sample' => ['2026-01-16', 'ขอคำวินิจฉัย', 'นางสาวทดสอบ', 'รอพิจารณา', 'รอข้อมูล', 'นายทดสอบ']
    ],
    'admin' => [
        'filename' => 'template_admin',
        'columns' => ['วันที่รับ', 'เรื่อง', 'ผู้เกี่ยวข้อง', 'สรุปเรื่อง', 'สาเหตุค้าง', 'ผู้รับผิดชอบ'],
        'sample' => ['2026-01-16', 'งานสารบรรณ', 'นางสาวทดสอบ', 'รอเสนอผู้บริหาร', 'รอลงนาม', 'นายทดสอบ']
    ]
];

if (!isset($templates[$workType])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid work type']);
    exit;
}

$template = $templates[$workType];

if ($format === 'csv') {
    // Generate CSV
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $template['filename'] . '.csv"');

    // BOM for Excel UTF-8 compatibility
    echo "\xEF\xBB\xBF";

    $output = fopen('php://output', 'w');
    fputcsv($output, $template['columns']);
    fputcsv($output, $template['sample']);
    // Add empty row for user to fill
    fputcsv($output, array_fill(0, count($template['columns']), ''));
    fclose($output);

} else {
    // For Excel, we'll use CSV with xlsx extension if PhpSpreadsheet not available
    // The file will still be readable by Excel
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="' . $template['filename'] . '.xlsx"');

    // Check if PhpSpreadsheet is available
    if (file_exists(__DIR__ . '/../vendor/autoload.php')) {
        require __DIR__ . '/../vendor/autoload.php';

        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();

        // Set headers
        $col = 'A';
        foreach ($template['columns'] as $header) {
            $sheet->setCellValue($col . '1', $header);
            $sheet->getStyle($col . '1')->getFont()->setBold(true);
            $sheet->getColumnDimension($col)->setAutoSize(true);
            $col++;
        }

        // Set sample data
        $col = 'A';
        foreach ($template['sample'] as $value) {
            $sheet->setCellValue($col . '2', $value);
            $col++;
        }

        // Style header row
        $headerRange = 'A1:' . chr(ord('A') + count($template['columns']) - 1) . '1';
        $sheet->getStyle($headerRange)->getFill()
            ->setFillType(\PhpOffice\PhpSpreadsheet\Style\Fill::FILL_SOLID)
            ->getStartColor()->setRGB('10B981');
        $sheet->getStyle($headerRange)->getFont()->getColor()->setRGB('FFFFFF');

        $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);
        $writer->save('php://output');
    } else {
        // Fallback to CSV with xlsx extension
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $template['filename'] . '.csv"');

        echo "\xEF\xBB\xBF";
        $output = fopen('php://output', 'w');
        fputcsv($output, $template['columns']);
        fputcsv($output, $template['sample']);
        fclose($output);
    }
}
?>