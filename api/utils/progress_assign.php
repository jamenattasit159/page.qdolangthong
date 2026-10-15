<?php
function isProgressTypeAssignmentAllowed($conn, $department)
{
    $keys = [];
    if (!empty($department)) {
        $keys[] = 'progress_type_assign_' . $department;
    }
    $keys[] = 'progress_type_assign';

    foreach ($keys as $key) {
        $stmt = $conn->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ? ORDER BY updated_at DESC");
        $stmt->execute([$key]);
        $value = $stmt->fetchColumn();

        if ($value !== false && $value !== null && trim((string) $value) !== '') {
            return strtolower(trim((string) $value)) === 'allowed';
        }
    }

    return false;
}
?>
