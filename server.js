const express = require("express");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl:
		process.env.NODE_ENV === "production"
			? { rejectUnauthorized: false }
			: false,
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

async function initDb() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS attendees (
			show_id TEXT NOT NULL,
			attendee_name TEXT NOT NULL,
			state TEXT NOT NULL DEFAULT 'normal',
			timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (show_id, attendee_name)
		);
	`);

	await pool.query(`
		CREATE TABLE IF NOT EXISTS comments (
			id BIGSERIAL PRIMARY KEY,
			show_id TEXT NOT NULL,
			name TEXT NOT NULL,
			text TEXT NOT NULL,
			timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`);
}

function parseCsvLine(line) {
	const values = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			inQuotes = !inQuotes;
		} else if (char === "," && !inQuotes) {
			values.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}

	values.push(current.trim());
	return values;
}

function getDayNumber(day) {
	const normalizedDay = String(day || "").toLowerCase();
	if (normalizedDay.includes("friday")) return 1;
	if (normalizedDay.includes("saturday")) return 2;
	if (normalizedDay.includes("sunday")) return 3;
	return 1;
}

function toSlug(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function toLegacyStageSlug(stage) {
	return String(stage || "").toLowerCase().replace(/\s+/g, "-");
}

function toLegacyArtistSlug(artist) {
	return String(artist || "")
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function normalizeExplicitId(sourceId) {
	const normalized = String(sourceId || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	if (!normalized) return "";
	return normalized.startsWith("show_") ? normalized : `show_${normalized}`;
}

function generateLegacyShowId(day, stage, artist, time) {
	const dayNum = getDayNumber(day);
	const stageSlug = toLegacyStageSlug(stage);
	const artistSlug = toLegacyArtistSlug(artist);
	const timeSlug = String(time || "").replace(/[^a-z0-9]/gi, "");
	return `show_${dayNum}_${stageSlug}_${artistSlug}_${timeSlug}`;
}

function parseScheduleRows(csvText) {
	const lines = String(csvText || "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (!lines.length) return [];

	const headers = parseCsvLine(lines[0]).map((header) =>
		header.replace(/^\ufeff/, "").trim().toLowerCase()
	);
	const dayIndex = headers.indexOf("day");
	const timeIndex = headers.indexOf("time");
	const stageIndex = headers.indexOf("stage");
	const artistIndex = headers.indexOf("artist");
	const idIndex = headers.indexOf("id");

	const rows = [];
	for (let i = 1; i < lines.length; i++) {
		const values = parseCsvLine(lines[i]);
		const day = (values[dayIndex >= 0 ? dayIndex : 0] || "").trim();
		const time = (values[timeIndex >= 0 ? timeIndex : 1] || "").trim();
		const stage = (values[stageIndex >= 0 ? stageIndex : 2] || "").trim();
		const artist = (values[artistIndex >= 0 ? artistIndex : 3] || "").trim();
		const sourceId = (values[idIndex >= 0 ? idIndex : -1] || "").trim();
		if (day && time && stage && artist) {
			rows.push({ day, time, stage, artist, sourceId });
		}
	}
	return rows;
}

function buildShowIdMappings(rows) {
	const counters = new Map();
	const byOldId = new Map();

	for (const row of rows) {
		const dayNum = getDayNumber(row.day);
		const oldId = generateLegacyShowId(row.day, row.stage, row.artist, row.time);
		const explicitId = normalizeExplicitId(row.sourceId);
		let newId = explicitId;

		if (!newId) {
			const stageSlug = toSlug(row.stage);
			const artistSlug = toSlug(row.artist);
			const key = `${dayNum}|${stageSlug}|${artistSlug}`;
			const occurrence = (counters.get(key) || 0) + 1;
			counters.set(key, occurrence);
			newId = `show_${dayNum}_${stageSlug}_${artistSlug}_${occurrence}`;
		}

		byOldId.set(oldId, newId);
	}

	return Array.from(byOldId.entries())
		.filter(([oldId, newId]) => oldId !== newId)
		.map(([oldId, newId]) => ({ oldId, newId }));
}

app.get("/api/health", async (_req, res) => {
	try {
		await pool.query("SELECT 1");
		res.json({ ok: true });
	} catch (error) {
		res.status(500).json({ ok: false, error: error.message });
	}
});

app.get("/api/attendees", async (_req, res) => {
	const result = await pool.query(
		"SELECT show_id, attendee_name, state, timestamp FROM attendees"
	);
	res.json({
		attendees: result.rows.map((r) => ({
			showId: r.show_id,
			attendeeName: r.attendee_name,
			state: r.state,
			timestamp: r.timestamp,
		})),
	});
});

app.get("/api/attendees/show/:showId", async (req, res) => {
	const result = await pool.query(
		"SELECT attendee_name FROM attendees WHERE show_id = $1",
		[req.params.showId]
	);
	res.json({ attendees: result.rows.map((r) => r.attendee_name) });
});

app.get("/api/attendees/person/:name", async (req, res) => {
	const result = await pool.query(
		"SELECT show_id FROM attendees WHERE attendee_name = $1 AND state != 'deleted'",
		[req.params.name]
	);
	res.json({ shows: result.rows.map((r) => r.show_id) });
});

app.put("/api/attendees", async (req, res) => {
	const { showId, attendeeName, state = "normal" } = req.body;
	await pool.query(
		`INSERT INTO attendees (show_id, attendee_name, state, timestamp)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (show_id, attendee_name)
		 DO UPDATE SET state = EXCLUDED.state, timestamp = NOW()`,
		[showId, attendeeName, state]
	);
	res.json({ ok: true });
});

app.delete("/api/attendees", async (req, res) => {
	const { showId, attendeeName } = req.body;
	await pool.query(
		"DELETE FROM attendees WHERE show_id = $1 AND attendee_name = $2",
		[showId, attendeeName]
	);
	res.json({ ok: true });
});

app.get("/api/comments", async (_req, res) => {
	const result = await pool.query(
		"SELECT id, show_id, name, text, timestamp FROM comments ORDER BY timestamp ASC"
	);
	res.json({
		comments: result.rows.map((r) => ({
			id: r.id,
			showId: r.show_id,
			name: r.name,
			text: r.text,
			timestamp: r.timestamp,
		})),
	});
});

app.post("/api/comments", async (req, res) => {
	const { showId, name, text, timestamp } = req.body;
	await pool.query(
		"INSERT INTO comments (show_id, name, text, timestamp) VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))",
		[showId, name, text, timestamp || null]
	);
	res.json({ ok: true });
});

app.post("/api/comments/delete", async (req, res) => {
	const { showId, commentIndex } = req.body;
	const result = await pool.query(
		"SELECT id FROM comments WHERE show_id = $1 ORDER BY timestamp ASC, id ASC",
		[showId]
	);
	const row = result.rows[commentIndex];
	if (!row) return res.status(404).json({ ok: false, error: "Comment not found" });

	await pool.query("DELETE FROM comments WHERE id = $1", [row.id]);
	res.json({ ok: true });
});

app.post("/api/clear", async (_req, res) => {
	await pool.query("DELETE FROM attendees");
	await pool.query("DELETE FROM comments");
	res.json({ ok: true });
});

app.get("/api/export", async (_req, res) => {
	const [attendeesResult, commentsResult] = await Promise.all([
		pool.query("SELECT show_id, attendee_name, state FROM attendees"),
		pool.query("SELECT show_id, name, text, timestamp FROM comments"),
	]);

	const attendees = {};
	const attendeeStates = {};
	attendeesResult.rows.forEach((r) => {
		if (!attendees[r.show_id]) attendees[r.show_id] = [];
		attendees[r.show_id].push(r.attendee_name);
		if (!attendeeStates[r.show_id]) attendeeStates[r.show_id] = {};
		attendeeStates[r.show_id][r.attendee_name] = r.state;
	});

	const comments = {};
	commentsResult.rows.forEach((r) => {
		if (!comments[r.show_id]) comments[r.show_id] = [];
		comments[r.show_id].push({
			name: r.name,
			text: r.text,
			timestamp: r.timestamp,
		});
	});

	res.json({ attendees, attendeeStates, comments });
});

app.post("/api/import", async (req, res) => {
	const { attendees = {}, attendeeStates = {}, comments = {} } = req.body || {};

	await pool.query("BEGIN");
	try {
		await pool.query("DELETE FROM attendees");
		await pool.query("DELETE FROM comments");

		for (const [showId, names] of Object.entries(attendees)) {
			for (const attendeeName of names) {
				const state = attendeeStates?.[showId]?.[attendeeName] || "normal";
				await pool.query(
					`INSERT INTO attendees (show_id, attendee_name, state, timestamp)
					 VALUES ($1, $2, $3, NOW())
					 ON CONFLICT (show_id, attendee_name)
					 DO UPDATE SET state = EXCLUDED.state, timestamp = NOW()`,
					[showId, attendeeName, state]
				);
			}
		}

		for (const [showId, list] of Object.entries(comments)) {
			for (const comment of list) {
				await pool.query(
					"INSERT INTO comments (show_id, name, text, timestamp) VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))",
					[showId, comment.name, comment.text, comment.timestamp || null]
				);
			}
		}

		await pool.query("COMMIT");
		res.json({ ok: true });
	} catch (error) {
		await pool.query("ROLLBACK");
		res.status(500).json({ ok: false, error: error.message });
	}
});

app.post("/api/admin/migrate-show-ids", async (req, res) => {
	const token = req.get("x-migration-token") || req.body?.token || req.query?.token;
	if (process.env.MIGRATION_TOKEN && token !== process.env.MIGRATION_TOKEN) {
		return res.status(403).json({ ok: false, error: "Invalid migration token" });
	}

	const dryRun = Boolean(req.body?.dryRun);
	const scheduleCsvPath = req.body?.scheduleCsvPath
		? path.resolve(__dirname, req.body.scheduleCsvPath)
		: path.join(__dirname, "ultra_2026_inferred_schedule.csv");
	const csvText =
		typeof req.body?.csvText === "string" && req.body.csvText.trim()
			? req.body.csvText
			: fs.readFileSync(scheduleCsvPath, "utf8");

	const rows = parseScheduleRows(csvText);
	const mappings = buildShowIdMappings(rows);
	if (!mappings.length) {
		return res.json({
			ok: true,
			dryRun,
			message: "No show ID remap needed.",
			parsedRows: rows.length,
			mappedRows: 0,
		});
	}

	const oldIds = mappings.map((m) => m.oldId);
	const newIds = mappings.map((m) => m.newId);

	const [attendeeMatches, commentMatches] = await Promise.all([
		pool.query(
			"SELECT COUNT(*)::int AS count FROM attendees WHERE show_id = ANY($1::text[])",
			[oldIds]
		),
		pool.query(
			"SELECT COUNT(*)::int AS count FROM comments WHERE show_id = ANY($1::text[])",
			[oldIds]
		),
	]);

	if (dryRun) {
		return res.json({
			ok: true,
			dryRun: true,
			parsedRows: rows.length,
			mappedRows: mappings.length,
			matchedAttendees: attendeeMatches.rows[0].count,
			matchedComments: commentMatches.rows[0].count,
			sample: mappings.slice(0, 20),
		});
	}

	await pool.query("BEGIN");
	try {
		await pool.query(`
			CREATE TEMP TABLE id_migration_map (
				old_id TEXT PRIMARY KEY,
				new_id TEXT NOT NULL
			) ON COMMIT DROP
		`);
		await pool.query(
			`INSERT INTO id_migration_map (old_id, new_id)
			 SELECT * FROM UNNEST($1::text[], $2::text[])`,
			[oldIds, newIds]
		);

		await pool.query(`
			CREATE TEMP TABLE attendees_snapshot ON COMMIT DROP AS
			SELECT
				COALESCE(m.new_id, a.show_id) AS show_id,
				a.attendee_name,
				a.state,
				a.timestamp
			FROM attendees a
			LEFT JOIN id_migration_map m ON m.old_id = a.show_id
		`);

		await pool.query("DELETE FROM attendees");
		await pool.query(`
			INSERT INTO attendees (show_id, attendee_name, state, timestamp)
			SELECT DISTINCT ON (show_id, attendee_name)
				show_id,
				attendee_name,
				state,
				timestamp
			FROM attendees_snapshot
			ORDER BY show_id, attendee_name, timestamp DESC
		`);

		await pool.query(`
			UPDATE comments c
			SET show_id = m.new_id
			FROM id_migration_map m
			WHERE c.show_id = m.old_id
		`);

		await pool.query("COMMIT");

		res.json({
			ok: true,
			dryRun: false,
			parsedRows: rows.length,
			mappedRows: mappings.length,
			matchedAttendees: attendeeMatches.rows[0].count,
			matchedComments: commentMatches.rows[0].count,
		});
	} catch (error) {
		await pool.query("ROLLBACK");
		res.status(500).json({ ok: false, error: error.message });
	}
});

app.get("*", (_req, res) => {
	res.sendFile(path.join(__dirname, "index.html"));
});

initDb()
	.then(() => {
		app.listen(port, () => {
			console.log(`Server listening on port ${port}`);
		});
	})
	.catch((error) => {
		console.error("Database initialization failed:", error);
		process.exit(1);
	});
