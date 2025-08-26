<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
	http_response_code(204);
	exit;
}

$user = $_GET['user'] ?? null;
$filename = $_GET['filename'] ?? null;

if ($user === null || $filename === null) {
	http_response_code(400);
	exit('Missing parameters.');
}

$user = basename($user);
$filename = basename($filename);

$dir = __DIR__ . "/$user";
$path = "$dir/$filename";

function send_json_headers($file = null) {
	header('Content-Type: application/json');
	header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
	header('Pragma: no-cache');
	header('Expires: 0');
	$time = ($file !== null && file_exists($file)) ? filemtime($file) : time();
	header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $time) . ' GMT');
}

// --- GET ---
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
	if (file_exists($path)) {
		send_json_headers($path);
		readfile($path);
	} else {
		send_json_headers();
		echo '[]';
	}
	exit;
}

// --- PUT ---
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
	$input = file_get_contents('php://input');

	if (!is_dir($dir)) {
		mkdir($dir, 0777, true);
	}

	if (file_exists($path)) {
		$backup = sprintf(
			"%s/%s_%s.%s",
			$dir,
			pathinfo($filename, PATHINFO_FILENAME),
			date('YmdHis'),
			pathinfo($filename, PATHINFO_EXTENSION)
		);
		rename($path, $backup);
	}

	file_put_contents($path, $input);

	send_json_headers($path);
	readfile($path);
	exit;
}

// Méthode non autorisée
http_response_code(405);
exit('Method not allowed.');
