<?php
class Logger
{
    private static $db;

    private static function init()
    {
        if (!isset(self::$db)) {
            global $conn;
            if (!isset($conn)) {
                require_once __DIR__ . '/../db.php';
            }
            self::$db = $conn;
        }
    }

    public static function log($userName, $action, $department, $itemId = null, $details = null)
    {
        self::init();
        try {
            $query = "INSERT INTO activity_logs (user_name, action, department, item_id, details) 
                      VALUES (:user_name, :action, :department, :item_id, :details)";
            $stmt = self::$db->prepare($query);

            $stmt->bindParam(':user_name', $userName);
            $stmt->bindParam(':action', $action);
            $stmt->bindParam(':department', $department);
            $stmt->bindParam(':item_id', $itemId);
            $stmt->bindParam(':details', $details);

            return $stmt->execute();
        } catch (PDOException $e) {
            error_log("Logging failed: " . $e->getMessage());
            return false;
        }
    }
}
?>